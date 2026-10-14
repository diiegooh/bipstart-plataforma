import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const homepage=readFileSync('public/index.html','utf8');
const app=readFileSync('public/app.js','utf8');
const clientHtml=readFileSync('public/cliente.html','utf8');
const client=readFileSync('public/cliente.js','utf8');
const admin=readFileSync('public/admin.js','utf8');
const menu=readFileSync('public/cardapio.js','utf8');
const sql=readFileSync('sql/bipstart_two_plans_unified_20261014.sql','utf8');

test('homepage comercial divulga só dois planos e não agenda',()=>{
 new vm.Script(app,{filename:'public/app.js'});
 const plans=[...homepage.matchAll(/<article class="plan(?: [^"]*)?"/g)];
 assert.equal(plans.length,2);
 assert.match(homepage,/Plano Básico/);
 assert.match(homepage,/Plano Premium/);
 assert.match(homepage,/R\$ <strong>29,90<\/strong>/);
 assert.match(homepage,/R\$ <strong>79,90<\/strong>/);
 assert.match(homepage,/suporte mensal/i);
 assert.match(homepage,/motoboys próprios/i);
 assert.doesNotMatch(homepage,/Agenda de serviços|Plano Personalizado|Plano Pro\b|data-model="agenda"/i);
 assert.doesNotMatch(homepage,/data:image\/png;base64/i);
});
test('onboarding oferece PDV e cardápio para os dois planos sem agenda',()=>{
 assert.match(clientHtml,/name="model" value="pdv"/);
 assert.match(clientHtml,/PDV com estoque \+ cardápio online/);
 assert.match(clientHtml,/value="basic">Básico/);
 assert.match(clientHtml,/value="pro">Premium/);
 assert.doesNotMatch(clientHtml,/value="agenda"|value="cardapio"|value="personalizado"/);
 assert.match(client,/const models=\{pdv:'PDV com estoque \+ cardápio online'\}/);
 assert.match(client,/if\(!plans\[v\.requested_plan\]\|\|v\.model!=='pdv'\)/);
 assert.match(client,/a\.push\(\['caixa','Frente de caixa'\],\['produtos','Produtos e estoque'\],\['cardapio','Meu cardápio'\],\['vendas','Histórico de vendas'\]\)/);
 assert.doesNotMatch(client,/a\.push\(\['agenda'/);
});
test('estoque fica no PDV e descrição no cardápio com o mesmo shop_products',()=>{
 assert.match(client,/const isMenu=tab==='cardapio'/);
 assert.match(client,/products=await get\('shop_products'\)/);
 assert.match(client,/sales=await get\('shop_sales'\)/);
 assert.match(client,/categories=\(await get\('shop_menu_categories'\)\)/);
 assert.match(client,/const isMenu=tab==='cardapio';/);
 assert.match(client,/isMenu\?\{description:String\(v\.description\|\|''\)\.trim\(\)\}:\{/);
 assert.match(client,/cost:Number\(v\.cost\),stock:Number\(v\.stock\)/);
 assert.match(client,/menuSchemaReady/);
 assert.doesNotMatch(app,/ws\.menuItems/);
 assert.match(app,/const model=\[\['pdv','Frente de caixa'\],\['products','Produtos e estoque'\],\['sales','Histórico de vendas'\],\['menu','Meu cardápio'\]/);
});
test('Premium exibe motoboys, suporte, logo e edição de cores',()=>{
 assert.match(client,/function canCustomize\(\)\{return proAccess\(\)\}/);
 assert.match(client,/if\(proAccess\(\)\)a\.push\(\['motoboys','Motoboys'\],\['entregas','Entregas'\]\)/);
 assert.match(client,/if\(canCustomize\(\)\)a\.push\(\['personalizar','Mudanças e suporte'\]\)/);
 assert.match(client,/canCustomize\(\)\?field\('brand_color'/);
 assert.match(client,/if\(canCustomize\(\)\)\{/);
 assert.match(client,/Logo própria e cores personalizadas são exclusivas do Premium vigente/);
 assert.match(admin,/const PLAN=\{basic:'Básico',pro:'Premium'\}/);
 assert.doesNotMatch(admin,/personalizado/);
 assert.match(menu,/document\.documentElement\.style\.setProperty\('--purple',menu\.brand_color\)/);
 assert.match(menu,/\^#\[0-9a-fA-F\]\{6\}\$/);
});
test('RLS e planos do banco impedem agenda e assinatura intermediária',()=>{
 assert.match(sql,/check\(model='pdv'\)/);
 assert.match(sql,/check\(requested_plan in \('basic','pro'\)\)/);
 assert.match(sql,/check\(plan_code in \('basic','pro'\)\)/);
 assert.match(sql,/public\.has_delivery_access\(p_shop\)/);
 assert.match(sql,/p_plan not in \('basic','pro'\)/);
 assert.match(sql,/now\(\)\+interval '30 days'/);
 assert.match(sql,/new\.brand_color is distinct from old\.brand_color/);
 assert.match(sql,/public\.bipstart_can_customize\(new\.id\)/);
 assert.match(sql,/where s\.slug=p_slug and s\.model='pdv'/);
 assert.match(sql,/case when e\.plan_code='pro' then s\.logo_path else null end/);
 assert.match(sql,/case when e\.plan_code='pro' then s\.brand_color else '#7c3aed' end/);
 assert.doesNotMatch(sql,/truncate|delete from public\.shops|drop table/i);
});


test('preços apresentados são Básico R$ 29,90 e Premium R$ 79,90',()=>{
 const files=[
  'public/index.html','public/cliente.html','public/cliente.js',
  'public/admin.html','public/app.js','README.md',
  'WHATSAPP_PLANOS_MANUAL.md','PROMPT_REDESIGN_CARDAPIO_BIPSTART.md',
  'MOTOBOYS_PLANO_PRO.md'
 ];
 for(const path of files){
  const content=readFileSync(path,'utf8');
  assert.doesNotMatch(content,/R\$\s*(?:29,99|99,90|49,99)/,path);
 }
 const signup=readFileSync('public/cliente.html','utf8');
 const front=readFileSync('public/index.html','utf8');
 const admin=readFileSync('public/admin.html','utf8');
 assert.match(front,/R\$ <strong>29,90<\/strong>/);
 assert.match(front,/R\$ <strong>79,90<\/strong>/);
 assert.match(signup,/Básico — R\$ 29,90/);
 assert.match(signup,/Premium — R\$ 79,90\/mês/);
 assert.match(admin,/Premium custa R\$ 79,90/);
 assert.match(client,/const planPrices=\{basic:'R\$ 29,90 \(pagamento único\)',pro:'R\$ 79,90\/mês'\}/);
 assert.match(app,/change===3\?'R\$ 79,90 por mês':fmt\(29\.90\)/);
 assert.match(front,/\/app\.js\?v=3/);
 assert.match(signup,/\/cliente\.js\?v=12/);
});
