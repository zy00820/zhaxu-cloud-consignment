# 栈序云寄售 - 后端部署指南

## 快速部署（Render，免费）

### 步骤 1：注册 Render 账号
访问 https://render.com ，用 GitHub 账号登录（免费）。

### 步骤 2：导入 Blueprint 一键部署
1. 点击右上角 **New** → **Blueprint**
2. 选择你的仓库 `zhaxu-cloud-consignment`
3. Render 会自动读取 `render.yaml`，点击 **Apply**

### 步骤 3：配置环境变量
在 Render 控制台 → 你的服务 → **Environment** 中填写：

**支付宝支付**（先申请 https://open.alipay.com）：
```
ALIPAY_APP_ID       = 你的应用 AppID
ALIPAY_PRIVATE_KEY  = 你的应用私钥（完整 PEM，含 -----BEGIN/END-----）
ALIPAY_PUBLIC_KEY   = 支付宝公钥
ALIPAY_NOTIFY_URL   = https://你的服务名.onrender.com/api/pay/alipay/notify
ALIPAY_RETURN_URL   = https://你的服务名.onrender.com/api/pay/alipay/return
```

**微信支付**（先申请 https://pay.weixin.qq.com）：
```
WX_APPID     = 公众号/小程序 AppID
WX_MCHID     = 商户号
WX_APIKEY    = API 密钥
WX_NOTIFY_URL = https://你的服务名.onrender.com/api/pay/wechat/notify
```

> 不想现在配置真实支付？`ALLOW_MOCK=true`（默认）会启用模拟支付，可先跑通流程。

### 步骤 4：更新前端后端地址
部署成功后，Render 会给你一个域名，例如：
```
https://zhaxu-cloud-consignment.onrender.com
```
把 `index.html` 中的 `API_BASE` 改为这个地址：
```js
const API_BASE = 'https://zhaxu-cloud-consignment.onrender.com';
```
提交并推送到 GitHub，GitHub Pages 会自动更新。

### 步骤 5：配置支付回调
- **支付宝**：登录支付宝开放平台 → 应用 → 回调地址 → 填入上面的 `ALIPAY_NOTIFY_URL`
- **微信支付**：登录微信支付商户平台 → 产品中心 → 开发配置 → 填入 `WX_NOTIFY_URL`

---

## 本地开发

```bash
npm install
cp .env.example .env   # 编辑 .env 填入你的配置
npm start
```
后端运行在 http://localhost:3000

---

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/market/products` | 商城在售商品列表 |
| POST | `/api/pay/create` | 创建支付订单 |
| POST | `/api/pay/mock/:orderId` | 模拟支付（触发自动发货）|
| POST | `/api/pay/alipay/notify` | 支付宝异步回调 |
| POST | `/api/pay/wechat/notify` | 微信支付异步回调 |
| GET | `/api/pay/status/:orderId` | 查询订单发货状态 |
| GET | `/api/buyer/orders/:phone` | 买家按手机号查订单 |

---

## 自动发货流程

```
买家下单 → 创建支付订单(pending_pay)
   ↓
支付宝/微信支付成功 → 回调通知后端
   ↓
后端验签 → 标记订单已支付
   ↓
autoShip()：取可用卡密 → 标记已售 → 写商家订单 + 买家订单
   ↓
前端轮询订单状态 → 展示卡密给买家
```

> **幂等保证**：`autoShip` 按订单号加锁，同一订单只会发货一次，避免重复发卡。
