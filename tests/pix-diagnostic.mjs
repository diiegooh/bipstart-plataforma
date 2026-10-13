import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { pixDiagnostic } from '../pix-diagnostic.mjs';

const shopId='22222222-2222-4222-8222-222222222222';
const orderId='11111111-1111-4111-8111-111111111111';
const base='https://bipstart.example.test';

Object.assign(process.env,{
  SUPABASE_URL:'https://testing.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',
  SUPABASE_SECRET_KEY:'sb_secret_fake',
  MERCADO_PAGO_ACCESS_TOKEN:'TEST-fake',
  MERCADO_PAGO_WEBHOOK_SECRET:'test-signing',
  MERCADO_PAGO_PROD_ACCESS_TOKEN:'APP_USR-mocked-never-real',
  MERCADO_PAGO_PROD_WEBHOOK_SECRET:'production-signing-mock',
  BIPSTART_BASE_URL:base,
  BIPSTART_BILLING_MODE:'test',
  BIPSTART_STAGING_MODE:'1',
  BIPSTART_REAL_PIX_TEST_ENABLED:'1',
  BIPSTART_REAL_PIX_TEST_EMAIL:'owner@example.test'
});
function req({method='POST',headers={},body={}}={}){
 return {
  method,headers,
  async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body))}
 };
}
function res(){
 return {status:0,body:null,writeHead(status){this.status=status},end(body){this.body=JSON.parse(body)}};
}
async function invoke(path,options){
 const result=res();
 const handled=await pixDiagnostic(req(options),result,new URL(base+path));
 assert.equal(handled,true);
 return result;
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function fakeNetwork({paid=false,live=true,ownerEmail='owner@example.test',confirmed=true,foreign=false,credentialHttp=200,paymentHttp=200}={}){
 const calls=[];let row=null;
 globalThis.fetch=async(input,init={})=>{
  const u=new URL(String(input)),path=u.pathname,method=init.method||'GET';
  const body=init.body?JSON.parse(init.body):null;
  calls.push({path,url:u.toString(),method,headers:init.headers||{},body});
  if(path==='/users/me')return json(credentialHttp===200?{id:12345}:{error:'invalid_token'},credentialHttp);
  if(path==='/auth/v1/user')return json({id:'owner',email:ownerEmail,email_confirmed_at:confirmed?'2026-10-13T12:00:00Z':null});
  if(path==='/rest/v1/shops')return json(foreign?[]:[{id:shopId,name:'BipStart Teste'}]);
  if(path==='/rest/v1/shop_billing_orders'){
   if(method==='GET')return json(row?[row]:[]);
   if(method==='POST'){row={id:orderId,shop_id:shopId,amount:1,provider:'mercado_pago_pix_diagnostic',status:'pending',provider_ref:null};return json([row]);}
   if(method==='PATCH'){row.provider_ref=body.provider_ref;return json([row]);}
  }
  if(path==='/v1/payments'&&method==='POST'&&paymentHttp!==200)return json({error:'invalid_token'},paymentHttp);
  if(path==='/v1/payments'&&method==='POST')return json({
    id:12345,live_mode:live,payment_method_id:'pix',transaction_amount:1,currency_id:'BRL',
    external_reference:'bipstart-pix-diagnostic:'+orderId,status:'pending',
    point_of_interaction:{transaction_data:{qr_code:'000201TEST',ticket_url:'https://www.mercadopago.com.br/payments/12345/ticket'}}
  });
  if(path==='/v1/payments/12345')return json({
    id:12345,live_mode:live,payment_method_id:'pix',transaction_amount:1,currency_id:'BRL',
    external_reference:'bipstart-pix-diagnostic:'+orderId,status:paid?'approved':'pending',
    point_of_interaction:{transaction_data:{qr_code:'000201TEST',ticket_url:'https://www.mercadopago.com.br/payments/12345/ticket'}}
  });
  throw Error('Unexpected request '+method+' '+u);
 };
 return calls;
}
function signedWebhook(){
 const ts=String(Math.floor(Date.now()/1000)),rid='request-123';
 const manifest='id:12345;request-id:'+rid+';ts:'+ts+';';
 return {
  'x-request-id':rid,
  'x-signature':'ts='+ts+',v1='+crypto.createHmac('sha256','production-signing-mock').update(manifest).digest('hex')
 };
}
const originalFetch=globalThis.fetch;
try{
 await test('sem bearer token não permite emitir PIX',async()=>{
  const calls=fakeNetwork();
  const response=await invoke('/api/billing/pix-diagnostic');
  assert.equal(response.status,403);
  assert.equal(calls.length,0);
 });
 await test('proxy preserva x-request-id: teste sem cobrança',async()=>{
  const calls=fakeNetwork();
  const marker='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const r=await invoke('/api/billing/pix-proxy-check?probe='+marker,{
   method:'GET',headers:{authorization:'Bearer mock','x-request-id':marker}
  });
  assert.equal(r.status,200);
  assert.equal(r.body.requestIdPreserved,true);
  assert.equal(r.body.createsPayment,false);
  assert.equal(r.body.planActivated,false);
  assert.ok(!calls.some(c=>c.path==='/v1/payments'));
  assert.ok(!calls.some(c=>c.method==='PATCH'));
 });
 await test('proxy sobrescreve x-request-id: detecta sem aceitar assinatura',async()=>{
  const calls=fakeNetwork();
  const marker='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const r=await invoke('/api/billing/pix-proxy-check?probe='+marker,{
   method:'GET',headers:{authorization:'Bearer mock','x-request-id':'ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb'}
  });
  assert.equal(r.status,200);
  assert.equal(r.body.requestIdPreserved,false);
  assert.equal(r.body.createsPayment,false);
  assert.ok(!calls.some(c=>c.path==='/v1/payments'));
 });
 await test('diagnóstico do proxy exige autenticação do titular',async()=>{
  const calls=fakeNetwork();
  const marker='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const r=await invoke('/api/billing/pix-proxy-check?probe='+marker,{
   method:'GET',headers:{'x-request-id':marker}
  });
  assert.equal(r.status,403);
  assert.equal(calls.length,0);
 });
 await test('consulta a credencial sem criar PIX e sem ativar plano',async()=>{
  const calls=fakeNetwork();
  const r=await invoke('/api/billing/pix-auth-check',{method:'GET',headers:{authorization:'Bearer mock'}});
  assert.equal(r.status,200);
  assert.equal(r.body.authorized,true);
  assert.equal(r.body.httpStatus,200);
  assert.equal(r.body.createsPayment,false);
  assert.ok(calls.some(c=>c.path==='/users/me'&&c.method==='GET'));
  assert.ok(!calls.some(c=>c.path==='/v1/payments'||c.method==='PATCH'||(c.method==='POST'&&c.path.includes('shop_billing_orders'))));
 });
 await test('MP informa 401 com código seguro sem criar PIX',async()=>{
  const calls=fakeNetwork({credentialHttp:401});
  const r=await invoke('/api/billing/pix-auth-check',{method:'GET',headers:{authorization:'Bearer mock'}});
  assert.equal(r.status,200);
  assert.equal(r.body.authorized,false);
  assert.equal(r.body.httpStatus,401);
  assert.equal(r.body.providerErrorCode,'invalid_token');
  assert.ok(!calls.some(c=>c.path==='/v1/payments'));
 });
 await test('diagnóstico da credencial exige usuário autorizado',async()=>{
  const calls=fakeNetwork({ownerEmail:'forbidden@example.test'});
  const r=await invoke('/api/billing/pix-auth-check',{method:'GET',headers:{authorization:'Bearer mock'}});
  assert.equal(r.status,403);
  assert.ok(!calls.some(c=>c.path==='/users/me'));
 });
 await test('401 na criação PIX expõe somente código seguro da API',async()=>{
  const calls=fakeNetwork({paymentHttp:401});
  const r=await invoke('/api/billing/pix-diagnostic',{headers:{authorization:'Bearer mock'}});
  assert.equal(r.status,502);
  assert.match(r.body.error,/401/);
  assert.match(r.body.error,/invalid_token/);
  assert.ok(!calls.some(c=>c.path.includes('shop_entitlements')));
 });
 await test('apenas e-mail confirmado e autorizado pode gerar',async()=>{
  const calls=fakeNetwork({ownerEmail:'other@example.test'});
  const response=await invoke('/api/billing/pix-diagnostic',{headers:{authorization:'Bearer mock'}});
  assert.equal(response.status,403);
  assert.ok(!calls.some(c=>c.path==='/v1/payments'));
 });
 await test('conta sem loja não pode gerar PIX',async()=>{
  const calls=fakeNetwork({foreign:true});
  const response=await invoke('/api/billing/pix-diagnostic',{headers:{authorization:'Bearer mock'}});
  assert.equal(response.status,403);
  assert.ok(!calls.some(c=>c.path==='/v1/payments'));
 });
 await test('gerar PIX usa produção apenas, valor R$1, sem ativação de planos',async()=>{
  const calls=fakeNetwork();
  const response=await invoke('/api/billing/pix-diagnostic',{headers:{authorization:'Bearer mock',host:'bipstart.example.test'}});
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.amount,1);
  assert.equal(response.body.planActivated,false);
  assert.equal(response.body.paymentId,'12345');
  assert.equal(response.body.pixCopyPaste,'000201TEST');
  const pay=calls.find(c=>c.path==='/v1/payments'&&c.method==='POST');
  assert.ok(pay);
  assert.equal(pay.body.transaction_amount,1);
  assert.equal(pay.body.payment_method_id,'pix');
  assert.ok(pay.body.notification_url.endsWith('/api/billing/pix-webhook'));
  assert.equal(pay.headers.Authorization,'Bearer APP_USR-mocked-never-real');
  assert.equal(pay.headers['X-Idempotency-Key'],orderId);
  assert.ok(!calls.some(c=>c.path.includes('shop_entitlements')),'Nenhum plano deve ser alterado');
  assert.ok(!calls.some(c=>c.path.includes('bipstart_confirm_plan_payment')),'Não chamar RPC comercial');
  const second=await invoke('/api/billing/pix-diagnostic',{headers:{authorization:'Bearer mock'}});
  assert.equal(second.status,200);
  assert.equal(calls.filter(c=>c.path==='/v1/payments'&&c.method==='POST').length,1,'No máximo uma cobrança');
  const status=await invoke('/api/billing/pix-diagnostic',{method:'GET',headers:{authorization:'Bearer mock'}});
  assert.equal(status.status,200);
  assert.equal(status.body.status,'pending');
 });
 await test('consultar PIX aprovado não ativa plano',async()=>{
  const calls=fakeNetwork({paid:true});
  await invoke('/api/billing/pix-diagnostic',{headers:{authorization:'Bearer mock'}});
  const response=await invoke('/api/billing/pix-diagnostic',{method:'GET',headers:{authorization:'Bearer mock'}});
  assert.equal(response.body.status,'approved');
  assert.equal(response.body.planActivated,false);
  assert.ok(!calls.some(c=>c.path.includes('shop_entitlements')));
 });
 await test('não aceita pagamento que não seja realmente live',async()=>{
  const calls=fakeNetwork({live:false});
  const response=await invoke('/api/billing/pix-diagnostic',{headers:{authorization:'Bearer mock'}});
  assert.equal(response.status,502);
  assert.ok(!calls.some(c=>c.path.includes('shop_entitlements')));
 });
 await test('webhook de produção assinado responde sem ativar planos',async()=>{
  const calls=fakeNetwork();
  const response=await invoke('/api/billing/pix-webhook?data.id=12345',{
   headers:signedWebhook(),body:{type:'payment',data:{id:'12345'},live_mode:true}
  });
  assert.equal(response.status,200);
  assert.equal(response.body.planActivated,false);
  assert.equal(calls.length,0);
 });
 await test('webhook de produção com HMAC inválido é bloqueado',async()=>{
  const calls=fakeNetwork();
  const response=await invoke('/api/billing/pix-webhook?data.id=12345',{
   headers:{'x-request-id':'request-123','x-signature':'ts=1760000000,v1='+'0'.repeat(64)},
   body:{type:'payment',data:{id:'12345'}}
  });
  assert.equal(response.status,401);
  assert.equal(calls.length,0);
 });
 await test('desligar flag bloqueia criação e leitura de diagnóstico',async()=>{
  const calls=fakeNetwork();
  process.env.BIPSTART_REAL_PIX_TEST_ENABLED='0';
  const response=await invoke('/api/billing/pix-diagnostic',{headers:{authorization:'Bearer mock'}});
  assert.equal(response.status,503);
  assert.equal(calls.length,0);
  process.env.BIPSTART_REAL_PIX_TEST_ENABLED='1';
 });
} finally {globalThis.fetch=originalFetch}
