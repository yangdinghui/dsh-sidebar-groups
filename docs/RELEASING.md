# 发布新版本

从改代码到用户机器上生效，一共五步。全部命令都在仓库根目录执行。

## 1. 改完先自测

```sh
npm test
```

它会在本机起一个临时 HTTP 服务，用无头 Chrome 打开 `test/harness.html`，跑 40 项断言
（默认分组、折叠、拖入拖出、右键菜单、持久化、React 重建自愈、图标轨、重载恢复）。

期望最后一行是 `RESULT: PASS (40/40)`，退出码 0。找不到 Chrome 时用
`CHROME_BIN=/path/to/chrome npm test`。

## 2. 升版本号

```sh
npm version patch -m "release: v%s"    # 0.1.0 → 0.1.1，修 bug
npm version minor -m "release: v%s"    # 0.1.0 → 0.2.0，加功能
```

`npm version` 会顺手改 `package.json`、提交一次、打一个 git tag。**版本号必须变**：npm 不允许
覆盖已发布的版本。

## 3. 推 GitHub

```sh
git push --follow-tags
```

## 4. 发 npm

```sh
npm publish
```

会提示 `Enter OTP:`，输入认证器里的 6 位码。`package.json` 的 `publishConfig.registry` 已指向
官方源，本机默认的 npmmirror 镜像不影响发布。

验证：

```sh
npm view dsh-sidebar-groups version
```

## 5. 用户侧怎么更新

- **dsh-market（插件市场）**：插件卡片上会出现 Update，一键升级。
- **CLI**：`dsh plugin --profile <profile> add dsh-sidebar-groups@0.1.1`，或删掉重装。
- **桌面版插件页**：卸载后重新安装，或使用插件页里的更新入口。
- 装的是本地目录 / tgz 的：换成新路径或新 tgz 重装一次。

## 不用重新提 PR 的部分

- **插件市场 / 官网的 catalog**：条目只登记仓库 URL，版本号、下载量从 npm 实时/每次构建读取，
  发新版本后自动跟进，不用再提 PR。
- **描述、图标、截图变了**：改自己仓库里的 `docs/awesome-dsh-plugin-entry.yml` 提交到
  awesome-dsh-plugin（一条 PR），截图则更新仓库根目录的 `screenshots.json` 与图片，market 下次
  构建自动生效。

## 不要动的东西

- **包名 `dsh-sidebar-groups`** 和 `lib/client.js` 里 `__ModuleLoader__.load({ id })` 的 id：
  两者必须一致，改了等于换了一个插件——用户要卸载重装，市集条目也要重提。
- **`cordis.patch.yml` 里的 entry id**：同理，它是配置树的定位键。
- **`lib/client.js` 保持手写产物**：这个仓库没有构建步骤，文件就是发布产物；改了直接发。
