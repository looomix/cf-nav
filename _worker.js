/**
 * cf-nav Worker —— 静态站 + 每日分批回源刷新订阅数据
 * ============================================================
 * 单文件版 Worker，三条部署路径都支持：
 *   1) 面板粘贴（推荐首发）：Dashboard → Workers & Pages → Create → Workers，
 *      名字填 cf-nav，进入 Edit code，把本文件整体粘进去 → Deploy。
 *      这一步只有代码、没有静态资源，访问会看到一个引导页（属正常）。
 *      随后在该 Worker 的 Settings → Build 里连接 GitHub 仓库，
 *      wrangler.jsonc 会把 ASSETS / SUBS / cron / 自定义域名一次配齐。
 *   2) wrangler 部署：wrangler.jsonc 的 main 指向本文件，连上仓库后走的就是它
 *   3) Pages 高级模式：放在站点根目录，文件名就叫 _worker.js
 *
 * 依赖两个绑定（缺失时均有降级处理，不会 500）：
 *   ASSETS  —— 静态资源（wrangler.jsonc 的 assets.binding）
 *   SUBS    —— KV，存最新数据（bindings 里的 binding 名为 SUBS）
 *
 * 逻辑要点：
 *   - 请求数据文件（CIDR/*、endpoint/* 等）时优先读 KV，没有才回落静态快照
 *   - 每天 3 个 cron 各刷三分之一，免费版单次 50 子请求的限制下也能刷完全量
 *   - /__refresh?token=xxx 可手动触发，连调 3 次刷完全站
 * ============================================================
 */

const ORIGIN = "https://bestcf.pages.dev";        // 优选 IP / 订阅数据来源
const MASQUE_ORIGIN = "https://masque.pages.dev"; // WARP MASQUE 端点数据来源
const KEY_PREFIX = "sub:v1:";
const CONCURRENCY = 6;

// 需要每天回源刷新的数据文件（共 130 个）
const SOURCES = [
  'client-ver.txt',
  'CIDR/WARP-MASQUE-CIDRs.txt',
  'CIDR/all.txt',
  'CIDR/core.txt',
  'CIDR/high-bandwidth.txt',
  'CIDR/low-blocking.txt',
  'CIDR/low-latency.txt',
  'CIDR/success.txt',
  'WARP/WARP-MASQUE-IPs-443.txt',
  'WARP/WARP-MASQUE-IPs-8443.txt',
  'WARP/WARP-MINI-443.txt',
  'WARP/WARP-MINI-8443.txt',
  'WARP/WARP-MINI.txt',
  'domain/Domain-AI-VPS789.txt',
  'domain/Domain-Asia.txt',
  'domain/Domain-Checked.txt',
  'domain/Domain-TOP.txt',
  'domain/all.txt',
  'domain/mini.txt',
  'random-region/list.txt',
  'random-region/mix.txt',
  'random-region/mix2.txt',
  'cfyes/ipv4.txt',
  'cfyes/ipv6.txt',
  'cmliu/all.txt',
  'cmliu2/all.txt',
  'entryip/50.txt',
  'gslege/Cfxyz.txt',
  'gslege/DE.txt',
  'gslege/JP.txt',
  'gslege/NL.txt',
  'gslege/SG.txt',
  'gslege/US.txt',
  'ircf/ipv4.txt',
  'kristi/all.txt',
  'luoli/all.txt',
  'lzj/all.txt',
  'moistr/all.txt',
  'nirevil/ipv4.txt',
  'nirevil/ipv6.txt',
  's5gy/all.txt',
  's5gy/hk.txt',
  's5gy/jp.txt',
  's5gy/kr.txt',
  's5gy/mini.txt',
  's5gy/sg.txt',
  's5gy/tw.txt',
  's5gy/us.txt',
  'tiancheng/all.txt',
  'tiancheng/hk.txt',
  'tiancheng/jp.txt',
  'tiancheng/kr.txt',
  'tiancheng/mini.txt',
  'tiancheng/sg.txt',
  'tiancheng/tw.txt',
  'tiancheng/us.txt',
  'tiancheng2/all.txt',
  'tiancheng2/de.txt',
  'tiancheng2/hk.txt',
  'tiancheng2/jp.txt',
  'tiancheng2/kr.txt',
  'tiancheng2/mini.txt',
  'tiancheng2/sg.txt',
  'tiancheng2/tw.txt',
  'tiancheng2/us.txt',
  'tiancheng3/all.txt',
  'tiancheng3/hk.txt',
  'tiancheng3/jp.txt',
  'tiancheng3/kr.txt',
  'tiancheng3/mini.txt',
  'tiancheng3/sg.txt',
  'tiancheng3/tw.txt',
  'tiancheng3/us.txt',
  'uouin/all.txt',
  'vps789/top10.txt',
  'vps789/top100.txt',
  'vps789/top20.txt',
  'vps789/top50.txt',
  'vvhan/ipv4.txt',
  'vvhan/ipv6.txt',
  'wetest/ipv4.txt',
  'xinyitang3/ipv4.txt',
  'yutian/all.txt',
  'zhixuanwang/ipv4-onlyip.txt',
  'endpoint/warp-ipv4v6-default.txt',
  'endpoint/warp-ipv4v6-443.txt',
  'endpoint/warp-ipv4v6-all.txt',
  'endpoint/warp-ipv4-default.txt',
  'endpoint/warp-ipv4-443.txt',
  'endpoint/warp-ipv4-all.txt',
  'endpoint/warp-ipv6-default.txt',
  'endpoint/warp-ipv6-443.txt',
  'endpoint/warp-ipv6-all.txt',
  'endpoint/zt-ipv4v6-default.txt',
  'endpoint/zt-ipv4v6-443.txt',
  'endpoint/zt-ipv4v6-all.txt',
  'endpoint/zt-ipv4-default.txt',
  'endpoint/zt-ipv4-443.txt',
  'endpoint/zt-ipv4-all.txt',
  'endpoint/zt-ipv6-default.txt',
  'endpoint/zt-ipv6-443.txt',
  'endpoint/zt-ipv6-all.txt',
  'endpoint/h2-random/warp-default-10.txt',
  'endpoint/h2-random/warp-default-20.txt',
  'endpoint/h2-random/warp-default-30.txt',
  'endpoint/h2-random/warp-default-50.txt',
  'endpoint/h2-random/warp-default-100.txt',
  'endpoint/h2-random/warp-default-all.txt',
  'endpoint/h2-random/warp-443-10.txt',
  'endpoint/h2-random/warp-443-20.txt',
  'endpoint/h2-random/warp-443-30.txt',
  'endpoint/h2-random/warp-443-50.txt',
  'endpoint/h2-random/warp-443-100.txt',
  'endpoint/h2-random/warp-443-all.txt',
  'endpoint/h2-random/zt-default-10.txt',
  'endpoint/h2-random/zt-default-20.txt',
  'endpoint/h2-random/zt-default-30.txt',
  'endpoint/h2-random/zt-default-50.txt',
  'endpoint/h2-random/zt-default-100.txt',
  'endpoint/h2-random/zt-default-all.txt',
  'endpoint/h2-random/zt-443-10.txt',
  'endpoint/h2-random/zt-443-20.txt',
  'endpoint/h2-random/zt-443-30.txt',
  'endpoint/h2-random/zt-443-50.txt',
  'endpoint/h2-random/zt-443-100.txt',
  'endpoint/h2-random/zt-443-all.txt',
  'endpoint/3rd/warp-ipv4.txt',
  'endpoint/3rd/warp-ipv6.txt',
  'endpoint/3rd/zt-ipv4.txt',
  'endpoint/3rd/zt-ipv6.txt'
];

// 这些路径要先经过 Worker，才能命中 KV 里的最新数据
const RUN_WORKER_FIRST = [
  "/__refresh",
  "/client-ver.txt",
  "/CIDR/*",
  "/WARP/*",
  "/domain/*",
  "/random-region/*",
  "/cfyes/*",
  "/cmliu/*",
  "/cmliu2/*",
  "/entryip/*",
  "/gslege/*",
  "/ircf/*",
  "/kristi/*",
  "/luoli/*",
  "/lzj/*",
  "/moistr/*",
  "/nirevil/*",
  "/s5gy/*",
  "/tiancheng/*",
  "/tiancheng2/*",
  "/tiancheng3/*",
  "/uouin/*",
  "/vps789/*",
  "/vvhan/*",
  "/wetest/*",
  "/xinyitang3/*",
  "/yutian/*",
  "/zhixuanwang/*",
  "/endpoint/*"
];

// 定时任务与配置里的 triggers.crons 一一对应，数组下标决定刷哪三分之一
const CRONS = ["0 4 * * *", "10 4 * * *", "20 4 * * *"];
const PARTS = CRONS.length;

// 只贴了代码、还没接上静态资源时返回的引导页（浅天蓝，与正式站同一色系）
const SETUP_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>cf-nav · 代码已就位</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       padding:32px 20px;background:linear-gradient(180deg,#eaf4ff 0%,#f7fbff 60%,#ffffff 100%);
       color:#16324f;font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  .card{width:100%;max-width:620px;background:#fff;border:1px solid #d6e8fb;border-radius:16px;
        padding:32px 30px;box-shadow:0 12px 34px rgba(37,99,235,.08)}
  .badge{display:inline-block;padding:4px 11px;border-radius:999px;background:#e2f0ff;color:#1a63c4;
         font-size:12px;font-weight:600;letter-spacing:.02em}
  h1{margin:14px 0 10px;font-size:22px;line-height:1.35;color:#12304d}
  p{margin:10px 0;color:#3f5a75}
  h2{margin:24px 0 8px;font-size:15px;color:#12304d}
  ol{margin:8px 0 0;padding-left:22px;color:#3f5a75}
  li{margin:6px 0}
  code{padding:1px 6px;border-radius:5px;background:#eef5fd;color:#1a63c4;font-size:13px;
       font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  b{color:#12304d}
  .hint{margin-top:22px;padding-top:16px;border-top:1px dashed #dbe9f8;font-size:13px;color:#6b8299}
</style>
</head>
<body>
<main class="card">
  <span class="badge">第 1 步 / 共 2 步 已完成</span>
  <h1>Worker 代码已生效</h1>
  <p>这个实例目前只加载了 <code>_worker.js</code>，还没有静态资源（<code>index.html</code> 和 130 个数据文件），所以显示的是这张说明页 —— <b>不是报错</b>。</p>
  <h2>再连一次仓库，就是完整站点</h2>
  <ol>
    <li>本 Worker → <b>Settings</b> → <b>Build</b> → <b>Connect</b>（部分界面写作 Connect Git / Deployments → Connect Git）</li>
    <li>仓库选 <code>cf-nav</code>，分支 <code>main</code></li>
    <li>Build command <b>留空</b>，Deploy command 保持 <code>npx wrangler deploy</code></li>
  </ol>
  <p>构建完成后，仓库里的 <code>wrangler.jsonc</code> 会把静态资源、KV、3 条 cron 和自定义域名一起挂上，本页随即被真正的导航页替换。</p>
  <p class="hint">逐项步骤与参数见仓库 README 的「第一步：网页端部署」。</p>
</main>
</body>
</html>`;

function dataUrl(path) {
  // endpoint/* 来自 MASQUE 站，其余来自 EDT 站
  const base = path.startsWith("endpoint/") ? MASQUE_ORIGIN : ORIGIN;
  return new URL("/" + path, base).toString();
}

function partRange(part) {
  const len = SOURCES.length;
  const from = Math.floor((part * len) / PARTS);
  const to = Math.floor(((part + 1) * len) / PARTS);
  return { from, to };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "cf-nav-cron/1.1" } });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return await res.text();
}

// 客户端版本表分散在两个上游，合并后写 KV：同 key 取日期较新的一条
async function refreshClientVer(env) {
  const [edt, masque] = await Promise.all([
    fetchText(ORIGIN + "/client-ver.txt"),
    fetchText(MASQUE_ORIGIN + "/client-ver.txt"),
  ]);
  const table = new Map();
  function absorb(text) {
    for (const line of text.split("\n")) {
      const row = line.trim();
      if (!row || row.indexOf("|") < 0) continue;
      const [key, ver = "", date = ""] = row.split("|");
      const k = key.trim();
      if (!k) continue;
      const old = table.get(k);
      if (!old || (old.date + "|" + old.ver) < (date.trim() + "|" + ver.trim())) {
        table.set(k, { line: row, ver: ver.trim(), date: date.trim() });
      }
    }
  }
  absorb(edt);
  absorb(masque);
  const merged =
    [...table.keys()]
      .sort()
      .map((k) => table.get(k).line)
      .join("\n") + "\n";
  await env.SUBS.put(KEY_PREFIX + "client-ver.txt", merged);
}

async function refreshPart(env, part) {
  if (!env.SUBS) {
    return { ok: false, error: "缺少 KV 绑定 SUBS，请检查 wrangler.jsonc" };
  }
  const idx = ((part % PARTS) + PARTS) % PARTS;
  const { from, to } = partRange(idx);
  const queue = SOURCES.slice(from, to);
  const failures = [];
  let updated = 0;

  async function drain() {
    while (queue.length) {
      const path = queue.shift();
      try {
        // 版本表要合并两个上游，单独处理
        if (path === "client-ver.txt") {
          await refreshClientVer(env);
          updated += 1;
          continue;
        }
        const res = await fetch(dataUrl(path), {
          headers: { "user-agent": "cf-nav-cron/1.1" },
        });
        if (!res.ok) {
          failures.push(path + " -> HTTP " + res.status);
          continue;
        }
        const text = await res.text();
        await env.SUBS.put(KEY_PREFIX + path, text);
        updated += 1;
      } catch (err) {
        failures.push(path + " -> " + (err && err.message ? err.message : "fetch error"));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, drain));

  return {
    ok: true,
    part: idx,
    from,
    to,
    count: to - from,
    total: SOURCES.length,
    updated,
    failed: failures.length,
    failures: failures.slice(0, 5),
    at: new Date().toISOString(),
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 手动触发一批刷新：/__refresh?token=你在后台设置的 REFRESH_TOKEN
    // 不带 &part= 时按 0 → 1 → 2 轮转，连调 3 次即可刷完全站
    if (url.pathname === "/__refresh") {
      const expected = env.REFRESH_TOKEN;
      if (!expected || url.searchParams.get("token") !== expected) {
        return new Response("Not Found", { status: 404 });
      }
      let part = parseInt(url.searchParams.get("part") || "", 10);
      if (!Number.isFinite(part) || part < 0 || part >= PARTS) {
        const raw = env.SUBS ? await env.SUBS.get("meta:part") : null;
        part = parseInt(raw || "0", 10);
        if (!Number.isFinite(part) || part < 0 || part >= PARTS) part = 0;
      }
      const result = await refreshPart(env, part);
      // 没有 KV 绑定时给 503，方便一眼看出是配置没到位
      if (!result.ok) return Response.json(result, { status: 503 });
      if (env.SUBS) {
        await env.SUBS.put("meta:part", String((result.part + 1) % PARTS));
      }
      result.next_part = (result.part + 1) % PARTS;
      return Response.json(result);
    }

    // 数据文件优先读 KV（定时任务写入的最新数据），读不到再回落静态资源
    if (env.SUBS) {
      const path = url.pathname.replace(/^\//, "");
      if (SOURCES.includes(path)) {
        const cached = await env.SUBS.get(KEY_PREFIX + path);
        if (cached !== null) {
          return new Response(cached, {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "cache-control": "public, max-age=300",
              "x-data-source": "kv",
            },
          });
        }
      }
    }

    // 只贴代码、还没连仓库时没有任何静态资源，给引导页而不是抛异常
    if (!env.ASSETS) {
      return new Response(SETUP_HTML, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-setup": "assets-missing",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },

  // 定时回源：每个 cron 只刷自己那三分之一
  async scheduled(controller, env, ctx) {
    let part = CRONS.indexOf(controller.cron);
    if (part < 0) part = 0;
    ctx.waitUntil(
      refreshPart(env, part).then((r) =>
        console.log(JSON.stringify({ event: "cron-refresh", cron: controller.cron, ...r }))
      )
    );
  },
};
