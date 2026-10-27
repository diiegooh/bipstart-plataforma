import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const client=readFileSync('public/cliente.js','utf8');
const html=readFileSync('public/cliente.html','utf8');
const css=readFileSync('public/cliente.css','utf8');
const server=readFileSync('server.mjs','utf8');

test('login abre diretamente o PDV e não mostra escolha de cardápio ou botão voltar',()=>{
 new vm.Script(client,{filename:'public/cliente.js'});
 assert.doesNotMatch(html,/id="modeChooser"|data-open-mode="cardapio"|data-open-mode="caixa"|id="backToModes"/);
 assert.doesNotMatch(client,/modeChooser|backToModes|modeCardapio/);
 assert.match(client,/async function openShop\(\)/);
 assert.match(client,/tab='caixa';showForm=null;pastedProductImage=null/);
 assert.match(client,/hiding\('workspace',true\);renderPage\(\)/);
 assert.match(client,/if\(!hasAccess\(\)\)\{hiding\('accessGate',true\);renderAccessGate\(\);return\}/);
});
test('CARDÁPIO reutiliza o mesmo endereço público e exibe prévia real do layout existente',()=>{
 assert.match(client,/return location\.origin\+'\/cardapio\?loja='\+encodeURIComponent\(shop\.slug\)/);
 assert.doesNotMatch(client,/class="menu-live-preview"|Prévia do seu cardápio|<iframe src=/);
 assert.doesNotMatch(client,/<iframe src=/);
 assert.match(client,/data-public-menu-link/);
 assert.doesNotMatch(html,/id="sideOpenMenu"/);
 assert.match(server,/'\/cardapio':\s*\['vitrine\.html'/);
 assert.match(html,/\/cliente\.js\?v=68/);
 assert.match(html,/\/cliente\.css\?v=44/);
});
function pdv(props={}){
 const source=client.slice(client.indexOf('function filteredPdvProducts(){'),client.indexOf('function renderPage(){'));
 assert.ok(source.startsWith('function filteredPdvProducts()'));
 const data={
   products:[
    {id:'a',name:'Coxinha especial',category:'Salgados',price:15,stock:5,active:true,image_path:null},
    {id:'b',name:'Coca-Cola 350 ml',category:'Bebidas',price:6,stock:0,active:true,image_path:null},
    {id:'c',name:'Café',category:'Bebidas',price:4,stock:8,active:true,image_path:null}
   ],
   cart:[{id:'a',name:'Coxinha especial',price:15,qty:2}],
   pdvQuery:'',pdvCategory:'',pdvInStockOnly:true,pdvShowBestSellers:false,pdvPayment:'pix',pdvCardFeePercent:'3.99',...props
 };
 const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 return new Function(
  'products','cart','pdvQuery','pdvCategory','pdvInStockOnly','pdvShowBestSellers','pdvPayment','pdvCardFeePercent','esc','fmt','imageUrl','publicShopUrl',
  source+';return {filteredPdvProducts,pdvProductCards,renderGodzillaPDV,selectPdvPayment,currentPayment:()=>pdvPayment};'
 )(...[
  data.products,data.cart,data.pdvQuery,data.pdvCategory,data.pdvInStockOnly,data.pdvShowBestSellers,data.pdvPayment,data.pdvCardFeePercent,
  escapeHtml,n=>'R$ '+Number(n).toFixed(2),path=>'https://cdn.bipstart.example/'+path,
  ()=>'https://bipstart.example/cardapio?loja=loja-de-teste'
 ]);
}
test('PDV estilo Godzilla tem busca, categoria, grade de produtos e caixa lado a lado',()=>{
 const ui=pdv();
 const markup=ui.renderGodzillaPDV();
 assert.match(markup,/<div class="pdv-title"><h2>PDV<\/h2><\/div>/);
 assert.doesNotMatch(markup,/VENDA PRESENCIAL|Produtos, estoque e vendas integrados ao seu cardápio\./);
 for(const text of ['Produtos da loja','Venda atual','Forma de pagamento','Dinheiro','Cartão','Pix','Crédito','Débito','Finalizar venda']){
  assert.ok(markup.includes(text),text);
 }
 assert.match(markup,/class="pdv-two-panels"/);
 assert.match(markup,/class="pdv-panel pdv-catalog"/);
 assert.match(markup,/class="pdv-panel pdv-sale-panel"/);
 assert.match(markup,/id="pdvSearch"/);
 assert.match(markup,/id="pdvCategory"/);
 assert.match(markup,/id="pdvProducts"/);
 assert.match(markup,/data-cart="a"/);
 assert.match(markup,/data-qty-less="a"/);
 assert.match(markup,/data-remove="a"/);
 assert.doesNotMatch(markup,/pdv-menu-link|Abrir cardápio ↗/);
 assert.doesNotMatch(markup,/godzilla-adega|\/delivery/i);
 assert.match(css,/\.pdv-two-panels\{display:grid/);
 assert.match(css,/\.pdv-sale-panel\{position:sticky/);
});
test('busca de PDV e categorias filtram com estoque sem misturar produto',()=>{
 assert.deepEqual(pdv().filteredPdvProducts().map(p=>p.id),['a','c']);
 assert.deepEqual(pdv({pdvQuery:'cafe'}).filteredPdvProducts().map(p=>p.id),[]);
 assert.deepEqual(pdv({pdvQuery:'Café'}).filteredPdvProducts().map(p=>p.id),['c']);
 assert.deepEqual(pdv({pdvCategory:'Salgados'}).filteredPdvProducts().map(p=>p.id),['a']);
 assert.deepEqual(pdv({pdvCategory:'Bebidas',pdvInStockOnly:false}).filteredPdvProducts().map(p=>p.id),['b','c']);
 const markup=pdv({pdvCategory:'Bebidas'}).pdvProductCards();
 assert.doesNotMatch(markup,/Coxinha/);
 assert.match(markup,/Café/);
});
test('Mais vendidos é filtro de categoria, respeita estoque, destaque e escape de HTML',()=>{
 const products=[
  {id:'a',name:'Bebida A',category:'Bebidas',price:8,stock:5,active:true,is_best_seller:true},
  {id:'b',name:'Bebida B',category:'Bebidas',price:6,stock:0,active:true,is_best_seller:true},
  {id:'c',name:'Não destacado',category:'Lanches',price:3,stock:5,active:true,is_best_seller:false},
  {id:'d',name:'Inativo',category:'Lanches',price:4,stock:7,active:false,is_best_seller:true},
  {id:'e',name:'Item <script>',category:'Lanches',price:11,stock:3,active:true,is_best_seller:true}
 ];
 const instance=pdv({products,cart:[],pdvShowBestSellers:true,pdvCategory:'Lanches'});
 assert.deepEqual(instance.filteredPdvProducts().map(p=>p.id),['a','e']);
 const page=instance.renderGodzillaPDV();
 assert.match(page,/data-pdv-best-sellers aria-pressed="true"/);
 assert.match(page,/Mais vendidos/);
 assert.match(page,/id="pdvProducts"/);
 assert.doesNotMatch(page,/class="pdv-best-sellers"/);
 const cards=instance.pdvProductCards();
 assert.match(cards,/data-cart="a"/);
 assert.match(cards,/data-cart="e"/);
 assert.doesNotMatch(cards,/data-cart="b"|data-cart="c"|data-cart="d"/);
 assert.match(cards,/Item &lt;script&gt;/);
 assert.doesNotMatch(cards,/<script>/);
 assert.deepEqual(pdv({products,pdvShowBestSellers:true,pdvInStockOnly:false}).filteredPdvProducts().map(p=>p.id),['a','b','e']);
 const soldOut=pdv({products,pdvShowBestSellers:true,pdvInStockOnly:false}).pdvProductCards();
 assert.match(soldOut,/data-cart="b" disabled/);
 const full=pdv({products,pdvShowBestSellers:true,cart:[{id:'a',name:'Bebida A',qty:5,price:8}]}).pdvProductCards();
 assert.match(full,/data-cart="a" disabled/);
 assert.deepEqual(pdv({products:products.map(p=>({...p,is_best_seller:false})),pdvShowBestSellers:true}).filteredPdvProducts(),[]);
 assert.ok(client.includes("closest('[data-pdv-best-sellers]')"));
 assert.match(client,/pdvShowBestSellers=!pdvShowBestSellers/);
 assert.match(client,/pdvShowBestSellers=false;pdvCategory=categoryTile\.dataset\.pdvCategory/);
});

test('caixa oferece Dinheiro, Cartão e Pix com botoes lado a lado e mantém crédito/débito no banco',()=>{
 const examples=[
  {code:'pix',active:'pix',cash:'hidden',card:'hidden'},
  {code:'dinheiro',active:'dinheiro',cash:'visible',card:'hidden'},
  {code:'credito',active:'cartao',cash:'hidden',card:'visible'},
  {code:'debito',active:'cartao',cash:'hidden',card:'visible'}
 ];
 for(const item of examples){
  const sample=pdv({pdvPayment:item.code});
  const markup=sample.renderGodzillaPDV();
  const selectors=markup.slice(markup.indexOf('<form id="saleForm"'),markup.indexOf('id="pdvCashFields"'));
  for(const key of ['dinheiro','cartao','pix'])assert.match(selectors,new RegExp('data-payment-option="'+key+'"'));
  assert.doesNotMatch(selectors,/<select name="payment_method"/);
  assert.match(selectors,new RegExp('data-payment-option="'+item.active+'" aria-pressed="true"'));
  assert.match(markup,new RegExp('name="payment_method" id="pdvPaymentMethod" value="'+item.code+'"'));
  assert.match(markup,new RegExp('id="pdvCashFields" class="'+(item.cash==='hidden'?'hidden':'')+'"'));
  assert.match(markup,new RegExp('id="pdvCardFields" class="'+(item.card==='hidden'?'hidden':'')+'"'));
  assert.match(markup,/data-card-method="credito"/);
  assert.match(markup,/data-card-method="debito"/);
  assert.match(markup,/Taxa da maquininha/);
 }
 assert.equal(pdv({pdvPayment:'pix'}).selectPdvPayment('cartao'),true);
 const select=pdv({pdvPayment:'pix'});
 select.selectPdvPayment('cartao');
 assert.equal(select.currentPayment(),'credito');
 select.selectPdvPayment('debito');
 assert.equal(select.currentPayment(),'debito');
 select.selectPdvPayment('cartao');
 assert.equal(select.currentPayment(),'debito');
 select.selectPdvPayment('dinheiro');
 assert.equal(select.currentPayment(),'dinheiro');
 select.selectPdvPayment('pix');
 assert.equal(select.currentPayment(),'pix');
 assert.equal(select.selectPdvPayment('invalido'),false);
 assert.equal(select.currentPayment(),'pix');
 assert.match(css,/#workspace \.pdv-payment-options\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(client,/if\(tab==='caixa'&&selectPdvPayment\(paymentButton\.dataset\.paymentOption\)\)renderPage\(\)/);
 assert.match(client,/selectPdvPayment\(cardKindButton\.dataset\.cardMethod\)/);
 assert.match(client,/p_payment_method:v\.payment_method/);
 assert.doesNotMatch(client,/if\(e\.target\.id==='pdvPaymentMethod'\)/);
});

test('checkout permanece no RPC seguro de BipStart, sem pagamentos automáticos',()=>{
 assert.match(client,/rpc\('bipstart_complete_sale',\{p_shop_id:shop\.id,p_items:cart\.map/);
 assert.match(client,/p_payment_method:v\.payment_method/);
 assert.match(client,/if\(v\.payment_method==='dinheiro'\)/);
 assert.match(client,/Informe um valor recebido suficiente/);
 assert.match(client,/Taxa registrada na venda e descontada do lucro no relatório/);
 assert.match(client,/p_card_fee_percent:feePercent/);
 assert.match(client,/Informe uma taxa da maquininha válida/);
 const markup=pdv({pdvPayment:'credito',pdvCardFeePercent:'2.5'}).renderGodzillaPDV();
 assert.match(markup,/name="card_fee_percent"[^>]*value="2.5"/);
 assert.match(markup,/Desconto da maquininha/);
 assert.match(markup,/Líquido estimado/);
 assert.match(client,/shop_id:'eq\.'\+shop\.id/);
 assert.doesNotMatch(html,/id="modeChooser"/);
});

test('PDV e lateral mantêm links de cardápio apenas onde permitido, sem tela de escolhas',()=>{
 assert.doesNotMatch(html,/id="sideOpenMenu"/);
 assert.doesNotMatch(client,/pdv-menu-link/);
 assert.doesNotMatch(pdv().renderGodzillaPDV(),/Abrir cardápio ↗/);
 assert.doesNotMatch(html,/data-open-mode="cardapio"/);
 assert.match(client,/data-public-menu-link/);
});
