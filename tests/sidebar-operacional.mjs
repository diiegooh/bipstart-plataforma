import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('public/cliente.html','utf8');
const css=readFileSync('public/cliente.css','utf8');
const js=readFileSync('public/cliente.js','utf8');

test('sidebar tem identidade da loja, engrenagem e os três botões do rodapé',()=>{
 new vm.Script(js,{filename:'public/cliente.js'});
 for(const id of ['sidebar','sideShopLogo','sideShopName','sideSettings','sideColor','sideOpenMenu','sideLogout','sideToggle','sideBackdrop']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 assert.match(html,/Central de operação/);
 assert.match(html,/Alterar cor/);
 assert.match(html,/Abrir cardápio/);
 assert.match(html,/Sair/);
 assert.match(html,/cliente\.js\?v=12/);
 assert.match(html,/cliente\.css\?v=7/);
});

test('coluna mostra exatamente as seis opções na ordem da referência Godzilla',()=>{
 const start=js.indexOf('function operationalMenuItems(){');
 const end=js.indexOf('function renderNav(){',start);
 assert.ok(start>=0&&end>start);
 const items=new Function(js.slice(start,end)+';return operationalMenuItems();')();
 assert.deepEqual(items.map(x=>x[1]),['PDV','Produtos','Estoque','Pedidos online','Motoboys','Vendas']);
 assert.deepEqual(items.map(x=>x[0]),['caixa','produtos','estoque','pedidos','motoboys','vendas']);
 assert.match(css,/#workspace \.side #nav nav button\.active\{background:linear-gradient\(100deg,#fc0816,#f51b20\)/);
});

function mockNav(premium,tab='caixa'){
 const nodes=new Map();
 function node(id){
  if(!nodes.has(id))nodes.set(id,{
   innerHTML:'',textContent:'',src:'',alt:'',href:'',
   classList:{toggle(){}}
  });
  return nodes.get(id);
 }
 const start=js.indexOf('function operationalMenuItems(){');
 const end=js.indexOf('function heading(',start);
 assert.ok(start>=0&&end>start);
 const create=new Function('$','esc','tab','shop','proAccess','canCustomize','imageUrl','publicShopUrl',
  js.slice(start,end)+';return renderNav;');
 const render=create(node,x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  tab,{name:'Adega <Teste>',logo_path:'loja-id/logo.png'},()=>premium,()=>premium,
  path=>'https://images.example/'+path,()=>'https://bipstart.example/cardapio?loja=adega-teste');
 render();
 return {node};
}
test('sidebar marca PDV ativo, usa logo da loja Premium e protege opções do Básico',()=>{
 const basic=mockNav(false);
 assert.match(basic.node('nav').innerHTML,/data-nav="caixa" class="active" aria-current="page"/);
 assert.match(basic.node('nav').innerHTML,/data-nav="motoboys" class="locked"/);
 assert.match(basic.node('nav').innerHTML,/Premium/);
 assert.equal(basic.node('sideShopLogo').src,'/bipstart-marca-icon.png');
 assert.equal(basic.node('sideShopName').textContent,'Adega <Teste>');
 assert.equal(basic.node('sideOpenMenu').href,'https://bipstart.example/cardapio?loja=adega-teste');
 const premium=mockNav(true);
 assert.match(premium.node('nav').innerHTML,/data-nav="motoboys" class=""/);
 assert.equal(premium.node('sideShopLogo').src,'https://images.example/loja-id/logo.png');
 const deliveries=mockNav(true,'entregas');
 assert.match(deliveries.node('nav').innerHTML,/data-nav="motoboys" class="active" aria-current="page"/);
});

test('Estoque mantém controle real e atalhos respeitam acesso ao Premium',()=>{
 assert.match(js,/a\.push\(\['estoque','Estoque'\],\['pedidos','Pedidos online'\]\)/);
 assert.match(js,/tab==='estoque'/);
 assert.match(js,/products\.filter\(p=>productStockState\(p\)\.state==='low'\)/);
 assert.match(js,/products\.filter\(p=>productStockState\(p\)\.state==='out'\)/);
 assert.match(js,/data-nav="entregas">Fila de entregas/);
 assert.match(js,/if\(nav\.dataset\.nav==='motoboys'&&!proAccess\(\)\)/);
 assert.match(js,/if\(!canCustomize\(\)\)return msg\('Alterar a cor do cardápio está disponível somente no plano Premium\.'/);
 assert.match(js,/if\(e\.target\.closest\('#sideLogout'\)\)\{closeSideMenu\(\);\$\('logout'\)\.click\(\);return\}/);
});

function menuNavigation(shop={slug:'adega-centro'},access=true){
 const result={urls:[],messages:[],closed:0,rendered:0};
 let click;
 const context=vm.createContext({
  shop,tab:'caixa',showForm:{kind:'product'},pastedProductImage:{},
  document:{addEventListener(type,handler){assert.equal(type,'click');click=handler;}},
  location:{origin:'https://bipstart.example',assign(url){result.urls.push(url);}},
  hasAccess:()=>access,
  msg:(message,error)=>result.messages.push({message,error}),
  closeSideMenu:()=>result.closed++,
  renderPage:()=>result.rendered++,
  proAccess:()=>false,
  pages:()=>[['caixa','PDV'],['produtos','Produtos'],['pedidos','Pedidos online']]
 });
 const helpers=js.slice(js.indexOf('function publicShopUrl(){'),js.indexOf('function shareTitle(){'));
 const handler=js.slice(js.indexOf("document.addEventListener('click',async e=>{"),js.indexOf('// Validação instantânea'));
 vm.runInContext(helpers+handler,context);
 return {
  result,context,
  clickNav(id){return click({target:{closest:selector=>selector==='[data-nav]'?{dataset:{nav:id}}:null}});},
  clickMode(){return click({target:{closest:selector=>selector==='[data-open-mode]'?{dataset:{openMode:'cardapio'}}:null}});}
 };
}

test('Pedidos online abre diretamente o cardápio da loja e fecha a navegação mobile',async()=>{
 const nav=menuNavigation({slug:'adega centro/&'});
 await nav.clickNav('pedidos');
 assert.deepEqual(nav.result.urls,['https://bipstart.example/cardapio?loja=adega%20centro%2F%26']);
 assert.equal(nav.result.closed,1);
 assert.equal(nav.result.rendered,0);
 assert.equal(nav.context.tab,'caixa');
 assert.doesNotMatch(js,/tab==='pedidos'/);

 const other=menuNavigation({slug:'pizzaria-outra'});
 await other.clickNav('pedidos');
 assert.deepEqual(other.result.urls,['https://bipstart.example/cardapio?loja=pizzaria-outra']);
 assert.notEqual(other.result.urls[0],nav.result.urls[0]);
});

test('Pedidos online protege lojas sem acesso ou endereço público',async()=>{
 for(const shop of [null,{},{slug:null},{slug:'   '}]){
  const nav=menuNavigation(shop);
  await nav.clickNav('pedidos');
  assert.deepEqual(nav.result.urls,[]);
  assert.equal(nav.result.closed,0);
  assert.equal(nav.result.rendered,0);
  if(shop)assert.equal(nav.result.messages[0]?.error,true);
 }
 const blocked=menuNavigation({slug:'loja-bloqueada'},false);
 await blocked.clickNav('pedidos');
 assert.deepEqual(blocked.result.urls,[]);
 assert.equal(blocked.result.closed,0);
});

test('Cardápio inicial e navegação operacional usam o mesmo destino',async()=>{
 const nav=menuNavigation({slug:'minha-loja'});
 await nav.clickMode();
 assert.deepEqual(nav.result.urls,['https://bipstart.example/cardapio?loja=minha-loja']);
 assert.equal(nav.result.rendered,0);

 const missing=menuNavigation({slug:''});
 await missing.clickMode();
 assert.deepEqual(missing.result.urls,[]);
 assert.equal(missing.result.messages[0]?.error,true);

 const internal=menuNavigation();
 await internal.clickNav('produtos');
 assert.deepEqual(internal.result.urls,[]);
 assert.equal(internal.context.tab,'produtos');
 assert.equal(internal.result.rendered,1);
});

test('menu mobile abre em coluna, fecha no backdrop e Escape e tem foco',()=>{
 assert.match(html,/aria-controls="sidebar" aria-expanded="false"/);
 assert.match(css,/#workspace \.side\{position:fixed;inset:0 auto 0 0;width:min\(292px,88vw\)/);
 assert.match(css,/#workspace \.side\.open\{transform:translateX\(0\);visibility:visible\}/);
 assert.match(css,/#workspace \.side #nav nav\{display:grid;overflow:visible/);
 assert.match(js,/const show=!\$\('sidebar'\)\.classList\.contains\('open'\)/);
 assert.match(js,/if\(e\.target\.closest\('#sideBackdrop'\)\)\{closeSideMenu\(\);return\}/);
 assert.match(js,/if\(event\.key==='Escape'&&\$\('sidebar'\)\.classList\.contains\('open'\)\)closeSideMenu\(\)/);
});
