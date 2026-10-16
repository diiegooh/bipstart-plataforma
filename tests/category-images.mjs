import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const panel=readFileSync('public/cliente.js','utf8');
const panelCss=readFileSync('public/cliente.css','utf8');
const publicMenu=readFileSync('public/vitrine.js','utf8');
const migration=readFileSync('sql/bipstart_category_images_20261016.sql','utf8');

test('colagem e upload ficam nas Configurações, e os cards de produtos e o editor voltam ao visual anterior',()=>{
 new vm.Script(panel,{filename:'public/cliente.js'});
 assert.match(panel,/data-category-image-paste/);
 assert.match(panel,/data-category-image-file/);
 assert.match(panel,/function categoryImagesSettings\(\)/);
 assert.match(panel,/categoryImageActions\(name\)/);
 assert.match(panel,/\(isMenu\?receiptSettingsPanel\(\)\+categoryImagesSettings\(\):''\)/);
 assert.doesNotMatch(panel.slice(panel.indexOf("function productCategoryCards(selected='all'){"),panel.indexOf("function productGrid(selected='all',stockMode='all'){")),/data-category-image|categoryThumbnail|categoryImageActions/);
 assert.doesNotMatch(panel.slice(panel.indexOf('function cardapioEditor(){'),panel.indexOf('function filteredPdvProducts(){')),/categoryThumbnail|categoryImageActions|data-category-image/);
 assert.match(panel,/async function saveCategoryImage\(name,file\)/);
 assert.match(panel,/if\(!proAccess\(\)\|\|!menuSchemaReady\)return ''/);
 assert.match(panel,/void saveCategoryImage\(categoryTarget\.dataset\.categoryImagePaste,file\)/);
 assert.match(panel,/void saveCategoryImage\(categoryFile\.dataset\.categoryImageFile,file\)/);
 assert.match(panel,/const file=pastedProductImage\|\|form\.querySelector\('input\[name=image\]'\)/);
 assert.match(panelCss,/\.category-image-thumb/);
 assert.match(panelCss,/\.category-image-actions/);
 assert.match(panelCss,/\.category-image-settings/);
 const start=panel.indexOf('function categoryKey(name){'),end=panel.indexOf("function productCategoryCards(selected='all'){",start);
 assert.ok(start>=0&&end>start);
 const settings=new Function('categories','products','shop','proAccess','menuSchemaReady','esc','imageUrl','normalizedProductCategory',
   panel.slice(start,end)+';return categoryImagesSettings;')(
   [{name:'Bebidas',image_path:'loja/bebidas.jpg'}],
   [{category:'Salgados',image_path:'loja/salgados.png'}],
   {model:'pdv'},()=>true,true,value=>String(value),path=>'https://img.test/'+path,
   item=>String(item.category||'Geral'));
 const settingsHtml=settings();
 assert.match(settingsHtml,/id="categoryImagesSettings"/);
 assert.match(settingsHtml,/data-category-image-paste="Bebidas"/);
 assert.match(settingsHtml,/data-category-image-file="Salgados"/);
 assert.match(settingsHtml,/loja\/bebidas\.jpg/);
 assert.match(settingsHtml,/loja\/salgados\.png/);
 assert.match(panel,/data-nav="configuracoes"/);
});

test('a foto da categoria tem prioridade; sem foto, usa a foto do produto ou o ícone',()=>{
 const from=publicMenu.indexOf('function categoryArtwork(name){');
 const to=publicMenu.indexOf('function applyBrand(){',from);
 assert.ok(from>=0&&to>from);
 const build=new Function('menu','products','fold','esc','imageUrl','categoryEmoji',
   publicMenu.slice(from,to)+';return categoryArtwork;');
 const make=(categories,products)=>build({categories},products,
  s=>String(s||'').toLocaleLowerCase('pt-BR'),s=>String(s),
  s=>'https://cdn.example/'+s,()=> '🥟');
 const withCustom=make([{name:'Bebidas',image_path:'lojista/categoria.png'}],
   [{name:'Água',category:'Bebidas',image_path:'lojista/produto.jpg'}]);
 assert.match(withCustom('Bebidas'),/categoria\.png/);
 assert.doesNotMatch(withCustom('Bebidas'),/produto\.jpg/);
 const fallback=make([],[{name:'Água',category:'Bebidas',image_path:'lojista/produto.jpg'}]);
 assert.match(fallback('Bebidas'),/produto\.jpg/);
 assert.match(make([],[])('Bebidas'),/category-art-emoji/);
});

test('a migração preserva a segurança e inclui somente imagem de categoria na RPC',()=>{
 assert.match(migration,/add column if not exists image_path text/);
 assert.match(migration,/image_path like \(shop_id::text \|\| '\/%'\)/);
 assert.match(migration,/create or replace function public\.bipstart_public_menu/);
 assert.match(migration,/'name',c\.name,'image_path',c\.image_path/);
 assert.match(migration,/e\.plan_code='pro'/);
 assert.match(migration,/p\.online_enabled=true/);
 assert.match(migration,/grant execute on function public\.bipstart_public_menu\(text\) to anon,authenticated/);
});
