import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const sql=readFileSync('sql/bipstart_courier_pro_20261014.sql','utf8');
const client=readFileSync('public/cliente.js','utf8');
const driver=readFileSync('public/motoboy.js','utf8');
const page=readFileSync('public/motoboy.html','utf8');
const server=readFileSync('server.mjs','utf8');

test('área individual de motoboy usa login por telefone e senha no Supabase Auth',()=>{
 new vm.Script(driver,{filename:'public/motoboy.js'});
 for(const id of ['loginForm','authPanel','dashboard','deliveries','refresh','logout']){
  assert.ok(page.includes('id="'+id+'"'),id);
 }
 assert.match(page,/name="login"/);
 assert.match(page,/name="password"/);
 assert.match(driver,/auth\\/v1\\/token\\?grant_type=password/);
 assert.match(driver,/courierLoginEmail/);
 assert.match(driver,/bipstart_courier_my_shops/);
 assert.match(driver,/bipstart_courier_queue/);
 assert.match(driver,/bipstart_courier_accept/);
 assert.match(driver,/bipstart_courier_set_status/);
 assert.match(driver,/bipstart_courier_session/);
 assert.doesNotMatch(driver,/SUPABASE_SECRET_KEY|ADMIN_PASSWORD|MERCADO_PAGO_ACCESS_TOKEN/);
});
test('fila de entregas protege dados do cliente e oferece ações por status',()=>{
 const start=driver.indexOf('function mapUrl(');
 const stop=driver.indexOf('async function refresh()',start);
 assert.ok(start>0&&stop>start);
 const htmlEscape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const {mapUrl,deliveryCard}=new Function('esc','currency',
   driver.slice(start,stop)+';return {mapUrl,deliveryCard};'
 )(htmlEscape,n=>'R$ '+Number(n).toFixed(2));
 const row={delivery_id:'7b9807f4-a873-4d21-9a01-26bf23cc15ee',
  customer_name:'Cliente <img src=x onerror=alert(1)>',
  address:'Rua A, 15 — São Paulo',items_text:'2x Combo & uma bebida',status:'pendente'};
 const offer=deliveryCard(row,true);
 assert.match(offer,/Aceitar entrega/);
 assert.match(offer,/&lt;img src=x/);
 assert.doesNotMatch(offer,/<img src=x/);
 assert.match(offer,/Combo &amp; uma bebida/);
 const assigned=deliveryCard({...row,status:'atribuida'},false);
 assert.match(assigned,/INICIAR ROTA/);
 assert.match(assigned,/data-address="Rua A, 15 — São Paulo"/);
 assert.match(deliveryCard({...row,status:'a_caminho'},false),/ENTREGUE/);
 assert.match(mapUrl(row.address),/destination=Rua%20A/);
 assert.match(driver,/await rpc\\('bipstart_courier_set_status'/);
 assert.match(driver,/window\\.open\\(mapUrl\\(destination\\)/);
});
test('painel motoboy oferece convite seguro e link de login com botões de compartilhar',()=>{
 const a=client.indexOf('function courierAccessUrl('),b=client.indexOf('function renderPage(){',a);
 assert.ok(a>=0&&b>a);
 const url=new Function(client.slice(a,b)+';return courierAccessUrl;')();
 assert.equal(url({invite_code:'convite-teste',account_id:null},'https://bipstart.example'),
  'https://bipstart.example/motoboy?convite=convite-teste');
 assert.equal(url({invite_code:null,account_id:'conta-vinculada'},'https://bipstart.example'),
  'https://bipstart.example/motoboy');
 assert.match(client,/data-share-courier/);
 assert.match(client,/data-copy-invite/);
 assert.match(client,/Compartilhar link/);
 assert.match(client,/Copiar link/);
 assert.match(client,/Link de login do motoboy/);
 assert.match(client,/if\(tab!=='motoboys'\|\|!proAccess\(\)\)return/);
 assert.match(client,/navigator\.share/);
 assert.match(client,/navigator\.clipboard\.writeText\(link\)/);
 assert.match(client,/case 'courierForm'/);
 assert.match(driver,/new URLSearchParams\(location\.search\)\.get\('convite'\)/);
});

test('os motoboys aparecem somente em Pro com acesso vigente',()=>{
 const start=client.indexOf('function trialValid(){');
 const stop=client.indexOf('function contactUrl(',start);
 assert.ok(start>0&&stop>start);
 const access=ent=>new Function('ent',client.slice(start,stop)+
  ';return {trialValid,subscriptionValid,hasAccess,proAccess};')(ent);
 const future=new Date(Date.now()+86400000).toISOString();
 const past=new Date(Date.now()-86400000).toISOString();
 assert.equal(access({status:'active',plan_code:'pro',active_until:future}).proAccess(),true);
 assert.equal(access({status:'trialing',plan_code:'pro',trial_until:future}).proAccess(),true);
 assert.equal(access({status:'active',plan_code:'basic',active_until:future}).proAccess(),false);
 assert.equal(access({status:'active',plan_code:'personalizado',active_until:future}).proAccess(),false);
 assert.equal(access({status:'active',plan_code:'pro',active_until:past}).proAccess(),false);
 assert.match(client,/if\(proAccess\(\)\)a\.push\(\['pedidos','Pedidos online'\],\['motoboys','Motoboys'\],\['entregas','Entregas'\]\)/);
 assert.match(client,/Motoboys disponíveis somente no Plano Premium vigente/);
 assert.match(client,/Entregas disponíveis somente no Plano Premium vigente/);
});
test('banco protege loja Pro, convites e transições com funções privilegiadas restritas',()=>{
 assert.match(sql,/public\.has_delivery_access\(c\.shop_id\)/);
 assert.match(sql,/public\.has_delivery_access\(v\.shop_id\)/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/u\.email_confirmed_at is not null/);
 assert.match(sql,/where c\.invite_code=p_invite/);
 assert.match(sql,/set account_id=auth\.uid\(\),invite_code=null/);
 assert.match(sql,/bipstart_guard_courier_account/);
 assert.match(sql,/before insert or update on public\.shop_couriers/);
 assert.match(sql,/foreign key \(shop_id,offered_courier_id\)/);
 assert.match(sql,/from public\.shop_couriers where id=v_courier for update/);
 assert.match(sql,/for update/);
 assert.match(sql,/d\.status in \('atribuida','a_caminho'\)/);
 assert.match(sql,/v\.status='atribuida' and p_status='a_caminho'/);
 assert.match(sql,/v\.status='a_caminho' and p_status='entregue'/);
 for(const sig of [
  'bipstart_courier_claim_invite(uuid)',
  'bipstart_courier_my_shops()',
  'bipstart_courier_queue()',
  'bipstart_courier_accept(uuid)',
  'bipstart_courier_set_status(uuid,text)'
 ]){
  assert.ok(sql.includes('revoke all on function public.'+sig+' from public,anon'),sig);
  assert.ok(sql.includes('grant execute on function public.'+sig+' to authenticated'),sig);
 }
 assert.doesNotMatch(sql,/drop table|truncate table|delete from public\.orders/i);
});
test('integração não depende das tabelas originais Salgatti nem de checkout Mercado Pago',()=>{
 for(const path of ['/motoboy','/motoboy.js','/motoboy.css'])
  assert.ok(server.includes("'"+path+"'"),path);
 assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/public\.settings|public\.orders|salgatti/i);
 assert.match(client,/\/motoboy\?convite=/);
 assert.match(client,/data-copy-invite/);
 assert.match(client,/offered_courier_id/);
 assert.match(client,/data-new="delivery"/);
});


test('Premium vincula entrega ao pedido online da mesma loja e só uma vez',()=>{
 const sync=readFileSync('sql/bipstart_courier_online_order_sync_20261015.sql','utf8');
 assert.match(sync,/add column if not exists online_order_id uuid/);
 assert.match(sync,/foreign key\(shop_id,online_order_id\)/);
 assert.match(sync,/references public\.shop_online_orders\(shop_id,id\)/);
 assert.match(sync,/create unique index if not exists bipstart_delivery_online_order_unique/);
 assert.match(sync,/online_order_id is not null/);
 assert.match(sync,/v_method <> 'delivery'/);
 assert.match(sync,/v_status in \('cancelled','fulfilled'\)/);
 assert.match(sync,/before insert or update of online_order_id,shop_id/);
 assert.match(sync,/revoke all on function public\.bipstart_validate_delivery_online_link/);
 assert.doesNotMatch(sync,/drop table|truncate table|disable row level security/i);
});
test('motoboy entregue finaliza status do pedido sem alterar pagamento nem cancelados',()=>{
 const sync=readFileSync('sql/bipstart_courier_online_order_sync_20261015.sql','utf8');
 assert.match(driver,/p_status:action==='start'\?'a_caminho':'entregue'/);
 assert.match(sync,/after update of status on public\.shop_deliveries/);
 assert.match(sync,/new\.status='entregue'/);
 assert.match(sync,/set status='fulfilled'/);
 assert.match(sync,/o\.id=new\.online_order_id and o\.shop_id=new\.shop_id/);
 assert.match(sync,/o\.status not in \('cancelled','fulfilled'\)/);
 assert.match(sync,/new\.status='a_caminho'/);
 assert.match(sync,/set status='out_for_delivery'/);
 assert.doesNotMatch(sync,/set payment_status|update public\.shop_sales|delete from public\.shop_online_orders/i);
});
test('Painel Premium permite vincular pedido pelo botão e acompanhar mudanças automaticamente',()=>{
 assert.match(client,/data-online-delivery/);
 assert.match(client,/onlineOrderDeliveryDefaults\(order\)/);
 assert.match(client,/function eligibleOnlineDeliveryOrders\(currentDelivery\)/);
 assert.match(client,/delivery_method==='delivery'/);
 assert.match(client,/!linked\.has\(o\.id\)/);
 assert.match(client,/name="online_order_id"/);
 assert.match(client,/online_order_id:v\.online_order_id\|\|null/);
 assert.match(client,/e\.target\.matches\('#deliveryForm select\[name="online_order_id"\]'\)/);
 assert.match(client,/refreshOnlineOrdersIfVisible/);
 assert.match(client,/setInterval\(\(\)=>\{void refreshOnlineOrdersIfVisible\(\)\},15000\)/);
 assert.match(client,/onlineOrders=latest;renderPage\(\)/);
 assert.match(client,/if\(!proAccess\(\)\)return msg\('Entregas com motoboys são exclusivas do Premium\.'/);
 const tracker=readFileSync('public/acompanhar.js','utf8');
 assert.match(tracker,/setInterval\(refreshTracking,20000\)/);
 assert.match(tracker,/fulfilled:'Finalizado'/);
});
