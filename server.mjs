import http from 'node:http';
import { billing } from './billing.mjs';
import { pixDiagnostic } from './pix-diagnostic.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const routes = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/cliente': ['cliente.html', 'text/html; charset=utf-8'],
  '/cliente.html': ['cliente.html', 'text/html; charset=utf-8'],
  '/cliente.css': ['cliente.css', 'text/css; charset=utf-8'],
  '/bipstart-logo.svg': ['bipstart-logo.svg', 'image/svg+xml; charset=utf-8'],
  '/bipstart-marca-icon.png': ['bipstart-marca-icon.png', 'image/png'],
  '/bipstart-marca-nome.png': ['bipstart-marca-nome.png', 'image/png'],
  '/cliente.js': ['cliente.js', 'text/javascript; charset=utf-8'],
  '/pix-teste': ['pix-teste.html', 'text/html; charset=utf-8'],
  '/pix-teste.js': ['pix-teste.js', 'text/javascript; charset=utf-8'],
  '/cardapio': ['cardapio.html', 'text/html; charset=utf-8'],
  '/cardapio.html': ['cardapio.html', 'text/html; charset=utf-8'],
  '/cardapio.js': ['cardapio.js', 'text/javascript; charset=utf-8']
};

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !(req.method === 'POST' && req.url?.startsWith('/api/billing/'))) {
    res.writeHead(405, { 'allow': 'GET, HEAD' });
    return res.end();
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Requisição inválida');
  }
  if (pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, app: 'BipStart', mode: 'demo' }));
  }
  if (pathname === '/api/public-config') {
    const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({
      enabled: Boolean(url && key),
      supabaseUrl: url,
      publishableKey: key,
      turnstileSiteKey: String(process.env.TURNSTILE_SITE_KEY || ''),
      stagingMode: process.env.BIPSTART_STAGING_MODE === '1',
      realPixDiagnosticAvailable:process.env.BIPSTART_STAGING_MODE === '1' && process.env.BIPSTART_REAL_PIX_TEST_ENABLED === '1'
    }));
  }
  if (pathname.startsWith('/api/billing/')) {
    const diagnostic = await pixDiagnostic(req, res, new URL(req.url, 'http://localhost'));
    if (diagnostic) return;
    const handled = await billing(req, res, new URL(req.url, 'http://localhost'));
    if (handled) return;
  }
  const file = routes[pathname];
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Página não encontrada');
  }
  try {
    const body = await fs.readFile(path.join(root, file[0]));
    res.writeHead(200, {
      'content-type': file[1],
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error('Erro BipStart:', error?.message || error);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Erro interno');
  }
});

server.listen(port, '0.0.0.0', () => console.log('BipStart iniciada na porta ' + port));
