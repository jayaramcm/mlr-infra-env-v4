const fs = require('fs');

async function run() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('3030'));
  if (!page) {
    console.error('No page');
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const cbs = new Map();

  function send(method, params = {}) {
    return new Promise(resolve => {
      const mid = id++;
      cbs.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }

  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && cbs.has(d.id)) {
      const cb = cbs.get(d.id);
      cbs.delete(d.id);
      cb(d.result);
    }
  };

  ws.onopen = async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:3030/#products' });
    await new Promise(r => setTimeout(r, 1500));

    const evalRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const el = document.querySelector('.products-moulds-container');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return JSON.stringify({
            x: Math.max(0, Math.floor(r.left - 24)),
            y: Math.floor(r.top + window.scrollY - 20),
            width: Math.floor(r.width + 48),
            height: Math.floor(r.height + 40),
            scale: 1
          });
        })()
      `
    });

    if (evalRes && evalRes.result && evalRes.result.value) {
      const clip = JSON.parse(evalRes.result.value);
      const shot = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
      fs.writeFileSync('audit_moulds_enlarged.png', Buffer.from(shot.data, 'base64'));
      console.log('Saved audit_moulds_enlarged.png');
    } else {
      console.error('Could not find element rect');
    }

    ws.close();
    process.exit(0);
  };
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
