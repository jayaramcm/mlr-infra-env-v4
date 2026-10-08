const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9889;
const FRAMES_DIR = path.resolve(__dirname, 'assets/frames');

if (!fs.existsSync(FRAMES_DIR)) {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function extract() {
  console.log('Starting Chrome to extract WebP frames...');
  const chromeProcess = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\chrome-extract-${Date.now()}`,
    'http://localhost:3030/'
  ]);

  await sleep(2500);

  const tabs = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/json`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const pageTab = tabs.find(t => t.type === 'page' && t.url.includes('3030'));
  if (!pageTab) {
    throw new Error('Target tab not found!');
  }

  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };

  await new Promise(res => ws.onopen = res);

  function send(method, params = {}) {
    return new Promise(res => {
      const curId = id++;
      pending.set(curId, res);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }

  await send('Page.enable');

  // Delete old frames first
  if (fs.existsSync(FRAMES_DIR)) {
    const oldFiles = fs.readdirSync(FRAMES_DIR);
    for (const file of oldFiles) {
      fs.unlinkSync(path.join(FRAMES_DIR, file));
    }
    console.log(`Deleted ${oldFiles.length} old frames from ${FRAMES_DIR}`);
  }

  // Initialize extractor in browser
  const initRes = await send('Runtime.evaluate', {
    expression: `
      new Promise((resolve, reject) => {
        window.__video = document.createElement('video');
        window.__video.src = 'assets/hero%20video.mp4?v=' + Date.now();
        window.__video.muted = true;
        window.__video.playsInline = true;
        window.__video.preload = 'auto';

        window.__canvas = document.createElement('canvas');

        window.__video.onloadedmetadata = () => {
          let origW = window.__video.videoWidth || 1280;
          let origH = window.__video.videoHeight || 720;
          let targetW = 1280;
          let targetH = Math.round((targetW / origW) * origH);
          if (targetH % 2 !== 0) targetH++;

          window.__canvas.width = targetW;
          window.__canvas.height = targetH;
          window.__ctx = window.__canvas.getContext('2d');

          resolve({
            duration: window.__video.duration,
            origW,
            origH,
            targetW,
            targetH
          });
        };
        window.__video.onerror = (e) => reject('Video error: ' + (window.__video.error ? window.__video.error.message : 'unknown'));
      })
    `,
    awaitPromise: true,
    returnByValue: true
  });

  const initVal = initRes.result.result.value;
  const duration = initVal.duration;
  console.log(`Video metadata loaded: duration = ${duration.toFixed(2)}s, original = ${initVal.origW}x${initVal.origH}, target = ${initVal.targetW}x${initVal.targetH}`);

  // Target 75 frames for smooth scrubbing
  const TOTAL_FRAMES = 75;
  console.log(`Extracting ${TOTAL_FRAMES} WebP frames at ${initVal.targetW}x${initVal.targetH}...`);

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const targetTime = (i / (TOTAL_FRAMES - 1)) * (duration - 0.05);

    const frameRes = await send('Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          const v = window.__video;
          const onSeeked = () => {
            v.removeEventListener('seeked', onSeeked);
            window.__ctx.drawImage(v, 0, 0, window.__canvas.width, window.__canvas.height);
            const dataUrl = window.__canvas.toDataURL('image/webp', 0.85);
            resolve(dataUrl);
          };
          v.addEventListener('seeked', onSeeked);
          v.currentTime = ${targetTime};
        })
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const dataUrl = frameRes.result.result.value;
    const base64Data = dataUrl.replace(/^data:image\/webp;base64,/, '');
    const filename = `frame_${String(i).padStart(3, '0')}.webp`;
    fs.writeFileSync(path.join(FRAMES_DIR, filename), Buffer.from(base64Data, 'base64'));

    if (i % 15 === 0 || i === TOTAL_FRAMES - 1) {
      console.log(`Extracted frame ${i + 1}/${TOTAL_FRAMES}: ${filename}`);
    }
  }

  console.log('Successfully extracted all WebP frames!');
  chromeProcess.kill();
  process.exit(0);
}

extract().catch(err => {
  console.error('Extraction error:', err);
  process.exit(1);
});
