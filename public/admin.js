'use strict';
const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PLAN={basic:'Básico',pro:'Premium'};
const WHATSAPP='5511978353820';
let config=null,busy=false,adminShopRecords=[];
function message(t,error=false){$('adminMessage').textContent=t;$('adminMessage').style.color=error?'var(--danger)':'var(--text)'}
const STORAGE='bipstart_customer_session';
function session(){try{return JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{return null}}
function loginRequired(){return Error('Sua sessão da homologação não está válida. Entre novamente em /cliente neste mesmo endereço e volte ao painel /admin.')}
async function activeSession(){
 const current=session();
 if(!current?.access_token)throw loginRequired();
 if(Number(current.expires_at||0)>Date.now()/1000+90)return current;
 if(!current.refresh_token)throw loginRequired();
 let response;
 try{
  response=await fetch(config.supabaseUrl+'/auth/v1/token?grant_type=refresh_token',{
   method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
   body:JSON.stringify({refresh_token:current.refresh_token})
  });
 }catch{throw Error('Não foi possível renovar a sessão. Tente novamente.')}
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.access_token||!data.refresh_token){
  localStorage.removeItem(STORAGE);
  throw loginRequired();
 }
 const renewed={...current,...data,expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)};
 localStorage.setItem(STORAGE,JSON.stringify(renewed));
 return renewed;
}
async function signedInAccount(){
 const auth=await activeSession();
 const r=await fetch(config.supabaseUrl+'/auth/v1/user',{
  headers:{apikey:config.publishableKey,Authorization:'Bearer '+auth.access_token}
 });
 if(!r.ok)throw loginRequired();
 const user=await r.json().catch(()=>null);
 if(!user?.id)throw loginRequired();
 $('adminAccount').textContent='Conta conectada: '+String(user.email||'(e-mail indisponível)');
 return user;
}
async function request(fn,body){
 const auth=await activeSession();
 const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+fn,{
   method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},
   body:JSON.stringify(body||{})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok){
  if(response.status===401)throw loginRequired();
  if(response.status===403||data?.code==='42501'){
   throw Error('Esta conta não tem permissão administrativa. Confira o e-mail conectado acima e entre com a conta autorizada na homologação.');
  }
  throw Error(data?.message||'Falha ao consultar as lojas. HTTP '+response.status);
 }
 return data;
}
function shopWhatsappUrl(value){
 const digits=String(value||'').replace(/\D/g,'');
 if(/^\d{10,11}$/.test(digits))return 'https://wa.me/55'+digits;
 if(/^55\d{10,11}$/.test(digits))return 'https://wa.me/'+digits;
 return '';
}
function premiumDueDate(item){
 const end=item.active_until;
 if(!end||!Number.isFinite(Date.parse(end)))return 'Ainda sem vencimento pago';
 return new Date(end).toLocaleString('pt-BR');
}
function premiumPaymentSummary(item){
 return '<div class="admin-premium-payment">'+
  '<strong>Próximo vencimento: '+escapeHtml(premiumDueDate(item))+'</strong>'+
  '<small>+30 dias registrados: '+Number(item.premium_paid_periods||0)+'</small>'+
  '</div>';
}
function row(item){
 const whatsappUrl=shopWhatsappUrl(item.shop_whatsapp);
 const whatsappLine=whatsappUrl?
  '<div class="admin-shop-whatsapp">WhatsApp: <a href="'+escapeHtml(whatsappUrl)+'" target="_blank" rel="noopener noreferrer" aria-label="Conversar no WhatsApp com '+escapeHtml(item.shop_name)+'">'+escapeHtml(item.shop_whatsapp)+' ↗</a></div>':
  '<div class="admin-muted admin-shop-whatsapp">WhatsApp não cadastrado</div>';
 const expiredTrial=item.access_status==='trialing'&&new Date(item.trial_until)<=new Date();
 const expiredPaid=item.access_status==='active'&&item.active_until&&new Date(item.active_until)<=new Date();
 const status=expiredTrial?'Teste expirado':expiredPaid?'Plano vencido':item.access_status;
 const plan=PLAN[item.requested_plan]?item.requested_plan:'basic';
 const option=Object.entries(PLAN).map(([value,label])=>'<option value="'+value+'"'+(value===plan?' selected':'')+'>'+label+'</option>').join('');
 const trialEditable=item.access_status==='trialing'&&
   Number.isFinite(Date.parse(item.trial_until))&&Date.parse(item.trial_until)>Date.now();
 const trialPlan=PLAN[item.plan_code]?item.plan_code:'basic';
 const trialOptions=Object.entries(PLAN).map(([value,label])=>
  '<option value="'+value+'"'+(value===trialPlan?' selected':'')+'>'+label+'</option>').join('');
 const trialControl=trialEditable?
  '<div class="admin-trial-change" data-trial-plan><label for="trial-plan-'+escapeHtml(item.shop_id)+'">Plano durante o teste</label>'+
  '<select class="admin-trial-select" id="trial-plan-'+escapeHtml(item.shop_id)+'" aria-label="Novo plano de teste da loja '+escapeHtml(item.shop_name)+'">'+trialOptions+'</select>'+
  '<button type="button" class="button admin-trial-save" data-trial-change-plan disabled>Salvar plano do teste</button>'+
  '<small>Até '+new Date(item.trial_until).toLocaleString('pt-BR')+'. O prazo original não muda.</small>'+
  '</div>':'';
 
 return '<tr data-shop-id="'+escapeHtml(item.shop_id)+'"><td><strong>'+escapeHtml(item.shop_name)+'</strong><div class="admin-email">'+escapeHtml(item.owner_email||'E-mail não disponível')+'</div>'+whatsappLine+'<div class="admin-muted">'+escapeHtml(item.shop_id)+'</div></td>'+
   '<td>'+escapeHtml(PLAN[item.requested_plan]||item.requested_plan)+'<div class="admin-muted">'+(item.signup_choice==='trial'?'Teste solicitado':'WhatsApp')+'</div></td>'+
   '<td class="admin-status">'+escapeHtml(status)+'<div class="admin-muted">'+(item.active_until?'Até '+new Date(item.active_until).toLocaleDateString('pt-BR'):(item.trial_until&&item.access_status==='trialing'?'Teste até '+new Date(item.trial_until).toLocaleString('pt-BR'):''))+'</div>'+
   ((item.plan_code==='pro'||item.requested_plan==='pro')?premiumPaymentSummary(item):'')+'</td>'+
   '<td><label class="admin-plan-activation-label">Plano para ativação paga<select class="admin-plan-activation" aria-label="Plano para ativar">'+option+'</select></label>'+trialControl+'</td><td><div class="admin-actions">'+
   '<button type="button" class="button" data-action="activate">Ativar</button>'+
   ((item.plan_code==='pro'||item.requested_plan==='pro')?
    '<button type="button" class="button admin-add-30" data-renew-30>+30 dias</button>':'')+
   '<button type="button" class="ghost" data-action="suspend">Suspender</button></div></td></tr>';
}
const REQUEST_STATUS={novo:'Pendente',em_analise:'Em andamento',concluido:'Concluído'};
function contactWhatsapp(item){
 let phone=String(item.shop_whatsapp||'').replace(/\D/g,'');
 if(/^\d{10,11}$/.test(phone))phone='55'+phone;
 if(!/^55\d{10,11}$/.test(phone))return '';
 const text=[
  'Olá! Aqui é do atendimento BipStart.',
  'Estou entrando em contato sobre a solicitação de personalização da loja '+String(item.shop_name||'')+'.',
  'Podemos conversar sobre os detalhes?'
 ].join('\n');
 return 'https://wa.me/'+phone+'?text='+encodeURIComponent(text);
}
function requestCard(item){
 const status=REQUEST_STATUS[item.request_status]?item.request_status:'novo';
 const plan=PLAN[item.plan_code]||'Não identificado';
 const contact=contactWhatsapp(item);
 const created=item.created_at?new Date(item.created_at).toLocaleString('pt-BR'):'Data indisponível';
 const options=Object.entries(REQUEST_STATUS).map(([value,label])=>
  '<option value="'+value+'"'+(value===status?' selected':'')+'>'+label+'</option>').join('');
 const action=contact?'<a class="ghost custom-contact" href="'+escapeHtml(contact)+'" target="_blank" rel="noopener noreferrer">Conversar pelo WhatsApp ↗</a>':
  '<span class="admin-muted">WhatsApp não cadastrado</span>';
 return '<article class="customization-card" data-request-id="'+escapeHtml(item.request_id)+'">'+
  '<div class="customization-head"><div><h3>'+escapeHtml(item.shop_name)+'</h3>'+
  '<p class="admin-email">'+escapeHtml(item.owner_email||'E-mail não disponível')+'</p>'+
  '<p class="admin-muted">Plano: '+escapeHtml(plan)+' · Enviado em '+escapeHtml(created)+'</p></div>'+
  '<span class="customization-status">'+escapeHtml(REQUEST_STATUS[status])+'</span></div>'+
  '<div class="customization-details">'+escapeHtml(item.details)+'</div>'+
  '<div class="customization-actions">'+
  '<label>Status <select aria-label="Status da solicitação">'+options+'</select></label>'+
  '<button type="button" class="button" data-custom-action="save">Salvar status</button>'+action+
  '</div></article>';
}
function pendingUpgrades(shops){
 return (Array.isArray(shops)?shops:[]).filter(item=>
  item.requested_plan==='pro'&&item.plan_code==='basic');
}
function trialUpgradeEligible(item){
 return item?.requested_plan==='pro'&&item.plan_code==='basic'&&
  item.upgrade_request_type==='trial'&&item.access_status==='trialing'&&
  Number.isFinite(Date.parse(item.trial_until))&&Date.parse(item.trial_until)>Date.now();
}
function upgradeWhatsappUrl(item){
 const base=shopWhatsappUrl(item.shop_whatsapp);
 if(!base)return '';
 const trial=item.upgrade_request_type==='trial';
 const text=[
  'Olá! Aqui é do atendimento BipStart.',
  'Recebemos a solicitação de '+(trial?'teste Premium':'upgrade pago para Premium')+
    ' da loja '+String(item.shop_name||'')+'.',
  trial?'O teste Premium usa apenas os dias restantes dos 7 dias gratuitos, sem reiniciar a data de suspensão.':
    'Gostaria de confirmar os dados e orientar sobre o pagamento.'
 ].join('\n');
 return base+'?text='+encodeURIComponent(text);
}
function upgradeCard(item){
 const contact=upgradeWhatsappUrl(item);
 const action=contact?'<a class="ghost custom-contact" target="_blank" rel="noopener noreferrer" href="'+escapeHtml(contact)+'">Conversar pelo WhatsApp ↗</a>':
  '<span class="admin-muted">WhatsApp não cadastrado</span>';
 const trialRequested=item.upgrade_request_type==='trial';
 const eligible=trialUpgradeEligible(item);
 const until=item.trial_until&&Number.isFinite(Date.parse(item.trial_until))?
   new Date(item.trial_until).toLocaleString('pt-BR'):'Data indisponível';
 const trialAction=eligible?
  '<button type="button" class="button" data-upgrade-trial>Liberar teste Premium</button>':
  '<p class="admin-muted">O teste Básico expirou ou foi encerrado. Não é possível reiniciar os 7 dias.</p>';
 const paidAction='<button type="button" class="button" data-upgrade-activate>Ativar Premium pago (+30 dias)</button>';
 return '<article class="customization-card upgrade-card" data-upgrade-shop-id="'+escapeHtml(item.shop_id)+'">'+
  '<div class="customization-head"><div><p class="upgrade-kind">'+
  (trialRequested?'Solicitação de teste Premium':'Solicitação de upgrade')+'</p>'+
  '<h3>'+escapeHtml(item.shop_name)+'</h3>'+
  '<p class="admin-email">'+escapeHtml(item.owner_email||'E-mail não disponível')+'</p>'+
  '<p class="admin-muted">ID da loja: '+escapeHtml(item.shop_id)+'</p></div>'+
  '<span class="customization-status">'+(trialRequested?'Teste grátis':'Aguardando liberação')+'</span></div>'+
  '<div class="customization-details"><strong>Plano Básico → Premium</strong>'+
  (trialRequested?
   '<p>Teste Premium gratuito somente pelos dias restantes do Básico. Suspensão original em <strong>'+escapeHtml(until)+
   '</strong>. Não reiniciar o prazo e não cobrar.</p>':
   '<p>Upgrade solicitado pela loja. Confirme o pagamento antes de ativar. A liberação não é automática.</p>')+
  '</div><div class="customization-actions">'+
  (trialRequested?trialAction:paidAction)+action+
  '</div></article>';
}
function renderUpgrades(shops=adminShopRecords){
 const items=pendingUpgrades(shops);
 $('upgradeRequests').innerHTML=items.map(upgradeCard).join('');
 $('upgradeMessage').textContent=items.length?
  items.length+' solicitação(ões) de upgrade pendente(s).':
  'Nenhum upgrade pendente no momento.';
 return items.length;
}
async function loadCustomization(){
 $('customMessage').textContent='Carregando solicitações...';
 const items=await request('bipstart_admin_list_customization_requests');
 if(!Array.isArray(items))throw Error('Resposta inesperada ao consultar as solicitações.');
 $('customRequests').innerHTML=items.map(requestCard).join('');
 $('customMessage').textContent=items.length?items.length+' solicitação(ões) encontrada(s).':'Nenhuma solicitação de personalização até agora.';
}
const ADMIN_TABS={shops:'adminShopsSection',custom:'customizationSection'};
function setAdminTab(name){
 if(!Object.hasOwn(ADMIN_TABS,name))return;
 for(const [tab,id] of Object.entries(ADMIN_TABS)){
  $(id).classList.toggle('hidden',tab!==name);
  $('adminTab'+(tab==='shops'?'Shops':'Custom')).setAttribute('aria-selected',String(tab===name));
 }
}
document.querySelector('.admin-tabs').addEventListener('click',event=>{
 const tab=event.target.closest('[data-admin-tab]');
 if(tab){
  setAdminTab(tab.dataset.adminTab);
  if(tab.dataset.adminTab==='custom'&&!busy)void load();
 }
});

async function load(){
 if(busy)return;busy=true;$('reload').disabled=true;message('Buscando lojas...');
 try{
   if(!config)config=await fetch('/api/public-config',{cache:'no-store'}).then(r=>r.json());
   if(!config?.enabled)throw Error('Configuração Supabase não disponível.');
   await signedInAccount();
   const items=await request('bipstart_admin_list_shops_with_contacts');
   if(!Array.isArray(items))throw Error('Resposta inesperada ao consultar as lojas.');
   const renewals=await request('bipstart_admin_premium_renewal_summary');
   if(!Array.isArray(renewals))throw Error('Não foi possível consultar os vencimentos.');
   const renewalByShop=new Map(renewals.map(item=>[item.shop_id,item]));
   for(const item of items)Object.assign(item,renewalByShop.get(item.shop_id)||{});
   const requestModes=await request('bipstart_admin_list_upgrade_request_modes');
   if(!Array.isArray(requestModes))throw Error('Não foi possível identificar os pedidos de teste.');
   const requestByShop=new Map(requestModes.map(item=>[item.shop_id,item.upgrade_request_type]));
   for(const item of items)item.upgrade_request_type=requestByShop.get(item.shop_id)||'paid';
   adminShopRecords=items;
   $('adminRows').innerHTML=items.map(row).join('');
   renderUpgrades(items);
   message(items.length+' loja(s) encontradas. Pagos: confirmar pagamento. Testes Premium: manter prazo original.');
   try{await loadCustomization()}
   catch(e){$('customRequests').replaceChildren();$('customMessage').textContent='Não foi possível carregar as solicitações: '+e.message}
 }catch(e){
   adminShopRecords=[];
   $('adminRows').replaceChildren();$('upgradeRequests').replaceChildren();
   $('customRequests').replaceChildren();
   $('upgradeMessage').textContent='Não foi possível consultar os upgrades: '+e.message;
   $('customMessage').textContent='Faça login com uma conta administradora para visualizar as solicitações.';
   message(e.message,true);
 }
 finally{busy=false;$('reload').disabled=false}
}
$('reload').addEventListener('click',load);
// Durante o teste, apenas o plano muda: dias usados continuam contando.
$('adminRows').addEventListener('change',event=>{
 const select=event.target.closest('.admin-trial-select');
 if(!select)return;
 const row=select.closest('[data-shop-id]');
 const item=adminShopRecords.find(x=>x.shop_id===row?.dataset.shopId);
 const button=row?.querySelector('[data-trial-change-plan]');
 if(!button)return;
 const canChange=!!item&&item.access_status==='trialing'&&
  Number.isFinite(Date.parse(item.trial_until))&&Date.parse(item.trial_until)>Date.now();
 button.disabled=!canChange||busy||select.value===item.plan_code;
});
$('adminRows').addEventListener('click',async event=>{
 const button=event.target.closest('[data-trial-change-plan]');
 if(!button||busy||button.disabled)return;
 const row=button.closest('[data-shop-id]');
 const shopId=row?.dataset.shopId;
 const item=adminShopRecords.find(x=>x.shop_id===shopId);
 const target=row?.querySelector('.admin-trial-select')?.value;
 if(!item||!PLAN[target]||target===item.plan_code||
    item.access_status!=='trialing'||!Number.isFinite(Date.parse(item.trial_until))||
    Date.parse(item.trial_until)<=Date.now())return;
 const originalDeadline=new Date(item.trial_until).toLocaleString('pt-BR');
 if(!window.confirm('Alterar o teste grátis da loja "'+item.shop_name+'" de '+
    (PLAN[item.plan_code]||item.plan_code)+' para '+PLAN[target]+
    '? O teste continuará até '+originalDeadline+
    ', mantendo todos os dias já utilizados. Nenhuma cobrança será registrada.'))return;
 busy=true;button.disabled=true;$('reload').disabled=true;
 let feedback='',feedbackError=false;
 try{
  const result=await request('bipstart_admin_change_trial_plan',{
   p_shop_id:shopId,p_plan:target
  });
  if(!result||result.plan_code!==target||result.status!=='trialing'||
     Date.parse(result.trial_until)!==Date.parse(item.trial_until))
    throw Error('Não foi possível comprovar que o prazo original permaneceu intacto.');
  feedback='Plano de teste alterado para '+PLAN[target]+'. Encerramento original preservado: '+
    originalDeadline+'. Nenhuma cobrança registrada.';
 }catch(error){
  feedback='Não foi possível alterar o plano durante o teste: '+error.message;
  feedbackError=true;
 }finally{
  busy=false;button.disabled=false;$('reload').disabled=false;
  await load();
  if(feedback)message(feedback,feedbackError);
 }
});
$('adminRows').addEventListener('click',async e=>{
 const btn=e.target.closest('[data-action]');if(!btn||busy)return;
 const tr=btn.closest('tr');const shopId=tr?.dataset.shopId,plan=tr?.querySelector('.admin-plan-activation')?.value;
 const action=btn.dataset.action;
 if(!shopId||!PLAN[plan]||!['activate','suspend'].includes(action))return;
 const text=action==='activate'
  ?'Você confirma que verificou o pagamento da loja e deseja '+(plan==='pro'?'somar 30 dias Premium ao próximo vencimento':'ativar o plano '+PLAN[plan])+'?'
  :'Deseja suspender imediatamente o acesso desta loja?';
 if(!window.confirm(text))return;
 busy=true;btn.disabled=true;
 try{
  const result=action==='activate'&&plan==='pro'?
   await request('bipstart_admin_extend_premium',{p_shop_id:shopId}):
   await request('bipstart_admin_set_access',{p_shop_id:shopId,p_plan:plan,p_action:action});
  if(action==='activate'&&plan==='pro'){
   if(!Array.isArray(result)||!result[0]?.active_until)throw Error('O novo vencimento não foi confirmado.');
   message('Pagamento registrado. Próximo vencimento: '+premiumDueDate(result[0])+
    '. Renovações: '+result[0].premium_paid_periods+'.');
  }else{
   if(result!==true)throw Error('A atualização não foi confirmada.');
   message('Acesso atualizado. Nenhuma cobrança foi processada pela BipStart.');
  }
 }catch(err){message(err.message,true)}
 finally{busy=false;btn.disabled=false;await load()}
});
$('adminRows').addEventListener('click',async event=>{
 const button=event.target.closest('[data-renew-30]');
 if(!button||busy)return;
 const shopId=button.closest('[data-shop-id]')?.dataset.shopId;
 const item=adminShopRecords.find(s=>s.shop_id===shopId);
 if(!item||!(item.plan_code==='pro'||item.requested_plan==='pro'))return;
 if(!window.confirm('Pagamento confirmado de 30 dias para "'+item.shop_name+
  '"? O prazo será SOMADO ao próximo vencimento (não substituído).'))return;
 busy=true;button.disabled=true;$('reload').disabled=true;
 try{
  const result=await request('bipstart_admin_extend_premium',{p_shop_id:shopId});
  if(!Array.isArray(result)||!result[0]?.active_until)throw Error('O Supabase não confirmou a renovação.');
  message('Acrescentados 30 dias. Próximo vencimento: '+premiumDueDate(result[0])+
   '. Total de acréscimos: '+result[0].premium_paid_periods+'.');
 }catch(error){message('Não foi possível somar 30 dias: '+error.message,true)}
 finally{busy=false;button.disabled=false;$('reload').disabled=false;await load()}
});
$('upgradeRequests').addEventListener('click',async event=>{
 const button=event.target.closest('[data-upgrade-activate], [data-upgrade-trial]');
 if(!button||busy)return;
 const card=button.closest('[data-upgrade-shop-id]');
 const shopId=card?.dataset.upgradeShopId;
 const item=pendingUpgrades(adminShopRecords).find(shop=>shop.shop_id===shopId);
 if(!item||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId))return;
 const isTrial=!!button.closest('[data-upgrade-trial]');
 if(isTrial&&!trialUpgradeEligible(item))return;
 if(!isTrial&&item.upgrade_request_type==='trial')return;
 const prompt=isTrial?
  'Liberar o teste Premium da loja "'+item.shop_name+'" apenas até '+
   new Date(item.trial_until).toLocaleString('pt-BR')+
   '? Os dias já utilizados no Básico continuam contando e o prazo original não muda.':
  'Você confirmou o pagamento da loja "'+item.shop_name+
   '"? Serão somados 30 dias Premium à data do próximo vencimento, sem perder dias já pagos.';
 if(!window.confirm(prompt))return;
 busy=true;button.disabled=true;$('reload').disabled=true;
 try{
  const ok=isTrial?
   await request('bipstart_admin_upgrade_trial',{p_shop_id:shopId}):
   await request('bipstart_admin_extend_premium',{p_shop_id:shopId});
  if(isTrial?ok!==true:!Array.isArray(ok)||!ok[0]?.active_until)
   throw Error('O Supabase não confirmou a liberação.');
  $('upgradeMessage').textContent=isTrial?
   'Teste Premium liberado sem alterar a data de suspensão. Atualizando...':
   'Pagamento Premium confirmado. +30 dias somados ao próximo vencimento. Atualizando...';
 }catch(error){
  $('upgradeMessage').textContent='Não foi possível liberar o upgrade: '+error.message;
  busy=false;button.disabled=false;$('reload').disabled=false;
  return;
 }
 busy=false;button.disabled=false;$('reload').disabled=false;
 await load();
});
$('customRequests').addEventListener('click',async event=>{
 const button=event.target.closest('[data-custom-action="save"]');
 if(!button||busy)return;
 const card=button.closest('[data-request-id]');
 const requestId=card?.dataset.requestId;
 const status=card?.querySelector('select')?.value;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId||'')||
    !Object.hasOwn(REQUEST_STATUS,status||''))return;
 if(!window.confirm('Atualizar esta solicitação para "'+REQUEST_STATUS[status]+'"?'))return;
 busy=true;button.disabled=true;$('reload').disabled=true;
 try{
  const result=await request('bipstart_admin_update_customization_status',{
   p_request_id:requestId,p_status:status
  });
  if(result!==true)throw Error('O Supabase não confirmou a atualização.');
  $('customMessage').textContent='Status atualizado com sucesso.';
 }catch(e){$('customMessage').textContent='Não foi possível atualizar: '+e.message}
 finally{busy=false;button.disabled=false;$('reload').disabled=false}
 if(!busy){
  try{await loadCustomization()}
  catch(e){$('customMessage').textContent='Não foi possível atualizar a lista: '+e.message}
 }
});
load();