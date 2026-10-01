#!/data/data/com.termux/files/usr/bin/bash
# ================================================
# 栈序云寄售 - Termux 一键安装脚本
# 在 Termux 里运行: curl -sL https://raw.githubusercontent.com/zy00820/zhaxu-cloud-consignment/main/backend/install.sh | bash
# ================================================

set -e

echo "═══════════════════════════════════════════"
echo "  栈序云寄售 - Termux 后端安装"
echo "═══════════════════════════════════════════"
echo ""

# 1. 更新系统
echo "[1/6] 更新包管理器..."
pkg update -y && pkg upgrade -y

# 2. 安装 Python 和 curl
echo ""
echo "[2/6] 安装 Python 和 curl..."
pkg install -y python python-pip curl

# 3. 安装 cloudflared（内网穿透）
echo ""
echo "[3/6] 安装 cloudflared 内网穿透..."
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
elif [ "$ARCH" = "armv7l" ]; then
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
else
  CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
fi

curl -L -o ~/cloudflared "$CF_URL"
chmod +x ~/cloudflared
echo "  ✅ cloudflared 已下载到 ~/cloudflared"

# 4. 创建项目目录并下载后端文件
echo ""
echo "[4/6] 下载后端文件..."
mkdir -p ~/zhaxu-backend
cd ~/zhaxu-backend

BASE_URL="https://raw.githubusercontent.com/zy00820/zhaxu-cloud-consignment/main/backend"
curl -sL -o app.py "$BASE_URL/app.py"
curl -sL -o shop-data.json "$BASE_URL/shop-data.json"
curl -sL -o start.sh "$BASE_URL/start.sh"
curl -sL -o stop.sh "$BASE_URL/stop.sh"
chmod +x start.sh stop.sh
echo "  ✅ 后端文件已下载到 ~/zhaxu-backend/"

# 5. 安装 Python 依赖
echo ""
echo "[5/6] 安装 Python 依赖..."
pip install flask flask-cors --quiet

echo ""
echo "[6/6] 安装完成！"
echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ 安装成功"
echo "═══════════════════════════════════════════"
echo ""
echo "启动后端:  bash ~/zhaxu-backend/start.sh"
echo "停止后端:  bash ~/zhaxu-backend/stop.sh"
echo ""
