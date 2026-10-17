import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('public/admin.html','utf8');
const js=readFileSync('public/admin.js','utf8');
const client=readFileSync('public/cliente.js','utf8');
const clientHtml=readFileSync('public/cliente.html','utf8');
const sql=readFileSync('sql/bipstart_admin_links_20261016.sql','utf8');

test('admin mantém apenas Lojas e planos e Personalizações, sem Gerenciar links',()=>{
 new vm.Script(js,{filename:'public/admin.js'});
 assert.match(html,/id="adminShopsSection"/);
 assert.match(html,/id="customizationSection"/);
 assert.match(html,/id="adminTabShops"/);
 assert.match(html,/id="adminTabCustom"/);
 assert.doesNotMatch(html,/Gerenciar links|adminTabLinks|adminLinksSection|adminShopLinks|adminGeneralLinks/);
 assert.doesNotMatch(js,/adminLinksSection|adminShopLinks|adminGeneralLinks|loadLinks\(\)|bipstart_admin_list_shop_links/);
 assert.match(js,/const ADMIN_TABS=\{shops:'adminShopsSection',custom:'customizationSection'\}/);
 assert.match(js,/setAdminTab\(tab\.dataset\.adminTab\)/);
 assert.match(html,/\/admin\.js\?v=8/);
});
test('lista administrativa mostra WhatsApp clicável das lojas com formato válido',()=>{
 const start=js.indexOf('function shopWhatsappUrl(value){');
 const end=js.indexOf('const REQUEST_STATUS=',start);
 assert.ok(start>0&&end>start);
 const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const {shopWhatsappUrl,row}=new Function('escapeHtml','PLAN',js.slice(start,end)+';return {shopWhatsappUrl,row};')(
  escapeHtml,{basic:'Básico',pro:'Premium'});
 assert.equal(shopWhatsappUrl('11966374236'),'https://wa.me/5511966374236');
 assert.equal(shopWhatsappUrl('+55 (11) 96637-4236'),'https://wa.me/5511966374236');
 assert.equal(shopWhatsappUrl('1234'),'');
 const item={
  shop_id:'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb',
  shop_name:'Loja <exemplo>',
  owner_email:'cliente@example.com',
  shop_whatsapp:'11966374236',
  requested_plan:'basic',signup_choice:'whatsapp',access_status:'pending'
 };
 const link=row(item);
 assert.match(link,/WhatsApp: <a href="https:\/\/wa\.me\/5511966374236"/);
 assert.match(link,/target="_blank" rel="noopener noreferrer"/);
 assert.match(link,/aria-label="Conversar no WhatsApp com Loja &lt;exemplo&gt;"/);
 assert.match(link,/11966374236 ↗/);
 assert.match(link,/cliente@example\.com/);
 assert.doesNotMatch(link,/<exemplo>/);
 assert.match(row({...item,shop_whatsapp:null}),/WhatsApp não cadastrado/);
 assert.doesNotMatch(row({...item,shop_whatsapp:'abc'}),/href="https:\/\/wa\.me\//);
 assert.match(js,/request\('bipstart_admin_list_shops_with_contacts'\)/);
 const migration=readFileSync('sql/bipstart_admin_shop_contacts_20261017.sql','utf8');
 assert.match(migration,/security definer/);
 assert.match(migration,/public\.bipstart_admins/);
 assert.match(migration,/shop_whatsapp text/);
 assert.match(migration,/revoke all on function public\.bipstart_admin_list_shops_with_contacts/);
 assert.match(migration,/grant execute on function public\.bipstart_admin_list_shops_with_contacts\(\) to authenticated/);
});

test('motoboys recebem convite individual no cadastro e login normal após vinculação',()=>{
 const start=client.indexOf('function courierAccessUrl(');
 const stop=client.indexOf('function renderPage(){',start);
 assert.ok(start>=0&&stop>start);
 const url=new Function(client.slice(start,stop)+';return courierAccessUrl;')();
 const origin='https://bipstart.example';
 const code='ac337d88-74aa-490f-82a1-699a1b364fa8';
 assert.equal(url({invite_code:code,account_id:null},origin),origin+'/motoboy?convite='+code);
 assert.equal(url({invite_code:null,account_id:'5b7f0c14-f4b0-45ef-a327-8a76e5f901ad'},origin),origin+'/motoboy');
 assert.equal(url({invite_code:null,account_id:null},origin),origin+'/motoboy');
 assert.match(client,/data-share-courier/);
 assert.match(client,/data-copy-invite/);
 assert.match(client,/navigator\.share/);
 assert.match(client,/navigator\.clipboard\.writeText\(link\)/);
 assert.match(client,/Compartilhar link/);
 assert.match(client,/Link de login do motoboy/);
});
test('diretório SQL legado mantém controles de acesso, mas não é mostrado no admin',()=>{
 assert.match(sql,/create or replace function public\.bipstart_admin_list_shop_links\(\)/);
 assert.match(sql,/auth\.uid\(\) is null or not exists/);
 assert.match(sql,/revoke all on function public\.bipstart_admin_list_shop_links\(\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.bipstart_admin_list_shop_links\(\) to authenticated/);
 assert.doesNotMatch(sql,/invite_code|access_token|service_role|delete from/i);
});
test('login cliente continua entrando diretamente no PDV',()=>{
 new vm.Script(client,{filename:'public/cliente.js'});
 assert.match(client,/async function openShop\(\)/);
 assert.match(client,/tab='caixa';showForm=null;pastedProductImage=null/);
 assert.match(client,/hiding\('workspace',true\);renderPage\(\)/);
 assert.doesNotMatch(client,/modeChooser|modeCardapio|backToModes/);
 assert.doesNotMatch(clientHtml,/id="modeChooser"|id="backToModes"|data-open-mode/);
 assert.match(clientHtml,/\/cliente\.js\?v=54/);
});
