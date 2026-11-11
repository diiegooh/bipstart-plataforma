import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

const page=readFileSync('public/index.html','utf8');
const css=readFileSync('public/landing.css','utf8');
const app=readFileSync('public/app.js','utf8');
const normalized=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

test('nenhum arquivo público volta a anunciar serviços de agenda, barbearias ou salões',()=>{
 const pattern=/(?:agendamento|agenda de servicos|barbearia|salao de beleza|saloes de beleza)/i;
 for(const name of readdirSync('public').filter(x=>/\.(html|css|js)$/i.test(x))){
  assert.doesNotMatch(normalized(readFileSync('public/'+name,'utf8')),pattern,name);
 }
});
test('demonstração preserva o funcionamento do PDV e do cardápio',()=>{
 new vm.Script(app,{filename:'public/app.js'});
 for(const name of ['renderPDV','renderProducts','renderSales','renderMenuEditor','renderPublicMenu','renderMenuOrders','renderCouriers','renderDeliveries'])
  assert.match(app,new RegExp('function '+name+'\\('));
 assert.match(page,/id="workspace"/);
 assert.match(page,/Ambiente demonstrativo/);
});
test('landing apresenta mercados, restaurantes, mercearias e adegas',()=>{
 for(const word of ['Mercados','Mercearias','Restaurantes','Adegas'])
  assert.match(page,new RegExp(word,'i'));
 assert.match(page,/id="recursos"/);
 assert.match(page,/PDV e controle de estoque/);
 assert.match(page,/Cardápio online e pedidos/);
});
test('há somente os planos Básico e Premium com valores oficiais',()=>{
 const plans=[...page.matchAll(/<article class="bs-plan(?: [^"]*)?">/g)];
 assert.equal(plans.length,2);
 assert.match(page,/<h3>Básico<\/h3>/);
 assert.match(page,/<h3>Premium<\/h3>/);
 assert.match(page,/R\$ 29,90/);
 assert.match(page,/R\$ 79,90/);
 assert.doesNotMatch(page,/Plano Personalizado|Plano Pro\b/i);
});
test('navegação Planos e demais âncoras aponta para IDs existentes',()=>{
 for(const id of ['inicio','recursos','planos','passos','duvidas']){
  assert.match(page,new RegExp('id="'+id+'"'));
  if(id!=='inicio')assert.match(page,new RegExp('href="#'+id+'"'));
 }
 assert.equal((page.match(/id="planos"/g)||[]).length,1);
});
test('site comercial oferece teste gratuito e contratação manual',()=>{
 assert.match(page,/Experimente grátis por 7 dias/);
 assert.match(page,/contratação e a renovação são combinadas pelo WhatsApp/i);
 assert.match(page,/liberação manual/i);
 assert.match(page,/data-action="trial"/);
});
test('FAQ diferencia o Básico do Premium e não promete processar pagamentos',()=>{
 assert.match(page,/O plano Básico tem cardápio online\?/);
 assert.match(page,/O Premium permite personalizar minha loja\?/);
 assert.match(page,/não processa pagamentos/i);
 assert.doesNotMatch(page,/pagamento automático confirmado|Agenda de serviços/i);
});
test('botões comerciais mostram chamada de ação para os dois planos',()=>{
 assert.match(page,/id="planos"/);
 assert.match(page,/data-action="trial"/);
 assert.match(page,/data-action=".*?"/);
 assert.match(page,/bs-plan bs-plan-highlight/);
});
test('navegação mobile permite entrar na conta',()=>{
 assert.match(page,/id="bsMenuToggle"/);
 assert.match(page,/id="bsNavLinks"/);
 assert.match(page,/class="bs-login" href="\/cliente">Entrar<\/a>/);
 assert.match(page,/aria-expanded="false"/);
 assert.match(page,/nav\.classList\.remove\('is-open'\)/);
 assert.match(css,/@media\(max-width:720px\)/);
});
test('plano no celular é exibido em coluna e sem overflow',()=>{
 assert.match(css,/\.bs-plans\{display:grid;grid-template-columns:1fr 1fr/);
 assert.match(css,/\.bs-plans\{grid-template-columns:1fr/);
 assert.match(page,/class="bs-plans"/);
});
test('demonstração separada das lojas reais mantém exemplos visuais',()=>{
 assert.match(page,/aria-label="Ilustração demonstrativa do painel BipStart"/);
 assert.match(page,/id="marketing"/);
 assert.match(page,/id="workspace" class="workspace hidden"/);
 assert.match(page,/id="toast"/);
 assert.doesNotMatch(page,/href="https:\/\/wa\.me\/\d{12}" data-order-id/);
});
