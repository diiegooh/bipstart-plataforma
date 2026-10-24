import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const client=readFileSync('public/cliente.js','utf8');
const html=readFileSync('public/cliente.html','utf8');
const css=readFileSync('public/cliente.css','utf8');
const server=readFileSync('server.mjs','utf8');

// Exercita o renderizador real, isolando apenas dependências de navegador/Supabase.
function pdv(props={}){
 const start=client.indexOf('function filteredPdvProducts(){');
 const end=client.indexOf('function updatePdvEstimates(){',start);
 assert.ok(start>=0 && end>start,'Funções de renderização do PDV acessíveis');
 const data={
  products:[
   {id:'a',name:'Coxinha especial',category:'Salgados',price:15,stock:5,active:true,is_best_seller:true},
   {id:'b',name:'Coca-Cola 350 ml',category:'Bebidas',price:6,stock:0,active:true,is_best_seller:true},
   {id:'c',name:'Café',category:'Bebidas',price:4,stock:8,active:true,is_best_seller:false},
  ],
  cart:[],
  pdvQuery:'',pdvCategory:'',pdvInStockOnly:true,pdvShowBestSellers:false,
  pdvPayment:'pix',pdvCardFeePercent:'3.99',pdvCheckoutOpen:false,
  pdvQuantityEntryProductId:null,floating:false,...props
 };
 const escaped=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const build=new Function('products','cart','pdvQuery','pdvCategory','pdvInStockOnly',
  'pdvShowBestSellers','pdvPayment','pdvCardFeePercent','pdvCheckoutOpen',
  'pdvQuantityEntryProductId','floatingSaleEnabled','productCategoryStyle','esc','fmt','imageUrl',
  client.slice(start,end)+';return {filteredPdvProducts,pdvProductCards,renderGodzillaPDV,selectPdvPayment,currentPayment:()=>pdvPayment};');
 return build(data.products,data.cart,data.pdvQuery,data.pdvCategory,data.pdvInStockOnly,
  data.pdvShowBestSellers,data.pdvPayment,data.pdvCardFeePercent,data.pdvCheckoutOpen,
  data.pdvQuantityEntryProductId,()=>data.floating,()=>({icon:'★',color:'#fff',text:'#222'}),
  escaped,n=>'R$ '+Number(n).toFixed(2),p=>'/images/'+p);
}

test('cliente abre o PDV sem tela de escolha intermediária',()=>{
 new vm.Script(client,{filename:'cliente.js'});
 assert.doesNotMatch(html,/id="modeChooser"|id="backToModes"/);
 assert.match(client,/tab='caixa';showForm=null;pastedProductImage=null/);
 assert.match(server,/'\/cardapio':\s*\['vitrine\.html'/);
});
test('assets versionados carregam o JS e CSS atuais sem exigir versão histórica',()=>{
 for(const asset of ['cliente.js','cliente.css']){
  assert.match(html,new RegExp('/'+asset.replace('.','\\.')+'\\?v=\\d+'));
 }
});
test('PDV exibe categorias, produtos e caixa sem painel duplicado Mais vendidos',()=>{
 const rendered=pdv().renderGodzillaPDV();
 for(const label of ['Produtos da loja','Venda atual','Forma de pagamento','Dinheiro','Cartão','Pix','Finalizar venda']){
  assert.ok(rendered.includes(label),label);
 }
 assert.match(rendered,/class="pdv-two-panels"/);
 assert.match(rendered,/id="pdvSearch"/);
 assert.match(rendered,/id="pdvProducts"/);
 assert.match(rendered,/data-pdv-best-sellers/);
 assert.doesNotMatch(rendered,/class="pdv-best-sellers"|data-best-seller-picker/);
});
test('filtros por categoria, busca e estoque mantêm produtos da própria lista',()=>{
 assert.deepEqual(pdv().filteredPdvProducts().map(x=>x.id),['a','c']);
 assert.deepEqual(pdv({pdvCategory:'Bebidas'}).filteredPdvProducts().map(x=>x.id),['c']);
 assert.deepEqual(pdv({pdvCategory:'Bebidas',pdvInStockOnly:false}).filteredPdvProducts().map(x=>x.id),['b','c']);
 assert.deepEqual(pdv({pdvQuery:'Café'}).filteredPdvProducts().map(x=>x.id),['c']);
 assert.doesNotMatch(pdv({pdvCategory:'Bebidas'}).pdvProductCards(),/Coxinha especial/);
});
test('Mais vendidos filtra a lista de produtos em vez de criar painel fixo',()=>{
 const products=[
  {id:'a',name:'Bebida A',category:'Bebidas',price:8,stock:5,active:true,is_best_seller:true},
  {id:'b',name:'Sem estoque',category:'Bebidas',price:6,stock:0,active:true,is_best_seller:true},
  {id:'c',name:'Não destacado',category:'Lanches',price:3,stock:5,active:true,is_best_seller:false},
  {id:'d',name:'Inativo',category:'Lanches',price:4,stock:7,active:false,is_best_seller:true},
  {id:'e',name:'Item <script>',category:'Lanches',price:11,stock:3,active:true,is_best_seller:true}
 ];
 const selected=pdv({products,pdvShowBestSellers:true,cart:[]});
 assert.deepEqual(selected.filteredPdvProducts().map(x=>x.id),['a','e']);
 const grid=selected.pdvProductCards();
 assert.match(grid,/Bebida A/);
 assert.match(grid,/Item &lt;script&gt;/);
 assert.doesNotMatch(grid,/Não destacado|<script>/);
 const page=selected.renderGodzillaPDV();
 assert.match(page,/data-pdv-best-sellers aria-pressed="true"/);
 assert.match(page,/<strong>Mais vendidos<\/strong><\/div><div id="pdvProducts"/);
 assert.doesNotMatch(page,/pdv-best-sellers-list/);
 assert.match(client,/pdvShowBestSellers=false;pdvCategory=categoryTile/);
});
test('venda usa seleção separada para cartão, dinheiro e Pix',()=>{
 const sample=pdv();
 assert.equal(sample.selectPdvPayment('cartao'),true);
 assert.equal(sample.currentPayment(),'credito');
 assert.equal(sample.selectPdvPayment('debito'),true);
 assert.equal(sample.currentPayment(),'debito');
 assert.equal(sample.selectPdvPayment('pix'),true);
 assert.equal(sample.currentPayment(),'pix');
 assert.equal(sample.selectPdvPayment('inválido'),false);
 const checkout=pdv({pdvPayment:'credito',pdvCardFeePercent:'2.5'}).renderGodzillaPDV();
 assert.match(checkout,/data-payment-option="cartao"/);
 assert.match(checkout,/data-card-method="credito"/);
 assert.match(checkout,/name="card_fee_percent"/);
 assert.match(checkout,/Taxa da maquininha/);
 assert.match(client,/rpc\('bipstart_complete_sale'/);
});
test('botão de venda flutuante expande catálogo e preserva o checkout',()=>{
 const view=pdv({floating:true}).renderGodzillaPDV();
 assert.match(view,/godzilla-pdv pdv-floating-layout/);
 assert.match(view,/class="pdv-floating-sale-button"/);
 assert.match(view,/class="pdv-panel pdv-sale-panel pdv-sale-panel-floating"/);
 assert.match(css,/pdv-floating-layout[\s\S]*pdv-products/);
 assert.match(css,/pdv-product-wrap/);
});
test('cards de categoria quebram linhas entre palavras sem cortar a palavra ao meio',()=>{
 assert.match(client,/name\.style\.setProperty\('word-break','normal','important'\)/);
 assert.match(client,/name\.style\.setProperty\('overflow-wrap','normal','important'\)/);
 assert.match(client,/for\(const size of \[30,28,26,24,22,20,18,16,14,12\]\)/);
 assert.match(css,/PDV: categorias de mesma altura e quebra de linha apenas entre palavras/);
});
