# PeachyKareoke 开发者指南

本文档介绍了如何设置、构建及参与 PeachyKareoke 代码库的开发。

## 技术栈
- **Electron**: 应用程序框架
- **React 18**: UI 渲染
- **Vite**: 前端打包工具与开发服务器
- **TypeScript**: 强类型支持（主进程与渲染进程均使用）
- **Web Audio API**: 高级音频处理与路由矩阵
- **SoundTouchJS**: 领先的 AudioWorklet 实时变调算法
- **Demucs**: 本地自动人声/伴奏音轨分离

## 项目结构
```text
PeachyKareoke/
├── src/
│   ├── main.ts              # Electron 主进程 (系统集成, HTTP 服务)
│   ├── preload.ts           # 上下文桥接 API (window.electronAPI)
│   └── renderer/            # React UI (渲染进程)
│       ├── components/      # UI 模块化组件 (DeviceSelector, PlaybackControls 等)
│       ├── hooks/           # 核心音频与逻辑 Hook (useAudioEngine.ts)
│       ├── utils/           # 辅助脚本 (音频处理, LRC 解析)
│       └── App.tsx          # React 应用主入口
├── dist/                    # 编译输出目录
├── package.json             # NPM 依赖与脚本
└── vite.config.ts           # Vite 打包配置
```

## 环境设置与运行

1. **安装 Node.js 与 NPM**
2. **安装依赖**:
   ```bash
   npm install
   ```
3. **以开发模式运行**:
   ```bash
   npm run dev
   ```
   此命令将并行运行 Vite、编译 TypeScript 主进程脚本，并启动启用了热模块替换 (HMR) 的 Electron 应用。

## 生产构建
如需打包应用程序以供分发（在 Windows 上默认生成 `.exe` NSIS 安装包）：
```bash
npm run dist
```

## 架构说明
- **音频路由**: 本应用使用了两个独立的 Web `AudioContext`，分别处理“观众 (Audience)”和“监听 (Monitor)”输出流。这允许将音频发送至不同的物理设备目标，并隔离各自的增益/滤波链路。
- **变调 (Pitch Shifting)**: 避免使用传统的时间域 (Time-domain) 或延迟节点 (Delay Node) 方法。PeachyKareoke 在音频图中注入了自定义的 `SoundTouchNode`，以便在独立的音频线程上动态处理锁相的 WSOLA 变调。
- **本地数据存储**: 在开发过程中，歌曲、配置及分离出的音轨均保存在根目录下的 `PeachyKareoke` 文件夹中。而在生产环境中，这些数据将被放置在操作系统标准的 `app.getPath('userData')` 路径下。
