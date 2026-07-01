// CDP bridge for browser automation (Chrome DevTools Protocol over WebSocket).
// 依赖: node >= 22 (内置 WebSocket 与 fetch)。无需任何 npm 包。
//
// 用法:
//   node wos_cdp.js targets                         列出标签页
//   node wos_cdp.js nav <url> [waitMs]              导航并返回 {url,title}
//   node wos_cdp.js eval "<js-expression>"          在页面执行 JS(同步), 返回值
//   node wos_cdp.js evalfile <path-to-js-file>      执行文件中的 JS(可 async), 返回值
//   node wos_cdp.js setdownload <windows-path>      设置 Chrome 下载目录
//   node wos_cdp.js raw <method> <json-params>      调用任意 CDP 方法
//
// 通过环境变量 CDP_PORT 指定端口(默认 9223):
//   CDP_PORT=9223 node wos_cdp.js targets
const CDP_PORT = Number(process.env.CDP_PORT || 9223);
const fs = require('fs');

async function getTargets() {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  return r.json();
}

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const onMsg = (ev) => {
      let data;
      try { data = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); }
      catch (e) { return; }
      if (data.id === id) {
        ws.removeEventListener('message', onMsg);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.addEventListener('error', (e) => reject(new Error('ws error: ' + (e.message || 'unknown'))));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, expression, awaitPromise = true) {
  const r = await cdpCall(ws, 'Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise, allowUnsafeEval: true
  });
  if (r.exceptionDetails) throw new Error('JS exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 1500));
  return r.result && r.result.value;
}

async function navigate(ws, url, waitMs = 8000) {
  await cdpCall(ws, 'Page.enable');
  await cdpCall(ws, 'Page.navigate', { url });
  await new Promise(res => setTimeout(res, waitMs));
}

async function openPage() {
  const targets = await getTargets();
  let page = targets.find(t => t.type === 'page' && !t.url.startsWith('chrome://'));
  if (!page) page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target available (先在 Chrome 打开任意页面)');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  return { ws, page };
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'targets') {
    const t = await getTargets();
    console.log(JSON.stringify(t.map(x => ({ type: x.type, url: x.url })), null, 2));
    return;
  }
  const { ws } = await openPage();
  try {
    if (mode === 'nav') {
      await navigate(ws, process.argv[3], Number(process.argv[4] || 8000));
      const info = await evaluate(ws, `JSON.stringify({url: location.href, title: document.title})`, false);
      console.log(info);
    } else if (mode === 'setdownload') {
      await cdpCall(ws, 'Page.enable');
      try { await cdpCall(ws, 'Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: process.argv[3] }); } catch (e) {}
      try { await cdpCall(ws, 'Page.setDownloadBehavior', { behavior: 'allow', downloadPath: process.argv[3] }); } catch (e) {}
      console.log(JSON.stringify({ setdownload: process.argv[3] }));
    } else if (mode === 'raw') {
      const m = process.argv[3]; const p = process.argv[4] ? JSON.parse(process.argv[4]) : {};
      const r = await cdpCall(ws, m, p);
      console.log(JSON.stringify(r));
    } else if (mode === 'eval') {
      const val = await evaluate(ws, process.argv[3]);
      console.log(JSON.stringify(val));
    } else if (mode === 'evalfile') {
      const code = fs.readFileSync(process.argv[3], 'utf8');
      const val = await evaluate(ws, code);
      console.log(JSON.stringify(val));
    } else {
      console.error('unknown mode: ' + mode);
    }
  } finally {
    ws.close();
  }
}
main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
