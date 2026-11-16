require('dotenv').config();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { loadProducts } = require('./lib/catalog');
const { answerQuery } = require('./lib/rag');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/products' && req.method === 'GET') {
    try { return sendJson(res, 200, { products: loadProducts() }); }
    catch (error) { console.error(error); return sendJson(res, 500, { error: 'Katalog produk belum dapat dimuat.' }); }
  }
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const query = typeof body.message === 'string' ? body.message.trim() : '';
      if (!query || query.length > 500) return sendJson(res, 400, { error: 'Pertanyaan harus berisi 1–500 karakter.' });
      return sendJson(res, 200, await answerQuery(query, loadProducts()));
    } catch (error) {
      if (error instanceof SyntaxError) return sendJson(res, 400, { error: 'Format pesan tidak valid.' });
      console.error('[Chat] Failed to answer:', error.message);
      return sendJson(res, 500, { error: 'Asisten sedang mengalami kendala. Silakan coba lagi.' });
    }
  }

  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) && filePath !== path.join(ROOT, 'index.html')) return sendJson(res, 403, { error: 'Akses ditolak.' });
  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(res, 404, { error: 'Halaman tidak ditemukan.' });
    res.writeHead(200, { 'content-type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => console.log(`Katalog berjalan di http://localhost:${PORT}`));
