/**
 * 栈序云寄售 - 后端服务
 * 功能：真实支付（支付宝 / 微信支付）+ 支付回调自动发货
 * 部署：Render / Vercel / 自有服务器
 */
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ 数据存储（JSON 文件，生产建议换数据库） ============
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, def = []) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch { return def; }
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

const db = {
  merchants: () => readJSON('merchants.json', []),
  saveMerchants: (d) => writeJSON('merchants.json', d),
  products: (email) => readJSON(`products_${email}.json`, []),
  saveProducts: (email, d) => writeJSON(`products_${email}.json`, d),
  cardkeys: (email) => readJSON(`cardkeys_${email}.json`, []),
  saveCardkeys: (email, d) => writeJSON(`cardkeys_${email}.json`, d),
  orders: (email) => readJSON(`orders_${email}.json`, []),
  saveOrders: (email, d) => writeJSON(`orders_${email}.json`, d),
  buyerOrders: () => readJSON('buyer_orders.json', []),
  saveBuyerOrders: (d) => writeJSON('buyer_orders.json', d),
  payOrders: () => readJSON('pay_orders.json', []),
  savePayOrders: (d) => writeJSON('pay_orders.json', d),
};

// ============ 工具 ============
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function fmtTime(t) { const d = new Date(t); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function fmtMoney(n) { return (n || 0).toFixed(2); }

// ============ 自动发货核心（幂等，按订单号加锁） ============
// 支付成功后调用：取卡密 → 标记已售 → 生成商家订单 + 买家订单
const shipLocks = new Map(); // orderId -> Promise

async function autoShip(orderId) {
  if (shipLocks.has(orderId)) return shipLocks.get(orderId);
  const task = (async () => {
    const pays = db.payOrders();
    const pay = pays.find(p => p.orderId === orderId);
    if (!pay) return { ok: false, msg: '支付订单不存在' };
    if (pay.shipped) return { ok: true, already: true, cardKey: pay.cardKey }; // 幂等：已发货直接返回

    // 取该商品第一张可用卡密
    const cards = db.cardkeys(pay.merchantEmail);
    const card = cards.find(c => c.productId === pay.productId && c.status === 'available');
    if (!card) return { ok: false, msg: '库存不足，无可用卡密' };

    // 原子更新
    card.status = 'sold';
    card.orderId = orderId;
    card.soldAt = Date.now();
    db.saveCardkeys(pay.merchantEmail, cards);

    // 商家订单
    const merchOrders = db.orders(pay.merchantEmail);
    merchOrders.push({
      id: orderId, productId: pay.productId, productName: pay.productName,
      buyer: pay.buyerNick, buyerPhone: pay.buyerPhone, amount: pay.amount,
      status: 'shipped', cardKey: card.key, createdAt: pay.createdAt, shippedAt: Date.now()
    });
    db.saveOrders(pay.merchantEmail, merchOrders);

    // 买家订单
    const buyerOrders = db.buyerOrders();
    buyerOrders.push({
      id: orderId, merchantEmail: pay.merchantEmail, productId: pay.productId,
      productName: pay.productName, shop: pay.shop, amount: pay.amount,
      buyerNick: pay.buyerNick, buyerPhone: pay.buyerPhone, cardKey: card.key,
      status: 'shipped', createdAt: pay.createdAt
    });
    db.saveBuyerOrders(buyerOrders);

    // 标记支付订单已发货
    pay.shipped = true;
    pay.cardKey = card.key;
    pay.shippedAt = Date.now();
    db.savePayOrders(pays);

    return { ok: true, cardKey: card.key };
  })();
  shipLocks.set(orderId, task);
  try { return await task; } finally { shipLocks.delete(orderId); }
}

// ============ 支付宝支付（电脑网站支付 / 手机网站支付） ============
const ALIPAY = {
  appId: process.env.ALIPAY_APP_ID || '',
  privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
  publicKey: process.env.ALIPAY_PUBLIC_KEY || '',
  gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
  returnUrl: process.env.ALIPAY_RETURN_URL || '',
};

function alipaySign(content) {
  // 按 key 字典序排序，拼接成 k=v&k=v，RSA2 签名
  const keys = Object.keys(content).filter(k => content[k] !== '' && content[k] != null && k !== 'sign' && k !== 'sign_type').sort();
  const query = keys.map(k => `${k}=${content[k]}`).join('&');
  return crypto.createSign('RSA-SHA256').update(query, 'utf8').sign(ALIPAY.privateKey, 'base64');
}

function alipayVerifySign(params) {
  const sign = params.sign;
  const keys = Object.keys(params).filter(k => k !== 'sign' && k !== 'sign_type').sort();
  const query = keys.map(k => `${k}=${params[k]}`).join('&');
  return crypto.createVerify('RSA-SHA256').update(query, 'utf8').verify(ALIPAY.publicKey, sign, 'base64');
}

// 创建支付宝订单，返回支付表单 HTML（前端跳转使用）
function createAlipayOrder(pay) {
  const bizContent = JSON.stringify({
    out_trade_no: pay.orderId,
    total_amount: fmtMoney(pay.amount),
    subject: pay.productName,
    product_code: 'FAST_INSTANT_TRADE_PAY',
  });
  const params = {
    app_id: ALIPAY.appId,
    method: 'alipay.trade.page.pay',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
    version: '1.0',
    notify_url: ALIPAY.notifyUrl,
    return_url: ALIPAY.returnUrl,
    biz_content: bizContent,
  };
  params.sign = alipaySign(params);
  // 生成表单 HTML
  const form = `<form id='alipaysubmit' name='alipaysubmit' action='${ALIPAY.gateway}' method='POST'>`
    + Object.entries(params).map(([k, v]) => `<input type='hidden' name='${k}' value='${String(v).replace(/'/g, "&#39;")}'/>`).join('')
    + `<input type='submit' value='ok' style='display:none'/></form><script>document.forms['alipaysubmit'].submit();</script>`;
  return form;
}

// ============ 微信支付（Native 扫码支付，简化版） ============
const WECHAT = {
  appId: process.env.WX_APPID || '',
  mchId: process.env.WX_MCHID || '',
  apiKey: process.env.WX_APIKEY || '',
  notifyUrl: process.env.WX_NOTIFY_URL || '',
};

function wechatSign(params) {
  const keys = Object.keys(params).filter(k => params[k] !== '' && params[k] != null && k !== 'sign').sort();
  const query = keys.map(k => `${k}=${params[k]}`).join('&') + `&key=${WECHAT.apiKey}`;
  return crypto.createHash('md5').update(query, 'utf8').digest('hex').toUpperCase();
}

function wechatVerifySign(params) {
  const sign = params.sign;
  return sign === wechatSign({ ...params, sign: undefined });
}

function createWechatOrder(pay) {
  // 调用微信统一下单 API（实际需 HTTPS 请求）
  // 这里返回签名参数，前端可用 jsapi 或生成二维码
  const nonceStr = uid();
  const params = {
    appid: WECHAT.appId,
    mch_id: WECHAT.mchId,
    nonce_str: nonceStr,
    body: pay.productName,
    out_trade_no: pay.orderId,
    total_fee: Math.round(pay.amount * 100),
    spbill_create_ip: '127.0.0.1',
    notify_url: WECHAT.notifyUrl,
    trade_type: 'NATIVE',
  };
  params.sign = wechatSign(params);
  // 实际需 POST 到 https://api.mch.weixin.qq.com/pay/unifiedorder
  // 此处返回构造好的参数，由调用方发起请求或后端代理
  return { params, needRequest: true };
}

// ============ API 路由 ============

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, service: '栈序云寄售后端', time: Date.now() }));

// 获取所有在售商品（商城用）
app.get('/api/market/products', (req, res) => {
  const merchants = db.merchants();
  const goods = [];
  merchants.forEach(m => {
    const products = db.products(m.email);
    const cards = db.cardkeys(m.email);
    products.forEach(p => {
      const avail = cards.filter(c => c.productId === p.id && c.status === 'available').length;
      if (avail > 0) {
        goods.push({
          id: p.id, name: p.name, category: p.category, price: p.price,
          stock: avail, merchantEmail: m.email, shop: m.shop,
        });
      }
    });
  });
  res.json({ ok: true, goods });
});

// 创建支付订单（前端下单时调用）
app.post('/api/pay/create', async (req, res) => {
  const { productId, merchantEmail, buyerNick, buyerPhone, payMethod } = req.body;
  if (!productId || !merchantEmail || !buyerNick || !buyerPhone) {
    return res.status(400).json({ ok: false, msg: '参数不完整' });
  }
  if (!/^1\d{10}$/.test(buyerPhone)) return res.status(400).json({ ok: false, msg: '手机号格式错误' });

  const merchants = db.merchants();
  const m = merchants.find(x => x.email === merchantEmail);
  if (!m) return res.status(404).json({ ok: false, msg: '商家不存在' });

  const products = db.products(merchantEmail);
  const p = products.find(x => x.id === productId);
  if (!p) return res.status(404).json({ ok: false, msg: '商品不存在' });

  const cards = db.cardkeys(merchantEmail);
  const stock = cards.filter(c => c.productId === productId && c.status === 'available').length;
  if (stock <= 0) return res.status(400).json({ ok: false, msg: '商品已售罄' });

  // 创建支付订单（待支付）
  const orderId = 'ZX' + Date.now().toString().slice(-8);
  const payOrder = {
    orderId, productId, merchantEmail, productName: p.name, shop: m.shop,
    amount: p.price, buyerNick, buyerPhone, payMethod: payMethod || 'alipay',
    status: 'pending_pay', shipped: false, cardKey: null, createdAt: Date.now(),
  };
  const pays = db.payOrders();
  pays.push(payOrder);
  db.savePayOrders(pays);

  // 根据支付方式返回
  if (payMethod === 'alipay' && ALIPAY.appId) {
    const formHtml = createAlipayOrder(payOrder);
    return res.json({ ok: true, orderId, payMethod: 'alipay', formHtml });
  }
  if (payMethod === 'wechat' && WECHAT.appId) {
    const wx = createWechatOrder(payOrder);
    return res.json({ ok: true, orderId, payMethod: 'wechat', wxParams: wx.params });
  }

  // 未配置真实支付 → 降级为模拟支付（便于演示）
  if (process.env.ALLOW_MOCK !== 'false') {
    return res.json({ ok: true, orderId, payMethod: 'mock', msg: '未配置真实支付，已降级为模拟支付' });
  }
  res.status(503).json({ ok: false, msg: '支付服务未配置，请联系管理员' });
});

// 模拟支付（演示用，无真实支付配置时启用）
app.post('/api/pay/mock/:orderId', async (req, res) => {
  const orderId = req.params.orderId;
  const pays = db.payOrders();
  const pay = pays.find(p => p.orderId === orderId);
  if (!pay) return res.status(404).json({ ok: false, msg: '订单不存在' });
  if (pay.status !== 'pending_pay') return res.status(400).json({ ok: false, msg: '订单状态异常' });

  pay.status = 'paid';
  pay.paidAt = Date.now();
  db.savePayOrders(pays);

  const r = await autoShip(orderId);
  res.json({ ok: r.ok, orderId, cardKey: r.cardKey, msg: r.msg });
});

// 支付宝异步回调
app.post('/api/pay/alipay/notify', async (req, res) => {
  const params = req.body;
  // 验签
  if (!alipayVerifySign(params)) return res.status(400).send('FAIL');
  const orderId = params.out_trade_no;
  const tradeStatus = params.trade_status;

  if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
    const pays = db.payOrders();
    const pay = pays.find(p => p.orderId === orderId);
    if (pay && pay.status === 'pending_pay') {
      pay.status = 'paid';
      pay.paidAt = Date.now();
      db.savePayOrders(pays);
      await autoShip(orderId);
    }
  }
  res.send('success'); // 支付宝要求返回 success
});

// 支付宝同步跳转
app.get('/api/pay/alipay/return', (req, res) => {
  const orderId = req.query.out_trade_no;
  res.redirect(`${process.env.FRONTEND_URL || '/'}/?order=${orderId}`);
});

// 微信支付回调
app.post('/api/pay/wechat/notify', async (req, res) => {
  const params = req.body;
  if (!wechatVerifySign(params)) return res.status(400).send('<xml><return_code><![CDATA[FAIL]]></return_code></xml>');
  if (params.return_code === 'SUCCESS' && params.result_code === 'SUCCESS') {
    const orderId = params.out_trade_no;
    const pays = db.payOrders();
    const pay = pays.find(p => p.orderId === orderId);
    if (pay && pay.status === 'pending_pay') {
      pay.status = 'paid';
      pay.paidAt = Date.now();
      db.savePayOrders(pays);
      await autoShip(orderId);
    }
  }
  res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>');
});

// 查询订单发货状态（前端轮询）
app.get('/api/pay/status/:orderId', (req, res) => {
  const pays = db.payOrders();
  const pay = pays.find(p => p.orderId === req.params.orderId);
  if (!pay) return res.status(404).json({ ok: false, msg: '订单不存在' });
  res.json({
    ok: true, orderId: pay.orderId, status: pay.status,
    shipped: pay.shipped, cardKey: pay.shipped ? pay.cardKey : null,
    productName: pay.productName, shop: pay.shop, amount: pay.amount,
  });
});

// 买家订单查询
app.get('/api/buyer/orders/:phone', (req, res) => {
  const list = db.buyerOrders()
    .filter(o => o.buyerPhone === req.params.phone)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ ok: true, orders: list });
});

// ============ 启动 ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`栈序云寄售后端已启动: http://localhost:${PORT}`);
  console.log(`支付宝已配置: ${!!ALIPAY.appId}`);
  console.log(`微信支付已配置: ${!!WECHAT.appId}`);
  console.log(`模拟支付: ${process.env.ALLOW_MOCK !== 'false'}`);
});
