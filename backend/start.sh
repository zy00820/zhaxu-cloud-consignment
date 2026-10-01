#!/data/data/com.termux/files/usr/bin/bash
# ================================================
# 栈序云寄售 - 启动脚本
# 运行: bash start.sh
# ================================================

cd ~/zhaxu-backend

echo "═══════════════════════════════════════════"
echo "  栈序云寄售 - 后端启动"
echo "═══════════════════════════════════════════"
echo ""

# 启动 Flask 后端（后台运行）
echo "[1/2] 启动 Flask 后端..."
pkill -f "python app.py" 2>/dev/null || true
nohup python app.py > backend.log 2>&1 &
sleep 2

# 检查后端是否启动
if curl -s http://127.0.0.1:5000/health > /dev/null 2>&1; then
  echo "  ✅ 后端已启动: http://127.0.0.1:5000"
else
  echo "  ❌ 后端启动失败，查看 backend.log"
  exit 1
fi

# 启动 cloudflared 隧道
echo ""
echo "[2/2] 启动 cloudflared 内网穿透..."
pkill -f "cloudflared tunnel" 2>/dev/null || true

# 清理旧日志
rm -f cloudflared.log

# 启动 cloudflared（快速隧道，无需注册）
nohup ~/cloudflared tunnel --url http://127.0.0.1:5000 > cloudflared.log 2>&1 &

echo "  等待隧道建立（约 10 秒）..."
sleep 10

# 提取公网 URL
CF_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' cloudflared.log | head -1)

echo ""
echo "═══════════════════════════════════════════"
if [ -n "$CF_URL" ]; then
  echo "  ✅ 后端已上线！"
  echo ""
  echo "  🌐 公网地址: $CF_URL"
  echo ""
  echo "  前端配置（在 index.html 里改）:"
  echo "    window.SHOP_CONFIG = {"
  echo "      apiBase: '$CF_URL',"
  echo "      syncMode: 'termux'"
  echo "    };"
else
  echo "  ⚠️  隧道建立失败，查看 cloudflared.log"
fi
echo "═══════════════════════════════════════════"
echo ""
echo "常用命令:"
echo "  查看后端日志: cat ~/zhaxu-backend/backend.log"
echo "  查看隧道日志: cat ~/zhaxu-backend/cloudflared.log"
echo "  停止服务:    bash stop.sh"
echo ""
