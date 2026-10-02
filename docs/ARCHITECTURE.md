# 当前架构

普通 VS Code 扩展注册 `.inkspace.json` Custom Editor 和页面树。打开笔记时检查本机服务，必要时启动随插件打包的 Ink Engine。编辑和保存使用 WorkspaceEdit 与 TextDocument API。

```mermaid
flowchart LR
  Pen[Windows 触控笔] --> Raw[Raw Input 后台采集]
  Raw --> Engine[独立 Ink Engine]
  Engine -->|本机 WebSocket 原始采样| View[VS Code Webview]
  View -->|异步栅格请求| Engine
  Engine --> Cairo[Cairo 工作进程]
  Cairo -->|RGBA 位图| View
  View --> Extension[普通 VS Code 插件]
  Extension --> File[inkspace.json 笔记]
```

服务仅监听 127.0.0.1，使用随机令牌鉴权。采样、Cairo 绘制和 IDE 插件分开运行，不注入 IDE 窗口，不修改 VS Code 安装文件。

校准将 HID 原始坐标映射到屏幕坐标。持久化记录按稳定的设备路径标识和显示配置匹配；运行时设备句柄改变不影响恢复。浏览器指针用于校准和窗口坐标偏移，书写轨迹使用 HID 原始坐标与压力。

移动和缩放时，未就绪的可见区域立即显示缓存的 Xournal++ SVG 轮廓预览。Cairo 位图全部准备好后统一替换，避免逐笔加载。常见笔迹完整位图在相同倍率下复用，较大笔迹裁剪到视口以控制内存。

历史独立桌面和 VSCodium 宿主使用 Windows Pointer/HIMETRIC 路线；Theia 和这些宿主保留用于参考与回归，不是普通 VS Code 插件的运行依赖。
