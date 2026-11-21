/**
 * cf-nav Worker —— 静态站 + 每日分批回源刷新订阅数据
 * ============================================================
 * 单文件版 Worker，三种用法都能直接用：
 *   1) wrangler 部署：wrangler.jsonc 的 main 指向它（当前就是这样用的）
 *   2) 面板部署：Dashboard → Workers & Pages → cf-nav → Edit code，
 *      把本文件整体粘进去保存（前提是已绑定 ASSETS 与 KV SUBS）
 *   3) Pages 高级模式：放在站点根目录，文件名就叫 _worker.js
 *
 * 依赖两个绑定：
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
