# dsh-sidebar-groups

[![npm version](https://img.shields.io/npm/v/dsh-sidebar-groups?color=4d6bfe)](https://www.npmjs.com/package/dsh-sidebar-groups)
[![license](https://img.shields.io/npm/l/dsh-sidebar-groups)](LICENSE)
[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-4d6bfe)](https://github.com/topics/dsh-plugin)

Groups the DeepSeek Harness sidebar's panel rows: two stay pinned at the top, the
rest fold under a collapsible **Tools** row, and rows can be dragged between the
two groups. A client-only plugin — no DSH source changes, no patched `app.asar`,
uninstalling restores the sidebar as shipped.

> 侧边栏那一长串面板入口（插件 / 插件市场 / 自动化任务 / 任务看板 / 上下文洞察 / 灵枢 /
> 记忆系统 …）分成两组：**两行常驻**（插件、自动化任务），其余收进可折叠的「工具」组；
> 拖动即可在两组之间搬运。纯客户端插件，不改 DSH 本体。

## 效果

```
插件              ← 常驻
自动化任务         ← 常驻
工具  5  ⌄        ← 点一下收起/展开
  插件市场         ┐
  任务看板         │ 展开后缩进显示
  上下文洞察       │
  灵枢             │
  记忆系统         ┘
更多
```

## 交互

- **点「工具」**：展开 / 收起，箭头跟着转；收起时右侧显示组内入口数量。
- **拖动**：
  - 把常驻行拖到「工具」行上 → 收进工具组；
  - 展开后把工具组里的一行拖到上面任意常驻行上 → 拉出来固定，插到该行的位置；
  - 常驻区内部拖动可调整顺序。
- **右键任意行**：菜单里也能完成同样的移动（拖动不可用时的退路）。
- 状态存在 `localStorage`（键 `dsh.sidebar-groups.v1`），刷新、重启桌面版后保持。
- 侧边栏收成 56px 图标轨时，「工具」行自动隐藏，图标轨保持原样。
- React 重新渲染侧边栏后会自己补回，不需要刷新页面。

## 安装

### npm（推荐）

```sh
dsh plugin --profile <profile> add dsh-sidebar-groups
```

### GitHub（不发 npm 也能装）

```sh
dsh plugin --profile <profile> add git+https://github.com/yangdinghui/dsh-sidebar-groups.git
```

`lib/client.js` 是预构建的 module-loader bundle，从源码安装**不需要构建步骤**。

### 桌面版 / 插件页

侧边栏 →「插件」→「添加插件」，填包名 `dsh-sidebar-groups`，或本目录 / 打包后的 tgz
绝对路径；启用后如果侧边栏没变化，重启一次 DeepSeek Harness 桌面版（客户端模块图在启动时组装）。

> 桌面版的 `desktop` profile 由 Electron 应用独占管理，`dsh plugin` 会拒绝直接写入，请走插件页。

### 本地 tgz

```sh
npm pack   # dsh-sidebar-groups-0.1.0.tgz
dsh plugin --profile <profile> add ./dsh-sidebar-groups-0.1.0.tgz
```

## 卸载

插件页停用或删除即可。插件会把插入的行、样式和行上的 `order` 全部还原，不留脏 DOM。

## 实现要点

- 侧边栏的导航是一整个 `<nav class="…panelList">`，面板行是其中的 `button.…panelRow`。
  插件只往 nav 里**追加一个自己的按钮**，然后给每个真实行写 `style.order` 和
  `data-dsh-fold-zone`，靠 flex `order` 完成分组——**从不搬运 React 的节点**，所以不会打断
  React 的 reconciliation。
- 折叠靠一条 CSS：`nav[data-dsh-fold][data-dsh-fold-collapsed] > [data-dsh-fold-zone="tools"] { display: none }`。
- 变化监听挂在 `documentElement` 上（childList + class 属性），用一层签名缓存跳过无变化的渲染，
  聊天流式输出时不会每帧写 DOM。
- 所有选择器落空时安静退出；插件 apply 不向外抛错（Web shell 里 apply 抛错会中断整个启动）。

## 兼容性

- 面向 DSH **0.2.x**（`dsh-client-ui-sidebar` 提供 `panelList` / `panelRow` 的版本），Web 与桌面版通用。
- 故意不写死 `engines.dsh`：老版本上选择器落空时插件什么都不做，不会把侧边栏弄坏，也不会
  因为版本号把安装挡在门外。
- 依赖侧边栏的 DOM 结构（`nav.panelList` / `button.panelRow` / 用 `aria-label` 取面板名）。
  DSH 大版本改版后如果结构变了，最坏情况是「工具」行不出现，其余功能不受影响。
- 面板用 `aria-label` 识别：切换界面语言后，记住的常驻列表可能对不上，会退回默认
  （插件 + 自动化任务）——重新拖一次即可。

## 与 dsh-sidebar-fold 的区别

社区里已有一个 [dsh-sidebar-fold](https://github.com/drscrewdriver/dsh-sidebar-fold)：它把插件行
整体折叠到官方「更多」行下面，靠设置卡片配置。本插件换了模型——**分组 + 拖动**：两行常驻、
其余进「工具」组、行可以在两组之间拖来拖去，不需要进设置页。两者解决的是同一类需求的不同做法。

## 开发与自测

`test/harness.html` 是一个合成侧边栏（照抄真实的类名与结构），在无头 Chrome 里跑 40 项断言：
默认分组、折叠、拖动归组、右键菜单、持久化、React 重建自愈、图标轨模式、重载恢复。

```sh
cd dsh-sidebar-groups
python3 -m http.server 8791 --bind 127.0.0.1 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --virtual-time-budget=15000 \
  --dump-dom http://127.0.0.1:8791/test/harness.html | grep -A2 'RESULT:'
```

期望输出 `RESULT: PASS (40/40)`。

## 许可

MIT © 2026 yangdinghui
