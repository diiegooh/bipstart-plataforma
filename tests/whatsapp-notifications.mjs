import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Readable} from 'node:stream';
import {updateOnlineOrderAndNotify,orderUpdateMessage,templatePayload} from '../order-notifications.mjs';
import {readFileSync} from 'node:fs';

const orderId='33333333-3333-4333-8333-333333333333';
const shopId='22222222-2222-4222-8222-222222222222';
const accessToken='session.user.jwt';

async function exercise({orderOverrides={},envOverrides={},payloadOverrides={},bearer=accessToken,metaOk=true}={}){
 const order={
  id:orderId,shop_id:shopId,customer_name:'Ana',customer_phone:'11987654321',
  status:'awaiting_confirmation',delivery_method:'delivery',payment_status:'pending',whatsapp_updates_opt_in:true,...orderOverrides
 };
 const request=Readable.from([Buffer.from(JSON.stringify({
  orderId,shopId,field:'status',action:'advance',expected:'awaiting_confirmation',...payloadOverrides
 }))]);
 request.headers=bearer?{authorization:'Bearer '+bearer}:{};
 let code=0,responseText='';
 const response={writeHead(status){code=status;},end(data){responseText=String(data??'');}};
 const requests=[];
 const fetcher=async(url,options={})=>{
  const method=options.method||'GET';
  requests.push({url:String(url),method,options});
  if(String(url).includes('graph.facebook.com/')){
   return new Response(JSON.stringify(metaOk?{messages:[{id:'wamid.test'}]}:{error:{code:131047}}),{
    status:metaOk?200:400,headers:{'content-type':'application/json'}
   });
  }
  if(String(url).includes('/rest/v1/shops'))return new Response(JSON.stringify([{name:'Salgatti'}]),{status:200});
  if(String(url).includes('/rest/v1/shop_online_orders')){
   if(method==='PATCH'){
    const change=JSON.parse(options.body);
    const field=Object.keys(change)[0];
    order[field]=change[field];
    return new Response(JSON.stringify([{id:order.id,[field]:order[field]}]),{status:200});
   }
   return new Response(JSON.stringify([order]),{status:200});
  }
  throw Error('Unexpected request '+url);
 };
 await updateOnlineOrderAndNotify(request,response,{fetcher,env:{
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test_public',
  WHATSAPP_CLOUD_PHONE_NUMBER_ID:'12345678',
  WHATSAPP_CLOUD_ACCESS_TOKEN:'secret_test',
  WHATSAPP_GRAPH_API_VERSION:'v23.0',
  ...envOverrides
 }});
 return {code,data:JSON.parse(responseText),requests,order};
}
test('notificação automática usa template utilitário com os 5 dados do pedido',async()=>{
 const {code,data,requests,order}=await exercise();
 assert.equal(code,200);
 assert.equal(data.updated,true);
 assert.equal(data.status,'confirmed');
 assert.equal(data.notification,'accepted');
 assert.equal(order.status,'confirmed');
 const meta=requests.find(r=>r.url.includes('graph.facebook.com/'));
 assert.ok(meta);
 assert.equal(meta.options.headers.Authorization,'Bearer secret_test');
 const msg=JSON.parse(meta.options.body);
 assert.equal(msg.to,'5511987654321');
 assert.equal(msg.type,'template');
 assert.equal(msg.template.name,'bipstart_atualizacao_pedido');
 assert.deepEqual(msg.template.components[0].parameters.map(p=>p.text),[
  'Ana','Salgatti','pedido','33333333','Confirmado'
 ]);
 const patch=requests.find(r=>r.method==='PATCH');
 assert.ok(patch.url.includes('status=eq.awaiting_confirmation'));
 assert.match(patch.options.headers.Prefer,/return=representation/);
 assert.equal(meta.options.headers.Authorization!=='Bearer test_public',true);
});
test('pagamento registrado gera a mensagem Pago, sem se confundir com o pedido',async()=>{
 const {code,data,requests}=await exercise({
  payloadOverrides:{field:'payment_status',action:'advance',expected:'pending'}
 });
 assert.equal(code,200);
 assert.equal(data.status,'paid');
 assert.equal(JSON.parse(requests.find(r=>r.url.includes('graph.facebook.com/')).options.body)
  .template.components[0].parameters[2].text,'pagamento');
 assert.match(orderUpdateMessage({shopName:'Salgatti',orderId,customerName:'Ana',field:'payment_status',status:'paid'}),/Pago/);
});
test('cancelamento é avisado, mas não representa estorno',async()=>{
 const {data,requests}=await exercise({orderOverrides:{payment_status:'paid'},
  payloadOverrides:{field:'payment_status',action:'cancel',expected:'paid'}});
 assert.equal(data.status,'cancelled');
 const tpl=JSON.parse(requests.find(r=>r.url.includes('graph.facebook.com/')).options.body);
 assert.equal(tpl.template.components[0].parameters[4].text,'Pagamento cancelado');
});
test('cliente sem opt-in não recebe notificações',async()=>{
 const {data,requests}=await exercise({orderOverrides:{whatsapp_updates_opt_in:false}});
 assert.equal(data.notification,'opt_out');
 assert.equal(data.manualUrl,null);
 assert.equal(requests.some(r=>r.url.includes('graph.facebook.com/')),false);
});
test('sem credenciais ou se a Meta recusar, oferece WhatsApp manual e não declara envio',async()=>{
 for(const setup of [{envOverrides:{WHATSAPP_CLOUD_ACCESS_TOKEN:''}},{metaOk:false}]){
  const {data,requests}=await exercise(setup);
  assert.equal(data.updated,true);
  assert.equal(data.notification,'manual');
  assert.match(data.manualUrl,/^https:\/\/wa\.me\/5511987654321\?text=/);
  assert.match(decodeURIComponent(data.manualUrl),/Confirmado/);
  if(setup.envOverrides)assert.equal(requests.some(r=>r.url.includes('graph.facebook.com/')),false);
 }
});
test('não modifica pedidos sem token válido ou com status já alterado',async()=>{
 const noAuth=await exercise({bearer:null});
 assert.equal(noAuth.code,401);
 assert.equal(noAuth.requests.length,0);
 const stale=await exercise({orderOverrides:{status:'preparing'}});
 assert.equal(stale.code,409);
 assert.equal(stale.requests.some(r=>r.method==='PATCH'),false);
});
test('template está livre de chaves privadas no navegador e mantém consentimento explícito',()=>{
 const html=readFileSync('public/vitrine.html','utf8');
 const js=readFileSync('public/vitrine.js','utf8');
 const sql=readFileSync('sql/bipstart_online_whatsapp_optin_20261015.sql','utf8');
 const server=readFileSync('server.mjs','utf8');
 assert.match(server,/updateOnlineOrderAndNotify\(req, res\)/);
 assert.doesNotMatch(html,/id="whatsappOptIn" type="checkbox"/);
 assert.match(html,/id="whatsappConsentNotice"/);
 assert.match(html,/aria-describedby="whatsappConsentNotice"/);
 assert.match(js,/bipstart_set_online_order_whatsapp_optin/);
 assert.match(js,/\$\('sendPreparedWhatsapp'\)\.addEventListener\('click'/);
 assert.match(sql,/whatsapp_updates_opt_in boolean not null default false/);
 assert.match(sql,/where id=p_order_id and client_token=p_client_token/);
 assert.doesNotMatch(js,/WHATSAPP_CLOUD_ACCESS_TOKEN|service_role/);
 const template=templatePayload({to:'5511999999999',shopName:'Salgatti',orderId,customerName:'Ana',field:'status',status:'preparing'});
 assert.equal(template.template.language.code,'pt_BR');
});

test('etapa saiu para entrega é validada no servidor e comunica o cliente',async()=>{
 const {code,data,requests}=await exercise({
  orderOverrides:{status:'preparing',delivery_method:'delivery'},
  payloadOverrides:{field:'status',action:'advance',expected:'preparing'}
 });
 assert.equal(code,200);
 assert.equal(data.status,'out_for_delivery');
 const meta=requests.find(r=>r.url.includes('graph.facebook.com/'));
 assert.ok(meta);
 assert.equal(JSON.parse(meta.options.body).template.components[0].parameters[4].text,'Saiu para entrega');
 assert.match(orderUpdateMessage({shopName:'Salgatti',orderId,customerName:'Ana',field:'status',status:'out_for_delivery'}),/Saiu para entrega/);
});
test('pedidos com retirada vão de preparo diretamente para finalizado',async()=>{
 const {code,data}=await exercise({
  orderOverrides:{status:'preparing',delivery_method:'pickup'},
  payloadOverrides:{field:'status',action:'advance',expected:'preparing'}
 });
 assert.equal(code,200);
 assert.equal(data.status,'fulfilled');
});
test('entrega só finaliza depois da etapa saiu para entrega',async()=>{
 const {code,data}=await exercise({
  orderOverrides:{status:'out_for_delivery',delivery_method:'delivery'},
  payloadOverrides:{field:'status',action:'advance',expected:'out_for_delivery'}
 });
 assert.equal(code,200);
 assert.equal(data.status,'fulfilled');
});
