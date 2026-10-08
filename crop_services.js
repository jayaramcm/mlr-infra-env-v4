const fs = require('fs');

async function run() {
  const res = await fetch('http://localhost:9222/json');
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('3030'));
  if (!page) {
    console.error('No page found');
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
    const filePath = 'C:/Users/User/.gemini/antigravity-ide/brain/e614c8ee-8009-4733-979a-e197cb3661c0/.user_uploaded/media_1791384039943.png';
    const base64Data = fs.readFileSync(filePath).toString('base64');

    const result = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `
        (async () => {
          const img = new Image();
          await new Promise(r => {
            img.onload = r;
            img.src = 'data:image/png;base64,' + '${base64Data}';
          });

          const w = img.naturalWidth;
          const h = img.naturalHeight;

          // Let's crop the three service photos:
          // In the reference image (w x h):
          // Row 1: Header (Site Services, Beyond Materials, copy, link)
          // Row 2: 3 cards side by side
          // Let's create a helper to crop an area to base64
          function crop(xPct, yPct, wPct, hPct) {
            const canvas = document.createElement('canvas');
            const sx = Math.floor(w * xPct);
            const sy = Math.floor(h * yPct);
            const sw = Math.floor(w * wPct);
            const sh = Math.floor(h * hPct);
            canvas.width = sw;
            canvas.height = sh;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
            return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
          }

          return {
            w,
            h
          };
        })()
      `
    });

    console.log('Result:', result.result.value);
    ws.close();
    process.exit(0);
  };
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
