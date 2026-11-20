# CF 节点导航站（静态副本）

Cloudflare 边缘节点 / 优选 IP 导航页的**纯静态**副本，可一键部署到 Cloudflare Workers（Static Assets）。

站点结构非常简单：一个内联 CSS/JS 的 `index.html`，加若干数据目录。**没有后端、没有构建步骤、没有框架**，所有"动态"逻辑都是浏览器端直接调用第三方接口。

## 目录结构

```
.
├── index.html              主页面（约 360KB，CSS/JS 全部内联）
├── favicon.svg
├── CIDR/                   Cloudflare 官方 IP 段（7 个 txt）
├── WARP/                   WARP MASQUE 优选 IP
├── domain/                 已测域名列表（约 1MB）
├── random-region/          区域权重表
├── vvhan/ vps789/ ...      各上游的订阅 txt（72 个文件，共 20 余个目录）
├── tools/                  工具子页（204 检测、CIDR 转换、UUID、混淆器等）
├── report/                 报告页
├── wrangler.jsonc          Workers 配置
├── _headers                缓存与安全响应头
└── .assetsignore           不上传到 CDN 的文件清单
```

## 相对原站做的改动

| 改动 | 说明 |
| --- | --- |
| **移除反搬运锁** | 原站在 `index.html` 里有一段混淆脚本，会校验 `location.hostname` 是否在白名单（`bestcf.pages.dev` / `cfbest.pages.dev` / `localhost` 等）内，否则 `top.location.replace()` 整页跳回原站，另带 iframe 直跳保护。已整段删除，否则部署到任何自有域名都会被弹回去。 |
| **保留复制功能** | 上述脚本里同时包含 `window.copy()`（页面有 128 处按钮依赖它）。删锁的同时重写了干净版本，并修复了原实现降级分支的 bug（`document.remove('copy')` 应为 `document.execCommand('copy')`，导致非 HTTPS 环境下复制必失败）。 |
| **移除 h1 品牌注入** | 原脚本会往 `h1` 后面插一个指向原站的品牌链接。已去掉。 |
| **移除第三方统计** | 删除 Google Analytics（`gtag`）和两段 Cloudflare Web Analytics `beacon.min.js`（token `7e1b4329…`、`91d54db1…`），共 10 个页面。不删的话访客数据会流进原作者看板。 |
| **订阅链接域名自适应** | 页面里 76 个"复制链接"按钮硬编码了 `https://bestcf.pages.dev/xxx.txt`。已在页面末尾注入一段脚本，自动把展示文本与复制内容替换为**当前访问域名**，换域名后无需改 HTML。 |

## 部署

### 方式一：Git 自动部署（推荐）

1. 打开 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository**
2. 选本仓库，分支 `main`
3. 构建命令**留空**（没有构建步骤），部署命令保持默认 `npx wrangler deploy`
4. 保存并部署，几十秒后得到 `https://cf-nav.<你的子域>.workers.dev`

之后每次 `git push` 都会自动重新部署，且在 Workers 面板可回滚到任一历史版本。

### 方式二：本地命令行直传

```bash
npx wrangler deploy
```

### 本地预览

```bash
npx wrangler dev
# 或任意静态服务器
python -m http.server 8080
```

## 自定义域名

Workers 绑定自定义域名**要求域名 NS 已托管在 Cloudflare**。若域名在别家且不能改 NS，只能先用 `workers.dev` 子域；确实需要外部域名时，可改用 Cloudflare Pages（Pages 支持 CNAME 接入外部域名）。

绑定后无需改任何代码，订阅链接会自动跟随新域名。

## 关于数据新鲜度（重要）

`vvhan/`、`vps789/`、`tiancheng3/` 这些订阅 txt 在原站是**每半小时刷新**的。镜像下来的是一份**快照**，时间一长就会过期失效。

若打算长期自用，建议加一个 Cron Trigger Worker 定时回源刷新这些文件并写入 R2/KV。这也是选 Workers 而不是 Pages 的一个实际好处——Pages 加不了定时任务。

## 外部依赖

页面运行时直接调用以下第三方服务，**本站不控制它们**，任一挂掉或限流都会导致对应功能失效：

- **Cloudflare 官方**：`api.cloudflare.com/client/v4/ips`（IP 段）、`speed.cloudflare.com`（测速）、`radar.cloudflare.com`
- **同类项目接口**：`randomip.pages.dev`、`warp-masque-bestip.pages.dev`、`autocf-workers.pages.dev`、`acl4ssr-clash.pages.dev`、`masque.pages.dev`、`harmony-up-2.pages.dev`、`ech-check-tool.pages.dev`、`api-proxyip-check.pages.dev`
- **IP / 域名数据**：`ipdb.api.030101.xyz`、`addressesapi.090227.xyz`、`cf.junzhen.qzz.io`、`zip.cm.edu.kg`
- **DNS over HTTPS**：`doh.cleanbrowsing.org`、`dns.alidns.com`、`dns.quad9.net`、`doh.adguard.com`、`doh.opendns.com`
- **其他**：`api.ipify.org`（本机 IP）、`itunes.apple.com`（App 信息）

要把这些换成自己的实现，需要自行写 Worker 做中转或重写对应逻辑。

## 来源与免责

页面内容、数据与工具链接整理自公开的 Cloudflare 节点导航项目，本仓库仅为个人自用/学习目的的静态镜像。

- 原作者品牌链接保留在页面页脚，可作为来源标注；如不需要可自行删除。
- **请勿用于商业用途或对外作为自有产品发布**；数据版权归原作者，`tools/` 下的 zip 归各自作者。
- 使用本仓库内容所产生的一切后果由使用者自行承担。
