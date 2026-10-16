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
  return new Function('tab','field','formShell','categoryOptions','esc','proAccess',
    client.slice(start,end)+';return productForm;')(
    tab,(name,label,type,value,extra='')=>'<input name="'+name+'" value="'+esc(value)+'" '+extra+'>',
    (_kind,_id,inside)=>'<form id="productForm">'+inside+'</form>',
    ()=>'<option>Geral</option>',esc,()=>true)(product());
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


test('Cadastro de produtos não tem descrição redundante nem parágrafo vazio',()=>{
 assert.doesNotMatch(client,/Cadastre produtos e acompanhe fotos, preços, quantidades e estoque mínimo na mesma tela\./);
 assert.match(client,/heading\('Cadastro de produtos','',/);
 assert.match(client,/subtitle\?'<p class="muted">'\+esc\(subtitle\)/);
});

test('quatro cards de resumo apresentam nomes acima de números e contagem correta de reposição',()=>{
 const start=client.indexOf('function stockSummaryCards(){');
 const end=client.indexOf('function productCard(product){',start);
 assert.ok(start>0&&end>start);
 const inventory=[
  product({id:'n',stock:13,min_stock:10}),
  product({id:'low',stock:4,min_stock:10}),
  product({id:'out',stock:0,min_stock:0}),
 ];
 const build=new Function('products','selectedStockPanel','productStockState','restockProducts',
  client.slice(start,end)+';return stockSummaryCards;');
 const all=build(inventory,'all',p=>({state:p.stock===0?'out':p.stock<=p.min_stock?'low':'ok'}),()=>inventory.slice(1))();
 for(const key of ['all','low','out','restock'])assert.match(all,new RegExp('data-stock-summary="'+key+'"'));
 assert.equal((all.match(/class="stock-summary-card/g)||[]).length,4);
 assert.match(all,/data-stock-summary="all" aria-pressed="true"[^>]*><span class="stock-summary-label">Produtos cadastrados<\/span><strong class="stock-summary-number">3<\/strong>/);
 assert.match(all,/data-stock-summary="low" aria-pressed="false"[^>]*><span class="stock-summary-label">Estoque baixo<\/span><strong class="stock-summary-number">1<\/strong>/);
 assert.match(all,/data-stock-summary="out" aria-pressed="false"[^>]*><span class="stock-summary-label">Sem estoque<\/span><strong class="stock-summary-number">1<\/strong>/);
 assert.match(all,/data-stock-summary="restock" aria-pressed="false" aria-expanded="false" aria-controls="restockDetails"[^>]*><span class="stock-summary-label">Reposição<\/span><strong class="stock-summary-number">2<\/strong>/);
 const open=build(inventory,'restock',p=>({state:p.stock===0?'out':p.stock<=p.min_stock?'low':'ok'}),()=>inventory.slice(1))();
 assert.match(open,/data-stock-summary="restock" aria-pressed="true" aria-expanded="true"/);
});
test('os filtros dos cards baixo e esgotado funcionam junto do filtro de categorias',()=>{
 const good=product({id:'normal',name:'Normal',stock:15});
 const low=product({id:'low',name:'Baixo',stock:5});
 const out=product({id:'out',name:'Zerado',stock:0});
 const render=cardSystem([good,low,out]);
 const baixa=render.productGrid('all','low');
 assert.match(baixa,/Baixo/);assert.doesNotMatch(baixa,/>Normal</);
 assert.doesNotMatch(baixa,/>Zerado</);
 const zeros=render.productGrid('all','out');
 assert.match(zeros,/Zerado/);assert.doesNotMatch(zeros,/>Baixo</);
 assert.match(render.productGrid('all','low'),/data-stock-state="low"/);
 assert.match(render.productGrid('all','out'),/data-stock-state="out"/);
 assert.match(client,/if\(selectedStockPanel==='restock'\)content\+=renderRestockList\(\)/);
 assert.match(client,/selectedStockPanel=selectedStockPanel===choice\?'':choice/);
});
test('seleções de estoque e categorias usam cor de destaque da loja, sem vermelho fixo',()=>{
 assert.match(css,/#workspace \.stock-summary-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/#workspace \.stock-summary-card\.active\{border-color:var\(--store-accent/);
 assert.match(css,/#workspace \.inventory-category-card\.active\{background:color-mix\(in srgb,var\(--store-accent/);
 assert.match(css,/#workspace \.inventory-category-card:focus-visible\{outline:3px solid var\(--store-accent/);
 assert.doesNotMatch(css,/#workspace \.inventory-category-card\.active\{background:linear-gradient\(100deg,#fe101e/);
 assert.match(css,/@media\(max-width:850px\)\{#workspace \.stock-summary-grid\{grid-template-columns:repeat\(2/);
});

test('categorias e produtos aparecem somente em Produtos cadastrados',()=>{
 const prefix="  }else if(tab==='produtos'){";
 const start=client.indexOf(prefix),end=client.indexOf("  }else if(tab==='pedidos'){",start);
 assert.ok(start>0&&end>start);
 const snippet=client.slice(start+prefix.length,end);
 const fn=new Function('selectedStockPanel','products','selectedCategoryFilter','heading',
  'stockSummaryCards','renderRestockList','productCategoryCards','productForm',
  'productGrid','normalizedProductCategory','showForm',
  "let content='';"+snippet+"return content;");
 const render=panel=>fn(panel,[],'all',()=>'<h1>Cadastro de produtos</h1>',
  ()=>'<stats></stats>',()=>'<section>Lista de reposição</section>',
  ()=>'<div>categorias</div>',()=>'<form>novo produto</form>',
  ()=>'<div>produtos</div>',product=>product.category,null);
 const initial=render('');
 assert.match(initial,/<stats>/);
 assert.doesNotMatch(initial,/categorias|<div>produtos<\/div>|Lista de reposição/);
 const listed=render('all');
 assert.match(listed,/categorias/);
 assert.match(listed,/<div>produtos<\/div>/);
 assert.doesNotMatch(listed,/Lista de reposição/);
 for(const panel of ['low','out']){
  const view=render(panel);
  assert.match(view,/<stats>/);
  assert.doesNotMatch(view,/categorias|<div>produtos<\/div>|Lista de reposição/);
 }
 const toRestock=render('restock');
 assert.match(toRestock,/Lista de reposição/);
 assert.doesNotMatch(toRestock,/categorias|<div>produtos<\/div>/);
 assert.match(client,/selectedStockPanel='';/);
});
test('Novo produto abre cadastro mesmo com a lista recolhida',()=>{
 assert.match(client,/if\(tab==='produtos'&&add\.dataset\.new==='product'\)selectedStockPanel='all'/);
 assert.match(client,/if\(tab==='produtos'\)selectedStockPanel='';showForm=null/);
 assert.match(client,/selectedStockPanel=selectedStockPanel===choice\?'':choice/);
});
