const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const sessions = path.join(root, 'sessions');
const port = Number(process.env.CAPTION_COLLECTOR_PORT || 8765);
const host = '127.0.0.1';
const routes = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/assembler.js', ['public/assembler.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/vendor/tesseract.min.js', ['node_modules/tesseract.js/dist/tesseract.min.js', 'text/javascript']],
  ['/vendor/worker.min.js', ['node_modules/tesseract.js/dist/worker.min.js', 'text/javascript']],
]);
const coreFiles = new Set([
  'tesseract-core.wasm.js', 'tesseract-core.wasm',
  'tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm',
  'tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm',
]);

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(contentType.startsWith('application/json') ? JSON.stringify(body) : body);
}

function serveFile(res, file, type) {
  fs.readFile(path.join(root, file), (error, data) => {
    if (error) return send(res, 404, { error: 'File unavailable. Run npm install first.' });
    send(res, 200, data, type);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let input = '';
    req.on('data', chunk => {
      input += chunk;
      if (input.length > 100_000) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(input)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sessionPath(id) {
  if (!/^\d{8}-\d{6}-[a-f0-9]{8}$/.test(id || '')) throw new Error('Invalid session');
  return path.join(sessions, `${id}.txt`);
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://${host}:${port}`) {
    return send(res, 403, { error: 'Cross-site request blocked' });
  }
  if (req.method === 'GET' && routes.has(url.pathname)) {
    const [file, type] = routes.get(url.pathname);
    return serveFile(res, file, type);
  }
  if (req.method === 'GET' && url.pathname.startsWith('/vendor/core/')) {
    const name = url.pathname.slice('/vendor/core/'.length);
    if (!coreFiles.has(name)) return send(res, 404, { error: 'Not found' });
    return serveFile(res, `node_modules/tesseract.js-core/${name}`,
      name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
  }
  if (req.method === 'GET' && url.pathname === '/vendor/lang/eng.traineddata.gz') {
    return serveFile(res, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'application/gzip');
  }
  if (req.method === 'POST' && url.pathname === '/api/session') {
    await fs.promises.mkdir(sessions, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const id = `${stamp}-${crypto.randomBytes(4).toString('hex')}`;
    const file = sessionPath(id);
    await fs.promises.writeFile(file, `Meeting captions\nStarted: ${new Date().toISOString()}\n\n`, { flag: 'wx' });
    await fs.promises.writeFile(file.replace(/\.txt$/, '.raw.txt'), `Raw OCR snapshots\nStarted: ${new Date().toISOString()}\n\n`, { flag: 'wx' });
    return send(res, 200, { id });
  }
  if (req.method === 'POST' && url.pathname === '/api/append') {
    const { id, text, at, raw } = await readJson(req);
    const file = sessionPath(id).replace(/\.txt$/, raw === true ? '.raw.txt' : '.txt');
    if (typeof text !== 'string' || !text.trim() || text.length > 5000) throw new Error('Invalid text');
    const timestamp = typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString();
    await fs.promises.appendFile(file, `[${timestamp}] ${text.trim().replace(/[\r\n]+/g, ' ')}\n`);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/transcript') {
    const file = sessionPath(url.searchParams.get('id')).replace(/\.txt$/, url.searchParams.get('raw') === '1' ? '.raw.txt' : '.txt');
    const body = await fs.promises.readFile(file, 'utf8');
    return send(res, 200, body, 'text/plain; charset=utf-8');
  }
  send(res, 404, { error: 'Not found' });
}

http.createServer((req, res) => {
  handler(req, res).catch(error => send(res, error.code === 'ENOENT' ? 404 : 400, { error: error.message }));
}).listen(port, host, () => {
  console.log(`Caption Collector: http://${host}:${port}`);
  console.log(`Transcripts: ${sessions}`);
});
