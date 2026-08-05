/**
 * City Blinds — static landing page server.
 *
 * Zero-dependency Node.js static file server. Serves the landing page
 * from the `public/` directory.
 *
 * Run with:
 *   node server.js
 * Then open http://localhost:3000
 *
 * Port can be overridden with the PORT environment variable.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load .env for local development (optional). Real env vars take precedence.
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envFile.split(/\r?\n/).forEach(function (line) {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = val;
  });
} catch (e) { /* no .env file — rely on real env vars */ }

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Extension -> MIME type map for the files we serve.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const { sendLeadSms, validateLead } = require('./lib/send-lead');

const MAX_BODY_BYTES = 32 * 1024;

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    let data = '';
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('Payload too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', function () { resolve(data); });
    req.on('error', reject);
  });
}

async function handleSubmit(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readJsonBody(req));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
  }
  const errors = validateLead(payload);
  if (errors.length) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: errors[0] }));
  }
  try {
    await sendLeadSms(payload);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('Failed to send lead SMS:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'Failed to send. Please try again.' }));
  }
}

const server = http.createServer((req, res) => {
  // Lead submission endpoint (mirrors api/submit.js for local testing).
  if (req.url.split('?')[0] === '/api/submit') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }));
    }
    return handleSubmit(req, res);
  }

  // Only GET / HEAD supported for a static site.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method Not Allowed');
  }

  // Resolve the requested path inside PUBLIC_DIR, guarding against
  // path traversal (e.g. /../secret.txt).
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad Request');
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));

  // Ensure the resolved path stays inside the public directory.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    });

    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`City Blinds landing page running at http://localhost:${PORT}`);
});
