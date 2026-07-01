// WoS 检索取数脚本 (通过 CDP 调用 WoS 内部 API)。
// 依赖: node >= 22; 本目录下 wos_cdp.js 的 CDP 连接逻辑(此处自包含)。
//
// 用法:
//   node wos_search.js '<TS表达式>' <年限> <取条数> <输出json路径> [CDP端口]
// 示例:
//   node wos_search.js '("incremental learning" OR "continual learning" OR "catastrophic forgetting")' 2015-2026 80 /tmp/wos_out.json
//
// 说明:
//   - 先用 queryJson URL 导航到结果页(建立 SID), 再用内部 API 翻页取数。
//   - 镜像站(clarivate.cn)关键点: 不带 editions 字段; 分页用 retrieve.first(1-based); 单次最多20条。
//   - 按 times-cited-descending 排序, 取前 N 条高被引。
const CDP_PORT = Number(process.argv[6] || process.env.CDP_PORT || 9223);
const fs = require('fs');

const TS_EXPR = process.argv[3] ? process.argv[2] : null;
if (!TS_EXPR) { console.error('用法: node wos_search.js "<TS表达式>" <年限> <取条数> <输出json路径> [端口]'); process.exit(1); }
const YR = process.argv[3];
const WANT = Number(process.argv[4] || 80);
const OUT = process.argv[5];

async function getTargets() { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json`); return r.json(); }
function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = (ev) => {
      let d; try { d = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch (e) { return; }
      if (d.id === id) { ws.removeEventListener('message', onMsg); if (d.error) reject(new Error(JSON.stringify(d.error))); else resolve(d.result); }
    };
    ws.addEventListener('message', onMsg);
    ws.addEventListener('error', e => reject(new Error('ws ' + (e.message || ''))));
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(ws, expression, awaitPromise = true) {
  const r = await cdpCall(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise, allowUnsafeEval: true });
  if (r.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.exceptionDetails).slice(0, 1000));
  return r.result && r.result.value;
}
async function navigate(ws, url, waitMs = 12000) { await cdpCall(ws, 'Page.enable'); await cdpCall(ws, 'Page.navigate', { url }); await new Promise(r => setTimeout(r, waitMs)); }

(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome://')) || targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  const q = [{ rowBoolean: null, rowField: "TS", rowText: TS_EXPR }];
  if (YR && YR !== '-') q.push({ rowBoolean: "AND", rowField: "PY", rowText: YR });

  // 1. queryJson URL 搜索 → 重建 SID
  const searchUrl = "https://webofscience.clarivate.cn/wos/woscc/general-summary?queryJson=" + encodeURIComponent(JSON.stringify(q));
  await navigate(ws, searchUrl, 12000);

  // 2. 内部 API 翻页取数 (在 WoS 页面内执行 fetch)
  const fetchJs = `
(async () => {
  const sid = performance.getEntriesByType('resource').map(r => r.name.match(/SID=([^&]+)/)?.[1]).filter(Boolean)[0] || '';
  if (!sid) return { status: 'no_session' };
  const query = ${JSON.stringify(q)};
  const all = [];
  let total = 0;
  for (let fr = 1; all.length < ${WANT}; fr += 20) {
    const body = { product: "WOSCC", searchMode: "general", viewType: "search", serviceMode: "summary",
      search: { mode: "general", database: "WOSCC", query },
      retrieve: { count: 20, first: fr, history: true, jcr: true, sort: "times-cited-descending", analyzes: [], locale: "en" },
      eventMode: null };
    const r = await fetch('/api/wosnx/core/runQuerySearch?SID=' + sid, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'application/x-ndjson' }, body: JSON.stringify(body) });
    const t = await r.text();
    const lines = t.trim().split('\\n').map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    const si = lines.find(l => l.key === 'searchInfo')?.payload;
    const rd = lines.find(l => l.key === 'records')?.payload;
    total = si?.RecordsFound || total;
    if (!rd || Object.keys(rd).length === 0) break;
    for (const [idx, rec] of Object.entries(rd)) {
      all.push({
        wosId: rec.colluid, title: rec.titles?.item?.en?.[0]?.title || '',
        authors: (rec.names?.author?.en?.filter(Boolean).map(a => a.wos_standard) || []).join('; '),
        source: rec.titles?.source?.en?.[0]?.title || '', year: rec.pub_info?.pubyear || '',
        vol: rec.pub_info?.vol || '', issue: rec.pub_info?.issue || '', pages: rec.pub_info?.page_no || '',
        doi: rec.doi || '', citations: rec.citation_related?.counts?.WOSCC || 0,
        citationsAll: rec.citation_related?.counts?.ALLDB || 0, docType: rec.doctypes?.[0] || '',
        abstract: (rec.abstract?.basic?.en?.abstract || '').replace(/<[^>]*>/g, '').slice(0, 500), oa: rec.oa || false
      });
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { status: 'ok', total, count: all.length, records: all };
})()`;
  const res = await evaluate(ws, fetchJs);
  fs.writeFileSync(OUT, JSON.stringify(res, null, 2));
  console.log(JSON.stringify({ status: res.status, total: res.total, count: res.count, out: OUT }));
  ws.close();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
