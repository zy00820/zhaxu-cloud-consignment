#!/usr/bin/env python3
"""
栈序云寄售 - Termux 本地后端
Python + Flask + SQLite + cloudflared 内网穿透
"""

import json
import os
import time
import sqlite3
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

DB_PATH = os.path.join(os.path.dirname(__file__), "shop.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""CREATE TABLE IF NOT EXISTS merchants (
        email TEXT PRIMARY KEY,
        shop TEXT,
        wxPaycode TEXT DEFAULT '',
        aliPaycode TEXT DEFAULT '',
        payNote TEXT DEFAULT '',
        password TEXT DEFAULT 'xdf195458'
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        merchantEmail TEXT,
        name TEXT,
        category TEXT,
        price REAL,
        desc TEXT,
        stockWarn INTEGER DEFAULT 5,
        status TEXT DEFAULT 'active'
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        productId TEXT,
        code TEXT,
        status TEXT DEFAULT 'available',
        orderId TEXT DEFAULT NULL,
        created INTEGER
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        productId TEXT,
        productName TEXT,
        merchantEmail TEXT,
        customerName TEXT,
        phone TEXT,
        email TEXT DEFAULT '',
        amount REAL,
        payMethod TEXT,
        status TEXT DEFAULT 'pending',
        cardCode TEXT DEFAULT '',
        created INTEGER,
        updated INTEGER
    )""")

    # 导入初始数据（如果表是空的）
    c.execute("SELECT COUNT(*) FROM merchants")
    if c.fetchone()[0] == 0:
        with open(os.path.join(os.path.dirname(__file__), "shop-data.json"), encoding="utf-8") as f:
            data = json.load(f)

        for m in data["merchants"]:
            c.execute(
                "INSERT INTO merchants (email, shop, wxPaycode, aliPaycode, payNote) VALUES (?,?,?,?,?)",
                (m["email"], m["shop"], m.get("wxPaycode", ""), m.get("aliPaycode", ""), m.get("payNote", ""))
            )

        for p in data["products"]:
            c.execute(
                "INSERT INTO products (id, merchantEmail, name, category, price, desc, stockWarn, status) VALUES (?,?,?,?,?,?,?,?)",
                (p["id"], p["merchantEmail"], p["name"], p["category"], p["price"], p["desc"], p.get("stockWarn", 5), p.get("status", "active"))
            )

        for card in data["cards"]:
            c.execute(
                "INSERT INTO cards (id, productId, code, status, created) VALUES (?,?,?,?,?)",
                (card["id"], card["productId"], card["code"], card.get("status", "available"), card["created"])
            )

    conn.commit()
    conn.close()


# ============ API 接口 ============

@app.route("/api/shop-data", methods=["GET"])
def get_shop_data():
    conn = get_db()
    merchants = [dict(r) for r in conn.execute("SELECT * FROM merchants").fetchall()]
    products = [dict(r) for r in conn.execute("SELECT * FROM products").fetchall()]

    # 统计每个商品的可用卡密数
    for p in products:
        cnt = conn.execute(
            "SELECT COUNT(*) FROM cards WHERE productId=? AND status='available'",
            (p["id"],)
        ).fetchone()[0]
        p["availableCount"] = cnt

    conn.close()
    return jsonify({
        "version": "2.0",
        "updated": int(time.time() * 1000),
        "merchants": merchants,
        "products": products
    })


@app.route("/api/orders", methods=["GET"])
def get_orders():
    conn = get_db()
    orders = [dict(r) for r in conn.execute(
        "SELECT * FROM orders ORDER BY created DESC"
    ).fetchall()]
    conn.close()
    return jsonify(orders)


@app.route("/api/orders/phone/<phone>", methods=["GET"])
def get_orders_by_phone(phone):
    conn = get_db()
    orders = [dict(r) for r in conn.execute(
        "SELECT id, productName, amount, payMethod, status, cardCode, created FROM orders WHERE phone=? ORDER BY created DESC",
        (phone,)
    ).fetchall()]
    conn.close()
    return jsonify(orders)


@app.route("/api/orders", methods=["POST"])
def create_order():
    body = request.json
    now = int(time.time() * 1000)
    order_id = "ORD" + str(now)[-10:]

    conn = get_db()
    product = conn.execute(
        "SELECT * FROM products WHERE id=?", (body["productId"],)
    ).fetchone()

    if not product:
        conn.close()
        return jsonify({"error": "商品不存在"}), 404

    conn.execute(
        """INSERT INTO orders (id, productId, productName, merchantEmail, customerName, phone, email, amount, payMethod, status, created, updated)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (order_id, product["id"], product["name"], product["merchantEmail"],
         body["customerName"], body["phone"], body.get("email", ""),
         product["price"], body["payMethod"], "pending", now, now)
    )
    conn.commit()
    conn.close()

    return jsonify({"id": order_id, "status": "pending"}), 201


@app.route("/api/orders/<order_id>/ship", methods=["POST"])
def ship_order(order_id):
    conn = get_db()
    order = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()

    if not order:
        conn.close()
        return jsonify({"error": "订单不存在"}), 404

    if order["status"] != "pending":
        conn.close()
        return jsonify({"error": "订单状态异常"}), 400

    # 取一张可用卡密
    card = conn.execute(
        "SELECT * FROM cards WHERE productId=? AND status='available' LIMIT 1",
        (order["productId"],)
    ).fetchone()

    if not card:
        conn.close()
        return jsonify({"error": "库存不足"}), 500

    now = int(time.time() * 1000)
    conn.execute("UPDATE cards SET status='sold', orderId=? WHERE id=?", (order_id, card["id"]))
    conn.execute(
        "UPDATE orders SET status='shipped', cardCode=?, updated=? WHERE id=?",
        (card["code"], now, order_id)
    )
    conn.commit()
    conn.close()

    return jsonify({"id": order_id, "status": "shipped", "cardCode": card["code"]})


@app.route("/api/merchant/login", methods=["POST"])
def merchant_login():
    body = request.json
    conn = get_db()
    m = conn.execute(
        "SELECT * FROM merchants WHERE email=?", (body["email"],)
    ).fetchone()
    conn.close()

    if not m or m["password"] != body["password"]:
        return jsonify({"error": "账号或密码错误"}), 401

    return jsonify({"email": m["email"], "shop": m["shop"]})


@app.route("/api/merchant/update", methods=["POST"])
def merchant_update():
    body = request.json
    conn = get_db()
    conn.execute(
        "UPDATE merchants SET shop=?, wxPaycode=?, aliPaycode=?, payNote=? WHERE email=?",
        (body["shop"], body.get("wxPaycode", ""), body.get("aliPaycode", ""),
         body.get("payNote", ""), body["email"])
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/cards", methods=["GET"])
def get_cards():
    conn = get_db()
    cards = [dict(r) for r in conn.execute("SELECT * FROM cards").fetchall()]
    conn.close()
    return jsonify(cards)


@app.route("/api/cards", methods=["POST"])
def add_card():
    body = request.json
    conn = get_db()
    card_id = "card_" + str(int(time.time() * 1000))[-6:]
    conn.execute(
        "INSERT INTO cards (id, productId, code, status, created) VALUES (?,?,?,?,?)",
        (card_id, body["productId"], body["code"], "available", int(time.time() * 1000))
    )
    conn.commit()
    conn.close()
    return jsonify({"id": card_id}), 201


@app.route("/health")
def health():
    return jsonify({"status": "ok", "time": int(time.time())})


if __name__ == "__main__":
    init_db()
    print("🚀 栈序云寄售后端启动中...")
    print("📡 本地地址: http://127.0.0.1:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
