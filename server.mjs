import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'allow': 'GET, HEAD' });
    return res.end();
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, app: 'BipStart', mode: 'demo' }));
    }
    if (pathname !== '/' && pathname !== '/index.html') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Página não encontrada');
    }
    const html = await fs.readFile(path.join(root, 'index.html'));
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    });
    return res.end(req.method === 'HEAD' ? undefined : html);
  } catch (error) {
    console.error('Erro ao abrir página BipStart:', error?.message || error);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Erro interno');
  }
});

server.listen(port, '0.0.0.0', () => console.log('BipStart iniciada na porta ' + port));
