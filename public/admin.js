'use strict';
const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PLAN={basic:'Básico',personalizado:'Personalizado',pro:'Pro'};
const WHATSAPP='5511978353820';
let config=null,busy=false;
function message(t,error=false){$('adminMessage').textContent=t;$('adminMessage').style.color=error?'var(--danger)':'var(--text)'}
function session(){try{return JSON.parse(localStorage.getItem('bipstart_customer_session')||'null')}catch{return null}}
async function request(fn,body){
 const auth=session();
 if(!auth?.access_token)throw Error('Entre primeiro em sua conta BipStart e abra novamente esta página.');
 const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+fn,{
   method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},
   body:JSON.stringify(body||{})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(response.status===401||response.status===403?'Seu usuário não está autorizado como administrador.':(data?.message||'Falha ao consultar as lojas.'));
 return data;
}
function row(item){
 const expiredTrial=item.access_status==='trialing'&&new Date(item.trial_until)<=new Date();
 const expiredPaid=item.access_status==='active'&&item.active_until&&new Date(item.active_until)<=new Date();
 const status=expiredTrial?'Teste expirado':expiredPaid?'Plano vencido':item.access_status;
 const plan=PLAN[item.requested_plan]?item.requested_plan:'basic';
 const option=Object.entries(PLAN).map(([value,label])=>'<option value="'+value+'"'+(value===plan?' selected':'')+'>'+label+'</option>').join('');
 return '<tr data-shop-id="'+escapeHtml(item.shop_id)+'"><td><strong>'+escapeHtml(item.shop_name)+'</strong><div class="admin-muted">'+escapeHtml(item.shop_id)+'</div></td>'+
   '<td>'+escapeHtml(PLAN[item.requested_plan]||item.requested_plan)+'<div class="admin-muted">'+(item.signup_choice==='trial'?'Teste solicitado':'WhatsApp')+'</div></td>'+
   '<td class="admin-status">'+escapeHtml(status)+'<div class="admin-muted">'+(item.active_until?'Até '+new Date(item.active_until).toLocaleDateString('pt-BR'):(item.trial_until&&item.access_status==='trialing'?'Teste até '+new Date(item.trial_until).toLocaleString('pt-BR'):''))+'</div></td>'+
   '<td><select aria-label="Plano para ativar">'+option+'</select></td><td><div class="admin-actions">'+
   '<button type="button" class="button" data-action="activate">Ativar</button>'+
   '<button type="button" class="ghost" data-action="suspend">Suspender</button></div></td></tr>';
}
async function load(){
 if(busy)return;busy=true;$('reload').disabled=true;message('Buscando lojas...');
 try{
   if(!config)config=await fetch('/api/public-config',{cache:'no-store'}).then(r=>r.json());
   if(!config?.enabled)throw Error('Configuração Supabase não disponível.');
   const items=await request('bipstart_admin_list_shops');
   $('adminRows').innerHTML=(Array.isArray(items)?items:[]).map(row).join('');
   message((items||[]).length+' loja(s) encontradas. Confirme o pagamento antes de liberar.');
 }catch(e){$('adminRows').replaceChildren();message(e.message,true)}
 finally{busy=false;$('reload').disabled=false}
}
$('reload').addEventListener('click',load);
$('adminRows').addEventListener('click',async e=>{
 const btn=e.target.closest('[data-action]');if(!btn||busy)return;
 const tr=btn.closest('tr');const shopId=tr?.dataset.shopId,plan=tr?.querySelector('select')?.value;
 const action=btn.dataset.action;
 if(!shopId||!PLAN[plan]||!['activate','suspend'].includes(action))return;
 const text=action==='activate'
  ?'Você confirma que verificou o pagamento desta loja por WhatsApp e deseja ativar o plano '+PLAN[plan]+'?'
  :'Deseja suspender imediatamente o acesso desta loja?';
 if(!window.confirm(text))return;
 busy=true;btn.disabled=true;
 try{
  const ok=await request('bipstart_admin_set_access',{p_shop_id:shopId,p_plan:plan,p_action:action});
  if(ok!==true)throw Error('A atualização não foi confirmada.');
  message('Acesso atualizado. Nenhuma cobrança foi processada pela BipStart.');
 }catch(err){message(err.message,true)}
 finally{busy=false;btn.disabled=false;await load()}
});
load();