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
 const a=publicJS.indexOf('function categoryGroups('),b=publicJS.indexOf('function renderCatalog(){');
 assert.ok(a>=0&&b>a);
 return new Function('esc','money','imageUrl',
  publicJS.slice(a,b)+';return {categoryGroups,productCard};'
 )(escaped,v=>'R$ '+Number(v).toFixed(2),path=>'https://cdn.exemplo/'+path);
}
test('categorias são separadas e produtos exibidos com escape de HTML',()=>{
 const {categoryGroups,productCard}=publicHelpers();
 const data={categories:[{name:'Combos'},{name:'Bebidas'}],
  items:[{id:'1',category:'Combos',name:'Combo <teste>',price:20,description:'Pão & bacon'},
         {id:'2',category:'Bebidas',name:'Suco',price:8},
         {id:'3',category:'Novidades',name:'Coxinha',price:5}]};
 const groups=categoryGroups(data);
 assert.deepEqual(groups.map(c=>c.name),['Combos','Bebidas','Novidades']);
 assert.equal(groups[0].items.length,1);
 const productHtml=productCard(groups[0].items[0]);
 assert.match(productHtml,/Combo &lt;teste&gt;/);
 assert.match(productHtml,/Pão &amp; bacon/);
 assert.match(productHtml,/data-add="1"/);
 assert.doesNotMatch(productHtml,/stock|estoque/i);
 assert.match(publicJS,/data-category/);
 assert.match(publicJS,/categoryChips/);
});
test('carrinho calcula quantidade, entrega e mensagem WhatsApp com validação',()=>{
 const start=publicJS.indexOf('function totalItems(){');
 const end=publicJS.indexOf('function render(){',start);
 const msgStart=publicJS.indexOf('function checkoutMessage(');
 const msgEnd=publicJS.indexOf('async function placeOnlineOrder(',msgStart);
 assert.ok(start>=0&&end>start&&msgStart>end&&msgEnd>msgStart);
 const elements={
  shippingMode:{value:'delivery'},
  deliveryAddress:{value:'Rua Exemplo, 123 - Centro'},
  customerName:{value:'Cliente Teste'},
  customerPhone:{value:'11999999999'},
  paymentMethod:{value:'pix'},
  orderNotes:{value:'Sem cebola'}
 };
 const cart=new Map([['a',2],['b',1]]);
 const menu={name:'gamalperfumes',delivery_fee:6,items:[{id:'a',name:'Combo',price:15},{id:'b',name:'Suco',price:8}]};
 const methods=new Function('$','cart','menu','money','paymentLabels',
  publicJS.slice(start,end)+publicJS.slice(msgStart,msgEnd)+
  ';return {totalItems,subtotal,deliveryCost,checkoutMessage};')(
  id=>elements[id],cart,menu,v=>'R$ '+Number(v).toFixed(2),{pix:'Pix'});
 assert.equal(methods.totalItems(),3);
 assert.equal(methods.subtotal(),38);
 assert.equal(methods.deliveryCost(),6);
 const message=methods.checkoutMessage('abc12345','https://exemplo.test/pedido/abc12345');
 assert.match(message,/2x Combo/);
 assert.ok(message.includes('Total: R$ 44.00'));
 assert.match(message,/Rua Exemplo, 123/);
 assert.match(message,/Sem cebola/);
 assert.match(message,/Cliente Teste/);
 elements.deliveryAddress.value='';
 assert.throws(()=>methods.checkoutMessage('abc12345','https://exemplo.test'),/endereço completo/);
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
test('HTML tem controle de categorias, carrinho e informações da loja',()=>{
 for(const id of ['categories','cartPanel','cartOpen','finishOrder','shippingMode','deliveryAddress','hours','locationLink','paymentMethods','deliveryFee']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(css,/\.category\[open\]/);
 assert.match(html,/cardapio\\.css\\?v=\\d+/);
 assert.match(publicJS,/<img src="\/bipstart-logo\.svg" alt="Logo BipStart">/);
 assert.match(html,/cardapio\\.js\\?v=\\d+/);
 assert.match(readFileSync('server.mjs','utf8'),/cardapio\.css/);
});
