# 发布新版本

从改代码到用户机器上生效。全部命令都在仓库根目录执行。

发布走 **npm Trusted Publishing（OIDC）**：推 `v*` tag 后 GitHub Actions 自动发 npm，
不需要登录、不需要 OTP、不需要长期 token。

## 一次性配置（只需要做一次）

在 https://www.npmjs.com/package/dsh-sidebar-groups → **Settings → Trusted Publisher** 里：

| 字段 | 值 |
|---|---|
| Publisher | GitHub Actions |
| Organization or user | `yangdinghui` |
| Repository | `dsh-sidebar-groups` |
| Workflow filename | `publish.yml`（必须带 `.yml`，区分大小写） |
| Environment | 留空 |

如果页面提供「允许直接 `npm publish`」的开关（staged publishing 相关），打开它。

配好后 `.github/workflows/publish.yml` 在推 tag 时就能拿到 OIDC 身份发布。**runner 必须是
GitHub 托管的**（自托管 runner 不支持）。

## 1. 改完先自测

```sh
npm test
```

它会在本机起一个临时 HTTP 服务，用无头 Chrome 打开 `test/harness.html`，跑 47 项断言
（默认分组、折叠、拖入拖出、右键菜单、持久化、React 重建自愈、图标轨、重载恢复、
0.2.1 旧外壳兼容）。期望 `RESULT: PASS (47/47)`，退出码 0。

找不到 Chrome 时用 `CHROME_BIN=/path/to/chrome npm test`。

## 2. 升版本号

```sh
npm version patch -m "release: v%s"    # 修 bug
npm version minor -m "release: v%s"    # 加功能
```

`npm version` 会改 `package.json`、提交一次、打一个 git tag。**版本号必须变**，否则 tag 校验会拦下。

## 3. 推 tag（触发自动发布）

```sh
git push --follow-tags
```

然后看 Actions：

```sh
gh run list --workflow publish.yml --limit 3
```

workflow 会先校验「tag 名 == `v` + package.json 版本」，再跑 `npm test`，最后 `npm publish`。

## 4. 验证

```sh
npm view dsh-sidebar-groups version --registry=https://registry.npmjs.org
```

⚠️ **npm 现在是异步发布**：CI 成功 ≠ 立刻可查。注册表可能先回 `202 being processed`，
通常几分钟后才出现在 `versions` 里；刚发完查不到是正常的，等 5–10 分钟。

如果 workflow 报 `ENEEDAUTH`：先确认 npm 包设置里的 **workflow 文件名一字不差**（含 `.yml`），
以及 runner 是 GitHub 托管的。

## 5. 用户侧怎么更新

- **dsh-market（插件市场）**：插件卡片上会出现 Update，一键升级。
- **CLI**：`dsh plugin --profile <profile> add dsh-sidebar-groups@<版本>`。
- **桌面版插件页**：使用插件页里的更新入口，或卸载后重装。

## 手动发布（备用）

Trusted Publishing 不可用时（比如不在 GitHub Actions 里）：

```sh
npm login --registry=https://registry.npmjs.org
npm publish
```

npm 会打开浏览器做 2FA，然后返回 `202`，几分钟后生效。注意：本机 npm token 会过期/被吊销，
失效时 publish 报的是 **404 Not Found**（不是 401），别被误导——先 `npm whoami` 确认登录。

## 不用重新提 PR 的部分

- **插件市场 / 官网的 catalog**：条目只登记仓库 URL，版本号、下载量从 npm 自动读取，
  发新版本后自动跟进。
- **描述、图标、截图变了**：改 `docs/awesome-dsh-plugin-entry.yml` 后到 awesome-dsh-plugin 提 PR；
  截图放仓库根目录的 `screenshots.json`，market 下次构建自动生效。

## 不要动的东西

- **包名 `dsh-sidebar-groups`** 和 `lib/client.js` 里 `__ModuleLoader__.load({ id })` 的 id：
  两者必须一致，改了等于换了一个插件——用户要卸载重装，市集条目也要重提。
- **`cordis.patch.yml` 里的 entry id**：同理，它是配置树的定位键。
- **`lib/client.js` 保持手写产物**：这个仓库没有构建步骤，文件就是发布产物；改了直接发。
