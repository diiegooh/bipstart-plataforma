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
const cancellationMigration=readFileSync('sql/bipstart_payment_cancellation_20261015.sql','utf8');

test('checkout atual coleta os dados necessários e exibe acompanhamento seguro',()=>{
 new vm.Script(panel,{filename:'public/cliente.js'});
 new vm.Script(vitrine,{filename:'public/vitrine.js'});
 for(const id of ['name','phone','address','shipping','sendOrder','trackingReady','trackingUrl','sendPreparedWhatsapp'])
  assert.match(vitrineHtml,new RegExp('id="'+id+'"'));
 assert.match(vitrineHtml,/\/vitrine\.js\?v=\d+/);
 assert.match(panelHtml,/\/cliente\.js\?v=\d+/);
 assert.match(panelHtml,/\/cliente\.css\?v=\d+/);
 assert.match(vitrine,/await registerOnlineOrder\(\)/);
 assert.match(vitrine,/checkoutMessage\(receipt\.id\)/);
 assert.match(vitrine,/showCheckoutNextStep\(receipt\)/);
 assert.match(vitrine,/trackingLinkFor\(receipt\.id,orderToken\)/);
 assert.doesNotMatch(vitrine,/location\.assign\(url\)/);
});
test('antes do WhatsApp a função pública recebe apenas itens/quantidades; não aceita preço do cliente',async()=>{
 const begin=vitrine.indexOf('async function registerOnlineOrder(){');
 const end=vitrine.indexOf('function trackingLinkFor(',begin);
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

test('pedido online escapa nome e endereço e expõe ações manuais de pagamento',()=>{
 const begin=panel.indexOf('function nextOnlineOrderStep(status,deliveryMethod){');
 const end=panel.indexOf('function courierAccessUrl(',begin);
 assert.ok(begin>=0&&end>begin);
 const escape=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const draw=new Function('esc','fmt','orderNotificationLinks',panel.slice(begin,end)+';return onlineOrderCard;')(escape,n=>'R$ '+Number(n).toFixed(2),new Map());
 const card=draw({id:'33333333-3333-4333-8333-333333333333',created_at:'2026-10-14T12:00:00Z',
  customer_name:'João <script>alert(1)</script>',customer_phone:'11987654321',
  delivery_method:'delivery',delivery_address:'Rua <img src=x onerror=alert(1)>, 120',
  payment_method:'pix',payment_status:'pending',status:'awaiting_confirmation',
  items:[{name:'Coca-Cola',qty:2,total:16}],subtotal:16,delivery_fee:5,total:21,notes:'Portão azul'});
 assert.match(card,/João &lt;script&gt;/);
 assert.doesNotMatch(card,/<script>|<img src=x/);
 assert.match(card,/Rua &lt;img/);
 assert.match(card,/href="https:\/\/wa\.me\/5511987654321"/);
 assert.match(card,/data-order-advance=/);
 assert.match(card,/data-order-cancel=/);
 assert.match(card,/data-payment-advance=/);
 assert.match(card,/data-payment-cancel=/);
 assert.match(card,/Confirmar pedido/);
 assert.match(card,/Confirmar pagamento/);
 assert.match(card,/Não aceitar pedido/);
 assert.match(card,/Pagamento/);
 assert.match(card,/R\$ 21\.00/);
});
test('card organiza cabeçalho, cliente, itens, pagamento e ações rápidas',()=>{
 const begin=panel.indexOf('function nextOnlineOrderStep(status,deliveryMethod){');
 const end=panel.indexOf('function courierAccessUrl(',begin);
 const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const draw=new Function('esc','fmt','orderNotificationLinks',panel.slice(begin,end)+';return onlineOrderCard;')(esc,n=>'R$ '+Number(n).toFixed(2),new Map());
 const card=draw({id:'11111111-2222-4333-8444-555555555555',created_at:'2026-10-17T21:00:00Z',customer_name:'Cliente',
  customer_phone:'11999999999',delivery_method:'delivery',delivery_address:'Rua Teste',payment_method:'pix',
  status:'out_for_delivery',payment_status:'paid',items:[{qty:2,name:'Produto',total:50}],total:55});
 const markers=['class="online-order-head"','Dados do Cliente','Itens do Pedido',
  'online-order-payment','Ações Rápidas'];
 const positions=markers.map(x=>card.indexOf(x));
 assert.ok(positions.every(x=>x>=0));
 assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
 assert.match(card,/PEDIDO #11111111/);
 assert.match(card,/data-order-finish=/);
 assert.match(card,/data-payment-cancel=/);
 assert.match(card,/Finalizar Pedido/);
 assert.match(card,/R\$ 55\.00/);
});
test('sidebar acompanha cor da loja com contraste e mantém o fundo escuro',()=>{
 assert.match(panel,/function applySidebarTheme\(\)/);
 assert.match(panel,/const value=String\(shop\?\.brand_color\|\|''\)/);
 assert.match(panel,/document\.documentElement\.style\.setProperty\('--store-accent',color\)/);
 assert.match(panel,/document\.documentElement\.style\.setProperty\('--store-accent-ink'/);
 assert.match(panel,/document\.documentElement\.style\.setProperty\('--accent',color\)/);
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
test('pagamento não é confirmado automaticamente nem o checkout altera estoque',()=>{
 assert.match(migration,/payment_status text not null default 'pending'/);
 assert.match(migration,/status text not null default 'awaiting_confirmation'/);
 assert.doesNotMatch(migration,/update public\.shop_products set stock/i);
 assert.match(panel,/fetch\('\/api\/online-order-update'/);
 assert.match(panel,/data-orders-refresh/);
 assert.match(panel,/data-payment-advance/);
 assert.match(panel,/Confirma que o pagamento foi realmente recebido pela loja\?/);
 assert.match(panel,/onlineOrders=await get\('shop_online_orders'\)/);
});
test('pedido avança em sequência correta, respeita retirada, entrega e estados finais',()=>{
 const begin=panel.indexOf('function nextOnlineOrderStep(status,deliveryMethod){');
 const end=panel.indexOf('function courierAccessUrl(',begin);
 const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const api=new Function('esc','fmt','orderNotificationLinks',panel.slice(begin,end)+';return {onlineOrderCard,nextOnlineOrderStep,nextOnlinePaymentStep};')(esc,n=>'R$ '+Number(n).toFixed(2),new Map());
 assert.deepEqual(api.nextOnlineOrderStep('awaiting_confirmation'),{next:'confirmed',label:'Confirmar pedido'});
 assert.deepEqual(api.nextOnlineOrderStep('confirmed'),{next:'preparing',label:'Iniciar preparo'});
 assert.deepEqual(api.nextOnlineOrderStep('preparing','delivery'),{next:'out_for_delivery',label:'Saiu para entrega'});
 assert.deepEqual(api.nextOnlineOrderStep('preparing','pickup'),{next:'fulfilled',label:'Finalizar pedido'});
 assert.deepEqual(api.nextOnlineOrderStep('out_for_delivery','delivery'),{next:'fulfilled',label:'Finalizar pedido'});
 assert.equal(api.nextOnlineOrderStep('fulfilled'),null);
 assert.equal(api.nextOnlineOrderStep('cancelled'),null);
 assert.deepEqual(api.nextOnlinePaymentStep('pending'),{next:'paid',label:'Confirmar pagamento'});
 assert.equal(api.nextOnlinePaymentStep('paid'),null);
 const order={id:'teste',created_at:'2026-10-15T12:00:00Z',customer_name:'Teste',customer_phone:'11988776655',
  delivery_method:'pickup',payment_method:'pix',status:'confirmed',payment_status:'pending',items:[],total:10};
 const ongoing=api.onlineOrderCard(order);
 assert.match(ongoing,/Iniciar preparo/);
 assert.match(ongoing,/Cancelar Pedido/);
 assert.match(ongoing,/Confirmar pagamento/);
 const delivery=api.onlineOrderCard({...order,delivery_method:'delivery',status:'preparing'});
 assert.match(delivery,/Saiu para entrega/);
 const pickup=api.onlineOrderCard({...order,delivery_method:'pickup',status:'preparing'});
 assert.doesNotMatch(pickup,/Saiu para entrega/);
 assert.match(pickup,/Finalizar pedido/);
 const done=api.onlineOrderCard({...order,status:'fulfilled',payment_status:'paid'});
 assert.match(done,/Pedido finalizado/);
 assert.doesNotMatch(done,/data-order-advance/);
 const cancelled=api.onlineOrderCard({...order,status:'cancelled',payment_status:'cancelled'});
 assert.match(cancelled,/Pedido não aceito/);
 assert.match(cancelled,/Pagamento cancelado/);
});
test('cliques de avanço/cancelamento têm confirmação, concorrência e não mudam pagamento automaticamente',()=>{
 assert.match(panel,/const pendingOrderUpdates=new Set\(\)/);
 for(const attr of ['data-order-advance','data-order-cancel','data-payment-advance','data-payment-cancel'])
  assert.ok(panel.includes("closest('["+attr+"]')"),attr);
 assert.ok(panel.includes("const next=cancelled?'cancelled':finishOrder?'fulfilled':step.next"));
 assert.ok(panel.includes("window.confirm(detail)"));
 assert.ok(panel.includes("Confirma que o pagamento foi realmente recebido pela loja?"));
 assert.ok(panel.includes("pendingOrderUpdates.has(key)"));
 assert.ok(panel.includes("expected:previous"));
 assert.ok(panel.includes("if(!response.ok||!result?.updated)"));
 assert.ok(panel.includes("order[field]=result.status"));
 assert.doesNotMatch(panel,/data-order-status=|data-order-payment=/);
 assert.match(css,/#workspace \.online-status-block\{/);
 assert.match(css,/#workspace \.online-status-controls \.online-cancel\{/);
});

test('status cancelado do pagamento é suportado sem reembolso ou alteração de RLS',()=>{
 assert.match(cancellationMigration,/payment_status in \('pending','paid','cancelled'\)/);
 assert.match(cancellationMigration,/drop constraint if exists shop_online_orders_payment_status_check/);
 assert.doesNotMatch(cancellationMigration,/drop table|delete from|disable row level security|grant .* to anon/i);
});

test('WhatsApp é manual e consentimento não é presumido ao registrar pedido',()=>{
 assert.doesNotMatch(vitrineHtml,/id="whatsappOptIn"|type="checkbox"[^>]*whatsappOptIn/);
 assert.match(vitrineHtml,/id="sendPreparedWhatsapp"/);
 assert.match(vitrine,/bipstart_set_online_order_whatsapp_optin/);
 assert.match(vitrine,/p_order_id:orderId,p_client_token:token,p_opt_in:true/);
 assert.match(vitrine,/\$\('sendPreparedWhatsapp'\)\.addEventListener\('click'/);
 assert.match(vitrine,/saveWhatsappUpdatesConsent\(registeredOrderId,orderToken\)/);
 const start=vitrine.indexOf('async function registerOnlineOrder(){');
 const stop=vitrine.indexOf('function trackingLinkFor(',start);
 assert.ok(stop>start);
 assert.doesNotMatch(vitrine.slice(start,stop),/bipstart_set_online_order_whatsapp_optin/);
});
test('opt-out permanece disponível na API, mesmo sem botão antigo no painel',()=>{
 const sql=readFileSync('sql/bipstart_online_whatsapp_owner_optout_20261015.sql','utf8');
 assert.match(sql,/whatsapp_updates_opt_in/);
 assert.match(sql,/grant update\(whatsapp_updates_opt_in\) on table public\.shop_online_orders to authenticated/);
 assert.match(sql,/RLS shop_online_orders_owner_update/);
 assert.doesNotMatch(sql,/drop table|truncate table|disable row level security/i);
 assert.doesNotMatch(panel,/O registro ocorre antes de abrir o WhatsApp/);
});
test('banco restringe saiu para entrega a pedidos enviados por delivery',()=>{
 const stepMigration=readFileSync('sql/bipstart_out_for_delivery_20261015.sql','utf8');
 assert.match(stepMigration,/out_for_delivery/);
 assert.match(stepMigration,/shop_online_orders_status_check/);
 assert.match(stepMigration,/status <> 'out_for_delivery' or delivery_method='delivery'/);
 assert.match(css,/#workspace \.online-order-whatsapp\{/);
 assert.match(panel,/\['confirmed','preparing','out_for_delivery'\]/);
 assert.match(panel,/nextOnlineOrderStep\(previous,order\.delivery_method\)/);
});

test('loja pode finalizar pedido manualmente sem alterar pagamento',()=>{
 assert.match(panel,/data-order-finish=/);
 assert.match(panel,/finishOrder=e\.target\.closest\('\[data-order-finish\]'\)/);
 assert.match(panel,/action:cancelled\?'cancel':finishOrder\?'finish':'advance'/);
 assert.match(panel,/if\(!window\.confirm\(detail\)\)return/);
 assert.match(panel,/online-order-finalize/);
 assert.match(panel,/if\(!proAccess\(\)\)return msg\('Entregas com motoboys são exclusivas do Premium/);
 assert.match(css,/\.online-order-finalize/);
});
