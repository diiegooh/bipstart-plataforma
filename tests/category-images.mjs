import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const panel=readFileSync('public/cliente.js','utf8');
const panelCss=readFileSync('public/cliente.css','utf8');
const publicMenu=readFileSync('public/vitrine.js','utf8');
const migration=readFileSync('sql/bipstart_category_images_20261016.sql','utf8');

test('colagem e escolha de arquivo estão disponíveis nas categorias, sem alterar o cadastro dos produtos',()=>{
 new vm.Script(panel,{filename:'public/cliente.js'});
 assert.match(panel,/data-category-image-paste/);
 assert.match(panel,/data-category-image-file/);
 assert.match(panel,/categoryImageActions\(name\)/);
 assert.match(panel,/categoryImageActions\(cat\.name\)/);
 assert.match(panel,/async function saveCategoryImage\(name,file\)/);
 assert.match(panel,/if\(!proAccess\(\)\|\|!menuSchemaReady\)return ''/);
 assert.match(panel,/void saveCategoryImage\(categoryTarget\.dataset\.categoryImagePaste,file\)/);
 assert.match(panel,/void saveCategoryImage\(categoryFile\.dataset\.categoryImageFile,file\)/);
 assert.match(panel,/const file=pastedProductImage\|\|form\.querySelector\('input\[name=image\]'\)/);
 assert.match(panelCss,/\.category-image-thumb/);
 assert.match(panelCss,/\.category-image-actions/);
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
