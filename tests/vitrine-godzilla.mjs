import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('public/vitrine.html','utf8');
const css=readFileSync('public/vitrine.css','utf8');
const js=readFileSync('public/vitrine.js','utf8');
const client=readFileSync('public/cliente.js','utf8');
const server=readFileSync('server.mjs','utf8');

test('vitrine Godzilla está no endereço direto do cardápio, sem login ou painel extra',()=>{
 new vm.Script(js,{filename:'public/vitrine.js'});
 assert.match(server,/'\/cardapio':\s*\['vitrine\.html'/);
 assert.match(server,/'\/vitrine\.js':\s*\['vitrine\.js'/);
 assert.match(server,/'\/vitrine\.css':\s*\['vitrine\.css'/);
 assert.match(client,/if\(mode\.dataset\.openMode==='cardapio'\)/);
 assert.match(client,/location\.assign\(publicShopUrl\(\)\)/);
 assert.match(client,/tab='caixa'/);
 assert.match(client,/hiding\('workspace',true\);\s*renderPage\(\);/);
});

test('o visual do cardápio inclui vitrine, categorias dinâmicas, produtos e carrinho',()=>{
 for(const text of ['hero-green','hero-city','category-strip','combo-banner','catalog-toolbar','delivery-grid','onlinecart','cartfloat','bottom-nav']){
  assert.match(html,new RegExp('class="[^"]*\\b'+text+'\\b'),text);
 }
 for(const id of ['storeName','quickCategories','catalog','search','category','cartDrawer','cartItems','shipping','address','pay','cartTotal','sendOrder','error']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(css,/\.hero-green/);
 assert.match(css,/\.dproduct/);
 assert.doesNotMatch(html,/Godzilla Adega|Jd Planalto|Suzano/);
 assert.doesNotMatch(js,/godzilla-adega|\/api\/products|\/api\/orders/);
});

test('cada vitrine consulta o cardápio da própria loja no Supabase',()=>{
 assert.match(js,/new URLSearchParams\(location\.search\)\.get\('loja'\)/);
 assert.match(js,/rpc\/bipstart_public_menu/);
 assert.match(js,/JSON\.stringify\(\{p_slug:slug\}\)/);
 assert.match(js,/menu\.src=config\.supabaseUrl/);
 assert.match(js,/menu\.logo_path/);
 assert.match(js,/menu\.brand_color/);
 assert.match(js,/categoryNames\(\)/);
 assert.match(js,/imageUrl\(item\.image_path\)/);
 assert.match(js,/encodeURIComponent\(checkoutMessage\(\)\)/);
 assert.match(js,/https:\/\/wa\.me\//);
 assert.doesNotMatch(js,/SUPABASE_SECRET_KEY|service_role|ADMIN_PASSWORD/);
});

test('o pedido calcula total e taxa de entrega antes de abrir WhatsApp',()=>{
 const start=js.indexOf('function checkoutMessage(){');
 const end=js.indexOf("document.addEventListener('click'",start);
 assert.ok(start>=0&&end>start);
 const fields={
  shipping:{value:'delivery'},
  address:{value:'Rua Um, 123, Centro'},
  name:{value:'Ana'},
  pay:{value:'pix'},
  notes:{value:'Sem gelo'}
 };
 const msg=new Function('$','cart','menu','products','subtotal','deliveryCost','money','paymentLabels',
  js.slice(start,end)+';return checkoutMessage();')(
  id=>fields[id],new Map([['a',2]]),{name:'Loja Teste'},
  [{id:'a',name:'Suco',price:10}],()=>20,()=>4,
  v=>'R$ '+Number(v).toFixed(2),{pix:'Pix'}
 );
 assert.match(msg,/Cliente: Ana/);
 assert.match(msg,/2x Suco/);
 assert.match(msg,/Subtotal: R\$ 20\.00/);
 assert.match(msg,/Taxa de entrega: R\$ 4\.00/);
 assert.match(msg,/Total: R\$ 24\.00/);
 assert.match(msg,/Forma de pagamento: Pix/);
 assert.match(msg,/Sem gelo/);
});

test('PDV mantém painel interno e acesso ao mesmo cardápio dinâmico',()=>{
 assert.match(client,/function renderGodzillaPDV\(\)/);
 assert.match(client,/function publicShopUrl\(\)/);
 assert.match(client,/return location\.origin\+'\/cardapio\?loja='\+encodeURIComponent\(shop\.slug\)/);
 assert.match(client,/rpc\('bipstart_complete_sale'/);
 assert.match(readFileSync('public/cliente.css','utf8'),/PDV em tela direta/);
});
