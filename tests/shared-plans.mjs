import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/cliente.js','utf8');
const panel=readFileSync('public/cliente.html','utf8');
const homepage=readFileSync('public/app.js','utf8');
const database=readFileSync('sql/bipstart_shared_shop_plan_upgrade_20261016.sql','utf8');

test('homepage oferece Básico e Premium na mesma conta, não em workspaces locais diferentes',()=>{
 new vm.Script(homepage);
 new vm.Script(source);
 assert.match(homepage,/window\.location\.assign\('\/cliente\?plano='\+\(change===3\?'pro':'basic'\)\)/);
 assert.match(homepage,/\$\('dashboardHeader'\)\.onclick=\(\)=>window\.location\.assign\('\/cliente'\)/);
 const begin=homepage.indexOf("function onboarding(plan=1,model='pdv'){");
 const end=homepage.indexOf("function showWorkspace(){",begin);
 const redirects=[];
 const fn=new Function('window',homepage.slice(begin,end)+';return onboarding;')({
  location:{assign(path){redirects.push(path)}}
 });
 fn(1);fn(3);
 assert.deepEqual(redirects,['/cliente?plano=basic','/cliente?plano=pro']);
});
test('todas as funcionalidades do Básico continuam presentes e motoboys ativa no Premium',()=>{
 const a=source.indexOf('function operationalMenuItems(){');
 const b=source.indexOf('function applySidebarTheme(){',a);
 assert.ok(a>0&&b>a);
 const menu=new Function(source.slice(a,b)+';return operationalMenuItems;')();
 assert.deepEqual(menu(),[
  ['caixa','PDV','🛒'],
  ['produtos','Produtos','📦'],
  ['cardapio_publico','Cardápio online','📋'],
  ['pedidos','Pedidos online','🚚'],
  ['motoboys','Motoboys','🛵'],
  ['vendas','Vendas','💰']
 ]);
 assert.match(source,/if\(\(id==='cardapio_publico'\|\|id==='pedidos'\|\|id==='motoboys'\)&&!proAccess\(\)\)/);
 assert.match(source,/if\(proAccess\(\)\)a\.push\(\['pedidos','Pedidos online'\],\['motoboys','Motoboys'\],\['entregas','Entregas'\]\)/);
 assert.match(source,/function proAccess\(\)\{return ent\?\.plan_code==='pro'&&hasAccess\(\)\}/);
 assert.match(source,/function canCustomize\(\)\{return proAccess\(\)\}/);
 assert.match(source,/if\(!proAccess\(\)\)throw Error\('Motoboys disponíveis somente no Plano Premium vigente\.'\)/);
 assert.match(source,/products=await get\('shop_products'\)/);
 assert.match(source,/onlineOrders=await get\('shop_online_orders'\)/);
});
test('cadastro mantém o mesmo shop_id e a mesma base em mudanças de plano',()=>{
 assert.match(source,/const initialPlan=\['basic','pro'\]\.includes\(preferredPlan\)\?preferredPlan:null/);
 assert.match(source,/if\(initialPlan\)\$\('shopForm'\)\.elements\.namedItem\('requested_plan'\)\.value=initialPlan/);
 assert.match(source,/else if\(initialPlan&&ent\?\.plan_code!==initialPlan\)/);
 assert.match(source,/data-plan-request/);
 assert.match(source,/rpc\('bipstart_request_plan_change',\{p_shop_id:shop\.id,p_plan:target\}\)/);
 assert.match(source,/shop\.requested_plan=target/);
 assert.match(source,/function refreshActivatedPlan\(\)|async function refreshActivatedPlan\(\)/);
 assert.match(source,/const currentShop=shop\.id/);
 assert.match(source,/await reloadData\(\)/);
 assert.doesNotMatch(panel,/id="modeChooser"|id="backToModes"/);
 assert.match(source,/tab='caixa';showForm=null;pastedProductImage=null/);
 assert.match(panel,/id="workspace"/);
 assert.match(panel,/\/cliente\.js\?v=37/);
});
test('pedido de troca não concede Premium; ativação administra a mesma loja',()=>{
 assert.match(database,/create or replace function public\.bipstart_request_plan_change\(p_shop_id uuid,p_plan text\)/);
 const begin=database.indexOf('create or replace function public.bipstart_request_plan_change(');
 const end=database.indexOf('create or replace function public.bipstart_admin_set_access(',begin);
 const request=database.slice(begin,end);
 assert.match(request,/s\.id=p_shop_id and s\.owner_id=auth\.uid\(\)/);
 assert.match(request,/set requested_plan=p_plan/);
 assert.doesNotMatch(request,/update public\.shop_entitlements|insert into public\.shops|delete from/);
 assert.match(database,/revoke all on function public\.bipstart_request_plan_change\(uuid,text\) from public,anon,authenticated/);
 assert.match(database,/grant execute on function public\.bipstart_request_plan_change\(uuid,text\) to authenticated/);
 const approve=database.slice(end);
 assert.match(approve,/update public\.shop_entitlements e/);
 assert.match(approve,/plan_code=p_plan/);
 assert.match(approve,/where e\.shop_id=p_shop_id/);
 assert.match(approve,/if p_action='activate' then[\s\S]*update public\.shops s set requested_plan=p_plan where s\.id=p_shop_id/);
 assert.doesNotMatch(approve,/insert into public\.shops|delete from public\.shop_products|truncate|drop table/i);
});
test('mudança de plano exibe botão de solicitação e mantém personalização Premium no mesmo painel',()=>{
 const css=readFileSync('public/cliente.css','utf8');
 assert.match(source,/function planManagementCard\(\)/);
 assert.match(source,/Plano ativo:/);
 assert.match(source,/Seus produtos, estoque, vendas, cardápio, endereço e configurações permanecem na mesma loja/);
 assert.match(source,/planManagementCard\(\)/);
 assert.match(source,/renderPage\(\)/);
 assert.match(source,/setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)void refreshActivatedPlan\(\)\},60000\)/);
 assert.match(css,/#workspace \.plan-management/);
 assert.match(panel,/\/cliente\.css\?v=25/);
});
