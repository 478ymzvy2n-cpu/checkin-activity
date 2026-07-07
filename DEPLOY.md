# 21天打卡活动 - 部署指南

## 项目结构

```
checkin-activity-vercel/
├── api/
│   ├── submit-reward.js    # 奖品领取 API（写入飞书多维表格）
│   └── get-records.js      # 查询记录 API（可选）
├── public/
│   └── index.html          # 活动页面
├── vercel.json             # Vercel 配置
└── package.json
```

---

## 部署步骤

### 第一步：注册 Vercel 账号

1. 打开 https://vercel.com
2. 点击右上角 **Sign Up**
3. 选择 **Continue with GitHub**（用 GitHub 账号登录）
4. 授权 Vercel 访问你的 GitHub

### 第二步：获取飞书 API 凭证

1. 打开 https://open.feishu.cn/app
2. 点击 **创建自建应用**
3. 填写应用名称（如"打卡活动"），创建后进入应用详情
4. 左侧菜单找到 **凭证与基础信息**，记录：
   - **App ID**（类似 `cli_xxx`）
   - **App Secret**
5. 左侧菜单找到 **权限管理** → **添加权限**，搜索并添加：
   - `bitable:app`（读写多维表格）
6. 点击 **发布应用**，等待审批通过

### 第三步：上传代码到 GitHub

1. 在 GitHub 上创建一个新仓库（如 `checkin-activity`）
2. 把本项目的所有文件推送到仓库：

```bash
cd checkin-activity-vercel
git init
git add .
git commit -m "21天打卡活动"
git remote add origin https://github.com/你的用户名/checkin-activity.git
git push -u origin main
```

### 第四步：部署到 Vercel

1. 打开 https://vercel.com/new
2. 点击 **Import Git Repository**
3. 选择你刚创建的 GitHub 仓库
4. 在 **Environment Variables** 中添加以下环境变量：

| 变量名 | 值 |
|--------|-----|
| `FEISHU_APP_ID` | 你的飞书 App ID |
| `FEISHU_APP_SECRET` | 你的飞书 App Secret |
| `FEISHU_BASE_TOKEN` | `NyqDbsE5ga0dmQsfzbgcwZkkn0b` |
| `FEISHU_TABLE_ID` | `tblJgSHB9G2mDYNJ` |

5. 点击 **Deploy**
6. 等待部署完成（约1-2分钟）

### 第五步：验证

1. Vercel 会给你一个链接，如 `https://checkin-activity-xxx.vercel.app`
2. 打开链接，测试签到流程
3. 点击第3天签到，触发抽奖，填写表单提交
4. 打开飞书多维表格，确认数据已写入

---

## 数据流向

```
用户提交表单
    ↓
Vercel API: /api/submit-reward
    ↓
获取飞书 tenant_access_token
    ↓
调用飞书 Bitable API 写入记录
    ↓
飞书多维表格自动更新
```

---

## 容量说明

| 项目 | 免费额度 | 10万日访问够用？ |
|------|---------|--------------|
| Vercel Serverless | 100GB流量 + 100K请求/月 | ✅ 够用（约3K请求/天） |
| 飞书 API 调用 | 无限制（自建应用） | ✅ 够用 |
| CDN 静态资源 | 100GB/月 | ✅ 够用 |

超出免费额度后，Pro 计划 $20/月可支撑百万级请求。

---

## 挂载到 APP

把 Vercel 部署的链接填入 APP 后台的轮播图配置：

```
https://checkin-activity-xxx.vercel.app
```

页面已做移动端适配，WebView 内可正常显示。

---

## 常见问题

**Q: 数据没有写入飞书多维表格？**
A: 检查环境变量是否正确，查看 Vercel 控制台的 Function Logs。

**Q: 用户签到状态不同步？**
A: 当前签到状态存在用户浏览器本地。如需多设备同步，可开发用户系统（手机号登录）。

**Q: 如何修改奖品？**
A: 编辑 `public/index.html` 中的 `REWARDS` 数组，重新部署即可。
