import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const panel=readFileSync('public/cliente.js','utf8');
const css=readFileSync('public/cliente.css','utf8');
const panelHtml=readFileSync('public/cliente.html','utf8');
const vitrine=readFileSync('public/vitrine.js','utf8');
const vitrineHtml=readFileSync('public/vitrine.html','utf8');
const migration=readFileSync('sql/bipstart_online_orders_20261014.sql','utf8');

test('frontend compila e checkout coleta nome, telefone e endereço de entrega',()=>{
 new vm.Script(panel,{filename:'public/cliente.js'});
 new vm.Script(vitrine,{filename:'public/vitrine.js'});
 assert.match(vitrineHtml,/id="name"[^>]*required/);
 assert.match(vitrineHtml,/id="phone"[^>]*required/);
 assert.match(vitrineHtml,/id="address"/);
 assert.match(vitrineHtml,/\/vitrine\.js\?v=6/);
 assert.match(panelHtml,/\/cliente\.js\?v=23/);
 assert.match(panelHtml,/\/cliente\.css\?v=14/);
 assert.match(vitrine,/await registerOnlineOrder\(\)/);
 assert.match(vitrine,/checkoutMessage\(receipt\.id\)/);
 assert.match(vitrine,/location\.assign\(url\)/);
});

test('antes do WhatsApp a função pública recebe apenas itens/quantidades; não aceita preço do cliente',async()=>{
 const begin=vitrine.indexOf('async function registerOnlineOrder(){');
 const end=vitrine.indexOf("$('sendOrder').addEventListener",begin);
 assert.ok(begin>=0&&end>begin);
 const sent=[];
 const fields={
  name:{value:'Ana Teste'},phone:{value:'(11) 98765-4321'},
  shipping:{value:'delivery'},address:{value:'Rua Principal 123, Centro'},
  pay:{value:'pix'},notes:{value:'Sem açúcar'}
 };
 const make=new Function('cart','menu','publicConfig','$','crypto','fetch','subtotal','deliveryCost','orderToken',
  vitrine.slice(begin,end)+';return registerOnlineOrder;');
 const call=make(new Map([['00000000-0000-4000-8000-000000000001',2]]),
  {slug:'minha-loja'},{supabaseUrl:'https://example.supabase.co',publishableKey:'public'},
  k=>fields[k],{randomUUID:()=>'22222222-2222-4222-8222-222222222222'},
  async(url,options)=>{
   sent.push({url,options});
   return {ok:true,json:async()=>({id:'33333333-3333-4333-8333-333333333333',total:25})};
  },()=>20,()=>5,null);
 const data=await call();
 assert.equal(data.total,25);
 assert.match(sent[0].url,/rpc\/bipstart_place_online_order$/);
 const body=JSON.parse(sent[0].options.body);
 assert.equal(body.p_name,'Ana Teste');
 assert.equal(body.p_phone,'11987654321');
 assert.equal(body.p_delivery_method,'delivery');
 assert.equal(body.p_address,'Rua Principal 123, Centro');
 assert.equal(body.p_items[0].qty,2);
 assert.equal(body.p_client_token,'22222222-2222-4222-8222-222222222222');
 assert.equal(Object.hasOwn(body,'total'),false);
 assert.equal(Object.hasOwn(body,'price'),false);
 assert.equal(Object.hasOwn(body,'status'),false);
});

test('dashboard apresenta dados e controles de pagamento; escapa nome/endereço contra XSS',()=>{
 const begin=panel.indexOf('function onlineOrderCard(order){');
 const end=panel.indexOf('function renderPage(){',begin);
 assert.ok(begin>=0&&end>begin);
 const escape=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const render=new Function('esc','fmt',panel.slice(begin,end)+';return onlineOrderCard')(
  escape,v=>'R$ '+Number(v).toFixed(2));
 const card=render({
  id:'33333333-3333-4333-8333-333333333333',created_at:'2026-10-14T12:00:00Z',
  customer_name:'João <script>alert(1)</script>',customer_phone:'11987654321',
  delivery_method:'delivery',delivery_address:'Rua <img src=x onerror=alert(1)>, 120',
  payment_method:'pix',payment_status:'pending',status:'awaiting_confirmation',
  items:[{name:'Coca-Cola',qty:2,total:16}],subtotal:16,delivery_fee:5,total:21,notes:'Portão azul'
 });
 assert.match(card,/João &lt;script&gt;/);
 assert.doesNotMatch(card,/<script>/);
 assert.match(card,/Rua &lt;img/);
 assert.match(card,/11987654321/);
 assert.match(card,/Pagamento/);
 assert.match(card,/Aguardando pagamento/);
 assert.match(card,/data-order-status=/);
 assert.match(card,/data-order-payment=/);
 assert.match(card,/Portão azul/);
 assert.match(card,/Coca-Cola/);
 assert.match(card,/R\$ 21\.00/);
});

test('sidebar acompanha cor da loja com contraste e mantém o fundo escuro',()=>{
 assert.match(panel,/function applySidebarTheme\(\)/);
 assert.match(panel,/canCustomize\(\)\?String\(shop\.brand_color\|\|''\):'#7c3aed'/);
 assert.match(panel,/document\.documentElement\.style\.setProperty\('--store-accent',color\)/);
 assert.match(panel,/document\.documentElement\.style\.setProperty\('--store-accent-ink'/);
 assert.match(css,/#workspace \.side #nav nav button\.active\{/);
 assert.match(css,/background:linear-gradient\(110deg,var\(--store-accent/);
 assert.match(css,/color:var\(--store-accent-ink,#fff\)/);
 assert.match(css,/#workspace \.online-order-card\{/);
 assert.match(css,/@media\(max-width:440px\)/);
});

test('banco guarda pedidos privados com políticas por dono, sem SELECT público',()=>{
 assert.match(migration,/create table if not exists public\.shop_online_orders/);
 assert.match(migration,/unique \(shop_id,client_token\)/);
 assert.match(migration,/alter table public\.shop_online_orders enable row level security/);
 assert.match(migration,/revoke all on table public\.shop_online_orders from public, anon, authenticated/);
 assert.match(migration,/grant select on table public\.shop_online_orders to authenticated/);
 assert.match(migration,/grant update\(status,payment_status\)/);
 assert.match(migration,/using \(public\.is_shop_owner\(shop_id\) and public\.is_shop_enabled\(shop_id\)\)/);
 assert.match(migration,/for update to authenticated[\s\S]*with check \(public\.is_shop_owner\(shop_id\)/);
 assert.doesNotMatch(migration,/grant select on table public\.shop_online_orders to anon/);
 assert.match(migration,/returns jsonb[\s\S]*security definer set search_path=''/);
 assert.match(migration,/p\.online_enabled=true and p\.stock>=v_quantity/);
 assert.match(migration,/v_product\.menu_price_enabled/);
 assert.match(migration,/v_subtotal\+v_delivery_fee/);
 assert.match(migration,/on conflict \(shop_id,client_token\) do nothing/);
 assert.match(migration,/customer_phone=v_phone/);
 assert.match(migration,/count\(\*\)[\s\S]*created_at>now\(\)-interval '1 minute'/);
 assert.doesNotMatch(migration,/to anon,\s*authenticated;\s*grant select/i);
 assert.match(migration,/grant execute on function public\.bipstart_place_online_order/);
});
test('pagamentos não são marcados como pagos automaticamente nem baixam estoque',()=>{
 assert.match(migration,/payment_status text not null default 'pending'/);
 assert.match(migration,/status text not null default 'awaiting_confirmation'/);
 assert.doesNotMatch(migration,/update public\.shop_products set stock/i);
 assert.match(panel,/await rest\('shop_online_orders',\{method:'PATCH'/);
 assert.match(panel,/data-orders-refresh/);
 assert.match(panel,/await reloadData\(\);renderPage\(\)/);
 assert.match(panel,/O registro ocorre antes de abrir o WhatsApp/);
 assert.match(panel,/onlineOrders=await get\('shop_online_orders'\)/);
});
