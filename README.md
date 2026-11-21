# Cloudflare 导航站（EDT × WARP MASQUE · 静态副本）

Cloudflare 边缘节点 / 优选 IP 导航页的**纯静态**副本，通过 Cloudflare Workers（Static Assets）托管。

在原 EDT 导航的基础上，已把 [WARP MASQUE 导航](https://masque.pages.dev) 的 12 个分区并入同一页面：两个站的上游数据、客户端列表、端点订阅、教程全部合在一处，共用左侧目录、全站搜索和一套浅色主题。

站点结构：一个内联 CSS/JS 的 `index.html`，加若干数据目录和一个单文件 Worker。**没有后端框架、没有构建步骤、没有 npm 依赖**。

部署分两步，都不需要本地装任何工具，全程在网页上完成：

- **第一步**：把 `_worker.js` 整份粘进 Workers 面板 → 先得到一个叫 `cf-nav` 的 Worker；再把 GitHub 仓库接上，静态资源和 KV 随之补齐 → 网站可访问（约 3 分钟）
- **第二步**（可选但推荐）：确认每日定时回源真的在跑，按需调整时间

> 顺序说明：面板创建 Worker 时只能填代码、不能上传 130 个数据文件，所以先贴代码只是**把 `cf-nav` 这个名字占住**，打开会看到一个引导页；接上仓库后 `wrangler.jsonc` 才会把 `index.html`、数据目录、KV、cron、自定义域名一次性配齐。

## 目录结构

```
.
├── index.html              主页面（约 490KB，CSS/JS 全部内联，30 个分区）
├── favicon.svg
├── _worker.js              单文件 Worker：静态资源 + 定时回源（可整份粘进面板）
├── CIDR/                   Cloudflare 官方 IP 段（7 个 txt）
├── WARP/                   WARP MASQUE / MINI 优选 IP
├── domain/                 已测域名列表（约 1MB）
├── random-region/          区域权重表
├── endpoint/               MASQUE 端点订阅（46 个 txt：warp/zt × 协议 × 端口）
├── vvhan/ vps789/ ...      各上游的订阅 txt（合计 130 个数据文件，分布在 27 个目录）
├── tools/                  工具子页（204 检测、CIDR 转换、UUID、混淆器等）
├── zt/                     ZeroTrust 注册子页 + 客户端压缩包
├── report/                 报告页
├── assets/                 README 用的截图（不随站点上传）
├── wrangler.jsonc          当前生效的配置（自定义域名 + KV + 每天 3 轮回源）
├── wrangler.cron.jsonc     开启定时任务时用的完整配置模板
├── _headers                缓存与安全响应头
└── .assetsignore           不随站点上传到 CDN 的文件清单
```

---

# 第一步：网页端部署

全程在 Cloudflare Dashboard 操作，不需要命令行。分两段：**先把 `_worker.js` 贴进面板**，**再把 GitHub 仓库接上**。

## 1.0 先建好 KV（约 1 分钟）

接仓库构建时，`wrangler.jsonc` 会按 `kv_namespaces` 去找一个 KV Namespace。**它必须提前存在**，否则构建直接失败（报 `KV namespace not found`）。

1. Dashboard 左侧菜单 → **Storage & Databases**（部分界面为 **存储和数据库**）
2. 点 **Workers KV** → **Create instance**（或 **Create namespace**）
3. **Namespace name** 填 `cf-nav-subs` → 点 **Create**
4. 点进刚创建的 `cf-nav-subs`，复制详情页上的 **Namespace ID**（32 位十六进制，如 `a1b2c3d4e5f6...`）
5. 打开 <https://github.com/looomix/cf-nav/blob/main/wrangler.jsonc>，点右上角铅笔图标 **Edit**，把这一行的值换成你刚复制的 ID：

   ```jsonc
   "kv_namespaces": [
     { "binding": "SUBS", "id": "742a20bd49bd4fbab6f145fb3c193a1c" }  // ← 换成你的
   ]
   ```

6. 页面底部 **Commit changes**，提交到 `main`

> 仓库里现在填的 `742a20bd...` 是原作者账号下的 KV，**别人复刻必须换成自己刚建的 ID**，否则构建会报找不到。
>
> 完全不想开定时回源，可以跳过这步，但**必须同时删掉 `wrangler.jsonc` 里的整个 `kv_namespaces` 段和 `triggers` 段**，否则同样构建失败。

## 1.1 创建 Worker

1. 打开 <https://dash.cloudflare.com>，登录你的 Cloudflare 账号
2. 左侧菜单点 **Workers & Pages**
3. 右上角点 **Create application**（部分界面版本显示为 **Create**）
4. 切到 **Workers** 标签页，选 **Create Worker**（有的界面是 **Start with Hello World!**）
5. **Name** 填 `cf-nav` —— 必须和 `wrangler.jsonc` 里的 `"name"` 完全一致
6. 点 **Deploy**，先用模板自带的代码部署一次（马上就会被替换掉）

> 这里**不要**选 **Import a repository**。那条路是直接连仓库、一步到位，但会跳过贴代码这一步。我们要的正是先有一个名为 `cf-nav` 的空 Worker。

## 1.2 粘贴 `_worker.js`

1. 打开 <https://github.com/looomix/cf-nav/blob/main/_worker.js>
2. 点右上角 **Copy raw file**（或先点 **Raw**，再 Ctrl+A / Ctrl+C）
3. 回到 Cloudflare，进入刚创建的 `cf-nav` → 右上角 **Edit code**（Quick Edit）
4. 编辑器里默认文件（`worker.js`）**全选删除**，粘贴刚才复制的完整内容
5. 右上角 **Deploy** → 弹窗确认

> 粘贴的是标准 ES Module（`export default { fetch, scheduled }`），编辑器会自动识别，不需要改任何一行。
> 面板改动只影响"当前这一份"：**1.6 接上仓库后会被仓库里的同名文件覆盖**，之后请改仓库文件，不要回面板改。

## 1.3 打开会看到一个引导页（不是报错）

部署完点右上 **Visit**，或打开：

```
https://cf-nav.<你的账号子域>.workers.dev
```

会看到一张浅蓝色的「Worker 代码已生效」说明页：

![只贴了 _worker.js、还没连仓库时打开的引导页](assets/worker-setup.png)

这是**刻意设计**的：此时 Worker 只有代码，仓库里的 `index.html` 和 130 个数据文件还没上传，`env.ASSETS` 为空。`_worker.js` 检测到这种情况会返回引导页，而不是抛 500。

确认方式：响应头里带 `x-setup: assets-missing`。等 1.6 构建完成，这个头就消失了，页面变成真正的导航站。

## 1.4 连接 GitHub 仓库

1. 进入 `cf-nav` → **Settings** → 左栏 **Build**（部分界面在 **Deployments** 标签页里，按钮叫 **Connect Git**）
2. 点 **Connect**（Connect to Git）
3. 首次使用会跳 GitHub 授权页：
   - **Repository access** 选 **Only select repositories**
   - 下拉里勾选 **`looomix/cf-nav`**
   - 点 **Install & Authorize**
4. 回到 Cloudflare，仓库选 **`cf-nav`**，Production branch 选 **`main`**
5. 点 **Next** / **Begin setup**

> 找不到 Build / Connect Git 入口，说明这个账号的界面还是旧版：改用 1.8 里的替代路径。

## 1.5 逐项填写构建配置

| 字段（界面名称） | 填写内容 | 说明 |
| --- | --- | --- |
| **Build command** | **留空** | 本站没有构建步骤。留空或写 `exit 0` 都行，**不要填 `npm run build`**，仓库里没有这个脚本，填了必失败。 |
| **Deploy command** | `npx wrangler deploy` | 默认值，不要改动。它读取仓库里的 `wrangler.jsonc` 完成部署。 |
| **Root directory** | **留空** | 配置文件在仓库根目录，留空即根目录。 |
| **Build variables and secrets** | 不填 | 可选的手动刷新令牌 `REFRESH_TOKEN` 见 2.6。 |
| **Project name**（若界面出现） | `cf-nav` | 必须与已有 Worker 同名。连的是现有 Worker 时这项通常不出现。 |

其余高级选项（Preview URLs、非生产分支部署等）保持默认。

## 1.6 部署并看构建日志

1. 点 **Save and Deploy**
2. 页面跳到构建日志，等 30～90 秒，出现绿色的 **Success** 即完成
3. 两个访问入口：

   ```
   https://cf-nav.315267532.xyz             ← 自定义域名，国内可直连
   https://cf-nav.<你的账号子域>.workers.dev ← workers.dev，部分地区需代理
   ```

   > `workers.dev` 在部分网络环境下会被 DNS 污染 / SNI 阻断，打不开不是部署失败。配置里的 `routes` 已把站点绑到 `cf-nav.315267532.xyz`，优先用这个地址。

4. 打开该地址，引导页被替换成完整导航页，排版、数据、复制按钮全部可用。

## 1.7 连上仓库后发生了什么

Cloudflare 读取仓库里的 `wrangler.jsonc`，按配置做四件事：

```jsonc
{
  "name": "cf-nav",
  "main": "_worker.js",          // 从仓库重新取 Worker 代码，覆盖你手贴的那份
  "assets": {
    "directory": ".",            // 把仓库根目录当作静态资源目录
    "binding": "ASSETS",         // 代码里用 env.ASSETS.fetch() 取静态文件
    "run_worker_first": ["/__refresh", "/CIDR/*", "/endpoint/*", "..."]
  },
  "kv_namespaces": [{ "binding": "SUBS", "id": "..." }],
  "triggers": { "crons": ["0 4 * * *", "10 4 * * *", "20 4 * * *"] }
}
```

- **静态资源上传到边缘**，`index.html` 与 27 个数据目录全部就位，`env.ASSETS` 不再是空的
- **KV 绑定生效**，`env.SUBS` 可用；三条 cron 同时注册（UTC 04:00 / 04:10 / 04:20）
- **`routes` 绑自定义域名**，自动创建 DNS 记录和证书
- **Worker 代码以仓库为准**：你 1.2 手贴的那份被同一份文件覆盖，从此改动一律走 `git push`

> 只有 `run_worker_first` 里列出的 29 条路径会先经过 Worker（去 KV 取当天最新数据），其余路径由平台直出，不消耗 Worker 调用。

## 1.8 构建失败怎么排查

| 报错关键字 | 原因 | 解决 |
| --- | --- | --- |
| `KV namespace ... not found` | 1.0 没建 KV，或 `wrangler.jsonc` 里的 `id` 没换成自己的 | 回到 1.0，建 KV 并替换 `id` |
| `The name in your Wrangler configuration file does not match...` | 1.1 的 Worker 名不是 `cf-nav` | 改名与 `wrangler.jsonc` 一致，或改配置里的 `name` |
| `Missing script: "build"` | Build command 填了 `npm run build` | 清空 Build command |
| `Could not resolve...` / `No such file` | Root directory 填错了 | 清空 Root directory |
| `Authentication error` / 找不到仓库 | GitHub 授权时没勾这个仓库 | GitHub → Settings → Applications → Cloudflare Workers 里补授权 |
| Settings 里没有 Build 入口 | 账号界面是旧版 | 见下方替代路径 |

**替代路径（没有 Build 入口时）**：先把 1.1 建的 `cf-nav` 删掉（Settings → 底部 Delete），然后走 **Workers & Pages → Create → Workers → Import a repository**，仓库选 `cf-nav`、名字填 `cf-nav`，构建配置按 1.5 填。这条路会一次完成"连仓库 + 建 Worker"，静态资源同样来自 `wrangler.jsonc`。

## 1.9 部署完成后长这样

![部署完成后打开 cf-nav.315267532.xyz 看到的页面](assets/deployed-preview.png)

上面就是 `https://cf-nav.315267532.xyz` 的真实渲染结果。到这一步，左侧 30 个分区、顶部搜索、条目数徽标、128 个复制按钮就已经全部可用了。

如果地址栏换成了 `cf-nav.<账号子域>.workers.dev` 也能打开，那个入口在部分网络下会被阻断，优先用自定义域名。

---

# 第二步：确认每日自动回源

## 2.0 为什么需要这一步

`vvhan/`、`vps789/`、`tiancheng3/` 这些订阅 txt，在原站是**每半小时刷新**的；`endpoint/` 下的 MASQUE 端点也是每天变动。你仓库里的是**一份快照**，不做自动更新的话，这些链接会随时间失效。

开启定时任务后，Worker 每天自动从两个源站重新抓 **130 个数据文件**（约 1.6 MB）写入 Cloudflare KV；用户访问时优先读 KV 里的最新数据，KV 里没有时才回落到仓库里的静态快照。

| 数据 | 来源 |
| --- | --- |
| `CIDR/` `WARP/` `domain/` `vvhan/` … 共 83 个 | `https://bestcf.pages.dev` |
| `endpoint/` 下 46 个端点订阅 | `https://masque.pages.dev` |
| `client-ver.txt`（客户端版本表） | **两个源站的版本表合并后写入**，同 key 取日期较新的一条 |

> **这一步其实已经跑起来了**：1.0 建好 KV、1.6 构建时 `triggers.crons` 就已注册。下面几节用来**确认它真的在跑**（2.5）、按需改时间（2.3）、需要时重建 KV（2.1 / 2.2）。

> 只打算临时用几天，这一步可以只做 2.5 的验证，不用管时间设置。想长期稳定运行就按顺序看完。

## 2.1 创建 KV Namespace 并拿到 ID

> **已经按 1.0 建过就跳过这一节**。这里留作换 KV、或从纯静态版重新升级时参考。

1. Dashboard 左侧菜单 → **Storage & Databases**（部分界面为 **存储和数据库**）
2. 点 **Workers KV** → **Create instance**（或 **Create namespace**）
3. **Namespace name** 填 `cf-nav-subs` → 点 **Create**
4. 在列表里点进刚创建的 `cf-nav-subs`，进入详情页
5. 找到 **Namespace ID**（32 位十六进制字符串，如 `a1b2c3d4e5f6...`），点旁边的复制按钮

> 详情页没直接显示 ID 的话，用命令行 `npx wrangler kv namespace list` 查看，输出里的 `id` 字段就是。

## 2.2 替换配置文件

> **1.0 已经改过就跳过**：仓库里的 `wrangler.jsonc` 本来就是定时版（`main` 指向 `_worker.js`，`kv_namespaces` 已填），连仓库构建时自动生效。这节只在**换 KV**、或仓库被人改回纯静态版时才需要照做。

1. 打开 <https://github.com/looomix/cf-nav/blob/main/wrangler.cron.jsonc>
2. 点右上角 **Copy raw file**（或点 **Raw** 后全选复制）
3. 打开 <https://github.com/looomix/cf-nav/blob/main/wrangler.jsonc>，点右上角铅笔图标 **Edit**
4. **全选（Ctrl+A）删除**原有内容，粘贴刚才复制的内容
5. 找到这一行：

   ```jsonc
   "id": "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"
   ```

   把引号里的内容换成 2.1 复制的 Namespace ID：

   ```jsonc
   "id": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
   ```

6. 页面底部点 **Commit changes**，直接提交到 `main`

提交后 Cloudflare 会自动检测到新 commit 并重新构建部署（约 1 分钟）。这次构建会把 `_worker.js` 一起打包，站点从"纯静态"升级为"静态 + 定时任务"。

## 2.3 设置 cron 表达式（决定每天几点跑）

配置里的 `triggers.crons` 就是定时规则，**时间一律是 UTC，不是北京时间**。

**先说一个必须知道的上限**：免费版 Worker **单次调用最多 50 个子请求**（每次回源算 1 个），而这里有 130 个数据文件，一次跑不完。

所以脚本把清单**按顺序均分成三份**（43 / 43 / 44 个），三条 cron 各刷一份。这样每轮最多 44 个请求，安全低于 50，而且三份拼起来正好是全集，不重不漏。

对应的 cron 就是每天 3 次，间隔 10 分钟：

```jsonc
"triggers": {
  "crons": ["0 4 * * *", "10 4 * * *", "20 4 * * *"]
}
```

= UTC 04:00 / 04:10 / 04:20 = **北京时间 12:00 / 12:10 / 12:20**，整个刷新在 20 分钟内完成，效果等同于「每天更新一次」。

每条 cron **必须**和 `_worker.js` 里的 `CRONS` 数组对得上，数组下标决定它刷第几份：

```js
const CRONS = ["0 4 * * *", "10 4 * * *", "20 4 * * *"];
```

改了 cron 时间，这个数组要同步改；否则匹配不上会退回刷第 0 份，全站就只有三分之一在更新。

想换时间，三个值一起平移即可：

| 想要的北京时间 | 三个 cron（间隔 10 分钟） |
| --- | --- |
| 每天 12:00 | `0 4 * * *` `10 4 * * *` `20 4 * * *` |
| 每天 04:00 | `0 20 * * *` `10 20 * * *` `20 20 * * *` |
| 每天 09:00 | `0 1 * * *` `10 1 * * *` `20 1 * * *` |

如果想更勤，把三条各加 30 分钟（`30 4 * * *` `40 4 * * *` `50 4 * * *`），一天就能刷两轮，KV 写入量仍在免费额度内。

> **注意**：cron 变更最多需要 **15 分钟**才能同步到 Cloudflare 全球网络，期间可能错过一次调度，属正常现象。
>
> **注意**：用 wrangler 配置管理的 Worker，cron **只能写在 `wrangler.jsonc` 里**。在面板 Triggers 页面手动加的 cron，下次部署会被配置文件覆盖。

## 2.4 配置项逐个解释

`wrangler.jsonc`（定时任务版）每个字段的作用：

| 字段 | 值 | 作用 |
| --- | --- | --- |
| `name` | `cf-nav` | Worker 名称，必须与面板里一致 |
| `main` | `_worker.js` | Worker 脚本入口。**有这个字段才开始跑脚本**，去掉就退回纯静态模式 |
| `compatibility_date` | `2026-11-20` | Workers 运行时版本日期，决定可用哪些 API，不必改 |
| `assets.directory` | `.` | 静态资源目录，指仓库根目录 |
| `assets.binding` | `ASSETS` | 静态资源绑定名，代码里用 `env.ASSETS.fetch()` 访问 |
| `assets.run_worker_first` | 29 条路径规则 | **关键**：列出的路径先交给 Worker 处理，才能优先返回 KV 里的新数据；其余路径由平台直出静态文件，不消耗 Worker 调用次数 |
| `kv_namespaces[0].binding` | `SUBS` | KV 在代码里的变量名，**不要改**，改了代码里找不到 |
| `kv_namespaces[0].id` | 你的 ID | KV 实例标识，必须换成 2.1 拿到的 ID |
| `triggers.crons` | 3 条 cron | 定时规则，UTC 时间，三条各刷三分之一；顺序要和 `_worker.js` 的 `CRONS` 一致 |
| `observability.enabled` | `true` | 打开日志，方便在面板里查看定时任务执行结果 |

## 2.5 验证是否生效

三种方式，从简到细：

**方式一：看数据是否在更新**

cron 到点后（或手动触发一次，见 2.6），请求任意数据文件，看响应头是否带 `x-data-source: kv`：

```bash
curl -sI https://cf-nav.315267532.xyz/vvhan/ipv4.txt
```

看到 `x-data-source: kv` 说明读的是 KV 里的新数据；没有这个头表示还在用静态快照（说明 KV 尚未写入成功）。

**方式二：看 cron 执行记录**

1. **Workers & Pages** → 选中 `cf-nav` → **Settings**
2. 找到 **Trigger Events** → 点 **View events**
3. 能看到最近 100 次调度记录及成功/失败状态

**方式三：看日志**

1. 同一个 Worker → **Logs**（或 **Observability**）
2. 筛选 `event = cron-refresh`，可见类似输出：

   ```json
   {"event":"cron-refresh","cron":"10 4 * * *","ok":true,"part":1,"from":43,"to":86,"count":43,"total":130,"updated":43,"failed":0,"at":"2026-11-21T04:10:08.120Z"}
   ```

   `from` → `to` 是这一轮刷的区间，`count` 是本轮条数，`failed` 不为 0 时 `failures` 会列出前 5 个失败路径和原因。

## 2.6 可选：配一个手动刷新令牌

不想等到第二天、想立刻验证一次，可以加个令牌手动触发。

1. **Workers & Pages** → `cf-nav` → **Settings** → **Variables and Secrets**
2. 点 **Add** → 类型选 **Secret**（密钥）
3. **Variable name** 填 `REFRESH_TOKEN`
4. **Value** 填一个自己定的随机字符串，例如 `my-cf-nav-2026` → 保存并部署
5. 访问（**一次只刷一批**，连调 3 次刚好刷完全站）：

   ```
   https://cf-nav.315267532.xyz/__refresh?token=你设的字符串
   ```

   返回 JSON 结果：

   ```json
   {"ok":true,"part":0,"from":0,"to":43,"count":43,"total":130,"updated":43,"failed":0,"failures":[],"next_part":1,"at":"2026-11-20T09:30:00.000Z"}
   ```

   不带 `part` 参数时按 `0 → 1 → 2` 轮转（进度记在 KV 的 `meta:part`），连调三次就把 130 个文件全刷一遍。

   也可以直接指定第几份：`...&part=2`（取值 0 / 1 / 2）。

没配 `REFRESH_TOKEN` 时，`/__refresh` 一律返回 404，不会暴露给外部。

## 2.7 免费额度够不够

| 项目 | 免费额度 | 本站消耗 |
| --- | --- | --- |
| KV 写入 | 1,000 次/天 | 130 次数据 + 手动刷新时的 3 次进度记录 ≈ 130 次/天 |
| KV 读取 | 100,000 次/天 | 每次访问一个数据文件算 1 次 |
| KV 存储 | 1 GB | 约 1.7 MB |
| Worker 请求 | 100,000 次/天 | 只有 27 个数据目录的请求会走 Worker，页面和其余资源不计 |
| 单次子请求 | 50 个/次 | 每轮最多 44 个 |

正常个人使用远低于额度上限，不会产生费用。

---

# 单文件 Worker：`_worker.js`

仓库根目录的 `_worker.js` 是**整个站点的全部服务端逻辑**，一个文件、零依赖、不打包。三种用法：

| 场景 | 怎么用 |
| --- | --- |
| **面板粘贴部署**（第一步 1.2 用的就是它） | Dashboard → **Workers & Pages** → `cf-nav` → **Edit code** → 全选默认文件删掉 → 粘贴 `_worker.js` 全文 → **Deploy** |
| **wrangler 部署**（连仓库后的正式方式） | `wrangler.jsonc` 里 `"main": "_worker.js"`，构建时由 `npx wrangler deploy` 打包，改代码只需 `git push` |
| **Pages 高级模式** | 文件放在站点根目录且命名为 `_worker.js`，Pages 会自动把它当作 Functions 入口执行 |

它做的事就四件：

1. **数据文件优先读 KV** —— 命中 `SOURCES` 清单里的路径时先查 KV，有值直接返回并带 `x-data-source: kv`，没有才 `env.ASSETS.fetch()` 回落到仓库快照
2. **每天分批回源** —— `scheduled()` 按 `controller.cron` 判断自己刷第几份，从两个源站抓取后写回 KV
3. **手动触发** —— `/__refresh?token=xxx`，未授权的请求一律 `404`
4. **缺绑定时的降级** —— 没 `ASSETS` 返回引导页（200 + `x-setup: assets-missing`），没 `SUBS` 时数据请求走静态快照、`/__refresh` 返回 `503`

**三个注意点**：

- **面板粘贴和仓库构建是"同一份代码的两个副本"**。接了仓库（1.4～1.6）之后，每次构建都会用仓库里的 `_worker.js` 覆盖面板上的改动。所以**后期只改仓库**，面板编辑器只当首次落地的入口。
- 面板粘贴部署时不需要 `ASSETS` / `SUBS` 已存在 —— 缺了会降级成引导页，不会 500。这两个绑定只在"完整站点"这个状态下才有。
- `_worker.js` 已在 `.assetsignore` 里排除，所以它**不会**被当作静态文件公开，访问 `/_worker.js` 返回 404（连仓库后也一样）。

改了 `index.html` 或数据文件只需 `git push`，Cloudflare 自动重新构建；改了 Worker 逻辑同样 `git push`，不用再回面板粘贴。

---

# 关于 WARP MASQUE 分区

页面下半部分的 12 个分区来自 [masque.pages.dev](https://masque.pages.dev)，已并入同一页面，与原 EDT 内容共用一套目录和搜索：

![MASQUE 端点分区](assets/masque-section.png)

合并时做的处理：

| 处理 | 说明 |
| --- | --- |
| 分区 id 加 `m-` 前缀 | 两边都有 `jiaocheng` / `cfgf` / `others`，加前缀彻底消除冲突（`m-guide` / `m-warp` 等） |
| 去掉重复分区 | 原站的 Cloudflare 官方分区与本站**完全相同**，MASQUE 站的"其它"分区只是回链本导航页，两者都没导入 |
| 去重工具卡片 | MASQUE 站的 DNS / DoH / 测速卡片与本站「更多工具」「测速工具」重复，只保留它独有的 SNI 伪装、延迟测试、注册工具 |
| 订阅地址跟随域名 | 端点生成器原本硬编码 `masque.pages.dev`，现在输出当前域名（本地预览时输出 `127.0.0.1`，上线后自动变） |
| 版面统一 | 原站是深色主题，这里全部改走浅天蓝配色，表格、下拉框、只读输入框都重做了样式 |
| 数据本地化 | 46 个端点订阅 txt、ZeroTrust 子页与客户端包全部镜像进仓库，不依赖原站可用性 |
| 版本号合并 | 两个站各有一份 `client-ver.txt`，回源时合并后写 KV（123 条），客户端卡片的版本号与"几天前更新"标签才会准 |

左侧目录里 MASQUE 相关分成三组：**WARP MASQUE**（总览 / 客户端 / 端点）、**MASQUE 客户端**（Clash / Xray / Singbox / Hiddify / 小火箭 / 内核）、**MASQUE 工具**（配套工具 / 教程 / WARP 官方）。

---

# 自定义域名

**现在的状态**：已在 `wrangler.jsonc` 的 `routes` 里绑定 `cf-nav.315267532.xyz`，部署时自动创建 DNS 记录和证书，不用手动去面板点。

想换域名：改 `routes[0].pattern` 后重新部署即可（旧记录不会被自动删除，需要到 DNS 页面手动清理）。

要手动添加：

1. **Workers & Pages** → `cf-nav` → **Settings** → **Domains & Routes** → **Add** → **Custom domain**
2. 填入域名（如 `nav.example.com`），按提示完成 DNS 记录

**前提**：Workers 绑定自定义域名要求**该域名的 NS 已托管在 Cloudflare**。域名在别家又改不了 NS 的话，只能继续用 `workers.dev` 子域（这是 Workers 的硬性限制，Pages 才支持 CNAME 接入外部域名）。

绑定后**无需改任何代码**：页面里 76 个订阅链接会自动跟随当前访问域名。

---

# 外部依赖

页面运行时直接调用以下第三方服务，本站不控制它们，任一挂掉或限流都会导致对应功能失效：

- **Cloudflare 官方**：`api.cloudflare.com/client/v4/ips`（IP 段）、`speed.cloudflare.com`（测速）、`radar.cloudflare.com`
- **同类项目接口**：`randomip.pages.dev`、`warp-masque-bestip.pages.dev`、`autocf-workers.pages.dev`、`acl4ssr-clash.pages.dev`、`m2c.pages.dev`（MASQUE 转换器）、`usque.pages.dev`、`harmony-up-2.pages.dev`、`ech-check-tool.pages.dev`、`api-proxyip-check.pages.dev`
- **IP / 域名数据**：`ipdb.api.030101.xyz`、`addressesapi.090227.xyz`、`cf.junzhen.qzz.io`、`zip.cm.edu.kg`
- **DNS over HTTPS**：`doh.cleanbrowsing.org`、`dns.alidns.com`、`dns.quad9.net`、`doh.adguard.com`、`doh.opendns.com`
- **其他**：`api.ipify.org`（本机 IP）、`itunes.apple.com`（App 信息）

定时回源的两个源站写在 `_worker.js` 顶部：

```js
const ORIGIN = "https://bestcf.pages.dev";        // 优选 IP / 订阅数据
const MASQUE_ORIGIN = "https://masque.pages.dev"; // MASQUE 端点数据
```

`endpoint/*` 走 `MASQUE_ORIGIN`，其余走 `ORIGIN`；要换源站改这两个常量即可。

> 订阅数据（`CIDR/`、`endpoint/` 等）已经全部镜像进本仓库，页面上的订阅链接也改成跟随当前域名，**不依赖原站存活**。只有上面这些"运行时查询"类接口仍然直连第三方。

---

# 来源与免责

页面内容、数据与工具链接整理自公开的 Cloudflare 节点导航项目，本仓库仅为个人自用 / 学习目的的静态镜像。

- 原作者品牌链接保留在页面页脚，可作为来源标注；不需要可自行删除。
- 请勿用于商业用途或对外作为自有产品发布；数据版权归原作者，`tools/` 下的 zip 归各自作者。
- 定时回源会周期性请求源站获取公开数据，请自行控制频率，避免对源站造成压力。
- 使用本仓库内容所产生的一切后果由使用者自行承担。
