import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const panel=readFileSync('public/cliente.js','utf8');
const html=readFileSync('public/cliente.html','utf8');
const css=readFileSync('public/cliente.css','utf8');
const sql=readFileSync('sql/bipstart_premium_online_menu_20261015.sql','utf8');
const checkout=readFileSync('public/vitrine.js','utf8');

test('Premium obrigatório na função pública e na criação de pedidos por RPC',()=>{
 const rule="where s.slug=p_slug and s.model='pdv' and e.plan_code='pro'";
 assert.equal(sql.split(rule).length-1,2,'vitrine e criação de pedido precisam exigir Premium');
 assert.match(sql,/create or replace function public\.bipstart_public_menu\(p_slug text\)/i);
 assert.match(sql,/create or replace function public\.bipstart_place_online_order\(/i);
 assert.match(sql,/v_product\.menu_price_enabled/);
 assert.match(sql,/p\.online_enabled=true/);
 assert.match(sql,/p\.stock>=v_quantity/);
 assert.match(sql,/on conflict \(shop_id,client_token\) do nothing/);
 assert.doesNotMatch(sql,/delete from public\.shop_products|truncate|drop table/i);
 assert.match(checkout,/rpc\/bipstart_public_menu/);
 assert.match(checkout,/rpc\/bipstart_place_online_order/);
});
test('PDV mantém páginas essenciais no Básico, e o Premium soma o editor e motoboys',()=>{
 new vm.Script(panel);
 const start=panel.indexOf('function pages(){'),end=panel.indexOf('function operationalMenuItems(){',start);
 const getPages=new Function('proAccess','canCustomize',panel.slice(start,end)+';return pages;');
 const basic=getPages(()=>false,()=>false)().map(x=>x[0]);
 const premium=getPages(()=>true,()=>true)().map(x=>x[0]);
 for(const page of ['resumo','caixa','produtos','vendas','configuracoes']){
  assert.ok(basic.includes(page),page);
  assert.ok(premium.includes(page),page);
 }
 assert.ok(!basic.includes('pedidos'));
 assert.ok(premium.includes('pedidos'));
 assert.ok(!basic.includes('cardapio'));
 assert.ok(!basic.includes('motoboys'));
 assert.ok(!basic.includes('entregas'));
 assert.ok(premium.includes('cardapio'));
 assert.ok(premium.includes('motoboys'));
 assert.ok(premium.includes('entregas'));
});
test('link público fica bloqueado no Básico e visível somente no Premium',()=>{
 const begin=panel.indexOf('function publicShopUrl(){');
 const end=panel.indexOf('function imageUrl(',begin);
 const helper=panel.slice(begin,end);
 const create=new Function('shop','location','esc','proAccess',helper+';return {url:publicShopUrl,card:publicLinkTile};');
 const store={slug:'loja-teste',name:'Loja Teste'};
 const common=[store,{origin:'https://bipstart.example'},s=>s];
 const basic=create(...common,()=>false).card();
 const premium=create(...common,()=>true).card();
 assert.match(basic,/Exclusivo do Premium/);
 assert.doesNotMatch(basic,/https:\/\/bipstart\.example\/cardapio\?loja/);
 assert.doesNotMatch(basic,/data-copy-shop|data-share-shop/);
 assert.match(premium,/data-copy-shop/);
 assert.match(premium,/data-share-shop/);
 assert.match(premium,/cardapio\?loja=loja-teste/);
});
test('no Básico, produto cadastrado continua editável sem expor ou apagar flags de cardápio',()=>{
 const begin=panel.indexOf('function productForm(p){');
 const end=panel.indexOf('function courierForm(c)',begin);
 const compiled=new Function('tab','field','formShell','categoryOptions','esc','proAccess',
  panel.slice(begin,end)+';return productForm;');
 const field=(name,label,type,value)=>'<input name="'+name+'" value="'+String(value??'')+'">';
 const shell=(_kind,_id,body)=>'<form>'+body+'</form>';
 const p={id:'123',name:'Coxinha',category:'Salgados',price:10,cost:5,stock:4,min_stock:2,online_enabled:true,menu_price_enabled:true,menu_price:15};
 const basic=compiled('produtos',field,shell,()=>'',x=>x,()=>false)(p);
 const premium=compiled('produtos',field,shell,()=>'',x=>x,()=>true)(p);
 assert.match(basic,/name="stock"/);
 assert.match(basic,/name="min_stock"/);
 assert.match(basic,/online-sale-locked/);
 assert.doesNotMatch(basic,/name="online_enabled"/);
 assert.match(premium,/name="online_enabled"/);
 assert.match(premium,/name="menu_price"/);
 assert.match(panel,/online_enabled:proAccess\(\)\?v\.online_enabled==='true':\(p\?\.online_enabled===true\)/);
 assert.match(panel,/menu_price_enabled:proAccess\(\)\?v\.online_enabled==='true':\(p\?\.menu_price_enabled===true\)/);
 assert.match(panel,/menu_price:proAccess\(\)\?/);
});
test('acesso Básico preserva bloqueios e upgrade sem tela de escolha inicial',()=>{
 assert.doesNotMatch(html,/modeChooser|modeCardapio|backToModes/);
 assert.doesNotMatch(panel,/modeChooser|modeCardapio|backToModes/);
 assert.match(panel,/tab='caixa';showForm=null;pastedProductImage=null/);
 assert.match(panel,/if\(\(id==='cardapio_publico'\|\|id==='cardapio'\|\|id==='pedidos'\|\|id==='motoboys'\)&&!proAccess\(\)\)/);
 assert.match(panel,/class="side-public-menu locked" disabled aria-disabled="true"/);
 assert.match(panel,/data-nav="configuracoes"/);
 assert.match(panel,/rpc\('bipstart_request_plan_change'/);
 assert.match(css,/online-sale-locked/);
 assert.match(html,/\/cliente\.js\?v=49/);
 assert.match(html,/\/cliente\.css\?v=32/);
});
