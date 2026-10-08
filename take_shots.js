const fs = require('fs');

async function run() {
  const res = await fetch('http://localhost:9222/json');
  const targets = await res.json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('3030'));
  if (!page) {
    console.error('No page target found');
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const callbacks = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      callbacks.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      cb(data.result);
    }
  };

  ws.onopen = async () => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send('Page.reload');
    await new Promise(r => setTimeout(r, 1500));

    // Scroll down to trigger any lazy images and wait for all image decodes
    await send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, 500));
        window.scrollTo(0, 0);
        await Promise.all(Array.from(document.images).map(async img => {
          if (!img.complete) {
            await new Promise(res => { img.onload = img.onerror = res; });
          }
          try { await img.decode(); } catch(e) {}
        }));
        await new Promise(r => setTimeout(r, 600));
      })()`
    });

    /*
    // 0. Screenshot Section 1 & 2 (Hero + Ticker)
    // 0b. Screenshot Section 3 (About Us)
    // 1. Screenshot Section 4 (Why Choose Us)
    */

    // 2. Screenshot Section 6 (Site Services)
    const servRect = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.getElementById('services');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return JSON.stringify({ x: 0, y: r.y + window.scrollY, width: 1440, height: r.height, scale: 1 });
      })()`
    });
    if (servRect && servRect.result && servRect.result.value) {
      const clip = JSON.parse(servRect.result.value);
      const shot = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
      fs.writeFileSync('audit_section_services.png', Buffer.from(shot.data, 'base64'));
      console.log('Saved audit_section_services.png');
    }

    ws.close();
    process.exit(0);
  };
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
