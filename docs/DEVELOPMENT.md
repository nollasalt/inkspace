# 开发、测试和打包

主线：`vscode/` + `ink-engine/`。插件版本位于 `vscode/package.json`；根目录版本用于独立桌面程序，二者分别管理。

## Windows x64 环境

Node.js、npm、MinGW GCC/G++、Python、Ninja，以及 Microsoft VS Code。原生构建的来源与步骤见 `native/UPSTREAM.md` 和 `scripts/build-native.cjs`。

```powershell
npm ci
npm run build:native
npm run build
npm run build:engine
npm run start:engine:vscode
```

开发启动器使用隔离的配置目录。正常安装插件后直接打开笔记即可，无需开发启动器。

## 验证

```powershell
npm test
npm run test:arrangement
npm run test:workbench
npm run test:blocks
npm run test:ownership
npm run test:text:caret
npm run test:engine
```

`test:workbench` 在实际 Chromium 中验证布局、主题、控件尺寸、独立设备工具状态、基本文本编辑、尺寸策略及 PDF 放置。`test:engine` 验证校准及持久化，接着在真实 Microsoft VS Code 和独立引擎内执行 0.11 工作台验证：300 个小数坐标采样、60 次快速打点、100 次延迟回包打点、连续缩放、焦点返回、公共控件、居中插入及二进制保存重开。结果位于 `artifacts/workbench-vscode-test/result.json`。合成采样不替代实体触控笔手感验证。

旧的 `test:engine:legacy`、`test:engine:binary` 保留 0.8 宿主诊断入口，部分断言引用已经移除的块顶部控件；不用于当前工作台界面验收。旧诊断源码保留在 `vscode/diagnostics.js`，只在验证宿主加载。

保留原 VSCodium 路线时可运行 `npm run test:vscode`，需要已有原生宿主构建。

## 构建分发文件

已有原生模块和前端构建后：

```powershell
npm run dist:vscode
npm run dist:vscode:bundle
```

前者生成 Windows x64 VSIX，后者生成含插件、对应源码、安装说明和校验和的跨电脑分发包。打包不会发布 Marketplace。

生成输出不提交 Git：`node_modules/`、`dist/`、`artifacts/`、`vscode/media/`、`vscode/engine-runtime/`、原生二进制与构建缓存。用户 `.inkspace.json` 文件保持原位且被 Git 忽略。

`test:arrangement` 验证固定屏幕吸附容差、等距、Alt 跳过、只预览调宽、锁定后移动/删除/微移拦截、混合层级命中、原生图形拖动、对齐的一步撤回、事务异常回滚、复制元数据、书签后退及切换画布/失焦。保存失败与崩溃恢复测试同时携带锁定、层级、区域和内部链接字段。
