import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const publicJS=readFileSync('public/cardapio.js','utf8');
const client=readFileSync('public/cliente.js','utf8');
const sql=readFileSync('sql/bipstart_menu_redesign_20261014.sql','utf8');
const html=readFileSync('public/cardapio.html','utf8');
const css=readFileSync('public/cardapio.css','utf8');
test('arquivos frontend e servidor sem erros de sintaxe',()=>{
 for(const path of ['public/cardapio.js','public/cliente.js'])
  new vm.Script(readFileSync(path,'utf8'),{filename:path});
});
const escaped=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function publicHelpers(){
 const a=publicJS.indexOf('function categoryGroups('),b=publicJS.indexOf('function totalItems(){');
 assert.ok(a>=0&&b>a);
 return new Function('esc','money','menu',
  publicJS.slice(a,b)+';return {categoryGroups,categoryCard,productCard,normalizeWhatsApp};'
 )(escaped,v=>Number(v).toFixed(2),{src:'https://cdn.exemplo'});
}
test('cardápio público expõe categorias da loja sem dados de estoque de outras lojas',()=>{
 const live=readFileSync('public/vitrine.js','utf8');
 assert.match(live,/function categoryNames\(\)/);
 assert.match(live,/function categoryArtwork\(name\)/);
 assert.match(live,/function filterCategory\(name\)/);
 assert.match(live,/data-cat=/);
 assert.match(live,/esc\(name\)/);
 assert.match(live,/category-art/);
 assert.doesNotMatch(live,/select:\s*'\*'.*shop_sales/);
});
test('carrinho público soma pedidos, calcula entrega e prepara WhatsApp após salvar pedido',()=>{
 const live=readFileSync('public/vitrine.js','utf8');
 assert.match(live,/function subtotal\(\)/);
 assert.match(live,/function deliveryCost\(\)/);
 assert.match(live,/function checkoutMessage\(orderId=''\)/);
 assert.match(live,/money\(subtotal\(\)\+deliveryCost\(\)\)/);
 assert.match(live,/bipstart_place_online_order/);
 assert.match(live,/encodeURIComponent\(checkoutMessage\(receipt\.id\)\)/);
 assert.match(live,/https:\/\/wa\.me\//);
});
test('painel do lojista mantém estoque no PDV, não no cardápio',()=>{
 const start=client.indexOf('function productForm(');
 const end=client.indexOf('function courierForm(',start);
 assert.ok(start>0&&end>start);
 assert.match(client.slice(start,end),/isMenu=tab==='cardapio'/);
 assert.match(client.slice(start,end),/name="description"/);
 assert.match(client.slice(start,end),/Quantidade em estoque/);
 assert.match(client,/function cardapioEditor\(/);
 assert.match(client,/id="categoryForm"/);
 assert.match(client,/shop_menu_categories/);
 assert.match(client,/opening_hours/);
 assert.match(client,/location_text/);
 assert.match(client,/delivery_fee/);
 assert.match(client,/logo_path/);
});
test('SQL preserva dados existentes e restringe logo aos planos adequados',()=>{
 assert.match(sql,/add column if not exists description/);
 assert.match(sql,/create table if not exists public\.shop_menu_categories/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/create policy menu_categories_owner_read/);
 assert.match(sql,/public\.can_write_shop\(shop_id\)/);
 assert.match(sql,/bipstart_guard_shop_logo/);
 assert.match(sql,/before insert or update on public\.shops/);
 assert.match(sql,/if TG_OP='INSERT'/);
 assert.match(sql,/public\.bipstart_can_customize\(new\.id\)/);
 assert.match(sql,/when e\.plan_code in \('personalizado','pro'\)/);
 assert.match(sql,/e\.status='trialing'/);
 assert.match(sql,/e\.status='active'/);
 assert.doesNotMatch(sql,/delete from public\.shop_products|truncate|drop table/i);
});
test('HTML oficial exibe categorias, produtos, carrinho e dados da loja',()=>{
 const live=readFileSync('public/vitrine.html','utf8');
 const server=readFileSync('server.mjs','utf8');
 for(const id of ['quickCategories','catalog','cartDrawer','openCart','sendOrder',
  'shipping','address','openingHours','locationLink','pay','cartTotal']){
  assert.match(live,new RegExp('id="'+id+'"'),id);
 }
 assert.match(live,/vitrine\.css\?v=\d+/);
 assert.match(live,/vitrine\.js\?v=\d+/);
 assert.match(server,/'\/cardapio':\s*\['vitrine\.html'/);
 assert.doesNotMatch(live,/id="ownerEditorLink"|id="ownerNav"/);
});
