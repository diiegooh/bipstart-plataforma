// BipStart webhook relay — Cloudflare Worker. EXCLUSIVO da homologação.
// Preserva x-request-id antes do proxy do Northflank e atesta por HMAC.
// Segredos devem ser configurados somente como Worker Secrets.
const ORIGIN='https://p01--bipstart-homologacao--fnrfyqb66946.code.run';
const PATH='/api/billing/pix-webhook';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder=new TextEncoder();
const hex=buf=>Array.from(new Uint8Array(buf),v=>v.toString(16).padStart(2,'0')).join('');
const noStore={'cache-control':'no-store','x-content-type-options':'nosniff'};
const response=(status,object)=>new Response(JSON.stringify(object),{status,headers:{...noStore,'content-type':'application/json; charset=utf-8'}});
async function sha256(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
async function relayHmac(secret,manifest){
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(manifest)));
}
const html="<!DOCTYPE html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>BipStart • teste Cloudflare</title>\n<style>body{font:16px system-ui;background:#181026;color:#faf7ff;max-width:560px;margin:60px auto;padding:24px}button{background:#8645e9;color:white;border:0;border-radius:8px;padding:14px;cursor:pointer}#result{padding:16px;background:#30203f;border-radius:8px;margin-top:16px}</style>\n<h2>Diagnóstico Cloudflare • BipStart</h2><p>Esse teste não cria pagamentos e verifica se o Cloudflare recebe <code>x-request-id</code> sem alterações.</p>\n<button id=\"start\">Testar cabeçalho sem cobrança</button><p id=\"result\">Aguardando.</p>\n<script>document.getElementById('start').onclick=async()=>{\n const id=crypto.randomUUID();const el=document.getElementById('result');\n try{const r=await fetch('/check?probe='+encodeURIComponent(id),{headers:{'x-request-id':id},cache:'no-store'});\n const d=await r.json();el.textContent=d.requestIdPreserved?'Cloudflare preservou x-request-id. Podemos configurar o encaminhamento.':'Cloudflare também alterou x-request-id. Não configure ainda o Mercado Pago.';\n }catch{el.textContent='Não foi possível executar o teste.'}\n}</script></html>";
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/probe'&&request.method==='GET'){
   return new Response(html,{headers:{'content-type':'text/html; charset=utf-8',...noStore}});
  }
  if(url.pathname==='/check'&&request.method==='GET'){
   const probe=url.searchParams.get('probe')||'';
   if(!UUID.test(probe))return response(400,{error:'Marcador inválido'});
   return response(200,{requestIdPreserved:request.headers.get('x-request-id')===probe,createsPayment:false});
  }
  if(url.pathname!==PATH)return response(404,{error:'Rota não encontrada'});
  if(request.method!=='POST')return response(405,{error:'Método não permitido'});
  const relaySecret=String(env?.BIPSTART_WEBHOOK_RELAY_SECRET||'');
  if(relaySecret.length<32)return response(503,{error:'Relay ainda não configurado'});
  const id=request.headers.get('x-request-id')||'';
  const mpSignature=request.headers.get('x-signature')||'';
  if(!UUID.test(id)||!/^ts=[0-9]{10,15},\s*v1=[a-f0-9]{64}$/i.test(mpSignature))
   return response(401,{error:'Cabeçalhos de autenticação ausentes ou inválidos'});
  if(!/^[0-9]+$/.test(url.searchParams.get('data.id')||''))return response(400,{error:'Falta ID na URL'});
  if(Number(request.headers.get('content-length')||0)>16384)return response(413,{error:'Corpo muito grande'});
  const body=new Uint8Array(await request.arrayBuffer());
  if(body.byteLength>16384)return response(413,{error:'Corpo muito grande'});
  const relayedAt=String(Math.floor(Date.now()/1000));
  const manifest=['v1',relayedAt,id,mpSignature,url.search,await sha256(body)].join('\n');
  const proof=await relayHmac(relaySecret,manifest);
  const headers=new Headers({
   'content-type':request.headers.get('content-type')||'application/json',
   'x-signature':mpSignature,
   'x-request-id':id,
   'x-bipstart-original-request-id':id,
   'x-bipstart-relay-ts':relayedAt,
   'x-bipstart-relay-proof':proof
  });
  try{
   // Destino fixo: nunca usar host/URL fornecido pelo remetente.
   const forwarded=new Request(ORIGIN+PATH+url.search,{method:'POST',headers,body,redirect:'manual'});
   const result=await fetch(forwarded);
   return new Response(result.body,{status:result.status,headers:{'content-type':result.headers.get('content-type')||'application/json',...noStore}});
  }catch{
   return response(502,{error:'Origem temporariamente inacessível'});
  }
 }
};
