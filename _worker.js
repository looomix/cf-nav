/**
 * cf-nav Worker —— 纯静态站托管
 * ============================================================
 * 只做一件事：把请求交给静态资源（env.ASSETS）。
 * 没有 KV、没有 cron、没有回源：页面里的订阅链接直连上游原站，
 * 数据新鲜度由原站负责，本站只作导航页。
 *
 * 两条部署路径：
 *   1) 面板粘贴（首发）：Create → Workers，名字填 cf-nav，Edit code
 *      整份粘进来 → Deploy。此时还没有静态资源，会显示引导页（正常）。
 *      随后 Settings → Build 连上 GitHub 仓库，wrangler.jsonc 补齐资源与域名。
 *   2) wrangler 部署：wrangler.jsonc 的 main 指向本文件，连仓库后走的就是它。
 * ============================================================
 */

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
  <p>这个实例目前只加载了 <code>_worker.js</code>，还没有静态资源（<code>index.html</code> 与各数据目录），所以显示的是这张说明页 —— <b>不是报错</b>。</p>
  <h2>再连一次仓库，就是完整站点</h2>
  <ol>
    <li>本 Worker → <b>Settings</b> → <b>Build</b> → <b>Connect</b>（部分界面写作 Connect Git / Deployments → Connect Git）</li>
    <li>仓库选 <code>cf-nav</code>，分支 <code>main</code></li>
    <li>Build command <b>留空</b>，Deploy command 保持 <code>npx wrangler deploy</code></li>
  </ol>
  <p>构建完成后，仓库里的 <code>wrangler.jsonc</code> 会把页面、静态资源和自定义域名一起挂上，本页随即被真正的导航页替换。</p>
  <p class="hint">逐项步骤与参数见仓库 README 的「第一步：网页端部署」。</p>
</main>
</body>
</html>`;

export default {
  async fetch(request, env) {
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
};
