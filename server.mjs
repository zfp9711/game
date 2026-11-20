// 零依赖静态服务器。`npm start` = 起服务并打开浏览器。
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4321);
const QA = process.argv.includes('--qa');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');

    // QA：把画布截图落盘，供无头验收读取（只在 --qa 下开启）
    if (QA && req.method === 'POST' && url.pathname === '/__shot') {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 12 * 1024 * 1024) throw new Error('too large');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const b64 = body.replace(/^data:image\/png;base64,/, '');
      const name = (url.searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '');
      const dir = path.join(ROOT, 'shots');
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${name || 'shot'}.png`);
      await writeFile(file, Buffer.from(b64, 'base64'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, file: `/shots/${path.basename(file)}`, bytes: b64.length }));
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('403');
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  守灯 · Lanternwatch\n  ${url}\n  Ctrl+C 结束\n`);
  if (process.argv.includes('--open')) {
    exec(`start "" "${url}"`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。可以换一个：set PORT=4322 && npm start`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
