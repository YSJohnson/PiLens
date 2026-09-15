<div align="center">

# PiLens

**A local desktop workspace for the [Pi coding agent](https://github.com/earendil-works/pi).**

会话、模型、资源、Git 变更 —— 全都在一个窗口里。

![platform](https://img.shields.io/badge/platform-Windows%20x64-0078D4?logo=windows&logoColor=white)
![electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![react](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)
![typescript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![node](https://img.shields.io/badge/Node.js-%E2%89%A522.19-5FA04E?logo=nodedotjs&logoColor=white)
![license](https://img.shields.io/badge/license-MIT-3DA639?logo=opensourceinitiative&logoColor=white)

</div>

PiLens 基于 Electron、React 与 TypeScript。主进程承载官方 `@earendil-works/pi-coding-agent` SDK，渲染进程只通过类型安全的 IPC 桥访问本地能力，不直接获得 Node.js 权限。

## 功能

**会话**
- 按项目浏览、新建、恢复、搜索、自动命名与手动重命名 Pi 持久化会话
- 流式回答、默认可展开的思考过程、工具参数 / 输出 / 耗时
- 消息排队与引导、随时终止当前任务
- 上下文 token、费用、压缩进度与历史；应用意外关闭后恢复原项目和精确会话
- 从任意历史用户消息继续当前分支，或 Fork 为独立 Pi 会话

**模型与凭据**
- 仅显示已连接服务的可搜索模型选择器，支持收藏、最近使用与按 Provider 分组
- 复用 Pi 已有的 OAuth、环境变量或本地凭据
- 用 Electron `safeStorage` 加密保存 API Key
- 可视化新增、编辑、删除自定义模型：OpenAI、Anthropic、Google、Ollama、vLLM、LM Studio

**资源**
- 安装、更新、卸载资源包
- 创建、启停、重载与调用 Skills
- 管理 Plugins 的工具、命令、快捷键，并查看加载诊断

**工作区**
- Git worktree 列表与切换
- 项目文件树、变更概览与完整 Diff 预览

**预览**：源码、Diff、Markdown、图片、音频、PDF 与 DOCX 的应用内预览，或交给系统默认程序打开。

**界面与系统集成**：无边框窗口、键盘快捷键、专注模式、响应式左右抽屉、舒适 / 大字号模式、深色 / 浅色 / 跟随系统主题、任务完成提示音、任务栏运行状态、失焦闪烁提示与超长消息 / 工具输出保护。

## 下载

Windows x64 安装程序见 [Releases](../../releases)（本地构建产物位于 `release/PiLens-<version>-x64.exe`）。

首次启动后选择一个本地项目文件夹。PiLens 会自动读取 Pi 已配置的 Provider，也可以在「设置」中添加 API Key。当前构建未使用商业代码签名证书，Windows SmartScreen 可能显示发布者未知。

## 从源码运行

要求 Node.js 22.19 或更新版本。

```powershell
npm install
npm run dev
```

只运行带明确预览标识的浏览器 UI（不连接真实 Pi，仅供 UI 开发）：

```powershell
npm run dev:web
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Electron 开发模式 |
| `npm run dev:web` | 浏览器 UI 预览，始终显示 `PREVIEW` 标识 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint，零警告 |
| `npm test` | Vitest 单元测试 |
| `npm run build` | 类型检查 + electron-vite 构建 |
| `npm run package` | 打包为目录版（`release/win-unpacked`） |
| `npm run dist` | 生成 NSIS 安装包 |
| `npm run qa:renderer` | Edge + DevTools 协议的 UI 回归，覆盖布局、模型选择、主题、资源生命周期、OAuth、分支 / Fork、worktree 与文件树 |
| `npm run smoke:packaged` | 启动生产包，验证 preload 桥、运行模式、Provider / 模型目录与首屏渲染 |

## 架构

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 主进程 | `electron/main.ts` | 窗口、IPC 注册、应用生命周期 |
| 服务层 | `electron/pi-service.ts` | Pi 会话、模型、Provider 与资源 |
| 工作区 | `electron/workspace-service.ts`、`electron/git-changes.ts` | 项目文件树、Git 状态与 Diff |
| 桥 | `electron/preload.ts` | 通过 `contextBridge` 暴露受控 API |
| 渲染层 | `src/` | React UI，无 Node 权限 |
| 契约 | `src/shared/contracts.ts` | 主进程与渲染层共享的类型定义 |

## 安全边界

渲染进程启用了 sandbox 与 context isolation，并关闭 Node integration。文件访问、项目选择、Git 检查、模型配置和 Pi 会话操作都经过受控 preload 桥；工作区文件打开操作会验证路径没有逃逸项目根目录。

## 文档

- [设计说明](docs/DESIGN.md)
- [第三方许可证](THIRD_PARTY_NOTICES.md)

## 非官方声明

PiLens 由社区维护，与 [Pi](https://github.com/earendil-works/pi) 官方项目无隶属关系，也未获得其背书。Pi 及相关名称、标识归各自所有者所有。

## License

[MIT](LICENSE) © 2026 YSJohnson
