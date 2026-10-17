import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const admin=readFileSync('public/admin.js','utf8');
const adminHtml=readFileSync('public/admin.html','utf8');
const client=readFileSync('public/cliente.js','utf8');
const clientHtml=readFileSync('public/cliente.html','utf8');
const driver=readFileSync('public/motoboy.js','utf8');
const driverHtml=readFileSync('public/motoboy.html','utf8');
const sql=readFileSync('sql/bipstart_premium_prepaid_30days_20261017.sql','utf8');
const courierSql=readFileSync('sql/bipstart_courier_managed_login_20261017.sql','utf8');
const edge=readFileSync('supabase/functions/bipstart-courier-credentials/index.ts','utf8');

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const d=(iso)=>new Date(iso).toLocaleString('pt-BR');

test('renovação +30 soma ao vencimento e registra quantidade e auditoria',()=>{
 new vm.Script(admin);
 const start=sql.indexOf('create or replace function public.bipstart_admin_extend_premium(');
 const end=sql.indexOf('revoke all on function public.bipstart_admin_extend_premium(',start);
 assert.ok(start>=0&&end>start);
 const rpc=sql.slice(start,end);
 assert.match(rpc,/public\.bipstart_admins a where a\.user_id=auth\.uid\(\)/);
 assert.match(rpc,/for update/);
 assert.match(rpc,/greatest\(now\(\),case/);
 assert.match(rpc,/when e\.status='trialing' and e\.trial_until>now\(\) then e\.trial_until/);
 assert.match(rpc,/when e\.status='active' and e\.active_until is not null then e\.active_until/);
 assert.match(rpc,/active_until=v_base\+interval '30 days'/);
 assert.match(rpc,/premium_paid_periods=e\.premium_paid_periods\+1/);
 assert.match(rpc,/values\(p_shop_id,auth\.uid\(\),'extend_30','pro'\)/);
 assert.match(rpc,/where e\.shop_id=p_shop_id/);
 assert.doesNotMatch(rpc,/delete from|truncate|drop table/i);
 assert.match(sql,/premium_paid_periods bigint not null default 0/);
 assert.match(sql,/grant execute on function public\.bipstart_admin_extend_premium\(uuid\) to authenticated/);
 assert.match(sql,/bipstart_access_audit_action_check/);
 // Exemplo de 3 pagamentos antecipados, sem descartar os 30 dias anteriores.
 const baseline=new Date('2026-11-10T12:00:00Z');
 const plus=(base,n)=>new Date(base.getTime()+n*30*86400000);
 assert.equal(plus(baseline,1).toISOString(),'2026-12-10T12:00:00.000Z');
 assert.equal(plus(baseline,3).toISOString(),'2027-02-08T12:00:00.000Z');
});

test('Admin mostra próximo vencimento, contador e ação +30 com confirmação de pagamento',()=>{
 const start=admin.indexOf('function premiumDueDate(item){');
 const end=admin.indexOf('function row(item){',start);
 assert.ok(start>=0&&end>start);
 const helper=new Function('escapeHtml',admin.slice(start,end)+';return {premiumDueDate,premiumPaymentSummary};')(escapeHtml);
 const shop={active_until:'2026-12-10T12:00:00Z',premium_paid_periods:3};
 assert.equal(helper.premiumDueDate(shop),d(shop.active_until));
 const line=helper.premiumPaymentSummary(shop);
 assert.match(line,/Próximo vencimento:/);
 assert.match(line,/acréscimos: 3/);
 assert.match(admin,/data-renew-30/);
 assert.match(admin,/request\('bipstart_admin_premium_renewal_summary'\)/);
 assert.match(admin,/request\('bipstart_admin_extend_premium',\{p_shop_id:shopId\}\)/);
 assert.match(admin,/Pagamento confirmado de 30 dias/);
 assert.match(admin,/O prazo será SOMADO ao próximo vencimento/);
 assert.match(admin,/Ativar Premium pago \(\+30 dias\)/);
 assert.match(adminHtml,/admin-add-30/);
 assert.match(adminHtml,/admin\.js\?v=12/);
 assert.match(client,/Próximo vencimento Premium:/);
 assert.match(clientHtml,/cliente\.js\?v=68/);
});

test('telefone do motoboy vira login seguro; conta antiga por e-mail continua funcionando',()=>{
 new vm.Script(driver);
 const start=driver.indexOf('function courierLoginEmail(input){');
 const stop=driver.indexOf("$('loginForm').onsubmit",start);
 assert.ok(start>=0&&stop>start);
 const login=new Function(driver.slice(start,stop)+';return courierLoginEmail;')();
 assert.equal(login('11 98888-7777'),'courier-5511988887777@login.bipstart.example');
 assert.equal(login('+55 (11) 98888-7777'),'courier-5511988887777@login.bipstart.example');
 assert.equal(login('998887777'),'courier-55998887777@login.bipstart.example');
 assert.equal(login('entregador@example.org'),'entregador@example.org');
 assert.throws(()=>login('abc'),/Informe seu telefone/);
 assert.match(driverHtml,/Telefone com DDD ou e-mail antigo/);
 assert.match(driverHtml,/name="login"/);
 assert.match(driverHtml,/autocomplete="current-password"/);
 assert.match(driver,/courierLoginEmail\(form\.elements\.namedItem\('login'\)\.value\)/);
 assert.match(driver,/auth\/v1\/token\?grant_type=password/);
 assert.match(driver,/bipstart_courier_claim_invite/);
 assert.match(driverHtml,/Tenho convite antigo/);
});

test('lojista define senha com confirmação e nunca salva a senha no banco da loja',()=>{
 new vm.Script(client);
 const start=client.indexOf('function courierForm(c){');
 const end=client.indexOf('function eligibleOnlineDeliveryOrders(',start);
 assert.ok(start>=0&&end>start);
 const render=new Function('formShell','field',client.slice(start,end)+';return courierForm;')(
  (_kind,id,body)=>body,
  (name,title,type,value,attributes)=>'<input name="'+name+'" '+attributes+' value="'+escapeHtml(value||'')+'">');
 const fresh=render({});
 assert.match(fresh,/name="phone"/);
 assert.match(fresh,/name="login_password"/);
 assert.match(fresh,/name="login_password_confirm"/);
 assert.match(fresh,/autocomplete="new-password"/);
 assert.match(fresh,/required/);
 const linked=render({id:'a',account_id:'x',login_managed:true,phone:'11999999999'});
 assert.match(linked,/Deixe vazio para manter a senha/);
 const legacy=render({id:'a',account_id:'x',login_managed:false,phone:'11999999999'});
 assert.doesNotMatch(legacy,/login_password/);
 assert.match(legacy,/conta por convite/);
 assert.match(client,/A confirmação da senha do motoboy não confere/);
 assert.match(client,/provisionCourierAccess/);
 assert.match(client,/functions\/v1\/bipstart-courier-credentials/);
 assert.match(client,/Authorization:'Bearer '\+session\.access_token/);
 assert.match(client,/case 'courierForm'/);
 assert.match(courierSql,/login_managed boolean not null default false/);
 assert.doesNotMatch(courierSql,/\bpassword\b|\bsenha\b/i);
});

test('Edge Function valida proprietário e Premium, usa Supabase Auth e não devolve credenciais',()=>{
 assert.match(edge,/createClient\(url, key/);
 assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(edge,/db\.auth\.getUser\(token\)/);
 assert.match(edge,/shop\.owner_id !== account\.user\.id/);
 assert.match(edge,/entitlement\.plan_code === "pro"/);
 assert.match(edge,/entitlement\.trial_until/);
 assert.match(edge,/entitlement\.active_until/);
 assert.match(edge,/login_managed: true/);
 assert.match(edge,/db\.auth\.admin\.createUser\(/);
 assert.match(edge,/db\.auth\.admin\.updateUserById\(/);
 assert.match(edge,/await db\.auth\.admin\.deleteUser\(created\.user\.id\)/);
 assert.match(edge,/\.eq\("shop_id", shopId\)/);
 assert.match(edge,/\.is\("account_id",null\)/);
 assert.match(edge,/access-control-allow-origin/);
 assert.match(edge,/password\.length|pass\.length < 8/);
 assert.doesNotMatch(edge,/console\.log|console\.error|password:\s*data\.password/);
 assert.match(edge,/return response\(200, "Acesso do motoboy criado\."/);
 assert.doesNotMatch(edge,/return response\([^\n]*password/);
});
