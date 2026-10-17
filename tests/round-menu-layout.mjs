import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('public/vitrine.html','utf8');
const css=readFileSync('public/vitrine.css','utf8');
const vitrine=readFileSync('public/vitrine.js','utf8');
const admin=readFileSync('public/cliente.js','utf8');
const adminCss=readFileSync('public/cliente.css','utf8');
const migration=readFileSync('sql/bipstart_round_menu_layout_20261016.sql','utf8');
const isolatedTheme=readFileSync('sql/bipstart_round_menu_theme_isolation_20261016.sql','utf8');

test('clássico permanece padrão e modelo alternativo usa categorias antigas e carrinho flutuante',()=>{
 new vm.Script(vitrine);
 new vm.Script(admin);
 assert.match(vitrine,/function roundMenuActive\(\)/);
 assert.match(vitrine,/menu\?\.menu_layout_style==='round'/);
 assert.match(vitrine,/get\('visual'\)==='redondo'/);
 assert.match(vitrine,/document\.body\.classList\.toggle\('round-menu',isRound\)/);
 assert.match(vitrine,/if\(typeof roundMenuActive==='function'&&roundMenuActive\(\)\)return roundItemCard\(item\)/);
 assert.match(vitrine,/categoryArtwork\(name\)\+'<b>'\+esc\(name\)/);
 assert.doesNotMatch(vitrine,/round-category|roundHeaderCart|roundCartCount/);
 assert.doesNotMatch(html,/roundHeaderCart|roundCartCount/);
 assert.match(html,/id="openCart" class="cartfloat"/);
 assert.match(html,/id="cartCount"/);
 assert.match(vitrine,/\$\('openCart'\)\.addEventListener\('click',openCart\)/);
 assert.match(vitrine,/\$\('cartCount'\)\.textContent=String\(count\)/);
 assert.match(vitrine,/querySelector\('\[data-card-feedback\]'\)/);
});
test('cards compactos com foto quadrada clicável usam produto, preço e o mesmo carrinho do site',()=>{
 const from=vitrine.indexOf('function roundItemCard(item){');
 const to=vitrine.indexOf('function itemCard(item){',from);
 assert.ok(from>=0&&to>from);
 const build=new Function('esc','imageUrl',vitrine.slice(from,to)+';return roundItemCard;');
 const make=build(x=>String(x).replace(/</g,'&lt;'),path=>'https://img.example/'+path);
 const markup=make({id:'111',name:'Batata Frita',price:29.9,image_path:'store/fries.png',in_stock:true});
 assert.match(markup,/class="dproduct round-card"/);
 assert.match(markup,/data-add="111"/);
 assert.match(markup,/class="round-photo"/);
 assert.match(markup,/src="https:\/\/img\.example\/store\/fries\.png"/);
 assert.match(markup,/Batata Frita/);
 assert.match(markup,/class="round-price"><small>R\$<\/small><strong>29<\/strong><sup>,90<\/sup>/);
 assert.match(markup,/class="round-add-symbol"/);
 assert.match(markup,/data-card-feedback="111"/);
 const unavailable=make({id:'222',name:'Esgotado',price:10,in_stock:false});
 assert.match(unavailable,/disabled aria-disabled="true"/);
 assert.match(unavailable,/Esgotado/);
 assert.doesNotMatch(unavailable,/data-add="111"/);
 assert.match(vitrine,/const add=event\.target\.closest\('\[data-add\]'\)/);
 assert.match(vitrine,/renderCart\(\)/);
});
test('categorias usam mesmas imagens, rótulos e seleção do cardápio clássico',()=>{
 assert.match(css,/body\.round-menu\{/);
 assert.match(css,/\.round-menu \.round-photo\{/);
 assert.match(css,/\.round-menu \.round-price\{/);
 assert.match(css,/\.round-menu \.cartfloat\{display:grid;position:fixed;right:22px;bottom:20px/);
 assert.doesNotMatch(css,/\.round-menu \.cartfloat\{display:none\}/);
 assert.match(css,/\.round-menu \.category-strip\{display:flex;flex-wrap:nowrap;align-items:flex-start;gap:9px;padding:4px 14px 18px/);
 assert.match(css,/\.category-tile \.category-art\{/);
 assert.match(css,/\.category-tile \.category-art-photo img\{/);
 assert.match(css,/\.category-tile.active > b\{color:var\(--green\)/);
 assert.match(css,/\.round-menu \.delivery-grid\{display:grid;grid-template-columns:repeat\(5/);
 assert.match(css,/@media\(max-width:640px\)\{[\s\S]*\.round-menu \.delivery-grid\{grid-template-columns:repeat\(2/);
 assert.match(css,/var\(--green\)/);
 assert.match(html,/Cormorant\+Garamond/);
 assert.match(vitrine,/\$\('category'\)\.addEventListener\('change',renderProducts\)/);
 assert.doesNotMatch(css,/\.round-menu \.round-category|\.round-menu \.bottom-nav/);
 const begin=vitrine.indexOf(" $('quickCategories').innerHTML=");
 const end=vitrine.indexOf(" const combos=",begin);
 const snippet=vitrine.slice(begin,end);
 assert.match(snippet,/categoryArtwork\(name\)/);
 assert.match(vitrine,/const allCategory=isRound\?/);
 assert.match(snippet,/allCategory\+categories\.filter/);
 assert.doesNotMatch(snippet,/round-category|categoryEmoji\(name\)/);
});
test('cabeçalho sem texto acima da logo e frase opcional abaixo do nome da loja',()=>{
 assert.doesNotMatch(html,/id="establishmentEyebrow"|ESTABELECIMENTO/);
 assert.doesNotMatch(vitrine,/establishmentEyebrow|establishmentLabels/);
 assert.match(html,/id="logoSubtitle"/);
 assert.match(html,/id="storeLogo"/);
 assert.match(html,/id="storeName"/);
 assert.match(vitrine,/menu\.show_logo_subtitle!==true/);
 assert.match(vitrine,/menu\.logo_subtitle/);
 assert.match(vitrine,/roundMenuActive\(\)&&menu\.menu_theme_color/);
 assert.match(vitrine,/\$\('storeName'\)\.textContent=menu\.name/);
 assert.doesNotMatch(css,/\.round-menu \.menu-hero-logo-card \.menu-eyebrow|\.round-menu \.menu-eyebrow/);
 assert.match(css,/\.round-menu \.menu-tagline:not\(\.hidden\)\{display:block/);
});
test('configurações Premium validam e persistem modelo, cor, slogan e tipo de estabelecimento',()=>{
 assert.match(admin,/function cardapioLayoutSettings\(\)/);
 assert.match(admin,/if\(!proAccess\(\)\)return ''/);
 assert.match(admin,/id="menuLayoutForm"/);
 assert.match(admin,/name="menu_layout_style"/);
 assert.match(admin,/name="establishment_type"/);
 assert.match(admin,/name="show_logo_subtitle"/);
 assert.match(admin,/name="logo_subtitle"/);
 assert.match(admin,/name="menu_theme_color"/);
 assert.match(admin,/Testar modelo redondo/);
 assert.match(admin,/case 'menuLayoutForm':/);
 assert.match(admin,/menuEstablishmentTypes\.some/);
 assert.match(admin,/logo_subtitle\.length>100/);
 assert.match(admin,/body=\{menu_layout_style,establishment_type,show_logo_subtitle,logo_subtitle,menu_theme_color\}/);
 assert.match(admin,/body\}\)/);
 assert.match(admin,/cardapioLayoutSettings\(\)/);
 assert.match(adminCss,/\.menu-layout-settings/);
 assert.match(admin,/menu_layout_style,establishment_type,show_logo_subtitle,logo_subtitle,menu_theme_color,created_at/);
});
test('RPC preserva bloqueio de publicação do Básico, limita imagem própria ao Premium e respeita cor da loja',()=>{
 assert.match(migration,/add column if not exists menu_layout_style/);
 assert.match(migration,/add column if not exists establishment_type/);
 assert.match(migration,/add column if not exists show_logo_subtitle/);
 assert.match(migration,/add column if not exists logo_subtitle/);
 assert.match(migration,/add column if not exists menu_theme_color/);
 assert.match(migration,/s\.menu_theme_color,s\.brand_color/);
 assert.match(isolatedTheme,/'brand_color',s\.brand_color/);
 assert.match(isolatedTheme,/'menu_theme_color',case when e\.plan_code='pro' then s\.menu_theme_color else null end/);
 assert.match(migration,/'logo_path',case when e\.plan_code='pro' then s\.logo_path else null end/);
 assert.match(migration,/e\.plan_code='pro'/);
 assert.match(migration,/p\.online_enabled=true/);
 assert.match(migration,/grant execute on function public\.bipstart_public_menu\(text\) to anon,authenticated/);
 assert.doesNotMatch(migration,/drop table|truncate|delete from public\.shops/i);
});

test('foto quadrada compacta e cards menores apenas no modelo alternativo',()=>{
 const square=css.match(/\.round-menu \.round-photo\{([^}]+)\}/)?.[1]||'';
 const image=css.match(/\.round-menu \.round-card \.round-photo img\{([^}]+)\}/)?.[1]||'';
 const card=css.match(/\.round-menu \.round-card\{([^}]+)\}/)?.[1]||'';
 const title=css.match(/\.round-menu \.round-name\{([^}]+)\}/)?.[1]||'';
 const price=css.match(/\.round-menu \.round-price\{([^}]+)\}/)?.[1]||'';
 assert.match(square,/width:min\(100%,156px\)/);
 assert.match(square,/aspect-ratio:1\/1/);
 assert.match(square,/border-radius:16px/);
 assert.doesNotMatch(square,/border-radius:50%/);
 assert.match(image,/aspect-ratio:1\/1/);
 assert.match(image,/border-radius:14px/);
 assert.match(image,/object-fit:cover/);
 assert.match(card,/max-width:180px/);
 assert.match(title,/min-height:50px/);
 assert.match(price,/min-width:108px/);
 assert.match(css,/@media\(max-width:900px\)\{\.round-menu \.delivery-grid\{grid-template-columns:repeat\(4/);
 assert.match(css,/@media\(max-width:700px\)\{\.round-menu \.delivery-grid\{grid-template-columns:repeat\(3/);
 assert.match(css,/\.round-menu \.round-photo\{width:min\(100%,138px\);border-radius:14px\}/);
 assert.match(css,/@media\(max-width:640px\)\{[\s\S]*\.round-menu \.delivery-grid\{grid-template-columns:repeat\(2/);
 assert.match(css,/\.round-menu \.round-price strong\{font-size:23px\}/);
 assert.match(css,/\.dproduct img\{width:100%;aspect-ratio:1\/1/);
 assert.match(css,/\.round-menu \.round-card-click\{/);
 assert.doesNotMatch(vitrine,/classList\.toggle\('round-menu',true\)/);
});

test('cabeçalho apresenta CARDÁPIO à esquerda e nome da loja no alto à direita sem logo',()=>{
 assert.match(html,/<p class="menu-hero-heading" aria-hidden="true">CARDÁPIO<\/p>/);
 assert.match(html,/<div class="menu-hero-logo-card">/);
 assert.match(html,/<img id="storeLogo"/);
 assert.match(html,/<h1 id="storeName">Sua loja<\/h1>/);
 assert.match(css,/\.menu-hero-heading\{display:none\}/);
 assert.match(css,/\.menu-hero-logo-card\{display:contents\}/);
 assert.match(css,/\.round-menu \.menu-hero-logo-card\{display:none\}/);
 assert.match(css,/\.round-menu \.store-header \.header-title\{[\s\S]*grid-template-columns:minmax\(0,1fr\) minmax\(140px,.95fr\)/);
 assert.match(css,/\.round-menu \.menu-hero-heading\{[\s\S]*grid-column:1;[\s\S]*grid-row:1\/3/);
 assert.match(css,/\.round-menu \.store-header \.header-title h1,[\s\S]*grid-column:2;[\s\S]*grid-row:1;[\s\S]*text-align:right/);
 assert.match(css,/\.round-menu \.store-header \.menu-tagline:not\(\.hidden\)\{[\s\S]*grid-column:2;[\s\S]*text-align:right/);
 assert.match(css,/@media\(max-width:640px\)\{[\s\S]*\.round-menu \.menu-hero-heading\{[\s\S]*font-size:clamp\(29px,7\.3vw,46px\)/);
 assert.match(vitrine,/menu\?\.plan_code==='pro'&&typeof menu\.logo_path==='string'/);
 assert.doesNotMatch(html,/id="roundHeaderCart"/);
 assert.match(html,/id="openCart" class="cartfloat"/);
});
test('logo oculta somente no modelo redondo, carrinho flutua à direita e categorias preservam fotos',()=>{
 assert.match(css,/\.round-menu \.menu-hero-logo-card\{display:none\}/);
 assert.match(css,/\.menu-hero-logo-card\{display:contents\}/);
 assert.match(html,/id="storeLogo"/);
 assert.match(vitrine,/function displayStoreLogo\(\)/);
 assert.match(css,/\.round-menu \.cartfloat\{display:grid;position:fixed;right:22px;bottom:20px/);
 assert.match(css,/\.round-menu \.cartfloat\{right:15px;bottom:20px\}/);
 assert.doesNotMatch(html,/roundHeaderCart|roundCartCount|establishmentEyebrow/);
 assert.doesNotMatch(vitrine,/roundHeaderCart|roundCartCount/);
 assert.match(html,/<p class="menu-hero-heading" aria-hidden="true">CARDÁPIO<\/p>/);
 assert.match(html,/<h1 id="storeName">Sua loja<\/h1>/);
 assert.match(vitrine,/categoryArtwork\(name\)/);
 assert.match(vitrine,/const category=\(menu\?\.categories\|\|\[\]\)\.find/);
 assert.match(vitrine,/category\?\.image_path\|\|product\?\.image_path/);
 assert.match(vitrine,/\/bipstart-marca-icon\.png/);
});


test('no novo visual, Todos ocupa a primeira categoria e substitui controles redundantes',()=>{
 assert.match(html,/id="showAll" type="button">Ver todos/); // clássico preservado
 assert.match(html,/id="category" class="select"/); // filtro interno mantido
 assert.match(css,/\.round-menu \.section-title-row\{display:none\}/);
 assert.match(css,/\.round-menu \.catalog-toolbar \.select\{display:none\}/);
 assert.match(css,/\.round-menu \.category-tile-all\{[\s\S]*position:sticky;[\s\S]*left:0/);
 assert.match(vitrine,/const allCategory=isRound\?/);
 assert.match(vitrine,/class="category-tile category-tile-all"/);
 assert.match(vitrine,/data-cat="" aria-pressed="true"/);
 assert.match(vitrine,/<b>Todos<\/b>/);
 assert.match(vitrine,/allCategory\+categories\.filter/);
 assert.match(vitrine,/btn\.dataset\.cat===''[\s]*\?!category/);
 assert.match(vitrine,/btn\.setAttribute\('aria-pressed',String\(active\)\)/);
 assert.match(vitrine,/if\(roundMenuActive\(\)&&!name\)\$\('search'\)\.value=''/);
 assert.doesNotMatch(vitrine,/roundHeaderCart|roundCartCount/);
});

test('Todos limpa busca e categoria, preserva filtros específicos e atualiza seleção',()=>{
 const from=vitrine.indexOf('function filterCategory(name){');
 const end=vitrine.indexOf('function checkoutMessage(',from);
 assert.ok(from>=0&&end>from);
 const fields={search:{value:'batata'},category:{value:'Fritos'}};
 let calls=0;
 const makeFilter=new Function('$','roundMenuActive','renderProducts',vitrine.slice(from,end)+';return filterCategory;');
 const filter=makeFilter(id=>fields[id],()=>true,()=>{calls++;});
 filter('');
 assert.equal(fields.search.value,'');
 assert.equal(fields.category.value,'');
 assert.equal(calls,1);
 fields.search.value='bolo';
 filter('Doces');
 assert.equal(fields.search.value,'bolo','outras categorias não limpam a busca');
 assert.equal(fields.category.value,'Doces');
 assert.equal(calls,2);
 const classicFilter=makeFilter(id=>fields[id],()=>false,()=>{calls++;});
 fields.search.value='coxinha';
 classicFilter('');
 assert.equal(fields.search.value,'coxinha','clássico mantém busca anterior');

 const fromRender=vitrine.indexOf('function renderProducts(){');
 const toRender=vitrine.indexOf('function subtotal(){',fromRender);
 assert.ok(fromRender>=0&&toRender>fromRender);
 const selected=[];
 const buttons=[
  {dataset:{cat:''},classList:{toggle(_c,v){selected[0]=v;}},setAttribute(){}},
  {dataset:{cat:'Doces'},classList:{toggle(_c,v){selected[1]=v;}},setAttribute(){}}
 ];
 const catalog={innerHTML:''};
 const ui={search:{value:''},category:{value:''},catalog};
 const makeRender=new Function('$','document','menu','products','fold','itemCard',vitrine.slice(fromRender,toRender)+';return renderProducts;');
 const render=makeRender(id=>ui[id],{querySelectorAll:()=>buttons},{},[
   {name:'Bolo',category:'Doces'},{name:'Coxinha',category:'Salgados'}
 ],s=>String(s||'').toLowerCase(),item=>'<div>'+item.name+'</div>');
 render();
 assert.equal(selected[0],true);
 assert.equal(selected[1],false);
 assert.match(catalog.innerHTML,/Bolo/);
 assert.match(catalog.innerHTML,/Coxinha/);
 ui.category.value='Doces';
 render();
 assert.equal(selected[0],false);
 assert.equal(selected[1],true);
 assert.match(catalog.innerHTML,/Bolo/);
 assert.doesNotMatch(catalog.innerHTML,/Coxinha/);
});
