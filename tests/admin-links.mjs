import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/admin.html','utf8');
const js=readFileSync('public/admin.js','utf8');
const sql=readFileSync('sql/bipstart_admin_links_20261016.sql','utf8');
const client=readFileSync('public/cliente.js','utf8');
const clientHtml=readFileSync('public/cliente.html','utf8');

test('administrador tem aba Gerenciar links, planos e personalizacoes',()=>{
 new vm.Script(js,{filename:'public/admin.js'});
 assert.match(html,/id="adminTabLinks"[^>]*data-admin-tab="links"/);
 assert.match(html,/id="adminLinksSection"[^>]*role="tabpanel"/);
 assert.match(html,/id="adminGeneralLinks"/);
 assert.match(html,/id="adminShopLinks"/);
 assert.match(html,/id="adminLinksMessage"/);
 assert.match(html,/id="adminShopsSection"/);
 assert.match(html,/id="customizationSection"/);
 assert.match(html,/\/admin\.js\?v=6/);
 assert.match(js,/function setAdminTab\(name\)/);
 assert.match(js,/setAdminTab\(tab\.dataset\.adminTab\)/);
});
test('diretorio traz links da plataforma e do cardapio por slug, compartilhar e copiar',()=>{
 assert.match(js,/bipstart_admin_list_shop_links/);
 for(const link of ["/cliente","/admin","/motoboy","/acompanhar"]){
  assert.ok(js.includes("base+'"+link+"'"),link);
 }
 assert.match(js,/location\.origin\+'\/cardapio\?loja='\+encodeURIComponent\(shop\.shop_slug\)/);
 assert.match(js,/data-link-action="share"/);
 assert.match(js,/data-link-action="copy"/);
 assert.match(js,/navigator\.share/);
 assert.match(js,/navigator\.clipboard\.writeText\(url\)/);
 assert.match(js,/share:title==='Login do motoboy'/);
 assert.match(js,/cardapio,\{share:true,available:premium\}/);
 assert.match(js,/plan_code==='pro'/);
 assert.match(js,/base\+'\/cliente\?editar=cardapio'/);
 assert.match(js,/const access=adminShopAccess\.find\(item=>item\.shop_id===shop\.shop_id\)/);
 assert.match(js,/Date\.parse\(access\.active_until\)>now/);
});
test('funcao de links exige administrador e nao expõe convites individuais de motoboy',()=>{
 assert.match(sql,/create or replace function public\.bipstart_admin_list_shop_links\(\)/);
 assert.match(sql,/auth\.uid\(\) is null or not exists/);
 assert.match(sql,/public\.bipstart_admins a where a\.user_id=auth\.uid\(\)/);
 assert.match(sql,/revoke all on function public\.bipstart_admin_list_shop_links\(\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.bipstart_admin_list_shop_links\(\) to authenticated/);
 assert.match(sql,/select s\.id,s\.name,s\.slug,e\.plan_code,e\.status/);
 assert.doesNotMatch(sql,/invite_code|access_token|service_role|delete from/i);
});
test('login cliente entra no PDV e não mostra tela de escolha ou botão voltar',()=>{
 new vm.Script(client,{filename:'public/cliente.js'});
 assert.match(client,/async function openShop\(\)/);
 assert.match(client,/tab='caixa';showForm=null;pastedProductImage=null/);
 assert.match(client,/hiding\('workspace',true\);renderPage\(\)/);
 assert.doesNotMatch(client,/modeChooser|modeCardapio|backToModes/);
 assert.doesNotMatch(clientHtml,/id="modeChooser"|id="backToModes"|data-open-mode/);
 assert.doesNotMatch(client,/Defina horário, localização, pagamentos e entrega/);
 assert.match(clientHtml,/\/cliente\.js\?v=35/);
});
