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
