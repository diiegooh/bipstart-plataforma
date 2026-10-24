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
 assert.match(html,/Mercados e mercearias/);
 assert.match(html,/Restaurantes e adegas/);
 assert.match(html,/Plano Básico/);
 assert.match(html,/Plano Premium/);
 assert.equal((html.match(/<article class="plan(?:\s[^"]*)?"/g)||[]).length,2);
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
 const css=readFileSync('public/style.css','utf8');
 assert.match(html,/<a href="#planos">Planos<\/a>/);
 assert.match(html,/<section class="section pricing-section"><div class="container"><div class="pricing-title" id="planos">/);
 assert.doesNotMatch(html,/<section[^>]+id="planos"/);
 assert.equal((html.match(/id="planos"/g)||[]).length,1);
 assert.match(css,/html\{scroll-padding-top:90px\}/);
 assert.match(css,/\.pricing-title#planos\{scroll-margin-top:12px\}/);
 assert.match(html,/\/style\.css\?v=[0-9]+/);
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
 assert.match(html,/O que inclui o Premium\?/);
 assert.match(html,/sistema integrado de motoboys particulares/i);
 assert.match(html,/depois de cadastrados na fila de entregas/);
 assert.doesNotMatch(html,/O envio automático do cardápio ainda não está disponível/);
 assert.match(html,/Você poderá solicitar mudanças conforme seu negócio\. Sem nenhum custo\./);
 assert.match(html,/Por questões de segurança, os pagamentos são realizados diretamente na sua loja física ou combinados pelo WhatsApp/);
 assert.doesNotMatch(html,/eventuais custos extras/);
});
test('botões de escolher plano têm o mesmo estilo e rótulos proporcionais',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/style.css','utf8');
 assert.match(html,/class="button button-primary button-plan-select" data-plan="1">Escolher Básico/);
 assert.match(html,/class="button button-primary button-plan-select" data-plan="3">Escolher Premium/);
 assert.equal((html.match(/class="button button-primary button-plan-select"/g)||[]).length,2);
 assert.match(css,/\.pricing-section \.plan>\.button-plan-select\{/);
 assert.match(css,/width:100%/);
 assert.match(css,/min-height:52px/);
});
test('celular oferece link direto Entrar para a área autenticada mesmo sem menu desktop',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/style.css','utf8');
 assert.match(html,/class="mobile-login" href="\/cliente" aria-label="Entrar na conta da loja">Entrar<\/a>/);
 assert.match(css,/\.mobile-login\{display:none\}/);
 assert.match(css,/@media\(max-width:760px\)\{/);
 assert.match(css,/\.mobile-login\{\s*display:inline-flex/);
 assert.match(css,/@media\(max-width:430px\)/);
 assert.match(css,/@media\(max-width:350px\)/);
});


test('planos ficam compactos em notebooks e empilhados com legibilidade no celular',()=>{
 const css=readFileSync('public/style.css','utf8');
 const html=readFileSync('public/index.html','utf8');
 assert.match(css,/@media\(min-width:831px\)\{/);
 assert.match(css,/\.pricing-section\.section\{padding-top:24px;padding-bottom:26px\}/);
 assert.match(css,/\.pricing-section \.pricing-title\{margin-bottom:19px\}/);
 assert.match(css,/\.pricing-section \.plans-two>\.plan\{/);
 assert.match(css,/\.pricing-section \.plan ul\{gap:8px;margin-bottom:15px\}/);
 assert.match(css,/\.pricing-section \.plan>\.button-plan-select\{/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(min-width:831px\) and \(max-height:900px\)\{/);
 assert.match(css,/@media\(max-width:830px\)\{/);
 assert.match(css,/\.pricing-section \.plans-two\{grid-template-columns:1fr;gap:25px\}/);
 assert.match(css,/\.pricing-section \.plan>\.button-plan-select\{min-height:48px\}/);
 assert.equal((html.match(/class="plan-top"/g)||[]).length,2);
 assert.equal((html.match(/class="button button-primary button-plan-select"/g)||[]).length,2);
});


test('Modelos apresenta três mini cards ilustrados para cada sistema, sem prévias grandes',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/style.css','utf8');
 const block=html.slice(html.indexOf('id="solucoes"'),html.indexOf('<section class="section pricing-section"'));
 assert.equal((block.match(/class="solution-mini-grid"/g)||[]).length,2);
 assert.equal((block.match(/class="solution-mini-card"/g)||[]).length,6);
 assert.equal((block.match(/class="mini-illustration /g)||[]).length,6);
 assert.doesNotMatch(block,/class="solution-preview"|modelo-pdv\.svg|modelo-cardapio\.svg/);
 for(const label of ['Venda rápida','Controle automático','Resumo de vendas',
  'Produtos organizados','Carrinho de compras','Pedido via WhatsApp'])
  assert.match(block,new RegExp(label));
 assert.match(block,/data-model="pdv">Experimentar PDV ↗/);
 assert.match(block,/data-model="pdv">Experimentar cardápio ↗/);
 assert.match(css,/#solucoes \.solution-mini-grid\{/);
 assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(143px,1fr\)\)/);
 assert.match(css,/#solucoes \.mini-illustration\{/);
 assert.match(css,/#solucoes \.mini-report>strong/);
 assert.match(css,/@media\(max-width:430px\)\{[\s\S]*#solucoes \.solution-mini-grid\{grid-template-columns:1fr\}/);
 assert.doesNotMatch(css,/#solucoes \.solution-preview/);
});

test('mini cards são apenas ilustrativos e não expõem dados reais de pedidos',()=>{
 const html=readFileSync('public/index.html','utf8');
 const block=html.slice(html.indexOf('id="solucoes"'),html.indexOf('<section class="section pricing-section"'));
 assert.match(block,/aria-hidden="true"/);
 assert.match(block,/Exemplos dos recursos do PDV/);
 assert.match(block,/Exemplos dos recursos do cardápio digital/);
 assert.equal((block.match(/class="mini-badge"/g)||[]).length,6);
 assert.doesNotMatch(block,/id="customer|data-order-id|href="https:\/\/wa\.me/);
});


test('nomes dos mini cards e dos dois modelos estão mais destacados no desktop e celular',()=>{
 const css=readFileSync('public/style.css','utf8');
 const html=readFileSync('public/index.html','utf8');
 const block=html.slice(html.indexOf('id="solucoes"'),html.indexOf('<section class="section pricing-section"'));
 assert.equal((block.match(/class="solution-mini-card"/g)||[]).length,6);
 assert.match(css,/#solucoes \.solution-mini-card>strong\{[\s\S]*font-size:17px;font-weight:900/);
 assert.match(css,/border-left:3px solid #b969ff;padding-left:9px/);
 assert.match(css,/#solucoes \.solution-card\.orange \.solution-mini-card>strong\{[\s\S]*color:#ffe3be;border-left-color:#ffaf66/);
 assert.match(css,/#solucoes \.solution-card-copy h3\{margin:0 0 9px;font-size:25px/);
 assert.match(css,/#solucoes \.solution-card-copy h3\{font-size:23px\}/);
 assert.match(css,/#solucoes \.solution-mini-card>strong\{font-size:16px\}/);
 assert.match(html,/\/style\.css\?v=[0-9]+/);
});


test('seção Modelos ocupa menos altura no notebook mantendo os seis exemplos',()=>{
 const html=readFileSync('public/index.html','utf8');
 const css=readFileSync('public/style.css','utf8');
 const section=html.slice(html.indexOf('id="solucoes"'),html.indexOf('<section class="section pricing-section"'));
 assert.equal((section.match(/class="solution-mini-card"/g)||[]).length,6);
 assert.equal((section.match(/class="solution-card /g)||[]).length,2);
 assert.match(section,/Experimentar PDV ↗/);
 assert.match(section,/Experimentar cardápio ↗/);
 assert.match(css,/@media\(min-width:831px\)\{[\s\S]*#solucoes\.section\{padding-top:43px;padding-bottom:40px\}/);
 assert.match(css,/@media\(min-width:831px\) and \(max-height:950px\)\{/);
 assert.match(css,/#solucoes\.section\{padding-top:22px;padding-bottom:23px\}/);
 assert.match(css,/#solucoes \.section-head\{margin-bottom:14px\}/);
 assert.match(css,/#solucoes \.solution-card\{padding:15px 18px;gap:8px\}/);
 assert.match(css,/#solucoes \.mini-illustration\{height:66px;margin-top:6px;padding:7px\}/);
 assert.match(css,/#solucoes \.solution-mini-grid\{\s*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:830px\)\{/);
 assert.match(css,/#solucoes \.solution-grid\{grid-template-columns:1fr;max-width:600px;margin-inline:auto;gap:19px\}/);
 assert.match(css,/@media\(max-width:430px\)\{/);
 assert.match(html,/\/style\.css\?v=[0-9]+/);
});
