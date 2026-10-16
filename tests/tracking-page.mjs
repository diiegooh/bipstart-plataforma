import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('public/acompanhar.html','utf8');
const css=readFileSync('public/acompanhar.css','utf8');
const js=readFileSync('public/acompanhar.js','utf8');
const shopMenu=readFileSync('public/vitrine.js','utf8');
const shopMenuHtml=readFileSync('public/vitrine.html','utf8');
const sql=readFileSync('sql/bipstart_track_online_order_20261015.sql','utf8');
const server=readFileSync('server.mjs','utf8');

test('pagina de acompanhamento compila, tem layout responsivo e estado seguro',()=>{
 new vm.Script(js);
 assert.match(html,/id="orderSteps"/);
 assert.match(html,/id="statusPill"/);
 assert.match(html,/id="paymentStatus"/);
 assert.match(html,/id="trackingError"/);
 assert.doesNotMatch(html,/As informações são atualizadas automaticamente|A loja confirma o pagamento e a entrega/);
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.match(html,/name="referrer" content="no-referrer"/);
 assert.match(css,/\.progress-list/);
 assert.match(css,/@media\(max-width:420px\)/);
 assert.match(js,/setInterval\(refreshTracking,20000\)/);
 assert.match(js,/document\.visibilityState==='hidden'/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
test('consulta por RPC exige id e token do link privado no fragmento',()=>{
 assert.match(js,/new URLSearchParams\(location\.hash/);
 assert.match(js,/p_order_id:credentials\.id,p_client_token:credentials\.token/);
 const begin=js.indexOf('function trackingCredentials(){');
 const end=js.indexOf('function renderTracking(order){',begin);
 assert.ok(begin>=0&&end>begin);
 const cred=new Function('location','URLSearchParams','uuid',js.slice(begin,end)+';return trackingCredentials;');
 const pattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const id='11111111-1111-4111-8111-111111111111',token='22222222-2222-4222-8222-222222222222';
 assert.deepEqual(cred({hash:'#pedido='+id+'&chave='+token},URLSearchParams,pattern)(),{id,token});
 assert.equal(cred({hash:'#pedido='+id},URLSearchParams,pattern)(),null);
 assert.equal(cred({hash:'#pedido=not-valid&chave='+token},URLSearchParams,pattern)(),null);
});
test('entrega exibe saiu para entrega e retirada pula a etapa',()=>{
 const element=id=>({
  hidden:false,textContent:'',children:[],classList:{toggle(){}},
  setAttribute(){},append(...nodes){this.children.push(...nodes)},replaceChildren(){this.children=[]},scrollIntoView(){}
 });
 const nodes=new Map();
 const fakeDoc={createElement(tag){return {tag,children:[],setAttribute(){},append(...x){this.children.push(...x)},set className(x){this.name=x},get className(){return this.name},set textContent(v){this.text=v}}}};
 const get=id=>{if(!nodes.has(id))nodes.set(id,element(id));return nodes.get(id)};
 const start=js.indexOf('function renderTracking(order){');
 const end=js.indexOf('async function refreshTracking(){',start);
 const render=new Function('$','document','statuses','payments','currency',js.slice(start,end)+';return renderTracking;')(
  get,fakeDoc,{
   awaiting_confirmation:'Aguardando confirmação',confirmed:'Confirmado',preparing:'Em preparo',
   out_for_delivery:'Saiu para entrega',fulfilled:'Finalizado',cancelled:'Cancelado'
  },{pending:'Aguardando pagamento',paid:'Pago'},n=>'R$ '+Number(n).toFixed(2)
 );
 const base={id:'11111111-1111-4111-8111-111111111111',shop_name:'Salgatti',status:'out_for_delivery',payment_status:'paid',total:29.9};
 render({...base,delivery_method:'delivery'});
 assert.equal(get('orderSteps').children.length,5);
 assert.equal(get('orderSteps').children[3].children[1].text,'Saiu para entrega');
 assert.equal(get('paymentStatus').textContent,'Pago');
 render({...base,status:'preparing',delivery_method:'pickup'});
 assert.equal(get('orderSteps').children.length,4);
});
test('endpoint não entrega informações pessoais ou token do banco',()=>{
 assert.match(sql,/p_order_id uuid, p_client_token uuid/);
 assert.match(sql,/o\.id=p_order_id and o\.client_token=p_client_token/);
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/revoke all on function public\.bipstart_track_online_order/);
 assert.match(sql,/grant execute on function public\.bipstart_track_online_order\(uuid,uuid\) to anon,authenticated/);
 assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*'customer_name'|'customer_phone'|'delivery_address'|'client_token'/);
 assert.match(server,/'\/acompanhar': \['acompanhar\.html'/);
 assert.match(server,/'\/acompanhar\.js': \['acompanhar\.js'/);
 assert.match(server,/'\/acompanhar\.css': \['acompanhar\.css'/);
});
test('checkout oferece link copiável e mantém confirmação manual pelo WhatsApp',()=>{
 assert.match(shopMenuHtml,/id="trackingReady"/);
 assert.match(shopMenuHtml,/id="trackingUrl"/);
 assert.match(shopMenuHtml,/id="copyTrackingUrl"/);
 assert.match(shopMenuHtml,/id="sendPreparedWhatsapp"/);
 assert.match(shopMenu,/return location\.origin\+'\/acompanhar#pedido='/);
 assert.match(shopMenu,/navigator\.clipboard\.writeText\(url\)/);
 assert.match(shopMenu,/showCheckoutNextStep\(receipt\)/);
 assert.match(shopMenu,/checkoutMessage\(receipt\.id\)/);
 assert.doesNotMatch(shopMenu,/location\.assign\(url\)/);
});
