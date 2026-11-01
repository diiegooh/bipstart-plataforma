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

test('homepage divulga somente Básico e Premium e destaca seus recursos',()=>{
 new vm.Script(app,{filename:'public/app.js'});
 assert.equal((homepage.match(/<article class="bs-plan(?: [^"]*)?">/g)||[]).length,2);
 assert.match(homepage,/<h3>Básico<\/h3>/);
 assert.match(homepage,/<h3>Premium<\/h3>/);
 assert.match(homepage,/R\$ 29,90/);
 assert.match(homepage,/R\$ 79,90/);
 assert.match(homepage,/PDV e controle de estoque/);
 assert.match(homepage,/Cardápio online e pedidos/);
 assert.match(homepage,/motoboys/i);
 assert.doesNotMatch(homepage,/Agenda de serviços|Plano Personalizado|Plano Pro\b|data-model="agenda"/i);
 assert.doesNotMatch(homepage,/data:image\/png;base64/i);
});
test('onboarding oferece PDV e cardápio para os dois planos sem agenda',()=>{
 assert.match(clientHtml,/name="model" value="pdv"/);
 assert.match(clientHtml,/PDV com estoque e vendas/);
 assert.match(clientHtml,/value="basic">Básico/);
 assert.match(clientHtml,/value="pro">Premium/);
 assert.doesNotMatch(clientHtml,/value="agenda"|value="cardapio"|value="personalizado"/);
 assert.match(client,/const models=\{pdv:'PDV com estoque \+ cardápio online'\}/);
 assert.match(client,/if\(!plans\[v\.requested_plan\]\|\|v\.model!=='pdv'\)/);
 assert.match(client,/a\.push\(\['caixa','Frente de caixa'\],\['produtos','Produtos e estoque'\],\['vendas','Histórico de vendas'\]\)/);
 assert.match(client,/if\(proAccess\(\)\)a\.push\(\['cardapio','Meu cardápio'\]\)/);
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
 assert.match(client,/if\(proAccess\(\)\)a\.push\(\['pedidos','Pedidos online'\],\['motoboys','Motoboys'\],\['entregas','Entregas'\]\)/);
 assert.match(client,/if\(canCustomize\(\)\)a\.push\(\['personalizar','Mudanças e suporte'\]\)/);
 assert.match(client,/canCustomize\(\)\?field\('brand_color'/);
 assert.match(client,/if\(canCustomize\(\)\)\{/);
 assert.doesNotMatch(client,/Logo própria e cores personalizadas são exclusivas do Premium vigente/);
 assert.doesNotMatch(client,/Identidade BipStart padrão\. A troca de cores é exclusiva do Premium\./);
 assert.doesNotMatch(client,/Seu endereço do cardápio é:/);
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


test('os preços exibidos e as regras de planos permanecem consistentes',()=>{
 const files=['public/index.html','public/cliente.html','public/cliente.js',
  'public/admin.html','public/app.js','README.md'];
 for(const path of files)assert.doesNotMatch(readFileSync(path,'utf8'),/R\$\s*(?:29,99|99,90|49,99)/,path);
 const signup=readFileSync('public/cliente.html','utf8');
 const front=readFileSync('public/index.html','utf8');
 const adminHtml=readFileSync('public/admin.html','utf8');
 assert.match(front,/R\$ 29,90/);
 assert.match(front,/R\$ 79,90/);
 assert.match(signup,/R\$ 29,90/);
 assert.match(signup,/R\$ 79,90/);
 assert.match(adminHtml,/79,90/);
 assert.match(client,/const planPrices=\{basic:'R\$ 29,90/);
 assert.doesNotMatch(client,/requested_plan:'personalizado'|requested_plan:'agenda'/);
});
