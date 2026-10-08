const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3030;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const requestHandler = (req, res) => {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  if (req.url.startsWith('/debug')) {
    console.log('DEBUG_LOG:', decodedPath);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  let reqPath = decodedPath;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(ROOT, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });

      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.on('error', (streamErr) => {
        console.error('File stream error:', streamErr.message);
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      });
      res.on('close', () => {
        fileStream.destroy();
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });

      const stream = fs.createReadStream(filePath);
      stream.on('error', (streamErr) => {
        console.error('Stream error:', streamErr.message);
        if (!res.headersSent) {
          res.writeHead(500);
        }
        res.end();
      });
      res.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
    }
  });
};

process.on('uncaughtException', (err) => {
  console.error('Handled Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Handled Unhandled Rejection:', reason);
});

const s = http.createServer(requestHandler);
s.listen(PORT, () => {
  console.log(`MLR server running exclusively at http://localhost:${PORT}/`);
}).on('error', (e) => {
  console.log(`Port ${PORT} error: ${e.message}`);
});
