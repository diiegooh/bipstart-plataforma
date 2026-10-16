'use strict';
const $=id=>document.getElementById(id);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PLAN={basic:'Básico',pro:'Premium'};
const WHATSAPP='5511978353820';
let config=null,busy=false;
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
function row(item){
 const expiredTrial=item.access_status==='trialing'&&new Date(item.trial_until)<=new Date();
 const expiredPaid=item.access_status==='active'&&item.active_until&&new Date(item.active_until)<=new Date();
 const status=expiredTrial?'Teste expirado':expiredPaid?'Plano vencido':item.access_status;
 const plan=PLAN[item.requested_plan]?item.requested_plan:'basic';
 const option=Object.entries(PLAN).map(([value,label])=>'<option value="'+value+'"'+(value===plan?' selected':'')+'>'+label+'</option>').join('');
 return '<tr data-shop-id="'+escapeHtml(item.shop_id)+'"><td><strong>'+escapeHtml(item.shop_name)+'</strong><div class="admin-email">'+escapeHtml(item.owner_email||'E-mail não disponível')+'</div><div class="admin-muted">'+escapeHtml(item.shop_id)+'</div></td>'+
   '<td>'+escapeHtml(PLAN[item.requested_plan]||item.requested_plan)+'<div class="admin-muted">'+(item.signup_choice==='trial'?'Teste solicitado':'WhatsApp')+'</div></td>'+
   '<td class="admin-status">'+escapeHtml(status)+'<div class="admin-muted">'+(item.active_until?'Até '+new Date(item.active_until).toLocaleDateString('pt-BR'):(item.trial_until&&item.access_status==='trialing'?'Teste até '+new Date(item.trial_until).toLocaleString('pt-BR'):''))+'</div></td>'+
   '<td><select aria-label="Plano para ativar">'+option+'</select></td><td><div class="admin-actions">'+
   '<button type="button" class="button" data-action="activate">Ativar</button>'+
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
async function loadCustomization(){
 $('customMessage').textContent='Carregando solicitações...';
 const items=await request('bipstart_admin_list_customization_requests');
 if(!Array.isArray(items))throw Error('Resposta inesperada ao consultar as solicitações.');
 $('customRequests').innerHTML=items.map(requestCard).join('');
 $('customMessage').textContent=items.length?items.length+' solicitação(ões) encontrada(s).':'Nenhuma solicitação de personalização até agora.';
}
const ADMIN_TABS={shops:'adminShopsSection',links:'adminLinksSection',custom:'customizationSection'};
function setAdminTab(name){
 if(!Object.hasOwn(ADMIN_TABS,name))return;
 for(const [tab,id] of Object.entries(ADMIN_TABS)){
  $(id).classList.toggle('hidden',tab!==name);
  $('adminTab'+(tab==='shops'?'Shops':tab==='links'?'Links':'Custom')).setAttribute('aria-selected',String(tab===name));
 }
}
function linkCard(title,detail,url,{share=false,available=true}={}){
 const safeUrl=escapeHtml(url);
 const actions=available?'<a class="ghost" href="'+safeUrl+'" target="_blank" rel="noopener noreferrer">Abrir ↗</a>'+
  '<button type="button" class="ghost" data-link-action="copy" data-link-url="'+safeUrl+'">Copiar link</button>'+
  (share?'<button type="button" class="button" data-link-action="share" data-link-url="'+safeUrl+'" data-link-title="'+escapeHtml(title)+'">Compartilhar ↗</button>':''):
  '<span class="admin-muted">Link indisponível no Plano Básico</span>';
 return '<article class="admin-link-card"><h3>'+escapeHtml(title)+'</h3><p class="admin-muted">'+escapeHtml(detail)+'</p>'+
  '<code>'+safeUrl+'</code><div class="admin-link-actions">'+actions+'</div></article>';
}
function staticLinks(){
 const base=location.origin;
 return [
  ['Site da BipStart','Página pública de apresentação e planos.',base+'/'],
  ['Login do lojista e PDV','Login do cliente: ao entrar, abre diretamente o painel PDV.',base+'/cliente'],
  ['Painel administrativo','Gerenciamento administrativo de lojas, personalizações e links.',base+'/admin'],
  ['Login do motoboy','Acesso do entregador. Os convites individuais são gerados na aba Motoboys da loja Premium.',base+'/motoboy'],
  ['Acompanhamento de pedidos','A visualização exige o link individual emitido para cada pedido e sua chave privada.',base+'/acompanhar']
 ];
}
async function loadLinks(){
 $('adminLinksMessage').textContent='Carregando links das lojas...';
 const shops=await request('bipstart_admin_list_shop_links');
 if(!Array.isArray(shops))throw Error('Diretório de lojas inválido.');
 $('adminGeneralLinks').innerHTML=staticLinks().map(([title,detail,url])=>
  linkCard(title,detail,url,{share:title==='Login do motoboy'})).join('');
 $('adminShopLinks').innerHTML=shops.map(shop=>{
  const cardapio=location.origin+'/cardapio?loja='+encodeURIComponent(shop.shop_slug);
  const premium=shop.plan_code==='pro'&&['active','trialing'].includes(shop.access_status);
  return '<section class="admin-links-shop"><h3>'+escapeHtml(shop.shop_name)+
   ' <span class="admin-muted">('+escapeHtml(PLAN[shop.plan_code]||'Plano indisponível')+')</span></h3>'+
   '<div class="admin-link-grid">'+
   linkCard('Cardápio online • '+shop.shop_name,
    premium?'Link público do cardápio e dos pedidos.':'Disponível somente com Premium ativo. O endereço é preservado no upgrade.',
    cardapio,{share:true,available:premium})+
   linkCard('Editor do cardápio • '+shop.shop_name,
    'Área do titular da loja; exige login e plano Premium ativo.',
    location.origin+'/cliente?editar=cardapio')+
   '</div></section>';
 }).join('')||'<p class="muted">Nenhuma loja cadastrada ainda.</p>';
 $('adminLinksMessage').textContent=shops.length+' loja(s) listada(s). O cardápio só fica acessível quando o Premium estiver vigente.';
}
async function copyLink(url){
 try{
  if(!navigator.clipboard?.writeText)throw Error('Área de transferência indisponível.');
  await navigator.clipboard.writeText(url);
  $('adminLinksMessage').textContent='Link copiado para compartilhar.';
 }catch{
  window.prompt('Copie o link:',url);
 }
}
$('adminLinksSection').addEventListener('click',async e=>{
 const btn=e.target.closest('[data-link-action]');
 if(!btn)return;
 const url=btn.dataset.linkUrl;
 if(!url||!url.startsWith(location.origin+'/'))return;
 if(btn.dataset.linkAction==='share'&&typeof navigator.share==='function'){
  try{
   await navigator.share({title:btn.dataset.linkTitle||'Link BipStart',url});
   return;
  }catch(error){if(error?.name==='AbortError')return;}
 }
 await copyLink(url);
});
document.querySelector('.admin-tabs').addEventListener('click',event=>{
 const tab=event.target.closest('[data-admin-tab]');
 if(tab)setAdminTab(tab.dataset.adminTab);
});

async function load(){
 if(busy)return;busy=true;$('reload').disabled=true;message('Buscando lojas...');
 try{
   if(!config)config=await fetch('/api/public-config',{cache:'no-store'}).then(r=>r.json());
   if(!config?.enabled)throw Error('Configuração Supabase não disponível.');
   await signedInAccount();
   const items=await request('bipstart_admin_list_shops_with_emails');
   $('adminRows').innerHTML=(Array.isArray(items)?items:[]).map(row).join('');
   message((items||[]).length+' loja(s) encontradas. Confirme o pagamento antes de liberar.');
   try{await loadCustomization()}
   catch(e){$('customRequests').replaceChildren();$('customMessage').textContent='Não foi possível carregar as solicitações: '+e.message}
   try{await loadLinks()}
   catch(e){$('adminShopLinks').replaceChildren();$('adminGeneralLinks').replaceChildren();$('adminLinksMessage').textContent='Não foi possível carregar os links: '+e.message}
 }catch(e){$('adminRows').replaceChildren();$('customRequests').replaceChildren();$('adminShopLinks').replaceChildren();$('adminGeneralLinks').replaceChildren();$('adminLinksMessage').textContent='Entre com uma conta administradora para consultar os links.';$('customMessage').textContent='Faça login com uma conta administradora para visualizar as solicitações.';message(e.message,true)}
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