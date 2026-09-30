# 栈序云寄售 - 后端部署指南

## 推荐方案（免信用卡）

### 方案 A：Zeabur（国内友好，中文界面，首选）

1. **注册账号**：打开 https://zeabur.com ，用 GitHub 登录
2. **新建服务**：点击 **新建部署** → **从 Git 仓库部署** → 选择 `zhaxu-cloud-consignment`
3. **配置环境变量**（在服务设置 → 环境变量中添加）：

| Key | Value | 说明 |
|-----|-------|------|
| `PORT` | `3000` | 端口 |
| `ALLOW_MOCK` | `true` | 先开模拟支付跑通流程 |
| `ALIPAY_GATEWAY` | `https://openapi-sandbox.dl.alipaydev.com/gateway.do` | 支付宝沙箱 |

> 真实支付密钥（`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`WX_APPID` 等）等你申请到支付资质再填。

4. **部署**：点击 **部署**，等 1 分钟左右
5. **拿到域名**：Zeabur 会给你一个 `xxx.zeabur.app` 域名，发我这个地址我帮你改前端

---

### 方案 B：Vercel（国际老牌）

1. **安装 Vercel CLI**：`npm i -g vercel`
2. **登录**：`vercel login`
3. **在项目目录运行**：`vercel` → 一路回车（用默认配置）
4. **配置环境变量**：`vercel env add ALLOW_MOCK` → 输入 `true`
5. **生产部署**：`vercel --prod`
6. **拿到域名**：`xxx.vercel.app` 发我

> 也可以直接在 https://vercel.com 网页端导入 GitHub 仓库，零配置部署。

---

### 方案 C：Render（需信用卡验证）

如果你有美元信用卡：
1. https://render.com → New → Blueprint → 选择仓库
2. 自动读取 `render.yaml` 一键部署

---

## 本地开发

```bash
npm install
cp .env.example .env   # 编辑 .env
npm start              # 运行在 http://localhost:3000
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/market/products` | 商城在售商品 |
| POST | `/api/pay/create` | 创建支付订单 |
| POST | `/api/pay/mock/:orderId` | 模拟支付（触发自动发货）|
| POST | `/api/pay/alipay/notify` | 支付宝异步回调 |
| POST | `/api/pay/wechat/notify` | 微信支付异步回调 |
| GET | `/api/pay/status/:orderId` | 查询订单状态 |
| GET | `/api/buyer/orders/:phone` | 买家按手机号查订单 |

## 接入真实支付（可选）

等你有了支付宝/微信商户资质，在 Zeabur/Vercel 的环境变量里填入：

**支付宝**（https://open.alipay.com 申请）：
```
ALIPAY_APP_ID       = 你的 AppID
ALIPAY_PRIVATE_KEY  = 应用私钥（完整 PEM）
ALIPAY_PUBLIC_KEY   = 支付宝公钥
ALIPAY_NOTIFY_URL   = https://你的域名/api/pay/alipay/notify
ALIPAY_RETURN_URL   = https://你的域名/api/pay/alipay/return
```

**微信支付**（https://pay.weixin.qq.com 申请）：
```
WX_APPID      = AppID
WX_MCHID      = 商户号
WX_APIKEY     = API 密钥
WX_NOTIFY_URL = https://你的域名/api/pay/wechat/notify
```

然后去支付宝/微信后台把回调地址配好即可。
