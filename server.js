const http = require('http');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const querystring = require('querystring');

const PORT = 3030;
const ROOT = __dirname;
const RECAPTCHA_SECRET_KEY = '6LcRvfMtAAAAABEUnxF_1qUJuoZ0y-EknmZt5euB';

// SMTP Configuration (MLR Infra)
const SMTP_CONFIG = {
  host: 'smtp.gmail.com',
  port: 465,
  user: 'keshanthenvizon@gmail.com',
  pass: 'jkqjaeinyzenmhkb',
  fromName: 'MLR Infra',
  toEmail: 'keshanthenvizon@gmail.com',
  companyPhone: '+91 94905 57886 / +91 93475 57886'
};

function sendSmtpMail({ fromEmail, fromName, toEmail, replyTo, subject, htmlBody }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(SMTP_CONFIG.port, SMTP_CONFIG.host, { rejectUnauthorized: false });
    let buffer = '';
    let step = 0;

    const commands = [
      `EHLO mlrinfra.com`,
      `AUTH LOGIN`,
      Buffer.from(SMTP_CONFIG.user).toString('base64'),
      Buffer.from(SMTP_CONFIG.pass).toString('base64'),
      `MAIL FROM:<${fromEmail}>`,
      `RCPT TO:<${toEmail}>`,
      `DATA`
    ];

    const mimeMessage = [
      `From: "${fromName}" <${fromEmail}>`,
      `To: <${toEmail}>`,
      replyTo ? `Reply-To: ${replyTo}` : null,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(htmlBody, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
      `.`,
      `QUIT`
    ].filter(Boolean).join('\r\n');

    socket.setTimeout(15000, () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });

    socket.on('error', (err) => reject(err));

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.substring(0, 3), 10);
        const isMultiline = line.charAt(3) === '-';
        if (isMultiline) continue;

        if (code >= 400) {
          socket.end();
          return reject(new Error(`SMTP Error ${code}: ${line}`));
        }

        if (step < commands.length) {
          const cmd = commands[step++];
          socket.write(cmd + '\r\n');
        } else if (step === commands.length) {
          step++;
          socket.write(mimeMessage + '\r\n');
        } else {
          socket.end();
          return resolve(true);
        }
      }
    });
  });
}

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

  // reCAPTCHA verification & enquiry mailer endpoint
  if (
    req.method === 'POST' &&
    (decodedPath === '/contact_validate.php' ||
      decodedPath === '/mailer.php' ||
      decodedPath === '/api/verify-captcha' ||
      decodedPath === '/api/submit-enquiry')
  ) {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
      }
    });
    req.on('end', async () => {
      try {
        const contentType = (req.headers['content-type'] || '').toLowerCase();
        let payload = {};
        if (contentType.includes('application/json')) {
          payload = JSON.parse(body || '{}');
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          payload = querystring.parse(body || '');
        } else {
          try {
            payload = JSON.parse(body || '{}');
          } catch (_) {
            payload = querystring.parse(body || '');
          }
        }

        // Anti-bot honeypot
        if (payload.website && String(payload.website).trim() !== '') {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ success: true, status: 'success', message: 'Thank you!' }));
          return;
        }

        const fullName = String(payload.full_name || payload.name || '').trim();
        const phone = String(payload.phone || payload.contact_info || payload.contact || '').trim();
        const email = String(payload.email || '').trim();
        const productInterest = String(payload.product_interest || payload.product || 'CC Bricks').trim();
        const estimatedQuantity = String(payload.estimated_quantity || payload.quantity || '').trim();
        const projectLocation = String(payload.project_location || payload.location || '').trim();
        const projectParams = String(payload.project_parameters || payload.requirement || payload.message || '').trim();

        if (!fullName || !phone || !email || !projectLocation || !projectParams) {
          res.writeHead(422, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            status: 'error',
            message: 'Please fill in all required fields (Name, Phone, Email, Location, and Project Parameters).'
          }));
          return;
        }

        const teamHtml = `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #cbd5e1;border-top:5px solid #0056A7;">
            <div style="background:#0a192f;color:#fff;padding:20px 24px;">
              <div style="color:#8CC63F;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">MLR Infra &bull; New Project Enquiry</div>
              <h2 style="margin:6px 0 0;font-size:20px;">New Quote Request from ${fullName}</h2>
              <p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">Reply directly to this email to respond to <strong>${fullName}</strong> (${email}).</p>
            </div>
            <div style="padding:24px;">
              <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
                <tr><td style="border-bottom:1px solid #e2e8f0;font-weight:700;width:36%;">Full Name</td><td style="border-bottom:1px solid #e2e8f0;">${fullName}</td></tr>
                <tr><td style="border-bottom:1px solid #e2e8f0;font-weight:700;">Email (Reply-To)</td><td style="border-bottom:1px solid #e2e8f0;"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="border-bottom:1px solid #e2e8f0;font-weight:700;">Phone Number</td><td style="border-bottom:1px solid #e2e8f0;"><a href="tel:${phone}">${phone}</a></td></tr>
                <tr><td style="border-bottom:1px solid #e2e8f0;font-weight:700;">Product Interest</td><td style="border-bottom:1px solid #e2e8f0;">${productInterest}</td></tr>
                <tr><td style="border-bottom:1px solid #e2e8f0;font-weight:700;">Estimated Quantity / Area</td><td style="border-bottom:1px solid #e2e8f0;">${estimatedQuantity || 'Not specified'}</td></tr>
                <tr><td style="border-bottom:1px solid #e2e8f0;font-weight:700;">Project Location</td><td style="border-bottom:1px solid #e2e8f0;">${projectLocation}</td></tr>
                <tr><td style="border-bottom:1px solid #e2e8f0;font-weight:700;">Project Parameters</td><td style="border-bottom:1px solid #e2e8f0;">${projectParams.replace(/\n/g, '<br>')}</td></tr>
              </table>
            </div>
          </div>`;

        const clientHtml = `
          <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #cbd5e1;border-top:5px solid #8CC63F;">
            <div style="background:#003B73;color:#fff;padding:20px 24px;">
              <div style="color:#8CC63F;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">MLR Infra</div>
              <h2 style="margin:6px 0 0;font-size:20px;">Thank You for Contacting MLR Infra</h2>
              <p style="margin:6px 0 0;font-size:13px;color:#e2e8f0;">We bring the factory to your site</p>
            </div>
            <div style="padding:24px;color:#1e293b;font-size:14px;line-height:1.6;">
              <p>Dear <strong>${fullName}</strong>,</p>
              <p>Thank you for reaching out to <strong>MLR Infra</strong>. We have received your enquiry for <strong>${productInterest}</strong> at <strong>${projectLocation}</strong> and our team will get back to you within 24 business hours.</p>
              <p>For immediate assistance, call us at <strong>${SMTP_CONFIG.companyPhone}</strong> or reply directly to this email.</p>
              <p style="margin-top:20px;">Warm regards,<br><strong>MLR Infra Team</strong></p>
            </div>
          </div>`;

        try {
          await sendSmtpMail({
            fromEmail: SMTP_CONFIG.user,
            fromName: SMTP_CONFIG.fromName,
            toEmail: SMTP_CONFIG.toEmail,
            replyTo: `"${fullName}" <${email}>`,
            subject: `New Project Quote Request: ${productInterest} — ${fullName} (${projectLocation})`,
            htmlBody: teamHtml
          });

          await sendSmtpMail({
            fromEmail: SMTP_CONFIG.user,
            fromName: SMTP_CONFIG.fromName,
            toEmail: email,
            replyTo: `"${SMTP_CONFIG.fromName}" <${SMTP_CONFIG.toEmail}>`,
            subject: `We've Received Your Project Enquiry — MLR Infra`,
            htmlBody: clientHtml
          }).catch(() => {});

          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: true,
            status: 'success',
            message: 'Thank you! Your project enquiry has been received. We have sent a confirmation to your email and will respond shortly.'
          }));
        } catch (mailErr) {
          console.error('SMTP send warning:', mailErr.message);
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({
            success: false,
            status: 'error',
            message: `Mail delivery failed (${mailErr.message}). Please call us at ${SMTP_CONFIG.companyPhone}.`
          }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, status: 'error', message: 'Invalid request payload' }));
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
