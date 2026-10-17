import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const client=readFileSync('public/cliente.js','utf8');
const admin=readFileSync('public/admin.js','utf8');
const clientHtml=readFileSync('public/cliente.html','utf8');
const adminHtml=readFileSync('public/admin.html','utf8');
const sql=readFileSync('sql/bipstart_premium_trial_remaining_days_20261017.sql','utf8');

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const future=()=>new Date(Date.now()+3*86400000).toISOString();
const past=()=>new Date(Date.now()-86400000).toISOString();

function planView(ent,shop){
 const start=client.indexOf('function planManagementCard(){');
 const end=client.indexOf('async function refreshActivatedPlan(){',start);
 assert.ok(start>=0&&end>start);
 return new Function('ent','shop','plans','esc','contactUrl','trialValid',
  client.slice(start,end)+';return planManagementCard();')(
   ent,shop,{basic:'Básico',pro:'Premium'},escapeHtml,()=>'https://wa.me/5511900000000',
   ()=>ent?.status==='trialing'&&Date.parse(ent.trial_until)>Date.now());
}
function upgradeFunctions(){
 const start=admin.indexOf('function pendingUpgrades(shops){');
 const end=admin.indexOf('async function loadCustomization(){',start);
 assert.ok(start>0&&end>start);
 return new Function('escapeHtml','PLAN','shopWhatsappUrl',
  admin.slice(start,end)+';return {pendingUpgrades,trialUpgradeEligible,upgradeCard,upgradeWhatsappUrl};')(
   escapeHtml,{basic:'Básico',pro:'Premium'},()=> 'https://wa.me/5511999999999');
}
function shop(overrides={}){
 return {shop_id:'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb',shop_name:'Loja de teste',
  owner_email:'teste@example.com',shop_whatsapp:'11999999999',requested_plan:'pro',
  upgrade_request_type:'trial',access_status:'trialing',plan_code:'basic',
  trial_until:future(),...overrides};
}

test('Básico gratuito oferece teste Premium sem reiniciar contagem',()=>{
 new vm.Script(client);
 new vm.Script(admin);
 const until=future();
 const base=planView({status:'trialing',plan_code:'basic',trial_until:until},
  {requested_plan:'basic',upgrade_request_type:'paid'});
 assert.match(base,/data-plan-trial-request="pro"/);
 assert.match(base,/Testar Premium com os dias restantes/);
 assert.match(base,/Os 7 dias não reiniciam/);
 assert.match(base,/data-plan-request="pro"/);
 assert.match(base,/Solicitar Premium pago/);
 const waiting=planView({status:'trialing',plan_code:'basic',trial_until:until},
  {requested_plan:'pro',upgrade_request_type:'trial'});
 assert.match(waiting,/Teste Premium solicitado/);
 assert.match(waiting,/Os dias já usados no teste Básico continuam contando/);
 assert.doesNotMatch(waiting,/Solicitar ativação pelo WhatsApp/);
 assert.doesNotMatch(waiting,/data-plan-trial-request="pro"/);
 const released=planView({status:'trialing',plan_code:'pro',trial_until:until},
  {requested_plan:'pro',upgrade_request_type:'trial'});
 assert.match(released,/Premium em teste até/);
 assert.match(released,/A data original de suspensão dos 7 dias foi mantida/);
 const expired=planView({status:'trialing',plan_code:'basic',trial_until:past()},
  {requested_plan:'basic',upgrade_request_type:'paid'});
 assert.doesNotMatch(expired,/data-plan-trial-request="pro"/);
 assert.match(client,/if\(!shop\|\|ent\?\.plan_code!=='basic'\|\|!trialValid\(\)/);
 assert.match(client,/rpc\('bipstart_request_premium_trial',\{p_shop_id:shop\.id\}\)/);
 assert.match(client,/shop\.upgrade_request_type='trial'/);
 assert.match(client,/shop\.upgrade_request_type='paid'/);
 assert.match(client,/requested_plan,signup_choice,upgrade_request_type,brand_color/);
});

test('Admin só libera teste Premium enquanto prazo gratuito original estiver ativo',()=>{
 const f=upgradeFunctions();
 const trial=shop();
 assert.equal(f.trialUpgradeEligible(trial),true);
 const card=f.upgradeCard(trial);
 assert.match(card,/Liberar teste Premium/);
 assert.match(card,/data-upgrade-trial/);
 assert.match(card,/Não reiniciar o prazo e não cobrar/);
 assert.doesNotMatch(card,/data-upgrade-activate/);
 assert.doesNotMatch(f.upgradeWhatsappUrl(trial),/pagamento/i);
 assert.equal(f.trialUpgradeEligible(shop({trial_until:past()})),false);
 assert.equal(f.trialUpgradeEligible(shop({access_status:'active'})),false);
 assert.equal(f.trialUpgradeEligible(shop({plan_code:'pro'})),false);
 assert.equal(f.trialUpgradeEligible(shop({upgrade_request_type:'paid'})),false);
 const expired=f.upgradeCard(shop({trial_until:past()}));
 assert.doesNotMatch(expired,/data-upgrade-trial/);
 assert.match(expired,/não é possível reiniciar os 7 dias/);
 const paid=f.upgradeCard(shop({upgrade_request_type:'paid'}));
 assert.match(paid,/data-upgrade-activate/);
 assert.match(paid,/Ativar Premium pago \(30 dias\)/);
 assert.doesNotMatch(paid,/data-upgrade-trial/);
 assert.match(admin,/request\('bipstart_admin_list_upgrade_request_modes'\)/);
 assert.match(admin,/request\('bipstart_admin_upgrade_trial',\{p_shop_id:shopId\}\)/);
 assert.match(admin,/request\('bipstart_admin_set_access',\{p_shop_id:shopId,p_plan:'pro',p_action:'activate'\}\)/);
 assert.match(admin,/if\(isTrial&&!trialUpgradeEligible\(item\)\)return/);
 assert.match(adminHtml,/\/admin\.js\?v=10/);
 assert.match(clientHtml,/\/cliente\.js\?v=67/);
});

test('Supabase mantém trial_until, active_until e status intactos na liberação',()=>{
 const begin=sql.indexOf('create or replace function public.bipstart_admin_upgrade_trial(');
 const end=sql.indexOf('revoke all on function public.bipstart_admin_upgrade_trial',begin);
 assert.ok(begin>=0&&end>begin);
 const fn=sql.slice(begin,end);
 assert.match(fn,/auth\.uid\(\) is null or not exists\(/);
 assert.match(fn,/public\.bipstart_admins a where a\.user_id=auth\.uid\(\)/);
 assert.match(fn,/s\.upgrade_request_type='trial'/);
 assert.match(fn,/set plan_code='pro', updated_at=now\(\)/);
 assert.match(fn,/e\.plan_code='basic' and e\.status='trialing'/);
 assert.match(fn,/e\.trial_until is not null and e\.trial_until>now\(\)/);
 assert.doesNotMatch(fn,/set[\s\S]*?trial_until\s*=/);
 assert.doesNotMatch(fn,/set[\s\S]*?active_until\s*=/);
 assert.doesNotMatch(fn,/set[\s\S]*?status\s*=/);
 assert.match(fn,/values\(p_shop_id,auth\.uid\(\),'trial_upgrade','pro'\)/);
 assert.match(sql,/grant execute on function public\.bipstart_admin_upgrade_trial\(uuid\) to authenticated/);
 assert.match(sql,/grant execute on function public\.bipstart_request_premium_trial\(uuid\) to authenticated/);
 assert.match(sql,/revoke all on function public\.bipstart_admin_upgrade_trial\(uuid\)/);
 assert.match(sql,/check\(action in \('activate','suspend','trial_upgrade'\)\)/);
});

test('Solicitação de teste exige lojista e 7 dias gratuitos ainda válidos',()=>{
 const begin=sql.indexOf('create or replace function public.bipstart_request_premium_trial(');
 const end=sql.indexOf('revoke all on function public.bipstart_request_premium_trial',begin);
 assert.ok(begin>=0&&end>begin);
 const fn=sql.slice(begin,end);
 assert.match(fn,/s\.owner_id=auth\.uid\(\)/);
 assert.match(fn,/e\.status='trialing'/);
 assert.match(fn,/e\.plan_code='basic' and e\.trial_until>now\(\)/);
 assert.match(fn,/set requested_plan='pro', upgrade_request_type='trial'/);
 assert.doesNotMatch(fn,/update public\.shop_entitlements/);
 assert.match(sql,/set requested_plan=p_plan,upgrade_request_type='paid'/);
 assert.match(sql,/upgrade_request_type text not null default 'paid'/);
});
