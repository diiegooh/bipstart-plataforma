import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('public/cliente.html','utf8');
const css=readFileSync('public/cliente.css','utf8');
const js=readFileSync('public/cliente.js','utf8');

test('sidebar tem identidade da loja, engrenagem e os três botões do rodapé',()=>{
 new vm.Script(js,{filename:'public/cliente.js'});
 for(const id of ['sidebar','sideShopName','sideSettings','sideColor','sideLogout','sideToggle','sideBackdrop']){
  assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 assert.doesNotMatch(html,/Central de operação/);
 assert.match(html,/aria-label="Menu da loja"/);
 assert.match(html,/Alterar cor/);
 assert.match(html,/Abrir cardápio/);
 assert.match(html,/Sair/);
 assert.match(html,/cliente\.js\?v=26/);
 assert.match(html,/cliente\.css\?v=15/);
});

test('coluna mostra seis opções, incluindo link externo do cardápio, sem aba separada de Estoque',()=>{
 const start=js.indexOf('function operationalMenuItems(){');
 const end=js.indexOf('function renderNav(){',start);
 assert.ok(start>=0&&end>start);
 const items=new Function(js.slice(start,end)+';return operationalMenuItems();')();
 assert.deepEqual(items.map(x=>x[1]),['PDV','Produtos','Cardápio online','Pedidos online','Motoboys','Vendas']);
 assert.deepEqual(items.map(x=>x[0]),['caixa','produtos','cardapio_publico','pedidos','motoboys','vendas']);
 assert.match(css,/#workspace \.side #nav nav button\.active\{background:linear-gradient\(100deg,#fc0816,#f51b20\)/);
});

function mockNav(premium){
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
 const create=new Function("$","esc","tab","shop","proAccess","canCustomize","imageUrl","publicShopUrl","document",
  js.slice(start,end)+';return renderNav;');
 const render=create(node,x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  'caixa',{name:'Adega <Teste>',logo_path:'loja-id/logo.png'},()=>premium,()=>premium,
  path=>'https://images.example/'+path,()=>'https://bipstart.example/cardapio?loja=adega-teste',
  {documentElement:{style:{setProperty(){}}}});
 render();
 return {node};
}
test('sidebar marca PDV ativo, usa logo da loja Premium e protege opções do Básico',()=>{
 const basic=mockNav(false);
 assert.match(basic.node('nav').innerHTML,/data-nav="caixa" class="active" aria-current="page"/);
 assert.match(basic.node('nav').innerHTML,/data-nav="motoboys" class="locked"/);
 assert.match(basic.node('nav').innerHTML,/Premium/);
 assert.doesNotMatch(html,/id="sideShopLogo"/);
 assert.doesNotMatch(js,/\$\('sideShopLogo'\)/);
 const external=basic.node('nav').innerHTML;
 assert.match(external,/<a class="side-public-menu" data-public-menu-link href="https:\/\/bipstart\.example\/cardapio\?loja=adega-teste" target="_blank" rel="noopener noreferrer"/);
 assert.match(external,/Abrir cardápio online da loja em outra aba/);
 assert.match(external,/<b>Cardápio online<\/b>/);
 assert.match(external,/side-external-icon/);
 assert.equal((external.match(/data-public-menu-link/g)||[]).length,1);
 assert.doesNotMatch(external,/data-nav="cardapio_publico"/);
 assert.match(css,/#workspace \.side #nav nav a\.side-public-menu\{/);
 assert.match(css,/#workspace \.side #nav nav a\.side-public-menu:focus-visible\{/);
  assert.equal(basic.node('sideShopName').textContent,'Adega <Teste>');
 const premium=mockNav(true);
 assert.match(premium.node('nav').innerHTML,/data-nav="motoboys" class=""/);
 assert.equal(premium.node('sideShopName').textContent,'Adega <Teste>');
});

test('link público preserva o slug de cada loja e não redireciona o PDV',()=>{
 const start=js.indexOf('function publicShopUrl(){');
 const end=js.indexOf('function shareTitle()',start);
 assert.ok(start>=0&&end>start);
 const getUrl=new Function('location','shop',js.slice(start,end)+';return publicShopUrl;');
 assert.equal(getUrl({origin:'https://bipstart.example'},{slug:'adega e mercado'})(),
  'https://bipstart.example/cardapio?loja=adega%20e%20mercado');
 assert.doesNotMatch(js,/location\.assign\(publicShopUrl\(\)\).*data-public-menu-link/);
 assert.match(js,/target="_blank" rel="noopener noreferrer"/);
});

test('Produtos incorpora estoque e Pedidos online não promete pedidos automáticos',()=>{
 assert.match(js,/a\.push\(\['pedidos','Pedidos online'\]\)/);
 assert.doesNotMatch(js,/\['estoque','Estoque'\]/);
 assert.doesNotMatch(js,/tab==='estoque'/);
 assert.match(js,/tab==='produtos'/);
 assert.match(js,/products\.filter\(p=>productStockState\(p\)\.state==='low'\)/);
 assert.match(js,/products\.filter\(p=>productStockState\(p\)\.state==='out'\)/);
 assert.match(js,/tab==='pedidos'/);
 assert.match(js,/O registro ocorre antes de abrir o WhatsApp/);
 assert.doesNotMatch(js,/data-nav="cardapio">Gerenciar cardápio/);
 assert.doesNotMatch(html,/id="sideOpenMenu"/);
 assert.doesNotMatch(js,/\$\('sideOpenMenu'\)/);
 assert.match(js,/data-nav="entregas">Abrir fila de entregas/);
 assert.match(js,/if\(nav\.dataset\.nav==='motoboys'&&!proAccess\(\)\)/);
 assert.match(js,/if\(!canCustomize\(\)\)return msg\('Alterar a cor do cardápio está disponível somente no plano Premium\.'/);
 assert.match(js,/if\(e\.target\.closest\('#sideLogout'\)\)\{closeSideMenu\(\);\$\('logout'\)\.click\(\);return\}/);
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

test('PDV em tela cheia não mostra marca BipStart nem faixa superior da loja',()=>{
 assert.doesNotMatch(html,/<div class="heading">/);
 assert.doesNotMatch(html,/id="shopName"|id="shopStatus"|id="publicMenuLink"|id="switchShop"/);
 assert.doesNotMatch(html,/id="sideShopLogo"/);
 assert.match(js,/if\(id==='workspace'\)document\.body\.classList\.toggle\('workspace-fullscreen',on\)/);
 assert.match(css,/body\.workspace-fullscreen \.top\{display:none\}/);
 assert.match(css,/body\.workspace-fullscreen \.shell\{max-width:none;padding:12px 14px 24px\}/);
 assert.match(html,/<div class="side-store">[\s\S]*id="sideShopName"/);
});
test('Voltar às opções e Sair aparecem lado a lado no rodapé, preservando acesso ao menu mobile',()=>{
 assert.match(html,/<div class="side-actions-row">[\s\S]*id="backToModes"[\s\S]*id="sideLogout"[\s\S]*<\/div>/);
 assert.match(css,/#workspace \.side \.side-actions-row\{[\s\S]*grid-template-columns:minmax\(0,1\.55fr\) minmax\(59px,\.8fr\)/);
 assert.match(js,/\$\('backToModes'\)\.onclick=\(\)=>\{if\(!shop\|\|!hasAccess\(\)\)return;closeSideMenu\(\);history\.replaceState/);
 assert.match(html,/<div class="pdv-mobile-menu">[\s\S]*id="sideToggle"/);
 assert.match(css,/#workspace \.pdv-mobile-menu\{display:none\}/);
 assert.match(css,/@media\(max-width:900px\)\{[\s\S]*#workspace \.pdv-mobile-menu\{display:flex/);
});

test('aba Pedidos online não exibe botões redundantes do cardápio',()=>{
 const start=js.indexOf("}else if(tab==='pedidos'){");
 const end=js.indexOf("}else if(tab==='caixa'){",start);
 assert.ok(start>=0&&end>start);
 const area=js.slice(start,end);
 assert.doesNotMatch(area,/Abrir cardápio ↗|Gerenciar cardápio|class="orders-actions"/);
 assert.match(area,/data-orders-refresh/);
 assert.match(area,/onlineOrderCard/);
 assert.doesNotMatch(js,/\$\('sideOpenMenu'\)/);
});
