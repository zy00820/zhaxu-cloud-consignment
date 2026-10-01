#!/data/data/com.termux/files/usr/bin/bash
# ================================================
# 栈序云寄售 - Termux 一键安装脚本
# 在 Termux 里运行: bash install.sh
# ================================================

set -e

echo "═══════════════════════════════════════════"
echo "  栈序云寄售 - Termux 后端安装"
echo "═══════════════════════════════════════════"
echo ""

# 1. 更新系统
echo "[1/6] 更新包管理器..."
pkg update -y && pkg upgrade -y

# 2. 安装 Python
echo ""
echo "[2/6] 安装 Python..."
pkg install -y python python-pip

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

# 4. 创建项目目录
echo ""
echo "[4/6] 创建项目目录 ~/zhaxu-backend..."
mkdir -p ~/zhaxu-backend
cd ~/zhaxu-backend

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
echo "下一步："
echo "  1. 把 app.py 和 shop-data.json 传到 ~/zhaxu-backend/"
echo "  2. 运行: bash start.sh"
echo ""
