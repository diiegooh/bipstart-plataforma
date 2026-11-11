import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('public/vitrine.html','utf8');
const css=readFileSync('public/vitrine.css','utf8');
const vitrine=readFileSync('public/vitrine.js','utf8');
const panel=readFileSync('public/cliente.js','utf8');
const server=readFileSync('server.mjs','utf8');
const panelCss=readFileSync('public/cliente.css','utf8');
const previousMigration=readFileSync('sql/bipstart_round_menu_layout_20261016.sql','utf8');
const officialMigration=readFileSync('sql/bipstart_official_menu_compact_20261017.sql','utf8');
const todosImageMigration=readFileSync('sql/bipstart_todos_category_background_20261017.sql','utf8');

test('modelo público atual usa layout compacto com logo, nome, categorias e opções',()=>{
 new vm.Script(vitrine);
 new vm.Script(panel);
 assert.match(vitrine,/function roundMenuActive\(\)\{return true;\}/);
 assert.match(html,/<h1 id="storeName">Sua loja<\/h1>/);
 assert.match(html,/id="storeLogo"/);
 assert.match(html,/id="openStoreOptions"/);
 assert.match(html,/id="quickCategories"/);
 assert.match(html,/id="openCart"/);
 assert.match(html,/id="toggleMenuNight"/);
 assert.doesNotMatch(html,/menuPreviewBadge|PRÉVIA DO MODELO REDONDO/);
 assert.doesNotMatch(panel,/cardapio_teste|data-round-preview-link|visual=redondo|Testar modelo redondo/);
 assert.match(panel,/Object\.assign\(body,\{menu_layout_style:'round',show_logo_subtitle,logo_subtitle\}\)/);
 assert.match(panel,/function cardapioLayoutSettings\(\)/);
});
test('cards compactos preservam clique e o mesmo carrinho',()=>{
 const from=vitrine.indexOf('function roundItemCard(item){');
 const to=vitrine.indexOf('function itemCard(item){',from);
 assert.ok(from>=0&&to>from);
 const build=new Function('esc','imageUrl',vitrine.slice(from,to)+';return roundItemCard;');
 const make=build(x=>String(x).replace(/</g,'&lt;'),path=>'https://img.example/'+path);
 const card=make({id:'111',name:'Batata Frita',price:29.9,image_path:'loja/batata.png',in_stock:true});
 assert.match(card,/class="dproduct round-card"/);
 assert.match(card,/data-add="111"/);
 assert.match(card,/class="round-photo"/);
 assert.match(card,/Batata Frita/);
 assert.match(card,/src="https:\/\/img\.example\/loja\/batata\.png"/);
 assert.match(card,/class="round-price"><small>R\$<\/small><strong>29<\/strong><sup>,90<\/sup>/);
 const unavailable=make({id:'222',name:'Esgotado',price:5,in_stock:false});
 assert.match(unavailable,/disabled aria-disabled="true"/);
 assert.match(vitrine,/renderCart\(\)/);
 assert.match(vitrine,/\$\('openCart'\)\.addEventListener\('click',openCart\)/);
 assert.match(html,/id="openCart" class="cartfloat"/);
 assert.match(css,/\.round-menu \.cartfloat\{display:grid;position:fixed;right:22px;bottom:20px/);
 assert.match(css,/\.round-menu \.cartfloat\{right:15px;bottom:20px\}/);
 assert.match(css,/\.round-menu \.round-photo\{width:min\(100%,156px\);aspect-ratio:1\/1/);
 assert.match(css,/@media\(max-width:640px\)\{[\s\S]*\.round-menu \.delivery-grid\{grid-template-columns:repeat\(2/);
});

test('categorias do cardápio usam imagem cadastrada e oferecem botão Todos fixo',()=>{
 assert.match(vitrine,/function categoryArtwork\(name\)/);
 assert.match(vitrine,/category\?\.image_path\|\|product\?\.image_path/);
 assert.match(vitrine,/const allCategory='<button type="button" class="category-tile category-tile-all"/);
 assert.match(vitrine,/data-cat="" aria-pressed="true"/);
 assert.match(vitrine,/<b>Todos<\/b>/);
 assert.match(vitrine,/allCategory\+categories\.filter/);
 assert.match(vitrine,/categoryArtwork\(name\)/);
 assert.match(html,/id="quickCategories"/);
 assert.match(css,/\.category-tile-all/);
 assert.match(css,/\.round-menu/);
 assert.match(vitrine,/function filterCategory\(name\)/);
 assert.match(vitrine,/renderProducts\(\)/);
});
test('card Todos exibe o PNG dentro da moldura e acompanha a cor do site',()=>{
 const from=vitrine.indexOf(' const allArtwork=');
 const to=vitrine.indexOf(" $('quickCategories').innerHTML=",from);
 assert.ok(from>=0&&to>from);
 const build=new Function(vitrine.slice(from,to)+';return allCategory;');
 const tile=build();
 assert.match(tile,/class="category-art category-art-all-fixed"/);
 assert.match(tile,/class="category-all-png"/);
 assert.match(tile,/data-cat="" aria-pressed="true"/);
 assert.match(tile,/aria-label="Exibir todos os produtos"/);
 assert.match(tile,/<b>Todos<\/b>/);
 assert.doesNotMatch(tile,/<svg|<circle /);
 assert.match(css,/\.round-menu \.category-tile-all \.category-art-all-fixed\{[\s\S]*background:transparent;[\s\S]*border:0/);
 assert.match(css,/\.round-menu \.category-tile-all\{[\s\S]*background:transparent/);
 assert.match(css,/\.round-menu \.category-tile-all \.category-all-png\{\s*display:block;\s*width:74%;\s*height:74%;/);
 assert.match(css,/mask-image:url\('\/todos-nove-circulos\.png'\)/);
 assert.match(css,/background-color:var\(--green\)/);
 assert.match(server,/'\/todos-nove-circulos\.png': \['todos-nove-circulos\.png', 'image\/png'\]/);
 const png=readFileSync('public/todos-nove-circulos.png');
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.match(panel,/filter\(name=>categoryKey\(name\)!=='todos'\)/);
});

test('checkout público mantém dados da loja, entrega e WhatsApp após registrar pedido',()=>{
 for(const id of ['name','phone','shipping','address','pay','cartTotal','sendPreparedWhatsapp']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(vitrine,/function checkoutMessage\(orderId=''\)/);
 assert.match(vitrine,/subtotal\(\)\+deliveryCost\(\)/);
 assert.match(vitrine,/bipstart_place_online_order/);
 assert.match(vitrine,/async function registerOnlineOrder\(\)/);
 assert.match(vitrine,/https:\/\/wa\.me\//);
 assert.match(vitrine,/encodeURIComponent\(checkoutMessage\(receipt\.id\)\)/);
 assert.match(panel,/payment_methods/);
 assert.match(panel,/opening_hours/);
 assert.match(panel,/location_text/);
 assert.match(panel,/delivery_fee/);
});
test('Premium permite personalizar cor, nome, frase e logo mantendo a identidade da loja',()=>{
 assert.match(panel,/function cardapioLayoutSettings\(\)/);
 assert.match(panel,/if\(!proAccess\(\)\)return ''/);
 assert.match(panel,/name="show_logo_subtitle"/);
 assert.match(panel,/name="logo_subtitle"/);
 assert.match(panel,/COR DO SISTEMA/);
 assert.match(panel,/Object\.assign\(body,\{menu_layout_style:'round',show_logo_subtitle,logo_subtitle\}\)/);
 assert.match(panel,/canCustomize\(\)\?field\('brand_color'/);
 assert.match(html,/id="logoSubtitle"/);
 assert.match(vitrine,/menu\.show_logo_subtitle/);
 assert.match(vitrine,/menu\?\.brand_color/);
 assert.doesNotMatch(panel,/name="menu_theme_color"/);
});
test('migração torna único o novo modelo sem apagar pedidos, estoque, usuários ou integrações',()=>{
 assert.match(officialMigration,/alter table public\.shops alter column menu_layout_style set default 'round'/);
 assert.match(officialMigration,/update public\.shops set menu_layout_style='round'/);
 assert.match(officialMigration,/check \(menu_layout_style='round'\)/);
 assert.doesNotMatch(officialMigration,/drop table|truncate|delete from|drop column/i);
 assert.match(previousMigration,/e\.plan_code='pro'/);
 assert.match(previousMigration,/p\.online_enabled=true/);
 assert.match(previousMigration,/grant execute on function public\.bipstart_public_menu\(text\) to anon,authenticated/);
});


test('cor do sistema é única e o cardápio herda a cor configurada na conta',()=>{
 assert.match(panel,/field\('brand_color','COR DO SISTEMA','color',shop\.brand_color/);
 assert.match(panel,/body\.brand_color=v\.brand_color/);
 assert.match(panel,/body\.menu_theme_color=v\.brand_color/);
 assert.match(panel,/function applySidebarTheme\(\)/);
 assert.match(panel,/document\.documentElement\.style\.setProperty\('--store-accent',color\)/);
 assert.match(panel,/document\.documentElement\.style\.setProperty\('--store-accent-ink'/);
 assert.match(vitrine,/menu\?\.brand_color\|\|menu\?\.menu_theme_color/);
 assert.doesNotMatch(panel,/name="menu_theme_color"/);
 assert.match(css,/--green/);
 assert.match(panelCss,/--store-accent/);
});
