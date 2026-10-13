import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { billing } from '../billing.mjs';

const orderId='11111111-1111-4111-8111-111111111111';
const shopId='22222222-2222-4222-8222-222222222222';
const envNames=['SUPABASE_URL','SUPABASE_SECRET_KEY','MERCADO_PAGO_ACCESS_TOKEN','MERCADO_PAGO_WEBHOOK_SECRET','BIPSTART_BASE_URL','BIPSTART_BILLING_MODE'];
for(const key of envNames)process.env[key]={
 SUPABASE_URL:'https://testing.supabase.co',
 SUPABASE_SECRET_KEY:'mock-secret',
 MERCADO_PAGO_ACCESS_TOKEN:'mock-mp',
 MERCADO_PAGO_WEBHOOK_SECRET:'mock-signing',
 BIPSTART_BASE_URL:'https://bipstart.example.test',
 BIPSTART_BILLING_MODE:'test'
}[key];

function request(path,{method='POST',body={},headers={}}={}){
 return {method,headers,
  async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body))}
 };
}
function response(){
 return {
   status:0,headers:null,result:null,
   writeHead(status,headers){this.status=status;this.headers=headers},
   end(payload){this.result=payload?JSON.parse(payload):null}
 };
}
async function invoke(path,options){
 const r=response();
 const handled=await billing(request(path,options),r,new URL('https://bipstart.example.test'+path));
 assert.equal(handled,true);
 return r;
}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
function mockApi({confirmed=true,owns=true,active=false,paymentStatus='approved',paymentAmount=29.99,live=false,orderStatus='pending',orderRef=null}={}){
 const calls=[];
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input));
  const p=url.pathname;
  calls.push({url:url.toString(),method:init.method||'GET',body:init.body?JSON.parse(init.body):null});
  if(p==='/auth/v1/user')return json({id:'owner',email_confirmed_at:confirmed?'2026-10-13T00:00:00Z':null});
  if(p==='/rest/v1/shops')return json(owns?[{id:shopId,name:'Loja'}]:[]);
  if(p==='/rest/v1/shop_entitlements')return json([{status:active?'active':'trialing',plan_code:'basic'}]);
  if(p==='/rest/v1/shop_billing_orders'&&init.method==='POST')return json([{id:orderId}]);
  if(p==='/rest/v1/shop_billing_orders'&&init.method==='PATCH')return json([{id:orderId,status:'test_approved'}]);
  if(p==='/checkout/preferences')return json({sandbox_init_point:'https://sandbox.mercadopago.com.br/checkout/mock'});
  if(p==='/v1/payments/12345')return json({id:12345,status:paymentStatus,external_reference:'bipstart:'+orderId,transaction_amount:paymentAmount,currency_id:'BRL',live_mode:live});
  if(p==='/rest/v1/shop_billing_orders')return json([{id:orderId,plan_code:'basic',amount:29.99,status:orderStatus,provider_ref:orderRef}]);
  if(p==='/rest/v1/rpc/bipstart_confirm_plan_payment')return json(true);
  throw Error('Unexpected request: '+url.toString());
 };
 return calls;
}
function signedHeaders(timestamp=String(Math.floor(Date.now()/1000))){
 const requestId='fake-notification';
 const payload='id:12345;request-id:'+requestId+';ts:'+timestamp+';';
 return {
  'x-request-id':requestId,
  'x-signature':'ts='+timestamp+',v1='+crypto.createHmac('sha256','mock-signing').update(payload).digest('hex')
 };
}
const originalFetch=globalThis.fetch;
try {
 await test('bloqueia checkout sem autenticação',async()=>{
   mockApi();
   const r=await invoke('/api/billing/checkout',{body:{shopId,plan:'basic'}});
   assert.equal(r.status,401);
 });
 await test('não inicia plano para e-mail não confirmado',async()=>{
   const calls=mockApi({confirmed:false});
   const r=await invoke('/api/billing/checkout',{headers:{authorization:'Bearer mock-jwt'},body:{shopId,plan:'basic'}});
   assert.equal(r.status,403);
   assert.ok(!calls.some(c=>c.url.includes('mercadopago.com')));
 });
 await test('não aceita loja de outro usuário',async()=>{
   const calls=mockApi({owns:false});
   const r=await invoke('/api/billing/checkout',{headers:{authorization:'Bearer mock-jwt'},body:{shopId,plan:'basic'}});
   assert.equal(r.status,403);
   assert.ok(!calls.some(c=>c.url.includes('mercadopago.com')));
 });
 await test('não gera novo pedido para plano já ativo',async()=>{
   const calls=mockApi({active:true});
   const r=await invoke('/api/billing/checkout',{headers:{authorization:'Bearer mock-jwt'},body:{shopId,plan:'basic'}});
   assert.equal(r.status,409);
   assert.ok(!calls.some(c=>c.url.includes('/checkout/preferences')));
 });
 await test('checkout de teste usa preço definido no servidor',async()=>{
   const calls=mockApi();
   const r=await invoke('/api/billing/checkout',{headers:{authorization:'Bearer mock-jwt'},body:{shopId,plan:'basic',amount:0.01}});
   assert.equal(r.status,200);
   assert.ok(r.result.checkoutUrl.includes('sandbox'));
   const pref=calls.find(c=>c.url.endsWith('/checkout/preferences'));
   assert.equal(pref.body.items[0].unit_price,29.99);
   assert.equal(pref.body.external_reference,'bipstart:'+orderId);
 });
 await test('plano recorrente Pro bloqueado em checkout único',async()=>{
   mockApi();
   const r=await invoke('/api/billing/checkout',{headers:{authorization:'Bearer mock-jwt'},body:{shopId,plan:'pro'}});
   assert.equal(r.status,400);
 });
 await test('webhook sem assinatura rejeitado antes de buscar pagamento',async()=>{
   const calls=mockApi();
   const r=await invoke('/api/billing/webhook?data.id=12345');
   assert.equal(r.status,401);
   assert.equal(calls.length,0);
 });
 for(const ts of [String(Math.floor(Date.now()/1000)),String(Date.now())]){
   await test('webhook aprovado com timestamp '+ts.length+' dígitos',async()=>{
     const calls=mockApi();
     const r=await invoke('/api/billing/webhook?data.id=12345',{headers:signedHeaders(ts)});
     assert.equal(r.status,200,JSON.stringify(r.result));
     const update=calls.find(c=>c.method==='PATCH'&&c.url.includes('/shop_billing_orders'));
     assert.equal(update.body.status,'test_approved');
     assert.equal(update.body.provider_ref,'12345');
     assert.ok(!calls.some(c=>c.url.includes('bipstart_confirm_plan_payment')),'Teste não pode ativar plano definitivo');
   });
 }
 await test('webhook com valor adulterado não ativa plano',async()=>{
   const calls=mockApi({paymentAmount:1});
   const r=await invoke('/api/billing/webhook?data.id=12345',{headers:signedHeaders()});
   assert.equal(r.status,422);
   assert.ok(!calls.some(c=>c.method==='PATCH'));
 });
 await test('não ativa pagamento real em modo de teste',async()=>{
   const calls=mockApi({live:true});
   const r=await invoke('/api/billing/webhook?data.id=12345',{headers:signedHeaders()});
   assert.equal(r.status,422);
   assert.ok(!calls.some(c=>c.url.includes('bipstart_confirm_plan_payment')));
 });
 await test('webhook repetido não ativa novamente',async()=>{
   const calls=mockApi({orderStatus:'test_approved',orderRef:'12345'});
   const r=await invoke('/api/billing/webhook?data.id=12345',{headers:signedHeaders()});
   assert.equal(r.status,200);
   assert.ok(!calls.some(c=>c.url.includes('bipstart_confirm_plan_payment')));
 });
} finally {globalThis.fetch=originalFetch}
