import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const escapeMeta = value => String(value??'').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

async function publicCardapioTitle(slug){
  const url=String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
  if(!url||!key||!/^[a-z0-9-]{3,60}$/.test(slug))return null;
  const response=await fetch(url+'/rest/v1/rpc/bipstart_public_menu',{
    method:'POST',
    headers:{apikey:key,'Content-Type':'application/json'},
    body:JSON.stringify({p_slug:slug}),
    signal:AbortSignal.timeout(2500)
  });
  if(!response.ok)return null;
  const data=await response.json();
  const name=typeof data?.name==='string'?data.name.trim():'';
  if(!name||name.length>120)return null;
  return 'CARDÁPIO ('+name+')';
}

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
  '/motoboy': ['motoboy.html', 'text/html; charset=utf-8'],
  '/motoboy.html': ['motoboy.html', 'text/html; charset=utf-8'],
  '/motoboy.js': ['motoboy.js', 'text/javascript; charset=utf-8'],
  '/motoboy.css': ['motoboy.css', 'text/css; charset=utf-8'],
  '/admin': ['admin.html', 'text/html; charset=utf-8'],
  '/admin.html': ['admin.html', 'text/html; charset=utf-8'],
  '/admin.js': ['admin.js', 'text/javascript; charset=utf-8'],
  '/cardapio': ['cardapio.html', 'text/html; charset=utf-8'],
  '/cardapio.html': ['cardapio.html', 'text/html; charset=utf-8'],
  '/cardapio.css': ['cardapio.css', 'text/css; charset=utf-8'],
  '/cardapio.js': ['cardapio.js', 'text/javascript; charset=utf-8']
};

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'allow': 'GET, HEAD' });
    return res.end();
  }
  let pathname, requestUrl;
  try {
    requestUrl = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(requestUrl.pathname);
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
      turnstileSiteKey: String(process.env.TURNSTILE_SITE_KEY || '')
    }));
  }
  const file = routes[pathname];
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Página não encontrada');
  }
  try {
    let body = await fs.readFile(path.join(root, file[0]));
    if (req.method === 'GET' && (pathname === '/cardapio' || pathname === '/cardapio.html')) {
      let title = null;
      try {
        title = await publicCardapioTitle(requestUrl.searchParams.get('loja')||'');
      } catch (error) {
        console.error('Prévia de cardápio indisponível:', error?.message||error);
      }
      if (title) {
        const escaped = escapeMeta(title);
        const head = '<title>'+escaped+'</title>'+
          '<meta property="og:type" content="website">'+
          '<meta property="og:title" content="'+escaped+'">'+
          '<meta name="twitter:card" content="summary">'+
          '<meta name="twitter:title" content="'+escaped+'">';
        body = Buffer.from(body.toString('utf8').replace(
          '<title>Cardápio digital • BipStart</title>', head
        ));
      }
    }
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
