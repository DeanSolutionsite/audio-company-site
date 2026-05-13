# 部署指南

## 整体架构

```
用户浏览器 ──→ GitHub Pages（静态站点：官网 + 聊天组件 + 管理后台）
                      │
                      │  (聊天消息 → POST /)
                      │  (联系方式 → POST /save-lead）
                      │  (管理员查看 → GET /get-leads?token=xxx）
                      ▼
              Cloudflare Worker（LLM API 代理 + KV 存储）
                      │
                      ├──→ LLM API（OpenAI / DeepSeek / 智谱 / 通义千问 等）
                      │
                      └──→ KV 存储（保存客户线索，管理员可查看）
```

---

## 第一步：部署 Cloudflare Worker（后端）

**全部在 Cloudflare Dashboard 网页操作，不需要命令行。**

### 1.1 创建 Worker

1. 打开 https://dash.cloudflare.com 登录
2. 左侧菜单 → **"Workers 和 Pages"**
3. 点 **"创建应用程序"**
4. 选 **"创建 Worker"** → 点 **"部署"**
5. 给 Worker 取名：**`audio-company-ai`** → 点 **"部署"**
6. 部署成功后点 **"编辑代码"**
7. 左边编辑器里 Ctrl+A 全选删除默认代码
8. 把项目里的 `worker/src/index.js` 的完整代码 **Ctrl+V 粘贴进去**
9. **Ctrl+S 保存**，点 **"保存并部署"**

### 1.2 设置 API Key（让 Worker 能调用大模型）

1. 在 Worker 页面点上面的 **"设置"** 标签
2. 左边选 **"变量"**
3. 往下翻到 "环境变量"，点 **"添加变量"**，逐个添加：

| 变量名 | 值 | 加密 |
|--------|-----|------|
| `LLM_API_KEY` | 你的 API Key（如 OpenAI 的 sk-xxx） | ✅ 勾选 |
| `ADMIN_TOKEN` | 管理后台的密码（如 yinlian2026） | ✅ 勾选 |
| `COMPANY_NAME` | 音链科技有限公司 | 否 |
| `COMPANY_EMAIL` | 你自己的公司邮箱 | 否 |

如果不用 OpenAI（比如用 DeepSeek），多加两个变量：

| 变量名 | 值 |
|--------|-----|
| `LLM_API_ENDPOINT` | `https://api.deepseek.com/v1/chat/completions` |
| `LLM_MODEL` | `deepseek-chat` |

点 **"保存"**。

### 1.3 创建 KV 存储（用来存客户线索）

1. 左侧菜单 → 回到 Cloudflare Dashboard 首页
2. 左侧菜单 → **"Workers"** → **"KV"**
3. 点蓝色 **"创建命名空间"**
4. 名称填 **`audio-company-leads`** → 点 **"创建"**
5. 回到你的 Worker 页面（左侧菜单 Workers 和 Pages → 点 `audio-company-ai`）
6. 点 **"设置"** → **"变量"** → 往下翻到 **"KV 命名空间绑定"**
7. 点 **"添加绑定"**：
   - 变量名称：**`LEADS`**
   - KV 命名空间：选你刚创建的 `audio-company-leads`
8. 点 **"保存"**

### 1.4 验证 Worker 是否正常

回到 Worker 的 **"部署"** 标签页，你会看到一个地址：
`https://audio-company-ai.xxxx.workers.dev`

复制这个地址，后面要用。

---

## 第二步：修改前端配置

### 2.1 编辑 `site/index.html`

找到这行（在文件底部）：

```javascript
AudioChat.init({
  workerUrl: '',  // ← 改成你的 Worker 地址
  ...
});
```

改成：

```javascript
workerUrl: 'https://audio-company-ai.xxxx.workers.dev',
```

### 2.2 编辑 `site/admin.html`

找到这行（在 JS 代码开头）：

```javascript
const WORKER_URL = '';  // ← 改成你的 Worker 地址
```

改成：

```javascript
const WORKER_URL = 'https://audio-company-ai.xxxx.workers.dev';
```

另外在 admin 页面打开后，输入的就是你在环境变量里设的 `ADMIN_TOKEN`（默认是 admin123，建议改掉）。

---

## 第三步：部署前端到 GitHub Pages

### 3.1 推送到 GitHub

```bash
# 在项目根目录（D:/OH-WorkSpace/audio-company-site）执行
git init
git add .
git commit -m "初始化官网+AI助手+管理后台"
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

### 3.2 开启 GitHub Pages

1. 进入 GitHub 仓库 → Settings → Pages
2. Source 选择 "Deploy from a branch"
3. Branch 选 `main`，目录选 `/site`
4. 点 Save
5. 等 1~2 分钟，出现绿色提示：`https://你的用户名.github.io/仓库名/`

---

## 第四步：绑定域名（可选）

推荐用 Cloudflare DNS，买好域名后：

1. Cloudflare Dashboard → 添加域名
2. 修改域名的 DNS 服务器为 Cloudflare 的
3. 在 DNS 设置里加一条 **CNAME** 记录：
   - 名称：`@` 或 `www`
   - 目标：`你的用户名.github.io`
4. 回到 GitHub 仓库 Settings → Pages → Custom domain 填入你的域名

---

## 整个系统的工作流程

### 客户在官网聊天

```
1. 客户打开官网，点击右下角聊天按钮
2. AI 助手打招呼，开始专业诊断流程：
   ① 问称呼 → ② 问行业/品牌/装修风格 → ③ 推导曲风
   ④ 据此推荐喇叭类型 → ⑤ 问面积 → ⑥ 问有无吊顶 → ⑦ 问功能需求
3. AI 生成完整的需求档案（含曲风建议、喇叭选型、安装方式等）
4. 聊天界面自动弹出联系方式表单
5. 客户填写姓名+手机号+邮箱 → 点击提交
6. 数据安全地存在 Cloudflare KV 中
```

### 团队查看线索

```
1. 打开 https://你的网址/admin.html
2. 输入管理员密码（即你设置的 ADMIN_TOKEN）
3. 看到所有客户线索列表，按时间倒序排列
4. 点击每条线索可展开查看完整的需求档案
```

---

## 常见问题

### 聊天没反应/跨域报错

检查 `site/index.html` 里的 `workerUrl` 是否写对了，末尾不要有斜杠。

### 表单提交后提示 KV 未绑定

说明没做 1.3 步的 KV 绑定设置，回 Cloudflare Dashboard 重新走一遍。

### 管理后台进不去/密码错误

检查 `ADMIN_TOKEN` 环境变量是否设置正确，或者在 Worker 设置里重新添加。

### 想换大模型

改环境变量 `LLM_API_ENDPOINT` 和 `LLM_MODEL` 即可。

### 对话历史存在哪

存在用户浏览器内存里，刷新就消失。客户提交联系方式后，需求档案才会持久化存到 KV。

### 想修改 AI 的对话逻辑

编辑 `worker/src/index.js` 中的 `SYSTEM_PROMPT` 部分，改完后重新复制到 Cloudflare 编辑器覆盖保存。

---

## 项目文件说明

```
audio-company-site/
├── site/                         # GitHub Pages 托管的静态站点
│   ├── index.html                # 官网 Demo 页面
│   ├── admin.html                # 线索管理后台（密码保护）
│   └── assets/
│       ├── chat-widget.js        # 聊天组件 JS（含联系方式表单逻辑）
│       └── chat-widget.css       # 聊天组件样式
├── worker/                       # Cloudflare Worker 后端
│   ├── wrangler.toml             # Worker 配置文件
│   └── src/
│       └── index.js              # Worker 主逻辑（对话引擎 + 线索存储 + 管理接口）
├── README.md
└── deploy-guide.md               # 本文件
```
