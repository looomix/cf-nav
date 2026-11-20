# CF 节点导航站（静态副本）

Cloudflare 边缘节点 / 优选 IP 导航页的**纯静态**副本，通过 Cloudflare Workers（Static Assets）托管。

站点结构：一个内联 CSS/JS 的 `index.html`，加若干数据目录。**没有后端、没有构建步骤、没有框架依赖**，所有"动态"逻辑都是浏览器端直接调用第三方接口。

部署分两步，都不需要本地装任何工具，全程在网页上完成：

- **第一步**：导入 GitHub 仓库 → 得到一个可访问的站点（约 2 分钟）
- **第二步**（可选但推荐）：开启每日定时回源，让数据自动保鲜

## 目录结构

```
.
├── index.html              主页面（约 370KB，CSS/JS 全部内联）
├── favicon.svg
├── CIDR/                   Cloudflare 官方 IP 段（7 个 txt）
├── WARP/                   WARP MASQUE / MINI 优选 IP
├── domain/                 已测域名列表（约 1MB）
├── random-region/          区域权重表
├── vvhan/ vps789/ ...      各上游的订阅 txt（84 个数据文件，分布在 26 个目录）
├── tools/                  工具子页（204 检测、CIDR 转换、UUID、混淆器等）
├── report/                 报告页
├── src/index.js            可选：定时回源 Worker 脚本（第一步用不到）
├── wrangler.jsonc          当前生效的配置（纯静态，无定时任务）
├── wrangler.cron.jsonc     开启定时任务时用的完整配置模板
├── _headers                缓存与安全响应头
└── .assetsignore           不随站点上传到 CDN 的文件清单
```

---

# 界面与配色

页面内置了一套自研导航层，全部内联在 `index.html` 尾部的 `<style id="ui2-style">` 和 `<script id="ui2-script">` 中，不依赖任何外部库：

- **左侧固定目录**：按「开始 / 脚本与部署 / 上手教程 / 优选资源 / 实用工具 / 参考与客户端」分组，每项带资源条目数，滚动时自动高亮当前分区
- **全站搜索**：标题、标签、地址全部参与匹配，边打边过滤并显示命中数量；按 `/` 聚焦搜索框，`Esc` 清空
- **移动端**：顶部固定栏 + 汉堡菜单抽屉，目录和搜索在抽屉内复用
- **原底部导航已隐藏**，改为上述目录

**换配色**：所有颜色集中在 `ui2-style` 开头的 `:root` 里，改这几个变量即可整体换肤：

| 变量 | 当前值 | 作用 |
| --- | --- | --- |
| `--bg-color` | `#dcedfb` | 页面底色（浅天蓝） |
| `--accent-blue` | `#1f8ae0` | 主强调色 |
| `--accent-strong` | `#1477c9` | 按钮/链接深一档的蓝 |
| `--accent-soft` | `#e8f4fe` | 标签、悬停底色 |
| `--text-main` | `#0f3550` | 正文主色 |
| `--text-muted` | `#5c7f9b` | 次要文字 |

想让蓝色更淡就把 `--bg-color` 调亮（如 `#e8f4fe`），想更明显就调深（如 `#cfe7fa`）。

---

# 第一步：网页端部署

全程在 Cloudflare Dashboard 操作，不需要命令行。

## 1.1 进入创建入口

1. 打开 <https://dash.cloudflare.com>，登录你的 Cloudflare 账号
2. 左侧菜单点 **Workers & Pages**
3. 右上角点 **Create application**（部分界面版本显示为 **Create**）
4. 切换到 **Workers** 标签页，选 **Import a repository** / **Connect to Git**

> 如果只看到 **Pages** 标签，请确认使用的是 **Workers** 标签。本站应部署为 Workers，不要选 Pages。

## 1.2 授权并选择仓库

1. 点 **Connect GitHub**（首次使用会跳出 GitHub 授权页）
2. 在 GitHub 授权页选择：
   - **Repository access** 选 **Only select repositories**
   - 下拉里勾选 **`looomix/cf-nav`**
   - 点 **Install & Authorize**
3. 回到 Cloudflare，仓库列表里选中 **`cf-nav`**，点 **Begin setup**

## 1.3 逐项填写配置

这一页有 5 个字段，按下面的表填：

| 字段（界面名称） | 填写内容 | 说明 |
| --- | --- | --- |
| **Project name** | `cf-nav` | **必须**和 `wrangler.jsonc` 里的 `"name"` 完全一致。不一致构建会直接失败（官方硬性要求）。 |
| **Production branch** | `main` | 仓库默认分支。以后往 `main` 推代码即触发生产部署。 |
| **Build command** | **留空** | 本站没有构建步骤。留空或写 `exit 0` 都行，**不要填 `npm run build`**，仓库里没有这个脚本，填了必失败。 |
| **Deploy command** | `npx wrangler deploy` | 这是默认值，不要改动。它会读取仓库里的 `wrangler.jsonc` 完成部署。 |
| **Root directory** | **留空** | 配置文件在仓库根目录，留空即根目录。 |
| **Build variables and secrets** | 不需要填 | 第一步不涉及任何环境变量。 |

其余高级选项（Preview URLs、非生产分支部署等）保持默认即可。

## 1.4 部署

1. 点 **Save and Deploy**（部分界面为 **Deploy**）
2. 页面跳到构建日志，等 30～90 秒，出现绿色的 **Success** 即完成
3. 顶部会显示访问地址，形如：

   ```
   https://cf-nav.<你的账号子域>.workers.dev
   ```

4. 打开该地址，页面应正常显示。此时排版、数据、复制按钮均已可用。

## 1.5 这一步实际做了什么

Cloudflare 读取仓库里的 `wrangler.jsonc`：

```jsonc
{
  "name": "cf-nav",
  "compatibility_date": "2026-11-20",
  "assets": {
    "directory": "."          // 把仓库根目录当作静态资源目录
  }
}
```

因为**没有 `main` 字段**，所以不运行任何 Worker 脚本，只是一个纯静态站点——静态请求免费且不限量。

## 1.6 构建失败怎么排查

| 报错关键字 | 原因 | 解决 |
| --- | --- | --- |
| `The name in your Wrangler configuration file does not match...` | Project name 和 `wrangler.jsonc` 的 `name` 不一致 | 把 Project name 改成 `cf-nav`，或改配置里的 `name` |
| `Missing script: "build"` | Build command 填了 `npm run build` | 清空 Build command |
| `Could not resolve...` / `No such file` | Root directory 填错了 | 清空 Root directory |
| `Authentication error` / 找不到仓库 | GitHub 授权时没勾这个仓库 | GitHub → Settings → Applications → Cloudflare Workers 里补授权 |

---

# 第二步：开启每日自动回源

## 2.0 为什么需要这一步

`vvhan/`、`vps789/`、`tiancheng3/` 这些订阅 txt，在原站是**每半小时刷新**的。你仓库里的是**一份快照**，不做自动更新的话，这些链接会随时间失效。

开启定时任务后，Worker 每天自动从源站重新抓 **84 个数据文件**（约 1.4 MB）写入 Cloudflare KV；用户访问时优先读 KV 里的最新数据，KV 里没有时才回落到仓库里的静态快照。

> 只打算临时用几天，可以跳过第二步。想长期稳定运行就做完它。

## 2.1 创建 KV Namespace 并拿到 ID

1. Dashboard 左侧菜单 → **Storage & Databases**（部分界面为 **存储和数据库**）
2. 点 **Workers KV** → **Create instance**（或 **Create namespace**）
3. **Namespace name** 填 `cf-nav-subs` → 点 **Create**
4. 在列表里点进刚创建的 `cf-nav-subs`，进入详情页
5. 找到 **Namespace ID**（32 位十六进制字符串，如 `a1b2c3d4e5f6...`），点旁边的复制按钮

> 详情页没直接显示 ID 的话，用命令行 `npx wrangler kv namespace list` 查看，输出里的 `id` 字段就是。

## 2.2 替换配置文件

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

提交后 Cloudflare 会自动检测到新 commit 并重新构建部署（约 1 分钟）。这次构建会把 `src/index.js` 一起打包，站点从"纯静态"升级为"静态 + 定时任务"。

## 2.3 设置 cron 表达式（决定每天几点跑）

配置里的 `triggers.crons` 就是定时规则，**时间一律是 UTC，不是北京时间**：

| 想要的北京时间 | 应填的 cron | 含义 |
| --- | --- | --- |
| 每天 12:00 | `0 4 * * *` | UTC 04:00（仓库默认值） |
| 每天 04:00 | `0 20 * * *` | UTC 20:00 |
| 每天 09:00 | `0 1 * * *` | UTC 01:00 |
| 每 6 小时一次 | `0 */6 * * *` | UTC 0/6/12/18 点 |

改法：同样打开 `wrangler.jsonc` 点编辑，改这一行后提交：

```jsonc
"triggers": {
  "crons": ["0 20 * * *"]
}
```

> **注意**：cron 变更最多需要 **15 分钟**才能同步到 Cloudflare 全球网络，期间可能错过一次调度，属正常现象。
>
> **注意**：用 wrangler 配置管理的 Worker，cron **只能写在 `wrangler.jsonc` 里**。在面板 Triggers 页面手动加的 cron，下次部署会被配置文件覆盖。

## 2.4 配置项逐个解释

`wrangler.jsonc`（定时任务版）每个字段的作用：

| 字段 | 值 | 作用 |
| --- | --- | --- |
| `name` | `cf-nav` | Worker 名称，必须与面板里一致 |
| `main` | `src/index.js` | Worker 脚本入口。**有这个字段才开始跑脚本**，去掉就退回纯静态模式 |
| `compatibility_date` | `2026-11-20` | Workers 运行时版本日期，决定可用哪些 API，不必改 |
| `assets.directory` | `.` | 静态资源目录，指仓库根目录 |
| `assets.binding` | `ASSETS` | 静态资源绑定名，代码里用 `env.ASSETS.fetch()` 访问 |
| `assets.run_worker_first` | 26 条路径规则 | **关键**：列出的路径先交给 Worker 处理，才能优先返回 KV 里的新数据；其余路径由平台直出静态文件，不消耗 Worker 调用次数 |
| `kv_namespaces[0].binding` | `SUBS` | KV 在代码里的变量名，**不要改**，改了代码里找不到 |
| `kv_namespaces[0].id` | 你的 ID | KV 实例标识，必须换成 2.1 拿到的 ID |
| `triggers.crons` | `0 4 * * *` | 定时规则，UTC 时间 |
| `observability.enabled` | `true` | 打开日志，方便在面板里查看定时任务执行结果 |

## 2.5 验证是否生效

三种方式，从简到细：

**方式一：看数据是否在更新**

cron 到点后（或手动触发一次，见 2.6），请求任意数据文件，看响应头是否带 `x-data-source: kv`：

```bash
curl -sI https://cf-nav.<你的子域>.workers.dev/vvhan/ipv4.txt
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
   {"event":"cron-refresh","ok":true,"total":84,"updated":84,"failed":0,"at":"2026-11-21T04:00:12.345Z"}
   ```

   `failed` 不为 0 时，`failures` 字段会列出前 10 个失败路径和原因。

## 2.6 可选：配一个手动刷新令牌

不想等到第二天、想立刻验证一次，可以加个令牌手动触发。

1. **Workers & Pages** → `cf-nav` → **Settings** → **Variables and Secrets**
2. 点 **Add** → 类型选 **Secret**（密钥）
3. **Variable name** 填 `REFRESH_TOKEN`
4. **Value** 填一个自己定的随机字符串，例如 `my-cf-nav-2026` → 保存并部署
5. 访问：

   ```
   https://cf-nav.<你的子域>.workers.dev/__refresh?token=my-cf-nav-2026
   ```

   返回 JSON 结果：

   ```json
   {"ok":true,"total":84,"updated":84,"failed":0,"failures":[],"at":"2026-11-20T09:30:00.000Z"}
   ```

没配 `REFRESH_TOKEN` 时，`/__refresh` 一律返回 404，不会暴露给外部。

## 2.7 免费额度够不够

| 项目 | 免费额度 | 本站消耗 |
| --- | --- | --- |
| KV 写入 | 1,000 次/天 | 84 次/天 |
| KV 读取 | 100,000 次/天 | 每次访问一个数据文件算 1 次 |
| KV 存储 | 1 GB | 约 1.5 MB |
| Worker 请求 | 100,000 次/天 | 只有 26 个数据目录的请求会走 Worker，页面和其余资源不计 |

正常个人使用远低于额度上限，不会产生费用。

---

# 自定义域名

1. **Workers & Pages** → `cf-nav` → **Settings** → **Domains & Routes** → **Add** → **Custom domain**
2. 填入域名（如 `nav.example.com`），按提示完成 DNS 记录

**前提**：Workers 绑定自定义域名要求**该域名的 NS 已托管在 Cloudflare**。域名在别家又改不了 NS 的话，只能继续用 `workers.dev` 子域（这是 Workers 的硬性限制，Pages 才支持 CNAME 接入外部域名）。

绑定后**无需改任何代码**：页面里 76 个订阅链接会自动跟随当前访问域名。

---

# 外部依赖

页面运行时直接调用以下第三方服务，本站不控制它们，任一挂掉或限流都会导致对应功能失效：

- **Cloudflare 官方**：`api.cloudflare.com/client/v4/ips`（IP 段）、`speed.cloudflare.com`（测速）、`radar.cloudflare.com`
- **同类项目接口**：`randomip.pages.dev`、`warp-masque-bestip.pages.dev`、`autocf-workers.pages.dev`、`acl4ssr-clash.pages.dev`、`masque.pages.dev`、`harmony-up-2.pages.dev`、`ech-check-tool.pages.dev`、`api-proxyip-check.pages.dev`
- **IP / 域名数据**：`ipdb.api.030101.xyz`、`addressesapi.090227.xyz`、`cf.junzhen.qzz.io`、`zip.cm.edu.kg`
- **DNS over HTTPS**：`doh.cleanbrowsing.org`、`dns.alidns.com`、`dns.quad9.net`、`doh.adguard.com`、`doh.opendns.com`
- **其他**：`api.ipify.org`（本机 IP）、`itunes.apple.com`（App 信息）

定时回源的源站是 `https://bestcf.pages.dev`，写在 `src/index.js` 顶部的 `ORIGIN` 常量里；要换源站改这一处即可。

---

# 来源与免责

页面内容、数据与工具链接整理自公开的 Cloudflare 节点导航项目，本仓库仅为个人自用 / 学习目的的静态镜像。

- 原作者品牌链接保留在页面页脚，可作为来源标注；不需要可自行删除。
- 请勿用于商业用途或对外作为自有产品发布；数据版权归原作者，`tools/` 下的 zip 归各自作者。
- 定时回源会周期性请求源站获取公开数据，请自行控制频率，避免对源站造成压力。
- 使用本仓库内容所产生的一切后果由使用者自行承担。
