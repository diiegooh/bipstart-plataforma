import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const client=readFileSync('public/cliente.js','utf8');
const css=readFileSync('public/cliente.css','utf8');
const sql=readFileSync('sql/bipstart_product_min_stock_20261014.sql','utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>'R$ '+Number(value||0).toFixed(2);

function cardSystem(items){
 const start=client.indexOf('function productStockState(product){');
 const end=client.indexOf('function categoryOptions(selected){',start);
 assert.ok(start>0&&end>start);
 return new Function('products','esc','fmt','imageUrl','editBtn','empty',
   client.slice(start,end)+';return {productStockState,productCard,productGrid};')(
    items,esc,fmt,path=>'https://cdn.example/'+path,
    (kind,id)=>'<button data-edit="'+kind+'" data-id="'+esc(id)+'">Editar</button>',
    message=>'<p>'+esc(message)+'</p>');
}
const product=(overrides={})=>({
 id:'abc',name:'Askóv',category:'Bebidas',price:14.90,cost:8,stock:13,min_stock:10,
 image_path:'loja/foto.webp',...overrides
});

test('o estado usa mínimo por produto e diferencia normal, baixo e esgotado',()=>{
 new vm.Script(client,{filename:'public/cliente.js'});
 const {productStockState}=cardSystem([]);
 assert.equal(productStockState(product()).label,'Estoque normal');
 assert.equal(productStockState(product({stock:10})).label,'Estoque baixo');
 assert.equal(productStockState(product({stock:3})).state,'low');
 assert.equal(productStockState(product({stock:0})).label,'Sem estoque');
 assert.equal(productStockState(product({stock:1,min_stock:0})).state,'ok');
 assert.equal(productStockState(product({stock:6,min_stock:5})).state,'ok');
 assert.equal(productStockState(product({stock:5,min_stock:5})).state,'low');
});

test('Produtos exibe cards com foto e informações de estoque',()=>{
 const {productCard,productGrid}=cardSystem([product()]);
 const html=productCard(product());
 assert.match(html,/class="inventory-card"/);
 assert.match(html,/class="inventory-photo"/);
 assert.match(html,/https:\/\/cdn\.example\/loja\/foto\.webp/);
 assert.match(html,/Askóv/);
 assert.match(html,/Bebidas/);
 assert.match(html,/R\$ 14\.90/);
 assert.match(html,/Custo: R\$ 8\.00/);
 assert.match(html,/Atual: <strong>13 un<\/strong>/);
 assert.match(html,/Mínimo: <strong>10 un<\/strong>/);
 assert.match(html,/Estoque normal/);
 assert.match(html,/data-edit="product" data-id="abc"/);
 assert.match(productGrid(),/inventory-grid/);
 assert.match(css,/\.inventory-grid\{/);
 assert.match(css,/\.inventory-photo-wrap\{/);
});

test('cards exibem foto de substituição e protegem contra HTML malicioso',()=>{
 const {productCard}=cardSystem([]);
 const html=productCard(product({name:'<script>alert(1)</script>',image_path:null,stock:0}));
 assert.match(html,/Produto sem foto/);
 assert.match(html,/Sem estoque/);
 assert.match(html,/data-stock-state="out"/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;/);
});

test('formulário em Produtos preserva estoque mínimo; Cardápio não altera saldo',()=>{
 const start=client.indexOf('function productForm(p){');
 const end=client.indexOf('function courierForm(c)',start);
 assert.ok(start>0&&end>start);
 function renderForm(tab){
  return new Function('tab','field','formShell','categoryOptions','esc',
    client.slice(start,end)+';return productForm;')(
    tab,(name,label,type,value,extra='')=>'<input name="'+name+'" value="'+esc(value)+'" '+extra+'>',
    (_kind,_id,inside)=>'<form id="productForm">'+inside+'</form>',
    ()=>'<option>Geral</option>',esc)(product());
 }
 const html=renderForm('produtos');
 assert.match(html,/name="min_stock" value="10"/);
 assert.match(html,/name="stock" value="13"/);
 assert.match(html,/name="image"/);
 assert.doesNotMatch(renderForm('cardapio'),/name="min_stock"/);
 assert.match(client,/cost:Number\(v\.cost\),stock:Number\(v\.stock\),min_stock:Number\(v\.min_stock\)/);
 assert.match(client,/!Number\.isInteger\(body\.min_stock\)\|\|body\.min_stock<0/);
});

test('aba Produtos reúne cards e avisos de estoque mínimo individual',()=>{
 assert.match(client,/tab==='produtos'/);
 assert.doesNotMatch(client,/tab==='estoque'/);
 assert.match(client,/content\+=productGrid\(selectedCategoryFilter\)/);
 assert.match(client,/products\.filter\(p=>productStockState\(p\)\.state==='low'\)/);
 assert.match(client,/products\.filter\(p=>productStockState\(p\)\.state==='out'\)/);
 assert.match(client,/document\.getElementById\('productForm'\)\?\.scrollIntoView/);
 assert.match(css,/@media\(max-width:380px\)/);
});

test('migration adiciona mínimo com padrão 5 e restrição, sem modificar estoque cadastrado',()=>{
 assert.match(sql,/alter table public\.shop_products/);
 assert.match(sql,/add column if not exists min_stock integer not null default 5/);
 assert.match(sql,/check \(min_stock between 0 and 999999999\)/);
 assert.doesNotMatch(sql,/\bupdate\s+public\.shop_products\s+set\b/i);
 assert.doesNotMatch(sql,/\bdelete\s+from\s+public\.shop_products\b/i);
 assert.doesNotMatch(sql,/\bdrop\s+table\b/i);
});
