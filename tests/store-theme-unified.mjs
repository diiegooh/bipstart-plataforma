import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const panel=readFileSync('public/cliente.js','utf8');
const panelCss=readFileSync('public/cliente.css','utf8');
const panelHtml=readFileSync('public/cliente.html','utf8');
const vitrine=readFileSync('public/vitrine.js','utf8');
const vitrineCss=readFileSync('public/vitrine.css','utf8');
const vitrineHtml=readFileSync('public/vitrine.html','utf8');
const courier=readFileSync('public/motoboy.js','utf8');
const courierCss=readFileSync('public/motoboy.css','utf8');
const courierHtml=readFileSync('public/motoboy.html','utf8');
const sql=readFileSync('sql/bipstart_courier_shop_theme_20261017.sql','utf8');

test('scripts são sintaticamente válidos e incluem versões cachebusted',()=>{
 for(const [name,code] of [['cliente.js',panel],['vitrine.js',vitrine],['motoboy.js',courier]])
  new vm.Script(code,{filename:name});
 for(const asset of ['cliente.js','cliente.css'])
  assert.match(panelHtml,new RegExp('/'+asset.replace('.','\\.')+'\\?v=\\d+'));
 for(const asset of ['vitrine.js','vitrine.css'])
  assert.match(vitrineHtml,new RegExp('/'+asset.replace('.','\\.')+'\\?v=\\d+'));
 for(const asset of ['motoboy.js','motoboy.css'])
  assert.match(courierHtml,new RegExp('/'+asset.replace('.','\\.')+'\\?v=\\d+'));
});
test('cor do sistema só pode ser alterada por conta Premium',()=>{
 assert.match(panel,/canCustomize\(\)\?field\('brand_color','COR DO SISTEMA','color'/);
 assert.match(panel,/body\.brand_color=v\.brand_color/);
 assert.match(panel,/body\.menu_theme_color=v\.brand_color/);
 assert.match(panel,/if\(!\/\^#\[0-9a-f\]\{6\}\$\/i\.test\(String\(v\.brand_color\|\|''\)\)\)/);
 assert.match(panel,/function applySidebarTheme\(\)/);
 for(const variable of ['store-accent','store-accent-ink','accent'])
  assert.match(panel,new RegExp("document\\.documentElement\\.style\\.setProperty\\('--"+variable+"'"));
 assert.doesNotMatch(panel,/name="menu_theme_color"/);
});
test('painel, vitrine e motoboy usam cores validadas da loja sem sobrescrever outras contas',()=>{
 assert.match(panelCss,/--store-accent/);
 assert.match(panelCss,/--store-accent-ink/);
 assert.match(panelCss,/\.online-order-card/);
 assert.match(panelCss,/\.inventory-category-card/);
 assert.match(vitrine,/menu\?\.brand_color\|\|menu\?\.menu_theme_color/);
 assert.match(vitrine,/document\.documentElement\.style\.setProperty\('--green',color\)/);
 assert.match(vitrineCss,/\.category-tile/);
 assert.match(vitrineCss,/--green/);
 assert.match(courier,/bipstart_courier_shop_theme/);
 assert.match(courierCss,/--courier-shop-accent/);
});
test('RPC do motoboy entrega somente cor de lojas autorizadas',()=>{
 assert.match(sql,/create or replace function public\.bipstart_courier_shop_theme\(\)/);
 assert.match(sql,/security definer set search_path to ''/);
 assert.match(sql,/c\.account_id=auth\.uid\(\)/);
 assert.match(sql,/c\.active=true/);
 assert.match(sql,/public\.has_delivery_access\(c\.shop_id\)/);
 assert.match(sql,/join public\.shops s on s\.id=c\.shop_id/);
 assert.match(sql,/grant execute on function public\.bipstart_courier_shop_theme\(\) to authenticated/);
 assert.match(sql,/revoke all on function public\.bipstart_courier_shop_theme\(\) from public,anon,authenticated/);
 assert.doesNotMatch(sql,/drop table|truncate|delete from/i);
 assert.match(courier,/rpc\('bipstart_courier_my_shops'\)/);
 assert.match(courier,/rpc\('bipstart_courier_queue'\)/);
 assert.match(courier,/rpc\('bipstart_courier_shop_theme'\)/);
 assert.match(courier,/const colors=new Map/);
 assert.match(courier,/const coloredRows=rows\.map/);
 assert.match(courier,/shops\.length===1\?colors\.get\(shops\[0\]\.shop_id\):'#7c3aed'/);
 assert.match(courierCss,/body\.courier-themed/);
 assert.match(courierCss,/\.courier-delivery\[style\]/);
 assert.match(courierCss,/--courier-shop-accent/);
});

test('cores arbitrárias não injetam CSS e cada entrega mantém identidade própria',()=>{
 const from=courier.indexOf('function mapUrl(');
 const to=courier.indexOf('async function refresh(){',from);
 assert.ok(from>=0&&to>from);
 const escaped=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const {themeColor,themeContrast,themeVars,deliveryCard}=new Function('esc','currency',
  courier.slice(from,to)+';return {themeColor,themeContrast,themeVars,deliveryCard};'
 )(escaped,n=>'R$ '+Number(n).toFixed(2));
 assert.equal(themeColor('#FFCC00'),'#FFCC00');
 assert.equal(themeContrast('#FFCC00'),'#101510');
 assert.equal(themeContrast('#141028'),'#ffffff');
 assert.equal(themeColor('red; background:url(evil)'),'#7c3aed');
 assert.doesNotMatch(themeVars('red; background:url(evil)'),/url|evil/);
 const base={delivery_id:'7b9807f4-a873-4d21-9a01-26bf23cc15ee',
  shop_name:'Minha loja',customer_name:'Ana',address:'Rua A, 123',
  total:10,status:'pendente',items_text:'1x Salgado'};
 const yellow=deliveryCard({...base,shop_color:'#ffcc00'},true);
 const blue=deliveryCard({...base,shop_color:'#003399'},true);
 assert.match(yellow,/style="--courier-shop-accent:#ffcc00;--courier-shop-ink:#101510"/);
 assert.match(blue,/style="--courier-shop-accent:#003399;--courier-shop-ink:#ffffff"/);
 assert.match(yellow,/data-job-action="accept"/);
});
