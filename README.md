# DOM Locator

一个纯 Chrome、仅面向 macOS 的开发辅助插件。它会读取页面上的 `data-insp-path` 一类属性，在按住 `Alt` 时高亮可定位 DOM，并在 `Alt + Click` 时拉起 VS Code 打开源码位置。

## Current Status

当前目录已经包含一个可直接通过 `Load unpacked` 加载的 Manifest V3 插件成品，不需要安装依赖或执行构建命令。

## Supported Metadata Format

页面上的属性值默认形如：

```html
data-insp-path="packages/L2/play-shared/src/components/SkillManagerV2/components/ManageCard.tsx:159:7:div"
```

解析规则：

- `packages/L2/.../ManageCard.tsx` 作为相对路径
- `159` 作为行号
- `7` 作为列号
- 其余尾部字段只用于展示，不参与打开文件

## Features

- 按住 `Alt` 进入 inspect mode
- 鼠标移动时高亮最近一个带目标属性的元素
- 浮层显示相对路径和行列
- `Alt + Click` 通过 `vscode://file/...` 打开源码
- Options 页支持配置：
  - workspace 根目录
  - DOM 属性名
  - 生效 host 规则
  - modifier key

## Directory

```text
browser-plugins/dom-locator/
  AGENTS.md
  openspec/AGENTS.md
  manifest.json
  background.js
  content-script.js
  options.html
  options.css
  options.js
  README.md
```

## Install

1. 打开 Chrome 的 `chrome://extensions`
2. 开启 `Developer mode`
3. 点击 `Load unpacked`
4. 选择当前目录：

```text
/Users/bytedance/mydir/dev/zy-hub/browser-plugins/dom-locator
```

5. 插件首次安装后会自动打开设置页

## Setup

在 options page 中至少配置：

- `Workspace Root`
  - 例如 `/Users/bytedance/mydir/dev/project-root`
- `Enabled Hosts`
  - 例如 `localhost`
  - 或 `*.test.byted.org`

默认属性名为 `data-insp-path`。

## Usage

1. 打开已注入 `data-insp-path` 的开发页面
2. 按住 `Alt`
3. 将鼠标移动到目标元素上，插件会自动高亮最近的可定位元素
4. 继续按住 `Alt` 点击，即可在 VS Code 中打开对应文件和行列

## Notes

- 当前版本只支持单一 workspace 根目录
- 当前版本只支持 `Alt`
- 当前版本不支持跨域 iframe
- 插件不发送网络请求，不上传 DOM 或路径信息
