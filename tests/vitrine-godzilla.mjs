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

test('o visual do cardápio tem título central sem banner, categorias, produtos e carrinho',()=>{
 for(const text of ['header-title','category-strip','combo-banner','catalog-toolbar','delivery-grid','onlinecart','cartfloat','bottom-nav']){
  assert.match(html,new RegExp('class="[^"]*\\b'+text+'\\b'),text);
 }
 for(const id of ['storeName','quickCategories','catalog','search','category','cartDrawer','cartItems','shipping','address','pay','cartTotal','sendOrder','error']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/<div class="header-title"><h1>CARDÁPIO<\/h1><small id="storeName">Sua loja<\/small><\/div>/);
 assert.doesNotMatch(html,/<section class="hero-green"|id="heroLogo"|id="heroOrder"|id="headerLogo"/);
 assert.doesNotMatch(html,/class="hero-copy"|CARDÁPIO DIGITAL • PEÇA PELO WHATSAPP/);
 assert.doesNotMatch(js,/heroLogo|heroOrder|headerLogo/);
 assert.match(css,/\.store-header \.header-title h1\{/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.doesNotMatch(css,/\.hero-green/);
 assert.match(html,/\/vitrine\.css\?v=6/);
 assert.match(html,/\/vitrine\.js\?v=6/);
 assert.match(css,/\.dproduct/);
 assert.doesNotMatch(html,/Godzilla Adega|Jd Planalto|Suzano/);
 assert.doesNotMatch(js,/godzilla-adega|\/api\/products|\/api\/orders/);
});

test('cada vitrine consulta o cardápio da própria loja no Supabase',()=>{
 assert.match(js,/new URLSearchParams\(location\.search\)\.get\('loja'\)/);
 assert.match(js,/rpc\/bipstart_public_menu/);
 assert.match(js,/JSON\.stringify\(\{p_slug:slug\}\)/);
 assert.match(js,/menu\.src=config\.supabaseUrl/);
 assert.doesNotMatch(js,/menu\.logo_path/);
 assert.match(js,/menu\.brand_color/);
 assert.match(js,/categoryNames\(\)/);
 assert.match(js,/imageUrl\(item\.image_path\)/);
 assert.match(js,/encodeURIComponent\(checkoutMessage\(receipt\.id\)\)/);
 assert.match(js,/https:\/\/wa\.me\//);
 assert.doesNotMatch(js,/SUPABASE_SECRET_KEY|service_role|ADMIN_PASSWORD/);
});

test('o pedido calcula total e taxa de entrega antes de abrir WhatsApp',()=>{
 const start=js.indexOf("function checkoutMessage(orderId=''){");
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


test('título CARDÁPIO é centralizado sem perder nome da loja e recursos de pedido',()=>{
 assert.equal((html.match(/<h1>CARDÁPIO<\/h1>/g)||[]).length,1);
 assert.equal((html.match(/id="storeName"/g)||[]).length,1);
 assert.match(js,/\$\('storeName'\)\.textContent=menu\.name/);
 assert.match(js,/\$\('storeName'\)\.textContent='Cardápio indisponível'/);
 assert.match(html,/class="store-header"/);
 assert.match(css,/\.store-header\{[\s\S]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
 assert.match(css,/\.store-header \.header-title\{[\s\S]*justify-self:center;text-align:center/);
 assert.match(css,/\.store-header \.header-title h1\{[\s\S]*text-transform:uppercase/);
 assert.match(css,/\.store-header \.header-title #storeName\{/);
 assert.match(html,/id="jumpCategories"/);
 assert.match(html,/id="focusSearch"/);
 assert.match(html,/id="headerCart"/);
 assert.match(html,/id="quickCategories"/);
 assert.match(html,/id="catalogue"/);
 assert.match(html,/id="sendOrder"/);
 assert.match(js,/\$\('jumpCategories'\)\.addEventListener/);
 assert.match(js,/\$\('sendOrder'\)/);
});


test('topo mostra endereço para retirada e horários sem taxa de entrega',()=>{
 assert.match(html,/aria-label="Retirada e funcionamento da loja"/);
 assert.match(html,/<small>Endereço para retirada<\/small><b id="storeLocation">Consulte a loja<\/b>/);
 assert.match(html,/<small>Horário de funcionamento<\/small><b id="openingHours">Consulte a loja<\/b>/);
 assert.match(html,/id="locationLink"[^>]*target="_blank" rel="noopener noreferrer"/);
 assert.equal((html.match(/id="openingHours"/g)||[]).length,1);
 assert.doesNotMatch(html,/id="deliveryBadge"|class="delivery-badge"|Consulte a taxa de entrega/);
 assert.match(js,/\$\('storeLocation'\)\.textContent=menu\.location\|\|'Localização a combinar'/);
 assert.match(js,/\$\('openingHours'\)\.textContent=menu\.opening_hours\|\|'Consulte a loja'/);
 assert.match(js,/new URLSearchParams\(location\.search\)\.get\('loja'\)/);
 assert.doesNotMatch(js,/deliveryBadge/);
 assert.match(js,/function deliveryCost\(\)\{return \$\('shipping'\)\.value==='delivery'\?Number\(menu\?\.delivery_fee\|\|0\):0;\}/);
 assert.match(js,/lines\.push\('Taxa de entrega: '\+money\(deliveryCost\(\)\)/);
 assert.match(css,/\.location-row\{display:grid;grid-template-columns:minmax\(0,1\.25fr\) minmax\(260px,\.75fr\)/);
 assert.match(css,/\.location-card,\.hours-card\{/);
 assert.match(css,/@media\(max-width:600px\)\{[\s\S]*\.hours-card\{display:flex\}/);
 assert.doesNotMatch(css,/\.delivery-badge/);
 assert.match(html,/id="paymentMethods"/);
});

test('o cardápio multiplica o total no card e não abre o carrinho ao adicionar',()=>{
 assert.doesNotMatch(html,/Ao continuar, seus dados e o pedido serão registrados/);
 const start=js.indexOf('function itemCard(item){');
 const end=js.indexOf('function renderProducts(){',start);
 assert.ok(start>=0&&end>start);
 const qty=new Map([['a',3]]);
 const itemCard=new Function('selectedQty','esc','money','imageUrl',js.slice(start,end)+';return itemCard;')(qty,v=>String(v),v=>'R$ '+Number(v).toFixed(2),()=>'/img.png');
 const card=itemCard({id:'a',name:'Copo Salgatti',price:12.5,category:'Salgados',in_stock:true});
 assert.match(card,/data-card-qty="a"[^>]*>3<\/strong>/);
 assert.match(card,/data-card-total="a"[^>]*>R\$ 37\.50<\/strong>/);
 assert.match(card,/data-card-inc="a"/);
 assert.match(card,/data-card-dec="a"/);
 assert.match(card,/data-add="a"/);
 assert.match(js,/const qty=add\?\(selectedQty\.get\(id\)\|\|1\):1/);
 assert.match(js,/card\.querySelector\('\[data-card-total\]'\)\.textContent=money\(Number\(product\.price\)\*qty\)/);
 assert.doesNotMatch(js,/if\(add\)openCart\(\)/);
 assert.match(css,/\.product-quantity\{/);
});

test('o retorno à seleção PDV ou Cardápio aparece só ao proprietário',()=>{
 assert.match(html,/id="ownerNav" class="owner-nav hidden"/);
 assert.match(html,/id="backToModesLink"[^>]*href="\/cliente"/);
 assert.match(html,/Voltar às opções: PDV ou Cardápio/);
 assert.doesNotMatch(html,/Gerenciar cardápio|ownerEditorLink/);
 assert.match(js,/\$\('ownerNav'\)\.classList\.remove\('hidden'\)/);
 assert.match(js,/Array\.isArray\(rows\)&&rows\.some\(row=>row\.slug===slug\)/);
 assert.match(css,/\.owner-modes-link\{/);
});
