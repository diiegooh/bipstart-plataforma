import assert from 'node:assert/strict';
import {test} from 'node:test';
import {webcrypto,createHmac,createHash} from 'node:crypto';
import relay from '../cloudflare/bipstart-webhook-relay.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin='https://p01--bipstart-homologacao--fnrfyqb66946.code.run';
const secret='cloudflare-relay-secret-longer-than-32-characters';
const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ts=String(Math.floor(Date.now()/1000));
const mpSignature='ts='+ts+',v1='+'a'.repeat(64);
const body=JSON.stringify({type:'payment',data:{id:'12345'},live_mode:true});
const originalFetch=globalThis.fetch;
try{
 await test('GET /probe fornece teste sem cobrar',async()=>{
  const r=await relay.fetch(new Request('https://relay.example.test/probe'),{});
  assert.equal(r.status,200);
  assert.match(await r.text(),/Testar cabeçalho sem cobrança/);
 });
 await test('GET /check confirma preservação de x-request-id',async()=>{
  const r=await relay.fetch(new Request('https://relay.example.test/check?probe='+id,{headers:{'x-request-id':id}}),{});
  assert.equal(r.status,200);
  const data=await r.json();
  assert.equal(data.requestIdPreserved,true);
  assert.equal(data.createsPayment,false);
 });
 await test('GET /check detecta reescrita do cabeçalho',async()=>{
  const r=await relay.fetch(new Request('https://relay.example.test/check?probe='+id,{headers:{'x-request-id':'00000000-0000-4000-8000-000000000000'}}),{});
  assert.equal(r.status,200);
  assert.equal((await r.json()).requestIdPreserved,false);
 });
 await test('Relay sem Secret não faz encaminhamento',async()=>{
  globalThis.fetch=async()=>{throw Error('Relay nunca deveria encaminhar sem segredo')};
  const r=await relay.fetch(new Request('https://relay.example.test/api/billing/pix-webhook?data.id=12345',{method:'POST',headers:{'x-request-id':id,'x-signature':mpSignature},body}),{});
  assert.equal(r.status,503);
 });
 await test('Relay preserva ID no cabeçalho próprio, atesta corpo e encaminha host fixo',async()=>{
  let count=0;
  globalThis.fetch=async request=>{
   count++;
   assert.equal(request.url,origin+'/api/billing/pix-webhook?data.id=12345');
   assert.equal(request.method,'POST');
   assert.equal(request.headers.get('x-bipstart-original-request-id'),id);
   assert.equal(request.headers.get('x-request-id'),id);
   assert.equal(request.headers.get('x-bipstart-relay-proof')?.length,64);
   const forwardedBody=await request.text();
   assert.equal(forwardedBody,body);
   const at=request.headers.get('x-bipstart-relay-ts');
   const manifest=['v1',at,id,mpSignature,'?data.id=12345',createHash('sha256').update(body).digest('hex')].join('\n');
   const expected=createHmac('sha256',secret).update(manifest).digest('hex');
   assert.equal(request.headers.get('x-bipstart-relay-proof'),expected);
   return new Response(JSON.stringify({ok:true,planActivated:false}),{status:200,headers:{'content-type':'application/json'}});
  };
  const r=await relay.fetch(new Request('https://relay.example.test/api/billing/pix-webhook?data.id=12345',{
   method:'POST',headers:{
    'x-request-id':id,'x-signature':mpSignature,'content-type':'application/json',
    'x-bipstart-original-request-id':'forged-client-value',
    'x-bipstart-relay-proof':'forged-proof'
   },body
  }),{BIPSTART_WEBHOOK_RELAY_SECRET:secret});
  assert.equal(r.status,200);
  assert.equal(count,1);
 });
 await test('Relay rejeita outros caminhos, métodos e assinaturas ausentes',async()=>{
  globalThis.fetch=async()=>{throw Error('Nunca encaminhar mensagens inválidas')};
  for(const [path,method,headers] of [
   ['/','POST',{}],['/api/billing/pix-webhook','GET',{}],
   ['/api/billing/pix-webhook','POST',{}]
  ]){
   const r=await relay.fetch(new Request('https://relay.example.test'+path,{method,headers,...(method==='POST'?{body}: {})}),{BIPSTART_WEBHOOK_RELAY_SECRET:secret});
   assert.ok([404,405,401].includes(r.status));
  }
 });
} finally {globalThis.fetch=originalFetch}
