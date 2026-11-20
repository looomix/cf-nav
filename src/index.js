// Cloudflare Worker：静态站 + 每日定时回源刷新数据
// 部署方式见 README「第二步：开启每日自动回源」

const ORIGIN = "https://bestcf.pages.dev";
const KEY_PREFIX = "sub:v1:";
const CONCURRENCY = 6;

// 需要每天回源刷新的数据文件（共 83 个，约 1.4 MB）
const SOURCES = [
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
  'zhixuanwang/ipv4-onlyip.txt'
];

// 这些路径要先经过 Worker，才能命中 KV 里的最新数据
const RUN_WORKER_FIRST = [
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
  "/zhixuanwang/*"
];

function dataUrl(path) {
  return new URL("/" + path, ORIGIN).toString();
}

async function refreshAll(env) {
  if (!env.SUBS) {
    return { ok: false, error: "缺少 KV 绑定 SUBS，请检查 wrangler.jsonc" };
  }
  const queue = SOURCES.slice();
  const failures = [];
  let updated = 0;

  async function drain() {
    while (queue.length) {
      const path = queue.shift();
      try {
        const res = await fetch(dataUrl(path), {
          headers: { "user-agent": "cf-nav-cron/1.0" },
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
    total: SOURCES.length,
    updated,
    failed: failures.length,
    failures: failures.slice(0, 10),
    at: new Date().toISOString(),
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 手动触发一次刷新：/__refresh?token=你在后台设置的 REFRESH_TOKEN
    if (url.pathname === "/__refresh") {
      const expected = env.REFRESH_TOKEN;
      if (!expected || url.searchParams.get("token") !== expected) {
        return new Response("Not Found", { status: 404 });
      }
      const result = await refreshAll(env);
      return Response.json(result);
    }

    // 数据文件优先读 KV（定时任务写入的最新数据），读不到再回落到静态资源
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

  // 每天定时回源一次
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      refreshAll(env).then((r) => console.log(JSON.stringify({ event: "cron-refresh", ...r })))
    );
  },
};
