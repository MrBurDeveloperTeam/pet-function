# 核心包与同仓库 Release 资源包

所有代码、图片、家具、服装和游戏仍在当前 `pet-function` 仓库中编辑。
不需要新建仓库，也不需要手动移动图片。资源的发布方式由构建脚本自动处理。

## 本地开发

- 界面和逻辑继续修改 `src/`。
- 图片与游戏运行文件继续修改 `public/`；Godot 源项目仍在 `godot/`。
- 本地源码工作区直接使用其 `public/`，可以立即看到素材修改，不下载 Release。
- `npm run build` 构建代码，并按游戏、素材类别生成 `.resource-packs/` 和 `resource-manifest.json`。
- 这些生成文件已被 Git 忽略；提交源代码与素材即可。
- 新游戏目录、新服装或新家具会自动进入相应资源包，不需要逐项修改发布清单。
  `public/.npmignore` 用于排除旧参考图和重复引擎等内容，仅支持已有的简单通配规则；不支持的规则会明确报错。

核心 npm 包包含代码、脚本、版本资源清单，以及猫咪/护理用品等少量必需的基础素材。
其他 `public/` 内容全部通过 Release 附件交付。核心包有 64 MiB 预算检查，保留
GitHub Packages 的 256 MiB 上限检查；大资源不能重新混入核心包。

每个资源包自动分成不超过 64 MiB 的附件。同一个大型文件也可以跨多个分片，
因此不需要为了增加图片或游戏而压低画质。资源分片使用流式 gzip JSONL 格式，
按原路径恢复，不改玩家看到的 URL。各分片与恢复后的各文件都有 SHA-256 校验。

## 提交与发布

1. 照常修改、commit、push；更新 `package.json` 与 `package-lock.json` 的版本。
2. 推送与版本一致的 tag，例如 `v0.10.0`。
3. `publish-package.yml` 自动构建并检查核心包和资源分片，在**当前仓库**创建 Release。
4. 所有资源附件上传完成后才公开 Release，然后发布核心 npm 包。

手动重跑工作流也必须运行在对应 tag 的提交上。已经发布的版本保持不可变：
重试会校验既有资源与核心包，内容不同必须使用新版本，不会静默替换玩家可能已缓存的资源。
不同 Node/zlib 版本可能生成不同的压缩字节；校验会固定源文件内容，使用已发布的压缩清单。

不需要把 `.tgz` 手动发给玩家或宿主开发者。宿主照常升级依赖版本、更新锁文件并重新部署。
从 Git tag 安装和从 GitHub Packages 安装均受支持。

## 宿主自动同步

Vite 宿主继续使用 `sharedGamesPlugin()`。开发时服务 `/games/` 与 `/pet-function/`，
构建时先取得该版本的完整资源，再复制到输出目录；宿主其他公共文件保持独立。
已有的 Cloudflare 游戏文件拆分在资源复制之后执行。

使用自定义复制逻辑的宿主应先调用：

```js
import {ensurePublicResources} from '@mrburdeveloperteam/pet-function/resource-sync';

const publicRoot = await ensurePublicResources(packageRoot);
// 从 publicRoot 复制资源，而不是假设 node_modules 中有完整 public/。
```

当前七个宿主的准备脚本已做兼容适配；Next 的准备过程也会等待资源恢复完成。
这些一次性的宿主适配需要与首个使用分包的版本一起提交。宿主的依赖版本不会被此改造自动提升。

下载的内容保存在系统临时缓存或指定的构建缓存目录，不修改 `node_modules`。
缓存按版本及资源清单隔离并校验；有效缓存可离线复用。下载中断、缺少 Release、
版本不符或校验失败都会阻止构建，不会以缺图状态继续部署。

## 私有仓库与构建环境

如果资源所在仓库是私有的，宿主的服务端构建环境需要一个能读取该仓库 Contents
的令牌，按顺序支持 `PET_FUNCTION_GITHUB_TOKEN`、`GITHUB_TOKEN`、`GH_TOKEN`。
跨仓库的默认 `GITHUB_TOKEN` 可能没有访问权限，应使用授权范围正确的令牌。
令牌只由 Node 构建脚本使用；不要使用 `VITE_` 或 `NEXT_PUBLIC_` 前缀，也不要提交到 Git。
下载跳转到 CDN 时不会转发 GitHub 令牌。

可选环境变量：

| 变量 | 用途 |
| --- | --- |
| `PET_FUNCTION_RESOURCE_CACHE` | 持久化构建缓存的位置 |
| `PET_FUNCTION_RESOURCE_ASSETS_DIR` | 本地 Release 资源目录，用于离线验证 |
| `PET_FUNCTION_RESOURCE_BASE_URL` | 同格式资源镜像的目录 URL |

资源镜像需同时提供对应的 `resource-manifest.json` 与分片。恢复器会核对源文件清单，
不能用一个版本的代码加载另一版本的资源。

## 验证

```sh
npm run build
npm run resources:check
node --test tests/resource-pack-builder.test.mjs tests/resource-pack-sync.test.mjs tests/resource-host-integration.test.mjs tests/resource-release-catalog.test.mjs
```

发布流程还会检查真实 npm 打包结果，保证游戏、大型服装/房间资源和资源分片不在核心包内。
分包解决的是 npm 包持续膨胀的问题；Git 仓库历史、Release 附件数量及部署平台自身的存储限制仍分别管理。
