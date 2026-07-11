# 桃子卡拉OK (PeachyKareoke) — 开发者文档

本文档介绍了 **桃子卡拉OK** (PeachyKareoke) 桌面客户端的架构设计、代码目录结构以及开发部署环境配置。

## 🛠️ 技术栈

* **外壳与原生窗口管理：** Electron 28
* **前端视图层：** React 18 & TypeScript 5
* **打包器与开发服务器：** Vite 5
* **音频处理引擎：** Web Audio API (基于浏览器的高优先级独立音频线程)
* **样式系统：** 自定义 Vanilla CSS

---

## 🏗️ 架构设计要点

### 1. 零复制本地音频流式加载
为了避免通过 Electron IPC 发送完整的 Base64 编码音频数据（这会严重阻塞 Electron 主进程和渲染进程并导致内存溢出），我们在 [main.ts](file:///f:/Kareoke/Kareoke/src/main.ts) 中注册了自定义媒体协议 `local-media://`。前端使用标准 `fetch()` 直接读取本地文件流并解码，无需通过 IPC 管道拷贝大量字节。

### 2. 多上下文音频设备输出路由
由于 Chromium 无法在单个 `AudioContext` 实例中对不同的音频节点输出分配不同的硬件 `sinkId`，我们初始化了两个独立的 `AudioContext` 来实现耳返与外放音响的完全物理隔离：
* `audienceContext`: 绑定观众外放音响的物理输出 `sinkId`。
* `monitorContext`: 绑定歌手监听耳机的物理输出 `sinkId`。

这两个 Context 共享相同的 context-neutral `AudioBuffer` 实例，并通过高精度的 epoch 硬件时间戳（`AudioContext.currentTime`）同步触发播放，从而避免多设备时钟漂移。

### 3. 实时时域变调 (Time-Domain Pitch Shifting)
在 [App.tsx](file:///f:/Kareoke/Kareoke/src/renderer/App.tsx#L70-L144) 中实现了一个轻量级的时域重叠相加 (OLA) 算法和线性插值重采样。与改变 `playbackRate` 会同时改变歌曲播放速度的传统方法不同，该算法将音频分帧（1024 采样点），通过动态缩放帧间距重叠混合，实现在**不改变播放速度/节奏**的情况下独立改变音调。

### 4. 麦克风超低延迟直通与实时人声效果链
我们通过在 `getUserMedia` 约束中显式关闭浏览器的内置回声消除、降噪和自动增益控制来获得最原始的麦克风人声音频流。随后将声音信号导入双架式滤波器（BiquadFilterNode，包含 150Hz 低架滤波器与 8kHz 高架滤波器）和一条高品质的反馈延时线（DelayNode & GainNode Loop）实现模拟人声混响，整体处理和往返延迟低于 15ms。

---

* `src/main.ts`: 主进程源码文件。编译输出为 `dist/main.js`（`package.json` 中配置的应用程序入口点）。
* `src/preload.ts`: 负责向渲染进程安全暴露 Electron 原生 IPC 接口的预加载脚本。
* `src/renderer/main.tsx`: React 前端页面入口点。
* `src/renderer/App.tsx`: 主 React 应用组件，包含 UI 布局与 Web Audio 混音音频图。
* `src/renderer/i18n.ts`: 多语言（en-US / zh-CN）国际化翻译字典与助手函数。
* `src/renderer/styles.css`: 统一的暗黑色调样式表，包含卡片组件、滑块、按钮微动画以及响应式网格布局。

---

## 💻 本地调试与构建

### 准备环境
* **Node.js:** v18.0.0 或更高版本
* **包管理器:** npm

### 开发环境启动
1. 安装项目所有依赖：
   ```bash
   npm install
   ```
2. 启动本地开发服务（包含热重载）：
   ```bash
   npm run dev
   ```

### 打包打包分发
要生成生产环境静态资源，并将其打包成独立的 Windows 安装程序 (`.exe`)：
```bash
npm run dist
```
打包成功后，输出的安装包位于 `/release` 目录下。
