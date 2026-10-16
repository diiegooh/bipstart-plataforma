import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const client=readFileSync('public/cliente.js','utf8');
const html=readFileSync('public/cliente.html','utf8');
const css=readFileSync('public/cliente.css','utf8');
const server=readFileSync('server.mjs','utf8');

test('login mostra CARDÁPIO e PDV + CARDÁPIO antes de abrir a área administrativa',()=>{
 new vm.Script(client,{filename:'public/cliente.js'});
 assert.match(html,/id="modeChooser"/);
 assert.match(html,/data-open-mode="cardapio"/);
 assert.match(html,/data-open-mode="caixa"/);
 assert.match(html,/CARDÁPIO<\/strong>/);
 assert.match(html,/PDV \+ CARDÁPIO<\/strong>/);
 assert.match(html,/id="backToModes"/);
 assert.match(client,/hiding\('modeChooser',true\)/);
 assert.match(client,/hiding\('modeChooser',false\);hiding\('workspace',true\)/);
 assert.match(client,/if\(!shop\|\|!hasAccess\(\)\)return/);
 assert.match(client,/if\(mode\.dataset\.openMode==='cardapio'\)/);
 assert.match(client,/location\.assign\(publicShopUrl\(\)\)/);
 assert.match(client,/tab='caixa'/);
 assert.match(client,/function hideAll\(\)\{[^}]*'modeChooser'/);
});
test('CARDÁPIO reutiliza o mesmo endereço público e exibe prévia real do layout existente',()=>{
 assert.match(client,/return location\.origin\+'\/cardapio\?loja='\+encodeURIComponent\(shop\.slug\)/);
 assert.doesNotMatch(client,/class="menu-live-preview"|Prévia do seu cardápio|<iframe src=/);
 assert.doesNotMatch(client,/<iframe src=/);
 assert.match(client,/Abrir cardápio ↗/);
 assert.doesNotMatch(html,/id="sideOpenMenu"/);
 assert.match(server,/'\/cardapio':\s*\['vitrine\.html'/);
 assert.match(html,/\/cliente\.js\?v=31/);
 assert.match(html,/\/cliente\.css\?v=21/);
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
   pdvQuery:'',pdvCategory:'',pdvInStockOnly:true,pdvPayment:'pix',...props
 };
 const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 return new Function(
  'products','cart','pdvQuery','pdvCategory','pdvInStockOnly','pdvPayment','esc','fmt','imageUrl','publicShopUrl',
  source+';return {filteredPdvProducts,pdvProductCards,renderGodzillaPDV};'
 )(...[
  data.products,data.cart,data.pdvQuery,data.pdvCategory,data.pdvInStockOnly,data.pdvPayment,
  escapeHtml,n=>'R$ '+Number(n).toFixed(2),path=>'https://cdn.bipstart.example/'+path,
  ()=>'https://bipstart.example/cardapio?loja=loja-de-teste'
 ]);
}
test('PDV estilo Godzilla tem busca, categoria, grade de produtos e caixa lado a lado',()=>{
 const ui=pdv();
 const markup=ui.renderGodzillaPDV();
 assert.match(markup,/<div class="pdv-title"><h2>PDV<\/h2><\/div>/);
 assert.doesNotMatch(markup,/VENDA PRESENCIAL|Produtos, estoque e vendas integrados ao seu cardápio\./);
 for(const text of ['Produtos da loja','Venda atual','Forma de pagamento','Dinheiro','Pix','Cartão de crédito','Cartão de débito','Finalizar venda']){
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
test('checkout permanece no RPC seguro de BipStart, sem pagamentos automáticos',()=>{
 assert.match(client,/rpc\('bipstart_complete_sale',\{p_shop_id:shop\.id,p_items:cart\.map/);
 assert.match(client,/p_payment_method:v\.payment_method/);
 assert.match(client,/if\(v\.payment_method==='dinheiro'\)/);
 assert.match(client,/Informe um valor recebido suficiente/);
 assert.match(client,/não é cobrada nem registrada na venda/);
 assert.match(client,/shop_id:'eq\.'\+shop\.id/);
 assert.match(html,/Abrir cardápio/);
});

test('PDV e lateral não exibem Abrir cardápio, mas a opção inicial continua funcionando',()=>{
 assert.doesNotMatch(html,/id="sideOpenMenu"/);
 assert.doesNotMatch(client,/pdv-menu-link/);
 assert.doesNotMatch(pdv().renderGodzillaPDV(),/Abrir cardápio ↗/);
 assert.match(html,/data-open-mode="cardapio"/);
 assert.match(client,/location\.assign\(publicShopUrl\(\)\)/);
});
