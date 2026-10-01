#!/data/data/com.termux/files/usr/bin/bash
# 停止后端和隧道
echo "停止 Flask 后端..."
pkill -f "python app.py" 2>/dev/null || echo "  后端未运行"

echo "停止 cloudflared 隧道..."
pkill -f "cloudflared tunnel" 2>/dev/null || echo "  隧道未运行"

echo "✅ 已停止所有服务"
