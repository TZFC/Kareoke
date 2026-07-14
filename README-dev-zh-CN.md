# Peachy Karaoke - 开发者文档

欢迎查阅 Peachy Karaoke 的开发者文档。本项目是一个使用 Electron、React 和 TypeScript 构建的桌面应用程序，提供完全离线的高级 AI 音频分离、歌词转录和简谱生成功能。

## 架构说明

应用程序主要分为两个进程：

### 1. 主进程 (`src/main.ts`)
Node.js 后端，负责处理繁重的工作、文件处理和 AI 推理。
- **IPC 桥接：** 通过 `src/preload.ts` 监听来自渲染进程的命令。
- **FFmpeg：** 将用户音频标准化为标准的 WAV 格式。
- **AI 提取伴奏 (`src/ai/separateStems.ts`)：** 使用 `demucs` 包加载 ONNX HTDemucs 模型，将音频分离为伴奏和人声轨。
- **AI 生成歌词 (`src/ai/generateLRC.ts`)：** 使用 `@xenova/transformers` (Whisper-tiny) 将人声轨转录为带时间轴的 `.lrc` 文本。
- **AI 生成简谱 (`src/ai/generateNMN.ts`)：** 使用 `@spotify/basic-pitch` 评估 22050Hz 单声道的人声轨，提取 MIDI 音高并将其映射到简谱记号。

### 2. 渲染进程 (`src/renderer/App.tsx`)
React 前端，负责 UI 呈现和 Web Audio API 实时音频处理。逻辑被清晰地模块化为多个自定义 Hook：
- **`useAudioContexts`：** 管理主要的 AudioContext 以及用于路由的子上下文（监听/观众）。
- **`useMicEngine`：** 处理麦克风输入，配备实时 DSP 效果链（双二阶滤波器 EQ、Freeverb 混响、DynamicsCompressorNode 限幅器）。
- **`usePlaybackEngine`：** 管理分离出的音轨（人声与伴奏）的播放，应用变调和偏移计算。为优化渲染性能，播放进度通过 `MutableRefObject` 进行跟踪，而非 React 状态，从而绕过协调引擎实现 60fps 的流畅 UI 更新。
- **`useConfigSync`：** 防抖并持久化保存用户的配置更改至本地磁盘。
- **`useSongLibrary`：** 管理文件系统状态和曲库目录。

## 开发环境设置

### 前置要求
- Node.js 18+
- npm 或 yarn

### 安装依赖
```bash
npm install
```

### 本地运行
以开发模式启动 Electron 应用程序，支持 React 热模块替换 (HMR)：
```bash
npm run dev
```

### 构建生产版本
将应用程序打包为 Windows 独立可执行文件：
```bash
npm run build
```

## AI 模型
所有 AI 依赖项均在本地加载运行：
- **Demucs**: 存储于 `node_modules/demucs/htdemucs.onnx`
- **Whisper**: 通过 `transformers.js` 获取或从缓存加载
- **Basic Pitch**: 存储于 `node_modules/@spotify/basic-pitch/model/model.json`

## 自动更新与发布
如需触发新的生产环境发布与自动更新：
1. 更新 `package.json` 中的版本号。
2. 提交并将代码推送到 GitHub。
3. 转到 GitHub 上的 **Actions** 选项卡，选择 **Release** 工作流，然后点击 **Run workflow**。
GitHub Action 将自动构建 NSIS 安装包并作为 GitHub Release 发布。应用程序启动时会自动检查更新。
