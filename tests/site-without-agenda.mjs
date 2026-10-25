import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

// Evita que trechos de interface antiga reapareçam nas páginas comerciais.
const paths=readdirSync('public').filter(x=>/\.(html|css|js)$/i.test(x));
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const legacy=/(?:agenda|agendament\w*|barbearia\w*|saloes|salao)/i;

test('nenhum arquivo público contém referências a agendamentos, barbearias ou salões',()=>{
 for(const filename of paths){
  const path='public/'+filename;
  const source=readFileSync(path,'utf8');
  assert.doesNotMatch(normalize(source),legacy,path);
 }
});
test('homepage destaca mercados e mantém Básico e Premium',()=>{
 const html=readFileSync('public/index.html','utf8');
 for(const segment of ['Mercados','Restaurantes','Adegas e delivery','>Básico</h3>','>Premium</h3>']){
  assert.ok(html.includes(segment),segment);
 }
 assert.equal((html.match(/<article class="bs-plan(?: [^"]*)?"/g)||[]).length,2);
 assert.match(html,/R\$ 29,90<\/strong><span>pagamento único<\/span>/);
 assert.match(html,/R\$ 79,90<\/strong><span>por mês<\/span>/);
});
test('a demonstração mantém PDV, cardápio, pedidos e motoboys sem tela de agenda',()=>{
 const source=readFileSync('public/app.js','utf8');
 const css=readFileSync('public/style.css','utf8');
 new vm.Script(source,{filename:'public/app.js'});
 for(const name of ['renderPDV','renderProducts','renderSales','renderMenuEditor','renderPublicMenu','renderMenuOrders','renderCouriers','renderDeliveries'])
  assert.match(source,new RegExp('function '+name+'\\('));
 assert.match(source,/class="record-row"/);
 assert.match(css,/\.record-row\{/);
 assert.doesNotMatch(source,/serviceModal|appointmentModal|serviceForm|appointmentForm|ws\.appointments|ws\.services/);
});

test('link Planos centraliza o título logo abaixo do cabeçalho fixo',()=>{
 const html=readFileSync('public/index.html','utf8');
 assert.match(html,/<a href="#planos">Planos<\/a>/);
 assert.match(html,/<section class="bs-section bs-pricing" id="planos">/);
 assert.equal((html.match(/id="planos"/g)||[]).length,1);
 assert.match(html,/\/style\.css\?v=\d+/);
 assert.match(html,/\/landing\.css\?v=\d+/);
});

test('tipografia dos planos permanece legível e destacada no desktop e no celular',()=>{
 const css=readFileSync('public/style.css','utf8');
 assert.match(css,/\.pricing-section \.plan-top>p\{font-size:clamp\(16px,1\.25vw,18px\)/);
 assert.match(css,/\.pricing-section \.plan ul li\{font-size:15px/);
 assert.match(css,/\.pricing-section \.plan-top>small\{font-size:14px/);
 assert.match(css,/\.pricing-section \.pricing-title>p\{font-size:clamp\(16px,1\.35vw,19px\)/);
 assert.match(css,/@media\(max-width:760px\)/);
});


test('FAQ Premium, solicitações gratuitas e pagamentos refletem a oferta comercial',()=>{
 const html=readFileSync('public/index.html','utf8');
 assert.match(html,/O Premium inclui personalização de logo e cores do cardápio/);
 assert.match(html,/Sistema integrado de motoboys particulares/i);
 assert.match(html,/pagamentos das vendas são combinados e recebidos diretamente pela sua loja/);
 assert.doesNotMatch(html,/O envio automático do cardápio ainda não está disponível/);
 assert.doesNotMatch(html,/eventuais custos extras/);
});
test('botões de escolher plano têm o mesmo estilo e rótulos proporcionais',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/landing.css','utf8');
 assert.match(html,/class="bs-button bs-button-secondary bs-plan-button" data-plan="1">Escolher Básico/);
 assert.match(html,/class="bs-button bs-button-primary bs-plan-button" data-plan="3">Escolher Premium/);
 assert.equal((html.match(/class="bs-button bs-button-(?:primary|secondary) bs-plan-button"/g)||[]).length,2);
 assert.match(css,/\.bs-button\{/);
 assert.match(css,/\.bs-button-primary\{/);
 assert.match(css,/\.bs-button-secondary\{/);
});
test('celular oferece link direto Entrar para a área autenticada mesmo sem menu desktop',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/landing.css','utf8');
 assert.match(html,/<a class="bs-login" href="\/cliente">Entrar<\/a>/);
 assert.match(html,/id="bsMenuToggle"[^>]*aria-expanded="false"[^>]*aria-controls="bsNavLinks"/);
 assert.match(html,/id="bsNavLinks"/);
 assert.match(css,/\.bs-menu-toggle\{display:none/);
 assert.match(css,/@media\s*\(max-width:/);
});


test('planos ficam compactos em notebooks e empilhados com legibilidade no celular',()=>{
 const css=readFileSync('public/landing.css','utf8');
 const html=readFileSync('public/index.html','utf8');
 assert.match(html,/class="bs-plans"/);
 assert.equal((html.match(/<article class="bs-plan(?: [^"]*)?"/g)||[]).length,2);
 assert.match(css,/\.bs-plans\{/);
 assert.match(css,/\.bs-plan\{/);
 assert.match(css,/@media\s*\(max-width:/);
});


test('Modelos apresenta três mini cards ilustrados para cada sistema, sem prévias grandes',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/landing.css','utf8');
 for(const item of ['PDV e controle de estoque','Cardápio online e pedidos','Uma loja com a sua identidade']){
  assert.ok(html.includes(item),item);
 }
 assert.equal((html.match(/<article class="bs-feature-card /g)||[]).length,3);
 assert.match(css,/\.bs-feature-grid\{/);
 assert.doesNotMatch(html,/modelo-pdv\.svg|modelo-cardapio\.svg/);
});

test('mini cards são apenas ilustrativos e não expõem dados reais de pedidos',()=>{
 const html=readFileSync('public/index.html','utf8');
 const start=html.indexOf('<section class="bs-section bs-features"');
 const end=html.indexOf('<section class="bs-section bs-pricing"',start);
 assert.ok(start>=0&&end>start);
 const section=html.slice(start,end);
 assert.match(section,/bs-mini-panel/);
 assert.match(section,/bs-menu-preview/);
 assert.doesNotMatch(section,/data-order-id|id="customer|data-customer-token|href="https:\/\/wa\.me/);
});


test('nomes dos mini cards e dos dois modelos estão mais destacados no desktop e celular',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/landing.css','utf8');
 assert.match(html,/<h3>PDV e controle de estoque<\/h3>/);
 assert.match(html,/<h3>Cardápio online e pedidos<\/h3>/);
 assert.match(css,/\.bs-feature-card/);
 assert.match(css,/\.bs-feature-grid/);
 assert.match(css,/@media\s*\(max-width:/);
});


test('seção Modelos ocupa menos altura no notebook mantendo os seis exemplos',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/landing.css','utf8');
 assert.equal((html.match(/<article class="bs-feature-card /g)||[]).length,3);
 assert.match(html,/class="bs-feature-grid"/);
 assert.match(css,/\.bs-feature-grid\{/);
 assert.match(css,/@media\s*\(max-width:/);
});
