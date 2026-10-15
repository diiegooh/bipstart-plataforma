import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const client=readFileSync('public/cliente.js','utf8');
const html=readFileSync('public/cliente.html','utf8');
const admin=readFileSync('public/admin.js','utf8');
const migration=readFileSync('sql/bipstart_manual_whatsapp_access.sql','utf8');
const rls=readFileSync('sql/bipstart_block_read_after_expiry.sql','utf8');

test('JS cliente e admin sem erros de sintaxe',()=>{
 new vm.Script(client,{filename:'public/cliente.js'});
 new vm.Script(admin,{filename:'public/admin.js'});
});

const start=client.indexOf('function trialValid(){');
const stop=client.indexOf('function renderAccessGate(){',start);
assert.ok(start>0&&stop>start);
function access(ent){
 const init=new Function('ent','shop','plans','planPrices','BIPSTART_PLAN_WHATSAPP',
  client.slice(start,stop)+';return {trialValid,subscriptionValid,hasAccess,proAccess,canCustomize,contactUrl};');
 return init(ent,{name:'Minha loja',id:'c49e0b8f-6f84-4d60-8abd-bc98c76449d6',requested_plan:'basic'},
  {basic:'Básico',pro:'Premium'},
  {basic:'R$ 29,90 (pagamento único)',pro:'R$ 79,90/mês'},
  '5511978353820');
}
const future=()=>new Date(Date.now()+86400000).toISOString();
const past=()=>new Date(Date.now()-86400000).toISOString();
test('trial válido tem acesso e expira sem reiniciar banco',()=>{
 assert.equal(access({status:'trialing',trial_until:future(),plan_code:'basic'}).hasAccess(),true);
 assert.equal(access({status:'trialing',trial_until:past(),plan_code:'basic'}).hasAccess(),false);
});
test('contratação pendente e suspensão bloqueiam conta',()=>{
 assert.equal(access({status:'pending',trial_until:future(),plan_code:'basic'}).hasAccess(),false);
 assert.equal(access({status:'suspended',trial_until:future(),plan_code:'basic'}).hasAccess(),false);
 assert.equal(access(null).hasAccess(),false);
});
test('pro ativo ou em teste recebe recursos pro somente na vigência',()=>{
 assert.equal(access({status:'trialing',trial_until:future(),plan_code:'pro'}).proAccess(),true);
 assert.equal(access({status:'trialing',trial_until:past(),plan_code:'pro'}).proAccess(),false);
 assert.equal(access({status:'active',active_until:future(),plan_code:'pro'}).proAccess(),true);
 assert.equal(access({status:'active',active_until:past(),plan_code:'pro'}).proAccess(),false);
});
test('planos pagos sem vencimento continuam ativos',()=>{
 assert.equal(access({status:'active',active_until:null,plan_code:'basic'}).hasAccess(),true);
});
test('WhatsApp correto, com identificação e preço do plano sem cobrança',()=>{
 const url=new URL(access({status:'pending',plan_code:'basic'}).contactUrl());
 assert.equal(url.hostname,'wa.me');
 assert.equal(url.pathname,'/5511978353820');
 const body=url.searchParams.get('text');
 assert.match(body,/Minha loja/);
 assert.match(body,/R\$ 29,90/);
 assert.match(body,/Identificador da loja/);
});
test('cadastro exige escolha explícita de caminho e oferece tela de bloqueio',()=>{
 assert.match(html,/name="signup_choice" value="trial"/);
 assert.match(html,/name="signup_choice" value="whatsapp"/);
 assert.match(html,/id="accessGate"/);
 assert.match(client,/signup_choice:v\.signup_choice/);
 assert.match(client,/if\(!hasAccess\(\)\)/);
});
test('gatilho garante teste 7 dias ou pendência sem ativar plano',()=>{
 assert.match(migration,/new\.signup_choice='trial'/);
 assert.match(migration,/interval '7 days'/);
 assert.match(migration,/'pending'/);
});
test('admin protegido por função e trilha de auditoria',()=>{
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/public\.bipstart_admins/);
 assert.match(migration,/public\.bipstart_access_audit/);
 assert.match(migration,/create or replace function public\.bipstart_admin_set_access/);
 assert.match(migration,/active_until=case/);
 assert.match(admin,/bipstart_admin_set_access/);
 assert.match(admin,/window\.confirm/);
});
test('bloqueio também restringe leituras operacionais por RLS',()=>{
 assert.match(rls,/alter policy products_owner_read/);
 assert.match(rls,/alter policy sales_owner_read/);
 assert.match(rls,/public\.is_shop_enabled\(shop_id\)/);
 assert.doesNotMatch(rls,/alter policy entitlements_owner_read/);
});

test('painel diferencia sessão inválida de falta de permissão',()=>{
 assert.match(admin,/async function activeSession/);
 assert.match(admin,/async function signedInAccount/);
 assert.match(admin,/response.status===401/);
 assert.match(admin,/response.status===403/);
 assert.match(admin,/Conta conectada:/);
 assert.match(readFileSync('public/admin.html','utf8'),/id="adminAccount"/);
});


test('admin mostra e-mail cadastrado por loja, com escape de HTML e RPC autorizada',()=>{
 const sql=readFileSync('sql/bipstart_admin_owner_email.sql','utf8');
 assert.match(sql,/create or replace function public\.bipstart_admin_list_shops_with_emails/);
 assert.match(sql,/join auth\.users u on u\.id=s\.owner_id/);
 assert.match(sql,/a\.user_id=auth\.uid\(\)/);
 assert.match(sql,/revoke all on function public\.bipstart_admin_list_shops_with_emails\(\) from public,anon/);
 assert.match(admin,/request\('bipstart_admin_list_shops_with_emails'\)/);
 assert.match(admin,/escapeHtml\(item\.owner_email/);
 assert.match(readFileSync('public/admin.html','utf8'),/admin\.js\?v=5/);
});


test('personalização só funciona no Premium com acesso vigente',()=>{
 const plans=['basic','pro'];
 for(const plan of plans){
  const allowed=plan==='pro';
  assert.equal(access({status:'trialing',trial_until:future(),plan_code:plan}).canCustomize(),allowed);
  assert.equal(access({status:'active',active_until:null,plan_code:plan}).canCustomize(),allowed);
  assert.equal(access({status:'trialing',trial_until:past(),plan_code:plan}).canCustomize(),false);
  assert.equal(access({status:'active',active_until:past(),plan_code:plan}).canCustomize(),false);
  assert.equal(access({status:'pending',trial_until:future(),plan_code:plan}).canCustomize(),false);
 }
});
test('menu e envio de personalização verificam direito ao plano',()=>{
 assert.match(client,/if\(canCustomize\(\)\)a\.push\(\['personalizar','Mudanças e suporte'\]\)/);
 assert.match(client,/if\(!pages\(\)\.some\(\(\[key\]\)=>key===tab\)\)tab='resumo'/);
 assert.match(client,/case 'customForm':\{\s*if\(!canCustomize\(\)\)throw Error/);
});
test('políticas de segurança impedem acesso à personalização do Básico',()=>{
 const sql=readFileSync('sql/bipstart_customization_plan_access.sql','utf8');
 assert.match(sql,/e\.plan_code in \('personalizado','pro'\)/);
 assert.match(sql,/create or replace function public\.bipstart_can_customize/);
 assert.match(sql,/revoke all on function public\.bipstart_can_customize\(uuid\) from public,anon/);
 assert.match(sql,/alter policy custom_owner_insert/);
 assert.match(sql,/alter policy custom_owner_read/);
 assert.match(sql,/public\.can_write_shop\(shop_id\)/);
});


test('admin controla solicitações com status existentes e histórico protegido',()=>{
 const sql=readFileSync('sql/bipstart_admin_customization_queue.sql','utf8');
 assert.match(sql,/create or replace function public\.bipstart_admin_list_customization_requests/);
 assert.match(sql,/create or replace function public\.bipstart_admin_update_customization_status/);
 assert.match(sql,/a\.user_id=auth\.uid\(\)/);
 assert.match(sql,/join auth\.users u on u\.id=s\.owner_id/);
 assert.match(sql,/p_status not in \('novo','em_analise','concluido'\)/);
 assert.match(sql,/public\.bipstart_customization_audit/);
 assert.match(sql,/revoke all on function public\.bipstart_admin_list_customization_requests\(\) from public,anon/);
 assert.match(sql,/revoke all on function public\.bipstart_admin_update_customization_status\(uuid,text\) from public,anon/);
 assert.match(admin,/request\('bipstart_admin_list_customization_requests'\)/);
 assert.match(admin,/request\('bipstart_admin_update_customization_status'/);
 assert.match(admin,/window\.confirm\('Atualizar esta solicitação/);
 const page=readFileSync('public/admin.html','utf8');
 assert.match(page,/id="customizationSection"/);
 assert.match(page,/id="customRequests"/);
 assert.match(page,/admin\.js\?v=5/);
});
test('cartão administrativo escapa descrição e e-mail, mostra plano, data, status e WhatsApp',()=>{
 const start=admin.indexOf('const REQUEST_STATUS=');
 const end=admin.indexOf('async function load(){',start);
 assert.ok(start>0&&end>start);
 const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const {requestCard,contactWhatsapp}=new Function('escapeHtml','PLAN',
  admin.slice(start,end)+';return {requestCard,contactWhatsapp};')(
    escapeHtml,{basic:'Básico',pro:'Premium'});
 const item={
  request_id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  shop_name:'Loja <teste>',
  owner_email:'teste@example.com',
  shop_whatsapp:'11978353820',plan_code:'pro',
  details:'Adicionar imagem <img src=x onerror=alert(1)>',
  request_status:'novo',
  created_at:'2026-10-13T20:00:00Z'
 };
 const html=requestCard(item);
 assert.match(html,/Loja &lt;teste&gt;/);
 assert.match(html,/teste@example.com/);
 assert.match(html,/Premium/);
 assert.match(html,/Pendente/);
 assert.match(html,/Em andamento/);
 assert.match(html,/Concluído/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x/);
 const url=new URL(contactWhatsapp(item).replaceAll('&amp;','&'));
 assert.equal(url.hostname,'wa.me');
 assert.equal(url.pathname,'/5511978353820');
 assert.match(url.searchParams.get('text'),/Loja <teste>/);
 assert.equal(contactWhatsapp({...item,shop_whatsapp:null}),'');
 assert.equal(contactWhatsapp({...item,shop_whatsapp:'abc'}),'');
});


test('visão geral sem botão de WhatsApp, mas contratação permanece no bloqueio',()=>{
 assert.doesNotMatch(client,/Solicitar plano pelo WhatsApp/);
 assert.match(client,/function contactUrl\(/);
 assert.match(client,/\$\('gateWhatsapp'\)\.href=contactUrl\(/);
 assert.match(html,/id="gateWhatsapp"/);
});


test('cada loja tem um link público único, pronto para compartilhar',()=>{
 const begin=client.indexOf('function publicShopUrl(){');
 const end=client.indexOf('function imageUrl(',begin);
 assert.ok(begin>0&&end>begin);
 const helpers=client.slice(begin,end);
 const render=(shop,origin='https://bipstart.exemplo')=>
  new Function('shop','location','esc',helpers+';return {url:publicShopUrl(),html:publicLinkTile()};')(
   shop,{origin},
   text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  );
 const a=render({name:'Adega A',slug:'adega-a'});
 const b=render({name:'Pizzaria B',slug:'pizzaria-b'});
 assert.equal(a.url,'https://bipstart.exemplo/cardapio?loja=adega-a');
 assert.equal(b.url,'https://bipstart.exemplo/cardapio?loja=pizzaria-b');
 assert.notEqual(a.url,b.url);
 for(const result of [a,b]){
  assert.match(result.html,/data-share-shop/);
  assert.match(result.html,/data-copy-shop/);
  assert.match(result.html,/Compartilhar/);
  assert.match(result.html,/Copiar link/);
  assert.match(result.html,/WhatsApp/);
  assert.match(result.html,/rel="noopener noreferrer"/);
 }
 const whatsapp=a.html.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/);
 assert.ok(whatsapp);
 assert.match(decodeURIComponent(new URL(whatsapp[1]).searchParams.get('text')),/Adega A/);
 assert.match(decodeURIComponent(new URL(whatsapp[1]).searchParams.get('text')),/adega-a/);
 const unsafe=render({name:'Loja <script>alert(1)</script>',slug:'a&b'});
 assert.doesNotMatch(unsafe.html,/<script>/);
 assert.match(unsafe.html,/Loja%20%3Cscript%3E/);
 assert.match(unsafe.url,/a%26b/);
});
test('compartilhamento usa dispositivo nativo, cópia e alternativa em desktop',()=>{
 assert.match(client,/typeof navigator\.share==='function'/);
 assert.match(client,/await navigator\.share\(/);
 assert.match(client,/navigator\.clipboard\.writeText\(url\)/);
 assert.match(client,/window\.prompt\('Copie o link do cardápio:',url\)/);
 assert.match(client,/if\(!shop\|\|shop\.model!=='pdv'\|\|!hasAccess\(\)\)return/);
 assert.match(readFileSync('public/cliente.html','utf8'),/cliente\.js\?v=21/);
});


test('compartilhamento usa somente CARDÁPIO (NOME DA LOJA) e o endereço',()=>{
 const begin=client.indexOf('function publicShopUrl(){');
 const end=client.indexOf('function imageUrl(',begin);
 const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const {url,title,html:card}=new Function('shop','location','esc',
   client.slice(begin,end)+';return {url:publicShopUrl(),title:shareTitle(),html:publicLinkTile()};')(
     {name:'gamalperfumes',slug:'gamalperfumes-3392813'},
     {origin:'https://bipstart.exemplo'},esc
   );
 assert.equal(title,'CARDÁPIO (gamalperfumes)');
 assert.match(card,/CARDÁPIO \(gamalperfumes\)/);
 const match=card.match(/href="(https:\/\/wa\.me\/\?text=[^"]+)"/);
 assert.ok(match);
 const message=new URL(match[1]).searchParams.get('text');
 assert.equal(message,title+'\n'+url);
 assert.doesNotMatch(message.split('\n')[0],/Confira|BipStart|contratar/i);
 assert.match(client,/navigator\.share\(\{title:shareTitle\(\),text:shareTitle\(\),url\}\)/);
 assert.match(readFileSync('public/cardapio.js','utf8'),/document\.title='CARDÁPIO \('\+menu\.name\+'\)'/);
});
