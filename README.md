# 🎵 商用音响官网 - AI 智能销售助手

一个可直接上线的公司官网模板 + AI 聊天销售助手。专为商用音响/连锁背景音乐行业的公司设计。

## 功能

- **公司官网**：首页展示品牌、核心优势、服务案例、数据看板
- **AI 智能助手**：嵌入网页底部的聊天组件，通过对话逐步了解潜在客户信息（称呼、业态、规模、联系方式等），最终生成需求摘要提示词，引导客户发邮件
- **后端安全代理**：通过 Cloudflare Worker 调用 LLM API，API Key 不暴露在前端

## 技术栈

| 层 | 技术 | 费用 |
|---|---|---|
| 前端 | 原生 HTML/CSS/JS | 免费 |
| 托管 | GitHub Pages | 免费 |
| AI 后端 | Cloudflare Workers | 免费 ~ $5/月 |
| LLM | OpenAI / DeepSeek / 智谱等 | 按用量 |

## 快速开始

```bash
# 1. 部署后端 Worker
cd worker
wrangler deploy
wrangler secret put LLM_API_KEY  # 输入你的 API Key

# 2. 修改前端配置
# 在 site/index.html 中填入 Worker URL

# 3. 部署前端到 GitHub Pages
git init && git add . && git commit -m "init"
git remote add origin 你的仓库地址
git push -u origin main

# 4. 在 GitHub 仓库 Settings → Pages 中开启
```

详细步骤见 [`deploy-guide.md`](deploy-guide.md)。

## 项目结构

```
├── site/                  # 静态站点（GitHub Pages）
│   ├── index.html         # 官网 Demo 页
│   └── assets/
│       ├── chat-widget.js  # 聊天组件
│       └── chat-widget.css # 聊天组件样式
├── worker/                # Cloudflare Worker
│   ├── wrangler.toml
│   └── src/index.js       # Worker 逻辑 + 系统提示词
└── deploy-guide.md        # 部署指南
```

## 定制指南

- **修改公司信息**：编辑 `worker/src/index.js` 中的 `SYSTEM_PROMPT`
- **修改对话流程**：编辑系统提示词中的对话阶段描述
- **修改 UI 主题色**：编辑 `chat-widget.css` 中的蓝色系颜色值
- **更换 LLM 模型**：通过 Cloudflare Dashboard 设置环境变量
