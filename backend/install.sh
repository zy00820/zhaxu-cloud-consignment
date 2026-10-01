#!/data/data/com.termux/files/usr/bin/bash
# ================================================
# 栈序云寄售 - Termux 一键安装脚本（国内镜像版）
# 在 Termux 里运行:
#   curl -sL https://gh-proxy.com/https://raw.githubusercontent.com/zy00820/zhaxu-cloud-consignment/main/backend/install.sh | bash
# ================================================

set -e

echo "═══════════════════════════════════════════"
echo "  栈序云寄售 - Termux 后端安装（国内镜像）"
echo "═══════════════════════════════════════════"
echo ""

# 0. 换 Termux 软件源为清华镜像
echo "[0/6] 更换 Termux 软件源为清华镜像..."
sed -i 's@^\(deb.*stable main\)$@#\1\ndeb https://mirrors.tuna.tsinghua.edu.cn/termux/apt/termux-main stable main@' $PREFIX/etc/apt/sources.list
echo "  ✅ 已切换到清华镜像源"

# 1. 更新系统
echo ""
echo "[1/6] 更新包管理器..."
pkg update -y 2>/dev/null || apt update -y
pkg upgrade -y 2>/dev/null || apt upgrade -y

# 2. 安装 Python 和 curl
echo ""
echo "[2/6] 安装 Python 和 curl..."
pkg install -y python python-pip curl 2>/dev/null || apt install -y python python-pip curl

# 3. 安装 cloudflared（内网穿透）— 用 ghproxy 代理
echo ""
echo "[3/6] 安装 cloudflared 内网穿透..."
ARCH=$(uname -m)
if [ "$ARCH" = "aarch64" ]; then
  CF_FILE="cloudflared-linux-arm64"
elif [ "$ARCH" = "armv7l" ]; then
  CF_FILE="cloudflared-linux-arm"
else
  CF_FILE="cloudflared-linux-arm64"
fi
CF_URL="https://gh-proxy.com/https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_FILE"

curl -L -o ~/cloudflared "$CF_URL"
chmod +x ~/cloudflared
echo "  ✅ cloudflared 已下载到 ~/cloudflared"

# 4. 创建项目目录并下载后端文件 — 用 ghproxy 代理
echo ""
echo "[4/6] 下载后端文件..."
mkdir -p ~/zhaxu-backend
cd ~/zhaxu-backend

BASE_URL="https://gh-proxy.com/https://raw.githubusercontent.com/zy00820/zhaxu-cloud-consignment/main/backend"
curl -sL -o app.py "$BASE_URL/app.py"
curl -sL -o shop-data.json "$BASE_URL/shop-data.json"
curl -sL -o start.sh "$BASE_URL/start.sh"
curl -sL -o stop.sh "$BASE_URL/stop.sh"
chmod +x start.sh stop.sh
echo "  ✅ 后端文件已下载到 ~/zhaxu-backend/"

# 5. 安装 Python 依赖 — 用清华 pip 镜像
echo ""
echo "[5/6] 安装 Python 依赖..."
pip install flask flask-cors -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet

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
