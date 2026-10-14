import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync('public/cliente.js','utf8');
const css=readFileSync('public/cliente.css','utf8');
const html=readFileSync('public/cliente.html','utf8');
const publicMenu=readFileSync('public/vitrine.js','utf8');
const previousMenu=readFileSync('public/cardapio.js','utf8');
const sql=readFileSync('sql/bipstart_menu_price_20261014.sql','utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

function catalog(list){
 const begin=js.indexOf('function productStockState(product){');
 const end=js.indexOf('function categoryOptions(selected){',begin);
 assert.ok(begin>0&&end>begin);
 return new Function('products','esc','fmt','imageUrl','editBtn','empty',
   js.slice(begin,end)+';return {productCard,productGrid,productCategoryCards,filteredProductList};')(
   list,esc,n=>'R$ '+Number(n).toFixed(2),p=>'https://cdn.example/'+p,
   (kind,id)=>'<button data-edit="'+kind+'" data-id="'+esc(id)+'">Editar</button>',
   t=>'<p class="empty">'+esc(t)+'</p>');
}
const goods=[
 {id:'1',name:'Água 1L',category:'Bebidas',price:5,cost:2,stock:9,min_stock:5},
 {id:'2',name:'Refri',category:'Bebidas',price:10,cost:4,stock:0,min_stock:5,
  menu_price:12.5,menu_price_enabled:true,image_path:'store/refri.jpg'},
 {id:'3',name:'Coxinha',category:'Salgados',price:7,cost:3,stock:4,min_stock:5}
];

test('JS compila; categorias aparecem como cards com contagens e acessibilidade',()=>{
 new vm.Script(js,{filename:'public/cliente.js'});
 const c=catalog(goods);
 const markup=c.productCategoryCards();
 assert.match(markup,/data-category-filter="all" aria-pressed="true"/);
 assert.match(markup,/data-category-filter="Bebidas" aria-pressed="false"/);
 assert.match(markup,/data-category-filter="Salgados" aria-pressed="false"/);
 assert.match(markup,/2 produto\(s\)/);
 assert.match(markup,/3 produto\(s\)/);
 assert.match(c.productCategoryCards('Bebidas'),/data-category-filter="Bebidas" aria-pressed="true"/);
 assert.deepEqual(c.filteredProductList('Bebidas').map(x=>x.id),['1','2']);
 assert.deepEqual(c.filteredProductList('Salgados').map(x=>x.id),['3']);
});

test('filtrar categoria muda os cards visíveis sem alterar produtos cadastrados',()=>{
 const c=catalog(goods);
 const bebidas=c.productGrid('Bebidas');
 assert.match(bebidas,/Água 1L/);
 assert.match(bebidas,/Refri/);
 assert.doesNotMatch(bebidas,/Coxinha/);
 const salgados=c.productGrid('Salgados');
 assert.match(salgados,/Coxinha/);
 assert.doesNotMatch(salgados,/Refri/);
 assert.match(c.productGrid('Sem categoria'),/Nenhum produto encontrado nesta categoria/);
 assert.equal(goods.length,3);
 assert.match(js,/selectedCategoryFilter=category\.dataset\.categoryFilter\|\|'all'/);
 assert.match(js,/content\+=productCategoryCards\(selectedCategoryFilter\)/);
 assert.match(js,/content\+=productGrid\(selectedCategoryFilter\)/);
});
test('nomes das categorias são escapados para evitar HTML injetado',()=>{
 const c=catalog([{...goods[0],category:'<script>alert("teste")</script>'}]);
 const h=c.productCategoryCards();
 assert.doesNotMatch(h,/<script>/);
 assert.match(h,/&lt;script&gt;/);
});
test('cards compactos ficam cerca de 40% menores, com grade responsiva',()=>{
 assert.match(catalog(goods).productGrid('Bebidas'),/class="inventory-grid compact"/);
 assert.match(css,/\.inventory-grid\{[\s\S]*?minmax\(230px,1fr\)/);
 assert.match(css,/\.inventory-grid\.compact\{grid-template-columns:repeat\(auto-fill,minmax\(174px,1fr\)\)/);
 assert.match(css,/\.inventory-grid\.compact \.inventory-card-body\{padding:10px;gap:8px\}/);
 assert.match(css,/@media\(max-width:600px\)\{/);
 assert.match(css,/\.inventory-category-card:focus-visible/);
});

test('o preço diferente aparece nos cards do cadastro, preservando preço do PDV',()=>{
 const c=catalog(goods);
 const price=c.productCard(goods[1]);
 assert.match(price,/R\$ 10\.00/);
 assert.match(price,/Cardápio online: <strong>R\$ 12\.50<\/strong>/);
 assert.doesNotMatch(c.productCard(goods[0]),/Cardápio online:/);
});

function renderForm(tab,product={}){
 const begin=js.indexOf('function productForm(p){');
 const end=js.indexOf('function courierForm(c)',begin);
 assert.ok(begin>0&&end>begin);
 return new Function('tab','field','formShell','categoryOptions','esc',
    js.slice(begin,end)+';return productForm;')(
  tab,
  (name,label,_type,val)=>'<input name="'+name+'" value="'+esc(val)+'">',
  (_kind,_id,content)=>'<form id="productForm">'+content+'</form>',
  ()=>'<option>Geral</option>',esc)(product);
}
test('o formulário mantém preço do PDV e permite ativar preço online em ambos editores',()=>{
 for(const tab of ['produtos','cardapio']){
  const product=renderForm(tab,goods[1]);
  assert.match(product,/name="price" value="10"/);
  assert.match(product,/name="menu_price" value="12.5"/);
  assert.match(product,/name="menu_price_enabled" checked/);
  assert.match(product,/Usar preço diferente no cardápio online/);
 }
 assert.doesNotMatch(renderForm('produtos',goods[0]),/name="menu_price_enabled" checked/);
 assert.match(js,/menu_price_enabled:form\.querySelector\('input\[name="menu_price_enabled"\]'\)\.checked/);
 assert.match(js,/body\.menu_price_enabled&&body\.menu_price===null/);
 assert.match(js,/min_stock:Number\(v\.min_stock\)/);
 assert.match(html,/cliente\.js\?v=15/);
 assert.match(html,/cliente\.css\?v=9/);
});

test('RPC pública devolve preço efetivo sem expor custo ou estoque exato',()=>{
 assert.match(sql,/add column if not exists menu_price numeric\(12,2\)/);
 assert.match(sql,/add column if not exists menu_price_enabled boolean not null default false/);
 assert.match(sql,/check \(not menu_price_enabled or menu_price is not null\)/);
 assert.match(sql,/'price',case when p\.menu_price_enabled and p\.menu_price is not null then p\.menu_price else p\.price end/);
 assert.match(sql,/where p\.shop_id=s\.id and p\.active=true/);
 assert.match(sql,/where s\.slug=p_slug and s\.model='pdv'/);
 assert.match(sql,/revoke all on function public\.bipstart_public_menu\(text\) from public/);
 assert.doesNotMatch(sql,/'cost',p\.cost|'stock',p\.stock/);
 assert.doesNotMatch(sql,/update public\.shop_products set/i);
 // Frontends antigos e novos já leem a mesma propriedade price devolvida pela RPC.
 assert.match(publicMenu,/money\(item\.price\)/);
 assert.match(publicMenu,/Number\(fresh\.price\)!==oldPrices\.get\(id\)/);
 assert.match(previousMenu,/item\.price/);
 assert.match(js,/price:Number\(v\.price\)/);
 assert.match(js,/rpc\('bipstart_complete_sale'/);
});
