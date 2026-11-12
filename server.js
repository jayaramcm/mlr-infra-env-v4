const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = 3030;
const ROOT = __dirname;
const RECAPTCHA_SECRET_KEY = '6LcRvfMtAAAAABEUnxF_1qUJuoZ0y-EknmZt5euB';

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
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml']);

const requestHandler = (req, res) => {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // reCAPTCHA verification & enquiry API endpoint
  if (req.method === 'POST' && (decodedPath === '/api/verify-captcha' || decodedPath === '/api/submit-enquiry')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const token = payload.token || payload['g-recaptcha-response'];

        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: 'Missing reCAPTCHA token' }));
          return;
        }

        const postData = `secret=${encodeURIComponent(RECAPTCHA_SECRET_KEY)}&response=${encodeURIComponent(token)}`;
        const verifyReq = https.request({
          hostname: 'www.google.com',
          path: '/recaptcha/api/siteverify',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (verifyRes) => {
          let gData = '';
          verifyRes.on('data', c => gData += c);
          verifyRes.on('end', () => {
            try {
              const gJson = JSON.parse(gData);
              if (gJson.success) {
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: true, message: 'reCAPTCHA verified successfully', data: payload }));
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ success: false, error: 'reCAPTCHA validation failed', codes: gJson['error-codes'] }));
              }
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ success: false, error: 'Failed to parse Google verification response' }));
            }
          });
        });

        verifyReq.on('error', (err) => {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        });

        verifyReq.write(postData);
        verifyReq.end();
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON request payload' }));
      }
    });
    return;
  }

  let reqPath = decodedPath;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  } else if (reqPath === '/blog' || reqPath === '/blog/') {
    reqPath = '/blog.html';
  } else if (
    reqPath === '/reliable-concrete-paver-blocks-supplier-hyderabad' ||
    reqPath === '/reliable-concrete-paver-blocks-supplier-hyderabad/'
  ) {
    reqPath = '/reliable-concrete-paver-blocks-supplier-hyderabad.html';
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
    const etag = `W/"${totalSize.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;
    const isAsset = reqPath.startsWith('/assets/');
    const cacheControl = isAsset
      ? 'public, max-age=86400, stale-while-revalidate=604800'
      : 'public, max-age=0, must-revalidate';

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': cacheControl,
        'Access-Control-Allow-Origin': '*'
      });
      res.end();
      return;
    }

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const shouldCompress = COMPRESSIBLE_EXTS.has(ext) && totalSize > 256 && !req.headers.range;

    if (shouldCompress && (acceptEncoding.includes('br') || acceptEncoding.includes('gzip'))) {
      const useBrotli = acceptEncoding.includes('br');
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Encoding': useBrotli ? 'br' : 'gzip',
        'Vary': 'Accept-Encoding',
        'ETag': etag,
        'Cache-Control': cacheControl,
        'Access-Control-Allow-Origin': '*'
      });

      const rawStream = fs.createReadStream(filePath);
      const compressor = useBrotli
        ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : zlib.createGzip({ level: 6 });

      rawStream.on('error', () => res.end());
      res.on('close', () => rawStream.destroy());
      rawStream.pipe(compressor).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': totalSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'ETag': etag,
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
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
