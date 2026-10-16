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
 assert.match(html,/<div class="header-title"><h1>CARDÁPIO <span id="storeName">Sua loja<\/span><\/h1><\/div>/);
 assert.doesNotMatch(html,/<section class="hero-green"|id="heroLogo"|id="heroOrder"|id="headerLogo"/);
 assert.doesNotMatch(html,/class="hero-copy"|CARDÁPIO DIGITAL • PEÇA PELO WHATSAPP/);
 assert.doesNotMatch(js,/heroLogo|heroOrder|headerLogo/);
 assert.match(css,/\.store-header \.header-title h1\{/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.doesNotMatch(css,/\.hero-green/);
 assert.match(html,/\/vitrine\.css\?v=13/);
 assert.match(html,/\/vitrine\.js\?v=13/);
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
  name:{value:'Ana'},phone:{value:'11966374236'},
  pay:{value:'pix'},
  notes:{value:'Sem gelo'}
 };
 const msg=new Function('$','cart','menu','products','subtotal','deliveryCost','money','paymentLabels',
  js.slice(start,end)+';return checkoutMessage();')(
  id=>fields[id],new Map([['a',2]]),{name:'Loja Teste'},
  [{id:'a',name:'Suco',price:10}],()=>20,()=>4,
  v=>'R$ '+Number(v).toFixed(2),{pix:'Pix'}
 );
 assert.match(msg,/=== LOJA TESTE - PEDIDO ===/);
 assert.match(msg,/DATA: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
 assert.match(msg,/CLIENTE: Ana/);
 assert.match(msg,/TEL: 11966374236/);
 assert.match(msg,/TIPO: ENTREGA/);
 assert.match(msg,/END: Rua Um, 123, Centro/);
 assert.match(msg,/2x SUCO\s+R\$ 20\.00/);
 assert.match(msg,/SUBTOTAL\s+R\$ 20\.00/);
 assert.match(msg,/TAXA ENTREGA\s+R\$ 4\.00/);
 assert.match(msg,/TOTAL\s+R\$ 24\.00/);
 assert.match(msg,/PAGTO: PIX/);
 assert.match(msg,/Obs: Sem gelo/);
});

test('PDV mantém painel interno e acesso ao mesmo cardápio dinâmico',()=>{
 assert.match(client,/function renderGodzillaPDV\(\)/);
 assert.match(client,/function publicShopUrl\(\)/);
 assert.match(client,/return location\.origin\+'\/cardapio\?loja='\+encodeURIComponent\(shop\.slug\)/);
 assert.match(client,/rpc\('bipstart_complete_sale'/);
 assert.match(readFileSync('public/cliente.css','utf8'),/PDV em tela direta/);
});


test('título CARDÁPIO é centralizado sem perder nome da loja e recursos de pedido',()=>{
 assert.equal((html.match(/<h1>CARDÁPIO <span id="storeName">Sua loja<\/span><\/h1>/g)||[]).length,1);
 assert.equal((html.match(/id="storeName"/g)||[]).length,1);
 assert.match(js,/\$\('storeName'\)\.textContent=menu\.name/);
 assert.match(js,/\$\('storeName'\)\.textContent='Cardápio indisponível'/);
 assert.match(html,/class="store-header"/);
 assert.match(css,/\.store-header\{[\s\S]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
 assert.match(css,/\.store-header \.header-title\{[\s\S]*justify-self:center;text-align:center/);
 assert.match(css,/\.store-header \.header-title h1\{[\s\S]*text-transform:uppercase/);
 assert.match(css,/\.store-header \.header-title #storeName\{/);
 assert.match(css,/\.store-header \.header-title h1\{[\s\S]*display:flex;align-items:baseline/);
 assert.match(css,/\.store-header \.header-title #storeName\{[\s\S]*font:inherit;color:inherit/);
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
 assert.match(js,/row\('TAXA ENTREGA',money\(deliveryCost\(\)\)\)/);
 assert.match(css,/\.location-row\{display:grid;grid-template-columns:minmax\(0,1\.25fr\) minmax\(260px,\.75fr\)/);
 assert.match(css,/\.location-card,\.hours-card\{/);
 assert.match(css,/@media\(max-width:600px\)\{[\s\S]*\.hours-card\{display:flex\}/);
 assert.doesNotMatch(css,/\.delivery-badge/);
 assert.doesNotMatch(html,/benefits-row|store-extra|id="paymentMethods"|Pedido simples|Carrinho de compras|Direto com a loja|Formas de pagamento/);
 assert.doesNotMatch(js,/\$\('paymentMethods'\)/);
 assert.doesNotMatch(css,/\.benefits-row|\.store-extra/);
 assert.match(html,/id="pay"/);
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

test('categorias têm imagens grandes e cards transparentes, mantendo a seleção',()=>{
 const start=js.indexOf('function categoryArtwork(name){');
 const end=js.indexOf('function applyBrand(){',start);
 assert.ok(start>=0&&end>start);
 const categoryArtwork=new Function('products','fold','esc','imageUrl','categoryEmoji',
  js.slice(start,end)+';return categoryArtwork;')(
  [{category:'Bebidas',image_path:'categoria/bebida.png'}],
  x=>String(x||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase(),
  x=>String(x),x=>'/imagens/'+x,()=> '🥟'
 );
 const photo=categoryArtwork('Bebidas');
 assert.match(photo,/category-art-photo/);
 assert.match(photo,/<img src="\/imagens\/categoria\/bebida\.png"/);
 assert.match(photo,/aria-hidden="true"/);
 const fallback=categoryArtwork('Salgados');
 assert.match(fallback,/category-art-emoji/);
 assert.match(fallback,/🥟/);
 assert.match(js,/categoryArtwork\(name\)/);
 assert.match(js,/data-cat=/);
 assert.match(css,/\.category-tile \.category-art\{/);
 assert.match(css,/flex:0 0 94px/);
 assert.match(css,/border-radius:23px/);
 assert.match(css,/background:transparent/);
 assert.match(css,/\.category-tile \.category-art-photo img\{/);
 assert.match(css,/object-fit:contain/);
 assert.match(css,/\.category-strip\{\s*display:flex/);
 assert.match(css,/scroll-snap-type:x proximity/);
 assert.match(css,/\.category-tile > b\{/);
 assert.match(css,/\.category-tile > i\{display:none\}/);
 assert.match(css,/flex:0 0 clamp\(60px,17\.2vw,75px\)/);
 assert.match(js,/categoryArtwork\(name\)\+'<b>'\+esc\(name\)\+'<\/b><\/button>'/);
 assert.match(css,/@media\(max-width:600px\)\{/);
});


test('pedido WhatsApp segue modelo SALGATTI, valores e acompanhamento privado',()=>{
 const start=js.indexOf("function checkoutMessage(orderId=''){");
 const end=js.indexOf("document.addEventListener('click'",start);
 assert.ok(start>=0&&end>start);
 const fields={
  name:{value:'Diego Vicente Da Silva'},phone:{value:'(11) 96637-4236'},
  shipping:{value:'delivery'},address:{value:'Rua Antonio neves 51'},
  pay:{value:'pix'},notes:{value:'Confirmar pagamento'}
 };
 class FixedDate {
  toLocaleDateString(){return '15/10/2026';}
  toLocaleTimeString(){return '20:56';}
 }
 const id='6ffe6b8d-1111-4111-8111-111111111111';
 const make=new Function('$','cart','menu','products','subtotal','deliveryCost','money','paymentLabels','Date','orderToken','trackingLinkFor',
  js.slice(start,end)+';return checkoutMessage;');
 const fn=make(
  key=>fields[key],new Map([['essencia',3]]),{name:'Salgatti'},
  [{id:'essencia',name:'Essencia',price:25}],()=>75,()=>5,
  n=>'R$'+Number(n).toFixed(2).replace('.',','),{pix:'Pix'},FixedDate,'secure-token',
  ()=> 'https://bipstart.example/acompanhar#pedido='+id+'&chave=secure-token'
 );
 const msg=fn(id);
 assert.match(msg,/=== SALGATTI - PEDIDO #6ffe6b8d ===/);
 assert.match(msg,/DATA: 15\/10\/2026 20:56/);
 assert.match(msg,/CLIENTE: Diego Vicente Da Silva/);
 assert.match(msg,/TEL: 11966374236/);
 assert.match(msg,/TIPO: ENTREGA/);
 assert.match(msg,/END: Rua Antonio neves 51/);
 assert.match(msg,/3x ESSENCIA\s+R\$75,00/);
 assert.match(msg,/SUBTOTAL\s+R\$75,00/);
 assert.match(msg,/TAXA ENTREGA\s+R\$5,00/);
 assert.match(msg,/TOTAL\s+R\$80,00/);
 assert.match(msg,/PAGTO: PIX/);
 assert.match(msg,/Obs: Confirmar pagamento/);
 assert.match(msg,/ACOMPANHE SEU PEDIDO: https:\/\/bipstart\.example\/acompanhar#/);
 assert.ok(msg.indexOf('Obs: Confirmar pagamento')<msg.indexOf('ACOMPANHE SEU PEDIDO'));
 const pickupFields={...fields,shipping:{value:'pickup'},address:{value:''}};
 const pickup=make(
  key=>pickupFields[key],new Map([['essencia',1]]),{name:'Minha Loja'},
  [{id:'essencia',name:'Essencia',price:25}],()=>25,()=>0,
  n=>'R$'+Number(n).toFixed(2).replace('.',','),{pix:'Pix'},FixedDate,null,()=>null
 )(id);
 assert.match(pickup,/TIPO: RETIRADA/);
 assert.doesNotMatch(pickup,/END: Rua/);
 assert.match(pickup,/TAXA ENTREGA\s+R\$0,00/);
});
