# Poque

朋友消遣向德州扑克小游戏：局域网好友联机 + DeepSeek AI 单机对战。

📄 完整产品定义见 [`PRD.md`](./PRD.md)

## 核心定位

- **联机**：2–9 人局域网热座德州（mDNS 自动发现 + WebSocket）
- **单机**：一个人也能开完整赛事，对手为 DeepSeek 驱动的 AI（LLM + 规则兜底）
- **风格**：参考 Codex 桌面应用，椭圆牌桌 + 极简操作条
- **结算**：每局独立，淘汰制，柱状图结算页；无货币积累

## 技术栈

- **前端**：React + Vite + TypeScript + TailwindCSS + Zustand
- **后端**：Node.js + Express + Socket.IO
- **服务发现**：`bonjour-service`（mDNS，`_poque._tcp`）
- **AI**：DeepSeek 官方 SDK（deepseek-chat，OpenAI 兼容协议）
- **桌面端**：1440px+ 优先，不适配手机

## 快速启动（开发期）

```bash
# 1. 启动后端
cd server
npm install
npm run dev    # http://localhost:3000

# 2. 启动前端
cd client
npm install
npm run dev    # http://localhost:5173
```

打开浏览器访问 `http://localhost:5173`：

- **联机**：点「创建赛事」→ 朋友同 WiFi 打开同一网址即可看到房间
- **单机 vs AI**：先到 Settings 填入 DeepSeek API Key → 首页点「单机 vs AI」

## 路线图

| Phase | 内容 | 周期 |
| --- | --- | --- |
| 1 | 本地热座 MVP（无网络） | 1 周 |
| 2 | 局域网联机（Node + mDNS） | 1 周 |
| 3 | AI 单机模式（DeepSeek + 规则兜底） | 1 周 |
| 4 | 完整赛事流程（MTT/断线/结算/主题） | 1 周 |
| 5 | 打磨与发布 | 3 天 |

详见 [`PRD.md` §10](./PRD.md#10-开发路线图)
