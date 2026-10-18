'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let cfg=null,session=null,shop=null,ent=null,products=[],categories=[],services=[],appointments=[],sales=[],requests=[],couriers=[],deliveries=[],onlineOrders=[];
let tab='resumo',cart=[],showForm=null,toastTimer,pastedProductImage=null,menuSchemaReady=false,selectedCategoryFilter='all',selectedStockPanel='';
const pendingOrderUpdates=new Set();
const orderNotificationLinks=new Map();
let onlineOrdersPolling=false;
let pdvQuery='',pdvCategory='',pdvInStockOnly=true,pdvPayment='pix',pdvCardFeePercent='3.99';
let salesPeriod='day',salesDay=localReportDate(),salesReport=null,salesLoading=false,salesRequestId=0;
const captchaTokens={login:'',signup:''},captchaWidgets={login:null,signup:null},captchaIssuedAt={login:0,signup:0},captchaWaiters={login:null,signup:null};
const storageKey='bipstart_customer_session';
const preferredPlan=new URLSearchParams(location.search).get('plano');
const initialPlan=['basic','pro'].includes(preferredPlan)?preferredPlan:null;
let planRefreshBusy=false;
const plans={basic:'Básico',pro:'Premium'};
const planPrices={basic:'R$ 29,90 (pagamento único)',pro:'R$ 79,90/mês'};
const BIPSTART_PLAN_WHATSAPP='5511978353820';
const models={pdv:'PDV com estoque + cardápio online'};
const hiding=(id,on)=>{
 $(id).classList.toggle('hidden',!on);
 if(id==='workspace')document.body.classList.toggle('workspace-fullscreen',on);
};
function msg(t,error=false){const box=$('toast');box.textContent=t;box.style.borderColor=error?'#e9768d':'#8052ce';box.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.add('hidden'),5500)}
function status(t){const box=$('notice');box.textContent=t;box.classList.remove('hidden')}
function formVal(form){return Object.fromEntries(new FormData(form).entries())}
function qs(table,search={}){
  const url=new URL(cfg.supabaseUrl+'/rest/v1/'+table);
  for(const [k,v] of Object.entries(search))url.searchParams.set(k,v);
  return url;
}
function saveSession(){try{if(session)localStorage.setItem(storageKey,JSON.stringify(session));else localStorage.removeItem(storageKey)}catch{}}
async function api(path,{method='GET',body,token,extraHeaders={}}={}){
  const headers={apikey:cfg.publishableKey,...extraHeaders};
  const bearer=token===undefined?session?.access_token:token;
  if(bearer)headers.Authorization='Bearer '+bearer;
  if(body!==undefined&&!extraHeaders['Content-Type'])headers['Content-Type']='application/json';
  const r=await fetch(cfg.supabaseUrl+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  let data=await r.json().catch(()=>null);
  if(!r.ok){
    if(data?.error_code==='captcha_failed'||String(data?.msg||data?.message||'').includes('captcha protection'))
      throw Error('O Supabase recusou a verificação Cloudflare. Atualize a página e tente novamente; se persistir, confira a Secret Key do Turnstile no Supabase.');
    throw Error(data?.msg||data?.message||data?.error_description||data?.error||'Erro de conexão com o banco.');
  }
  return data;
}
async function ensureSession(){
  if(!session)return false;
  if(Number(session.expires_at||0)>Date.now()/1000+60)return true;
  if(!session.refresh_token)return false;
  try{
    const s=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',token:null,body:{refresh_token:session.refresh_token}});
    session={...s,expires_at:Date.now()/1000+Number(s.expires_in||3600)};
    saveSession();return true;
  }catch{session=null;saveSession();return false}
}
async function rest(table,{method='GET',query={},body}={}){
  if(shop&&ent&&table!=='shops'&&table!=='shop_entitlements'&&!hasAccess()){hiding('workspace',false);hiding('accessGate',true);renderAccessGate();throw Error('Seu acesso expirou. Contrate ou renove pelo WhatsApp.');}
  if(!await ensureSession()){showAuth();throw Error('Sua sessão expirou. Entre novamente.')}
  let url=qs(table,query);const headers={apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,Prefer:'return=representation'};
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(url.toString(),{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.message||data?.error||'Não foi possível salvar. Confira seus dados.');
  return data;
}
async function rpc(name,body){
  return api('/rest/v1/rpc/'+name,{method:'POST',body});
}
function hideAll(){['auth','setup','createShop','workspace','resetPass','accessGate'].forEach(id=>hiding(id,false));}
function showAuth(){hideAll();hiding('auth',true);hiding('logout',false);renderActiveCaptcha();}
function authTab(signup){
  hiding('loginForm',!signup);hiding('signupForm',signup);
  $('showLogin').classList.toggle('selected',!signup);$('showSignup').classList.toggle('selected',signup);
  renderActiveCaptcha();
}
function renderActiveCaptcha(){
  if(!cfg?.turnstileSiteKey||!window.turnstile||$('auth').classList.contains('hidden'))return;
  const kind=$('signupForm').classList.contains('hidden')?'login':'signup';
  if(captchaWidgets[kind]!==null)return;
  const element=$(kind==='login'?'loginCaptcha':'signupCaptcha');
  element.classList.remove('hidden');
  captchaWidgets[kind]=window.turnstile.render(element,{
    sitekey:cfg.turnstileSiteKey,
    callback:token=>{
      captchaTokens[kind]=token;captchaIssuedAt[kind]=Date.now();
      if(captchaWaiters[kind])captchaWaiters[kind].resolve(token);
    },
    'expired-callback':()=>{captchaTokens[kind]='';captchaIssuedAt[kind]=0;},
    'error-callback':()=>{
      captchaTokens[kind]='';captchaIssuedAt[kind]=0;
      if(captchaWaiters[kind])captchaWaiters[kind].reject(Error('Falha na verificação. Tente novamente.'));
    }
  });
}
function resetCaptcha(kind){
  captchaTokens[kind]='';captchaIssuedAt[kind]=0;
  if(captchaWidgets[kind]!==null&&window.turnstile)window.turnstile.reset(captchaWidgets[kind]);
}
async function captchaFor(kind){
  if(!cfg?.turnstileSiteKey)return {};
  if(captchaTokens[kind]&&Date.now()-captchaIssuedAt[kind]<240000)
    return {gotrue_meta_security:{captcha_token:captchaTokens[kind]}};
  if(!window.turnstile||captchaWidgets[kind]===null)
    throw Error('A verificação de segurança ainda está carregando. Aguarde e tente novamente.');
  const fresh=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('A verificação demorou. Tente novamente.')),30000);
    captchaWaiters[kind]={
      resolve:token=>{clearTimeout(timer);resolve(token)},
      reject:error=>{clearTimeout(timer);reject(error)}
    };
    resetCaptcha(kind);
  }).finally(()=>{captchaWaiters[kind]=null});
  return {gotrue_meta_security:{captcha_token:fresh}};
}
function setupSignupCaptcha(){
  if(!cfg?.turnstileSiteKey)return;
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;
  script.onload=()=>renderActiveCaptcha();
  script.onerror=()=>msg('Não foi possível carregar a verificação de segurança.',true);
  document.head.append(script);
}
function consumeAuthRedirect(){
  const params=new URLSearchParams(location.hash.replace(/^#/, ''));
  if(!params.has('access_token'))return null;
  session={
    access_token:params.get('access_token'),
    refresh_token:params.get('refresh_token'),
    token_type:params.get('token_type')||'bearer',
    expires_in:Number(params.get('expires_in')||3600),
    expires_at:Date.now()/1000+Number(params.get('expires_in')||3600)
  };
  saveSession();
  history.replaceState(null,'',location.pathname+location.search);
  return params.get('type');
}
async function begin(){
  try{cfg=await fetch('/api/public-config',{cache:'no-store'}).then(r=>r.json());}catch{}
  if(!cfg?.enabled){hideAll();hiding('setup',true);return}
  setupSignupCaptcha();
  const redirectType=consumeAuthRedirect();
  if(!session){try{session=JSON.parse(localStorage.getItem(storageKey)||'null')}catch{session=null}}
  if(await ensureSession()){
    if(redirectType==='recovery'){hideAll();hiding('resetPass',true);return}
    await loadShops();
  } else showAuth();
}
async function requireVerifiedEmail(){
  if(!await ensureSession())throw Error('Entre na sua conta para continuar.');
  const user=await api('/auth/v1/user');
  if(!user?.email_confirmed_at){
    session=null;saveSession();showAuth();authTab(false);
    throw Error('Confirme seu e-mail pelo link enviado antes de iniciar os 7 dias gratuitos.');
  }
  return user;
}
async function loadShops(){
  await requireVerifiedEmail();
  const rows=await rest('shops',{query:{select:'id,name,slug,model,requested_plan,signup_choice,upgrade_request_type,brand_color,whatsapp,opening_hours,location_text,payment_methods,delivery_fee,logo_path,menu_layout_style,establishment_type,show_logo_subtitle,logo_subtitle,menu_theme_color,created_at',order:'created_at.desc',limit:'20'}});
  if(!rows?.length){
    hideAll();hiding('createShop',true);hiding('logout',true);
    if(initialPlan)$('shopForm').elements.namedItem('requested_plan').value=initialPlan;
    return;
  }
  shop=rows[0];selectedCategoryFilter='all';await openShop();
}
function trialValid(){
  return ent?.status==='trialing'&&Number.isFinite(Date.parse(ent.trial_until))&&Date.parse(ent.trial_until)>Date.now();
}
function subscriptionValid(){
  return ent?.status==='active'&&(ent.active_until===null||
    (Number.isFinite(Date.parse(ent.active_until))&&Date.parse(ent.active_until)>Date.now()));
}
function hasAccess(){return trialValid()||subscriptionValid()}
function proAccess(){return ent?.plan_code==='pro'&&hasAccess()}
function canCustomize(){return proAccess()}
function planManagementCard(){
 const active=ent?.plan_code==='pro'?'pro':'basic';
 const pending=active==='basic'&&shop?.requested_plan==='pro';
 const trial=trialValid();
 const trialEnd=trial&&ent.trial_until?
   new Date(ent.trial_until).toLocaleString('pt-BR'):'';
 const trialRequested=pending&&shop?.upgrade_request_type==='trial';
 const info=active==='pro'?
   (trial?'<p class="plan-management-pending">Premium em teste até '+esc(trialEnd)+
    '. A data original de suspensão dos 7 dias foi mantida.</p>':
    ent?.status==='active'&&ent.active_until?
     '<p class="plan-management-pending">Próximo vencimento Premium: <strong>'+esc(new Date(ent.active_until).toLocaleString('pt-BR'))+'</strong></p>':''):
   pending?
     (trialRequested?
       '<p class="plan-management-pending">Teste Premium solicitado. Aguardando aprovação da BipStart. Os dias já usados no teste Básico continuam contando; término: '+esc(trialEnd)+'.</p>':
       '<p class="plan-management-pending">Upgrade Premium pago solicitado. Aguarde a confirmação e a ativação manual pela BipStart.</p>'):
     (trial?
       '<div class="plan-trial-upgrade">'+
       '<button type="button" class="ghost plan-request-button" data-plan-trial-request="pro">Testar Premium com os dias restantes</button>'+
       '<small>O teste continua até '+esc(trialEnd)+'. Os 7 dias não reiniciam e não há cobrança.</small></div>'+
       '<button type="button" class="ghost plan-request-button" data-plan-request="pro">Solicitar Premium pago</button>':
       '<button type="button" class="ghost plan-request-button" data-plan-request="pro">Solicitar upgrade para Premium</button>');
 return '<section class="plan-management" aria-label="Meu plano e dados da loja">'+
   '<h3>Meu plano</h3><p>Plano ativo: <strong>'+esc(plans[active])+'</strong></p>'+
   info+
   (pending&&!trialRequested?'<a class="ghost plan-contact" href="'+esc(contactUrl('alteracao'))+'" target="_blank" rel="noopener noreferrer">Solicitar ativação pelo WhatsApp ↗</a>':'')+
   '</section>';
}
async function refreshActivatedPlan(){
 if(planRefreshBusy||!shop||!session)return;
 planRefreshBusy=true;
 try{
  const id=shop.id;
  const [latest]=await rest('shop_entitlements',{query:{select:'plan_code,status,trial_until,active_until',shop_id:'eq.'+id,limit:'1'}});
  if(shop?.id!==id||!latest)return;
  const previous=JSON.stringify(ent);
  if(JSON.stringify(latest)===previous)return;
  ent=latest;
  const rows=await rest('shops',{query:{
    select:'id,name,slug,model,requested_plan,signup_choice,upgrade_request_type,brand_color,whatsapp,opening_hours,location_text,payment_methods,delivery_fee,logo_path,menu_layout_style,establishment_type,show_logo_subtitle,logo_subtitle,menu_theme_color,created_at',
    id:'eq.'+id,limit:'1'
  }});
  if(rows[0])shop={...shop,...rows[0]};
  if(!hasAccess()){hideAll();hiding('accessGate',true);renderAccessGate();return;}
  await reloadData();
  renderNav();
  if(!$('workspace').classList.contains('hidden'))renderPage();
  msg('Plano e permissões atualizados. Seus produtos e configurações foram preservados.');
 }catch(error){console.warn('Atualização do plano indisponível:',error.message)}
 finally{planRefreshBusy=false;}
}
function contactUrl(reason='contratacao',registeredEmail=''){
  const chosen=plans[shop?.requested_plan]||'Básico';
  const price=planPrices[shop?.requested_plan]||planPrices.basic;
  const email=String(registeredEmail||session?.user?.email||'Não informado').trim();
  const request=reason==='renovacao'?'renovar':reason==='alteracao'?'solicitar a alteração de':'contratar';
  const lines=[
    'Olá, equipe BipStart! 👋',
    'Gostaria de '+request+' meu plano BipStart.',
    '',
    '🏪 Nome da loja: '+String(shop?.name||''),
    '📧 E-mail cadastrado: '+email,
    '📦 Plano de interesse: '+chosen+' — '+price,
    '🆔 Identificador da loja: '+String(shop?.id||''),
    '',
    'Por favor, envie as instruções de pagamento pelo WhatsApp.',
    'Aguardo a confirmação do pagamento e a liberação do acesso. Obrigado!'
  ];
  return 'https://wa.me/'+BIPSTART_PLAN_WHATSAPP+'?text='+encodeURIComponent(lines.join('\n'));
}
function renderAccessGate(){
  const expiredTrial=ent?.status==='trialing'&&!trialValid();
  const expiredPaid=ent?.status==='active'&&!subscriptionValid();
  const suspended=ent?.status==='suspended';
  const waiting=!expiredTrial&&!expiredPaid&&!suspended;
  $('gateTitle').textContent=expiredTrial?'Seus 7 dias gratuitos terminaram':
    expiredPaid?'Seu plano venceu':suspended?'Acesso suspenso':'Sua contratação está aguardando liberação';
  $('gateDesc').textContent=expiredTrial?'O período gratuito encerrou. Seus dados continuam salvos. Para voltar a usar as funcionalidades, contrate um plano pelo WhatsApp.':
    expiredPaid?'Seu acesso está pausado. Renove pelo WhatsApp e aguarde a confirmação para retomar.':
    suspended?'Seu acesso foi suspenso pela administração. Fale conosco pelo WhatsApp para regularizar.':
    'Após enviar a mensagem preparada no WhatsApp, aguarde as instruções de pagamento. A BipStart liberará seu acesso após a confirmação manual.';
  $('gateShop').textContent=shop.name;
  $('gatePlan').textContent=(plans[shop.requested_plan]||'Básico')+' — '+(planPrices[shop.requested_plan]||planPrices.basic);
  $('gateWhatsapp').href=contactUrl(expiredPaid?'renovacao':'contratacao');
  $('gateWhatsapp').classList.toggle('hidden',waiting);
  $('gateStatus').textContent=waiting?'Aguardando contratação':'Acesso temporariamente bloqueado';
}
async function openShop(){
 salesRequestId++;salesReport=null;salesLoading=false;salesPeriod='day';salesDay=localReportDate();
 hideAll();hiding('logout',true);
 const [access]=await rest('shop_entitlements',{query:{select:'plan_code,status,trial_until,active_until',shop_id:'eq.'+shop.id,limit:'1'}});
 ent=access||null;
 if(!hasAccess()){hiding('accessGate',true);renderAccessGate();return}
 await reloadData();
 lastReceipt=null;
 tab='caixa';showForm=null;pastedProductImage=null;selectedStockPanel='';
 const requested=new URLSearchParams(location.search);
 if(requested.get('editar')==='cardapio')tab=proAccess()?'cardapio':'configuracoes';
 else if(initialPlan&&ent?.plan_code!==initialPlan)tab='configuracoes';
 hiding('workspace',true);renderPage();
}
function localReportDate(date=new Date()){
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
async function reloadData(){
  products=[];categories=[];services=[];appointments=[];sales=[];requests=[];couriers=[];deliveries=[];onlineOrders=[];
  const get=(t,fields='*')=>rest(t,{query:{select:fields,shop_id:'eq.'+shop.id,order:'created_at.desc',limit:'200'}});
  products=await get('shop_products');
  if(shop.model==='pdv'){
    try{
      categories=(await get('shop_menu_categories')).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
      menuSchemaReady=true;
    }catch(err){
      console.warn('Categorias do cardápio aguardando atualização do banco:',err.message);
      categories=[...new Set(products.map(p=>p.category||'Geral'))].map((name,i)=>({name,sort_order:i*10}));
      menuSchemaReady=false;
    }
  }
  sales=await get('shop_sales');
  onlineOrders=await get('shop_online_orders');
  requests=await get('shop_customization_requests');
  if(proAccess()){
    couriers=await rest('shop_couriers',{query:{select:'*',shop_id:'eq.'+shop.id,removed_at:'is.null'}});
    deliveries=await get('shop_deliveries');
  }
}
async function refreshOnlineOrdersIfVisible(){
 if(onlineOrdersPolling||pendingOrderUpdates.size||!shop||!hasAccess()||tab!=='pedidos'||
    document.visibilityState==='hidden'||!$('workspace')||$('workspace').classList.contains('hidden'))return;
 onlineOrdersPolling=true;
 const currentShop=shop.id;
 try{
   const latest=await rest('shop_online_orders',{query:{
     select:'*',shop_id:'eq.'+currentShop,order:'created_at.desc',limit:'200'
   }});
   if(shop?.id!==currentShop||tab!=='pedidos'||pendingOrderUpdates.size)return;
   const sig=rows=>rows.map(o=>o.id+':'+o.status+':'+o.payment_status).join('|');
   if(sig(latest)!==sig(onlineOrders)){onlineOrders=latest;renderPage();}
 }catch(error){console.warn('Atualização de pedidos indisponível:',error.message);}
 finally{onlineOrdersPolling=false;}
}
function pages(){
  const a=[['resumo','Visão geral']];
  a.push(['caixa','Frente de caixa'],['produtos','Produtos e estoque'],['vendas','Histórico de vendas']);
  if(proAccess())a.push(['cardapio','Meu cardápio']);
  if(proAccess())a.push(['pedidos','Pedidos online'],['motoboys','Motoboys'],['entregas','Entregas']);
  if(canCustomize())a.push(['personalizar','Mudanças e suporte']);
  a.push(['configuracoes','Configurações']);
  return a;
}
function operationalMenuItems(){
  return [
    ['caixa','PDV','🛒'],
    ['produtos','Produtos','📦'],
    ['cardapio_publico','Cardápio online','📋'],
    ['pedidos','Pedidos online','🚚'],
    ['motoboys','Motoboys','🛵'],
    ['vendas','Vendas','💰']
  ];
}
function applySidebarTheme(){
 const value=String(shop?.brand_color||'');
 const color=/^#[0-9a-fA-F]{6}$/.test(value)?value:'#7c3aed';
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
 const linear=rgb.map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
 const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
 document.documentElement.style.setProperty('--store-accent',color);
 document.documentElement.style.setProperty('--store-accent-ink',luminance>.35?'#101510':'#ffffff');
 document.documentElement.style.setProperty('--accent',color);
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
}
function renderNav(){
  applySidebarTheme();
  const current=tab==='entregas'?'pedidos':tab;
  const sidebarItems=operationalMenuItems();
  if(!proAccess()){
    // Itens bloqueados ficam juntos no fim, preservando a ordem original de cada grupo.
    const blocked=new Set(['cardapio_publico','pedidos','motoboys']);
    sidebarItems.sort((a,b)=>Number(blocked.has(a[0]))-Number(blocked.has(b[0])));
  }
  $('nav').innerHTML='<nav aria-label="Navegação operacional">'+sidebarItems.map(([id,name,icon])=>{
    if((id==='cardapio_publico'||id==='pedidos'||id==='motoboys')&&!proAccess()){
      return '<button type="button" class="side-public-menu locked" disabled aria-disabled="true" aria-label="'+esc(name)+': exclusivo Premium" title="Exclusivo Premium">'+
        '<span class="side-nav-icon" aria-hidden="true">'+icon+'</span><b>'+esc(name)+'</b><small class="side-lock">Premium</small></button>';
    }
    if(id==='cardapio_publico'){
      return '<a class="side-public-menu" data-public-menu-link href="'+esc(publicShopUrl())+'" target="_blank" rel="noopener noreferrer" aria-label="Abrir cardápio online da loja em outra aba" title="Abrir cardápio online em outra aba">'+
        '<span class="side-nav-icon" aria-hidden="true">'+icon+'</span><b>'+esc(name)+'</b><span class="side-external-icon" aria-hidden="true">↗</span></a>';
    }
    return '<button type="button" data-nav="'+esc(id)+'" class="'+(current===id?'active':'')+'"'+(current===id?' aria-current="page"':'')+'>'+
      '<span class="side-nav-icon" aria-hidden="true">'+icon+'</span><b>'+esc(name)+'</b></button>';
  }).join('')+'</nav>';
  $('sideShopName').textContent=shop.name;
  $('sideSettings').classList.toggle('active',tab==='configuracoes');
}
function closeSideMenu(){
  $('sidebar').classList.remove('open');
  $('sideBackdrop').classList.add('hidden');
  $('sideToggle').setAttribute('aria-expanded','false');
  $('sideToggle').setAttribute('aria-label','Abrir menu da loja');
  document.body.classList.remove('sidebar-open');
}
function toggleSideMenu(){
  const show=!$('sidebar').classList.contains('open');
  $('sidebar').classList.toggle('open',show);
  $('sideBackdrop').classList.toggle('hidden',!show);
  $('sideToggle').setAttribute('aria-expanded',String(show));
  $('sideToggle').setAttribute('aria-label',show?'Fechar menu da loja':'Abrir menu da loja');
  document.body.classList.toggle('sidebar-open',show);
}
function heading(title,subtitle,action=''){return '<div class="toolbar"><div><h2>'+esc(title)+'</h2>'+(subtitle?'<p class="muted">'+esc(subtitle)+'</p>':'')+'</div>'+action+'</div>'}
function empty(t='Nenhum registro até agora.'){return '<div class="empty">'+esc(t)+'</div>'}
function tile(t,v,sub){return '<div class="tile"><small>'+esc(t)+'</small><strong>'+esc(v)+'</strong><small>'+esc(sub||'')+'</small></div>'}
function publicShopUrl(){
  return location.origin+'/cardapio?loja='+encodeURIComponent(shop.slug);
}
function shareTitle(){return 'CARDÁPIO ('+shop.name+')'}
function publicLinkTile(){
  if(!proAccess())return '<div class="tile public-link-tile is-locked">'+
    '<small>Cardápio online</small><strong>Exclusivo do Premium</strong>'+
    '<small>Disponível somente no Plano Premium.</small></div>';
  const url=publicShopUrl();
  const title=shareTitle();
  const whatsapp='https://wa.me/?text='+encodeURIComponent(title+'\n'+url);
  return '<div class="tile public-link-tile">'+
    '<small>Link público do cardápio</small>'+
    '<a class="public-link-url" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" title="Abrir meu cardápio">'+esc(title)+'</a>'+
    '<div class="public-share-actions">'+
      '<button type="button" class="button share-primary" data-share-shop>Compartilhar ↗</button>'+
      '<button type="button" class="ghost" data-copy-shop>Copiar link</button>'+
      '<a class="ghost" href="'+esc(whatsapp)+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>'+
    '</div></div>';
}

function imageUrl(path){if(!path)return '';return cfg.supabaseUrl+'/storage/v1/object/public/bipstart-images/'+path.split('/').map(encodeURIComponent).join('/')}
function editBtn(kind,id){return '<button data-edit="'+esc(kind)+'" data-id="'+esc(id)+'">Editar</button>'}
function productRows(){
  return products.length?'<div class="stack">'+products.map(p=>'<div class="item">'+(p.image_path?'<img src="'+esc(imageUrl(p.image_path))+'" alt="">':'')+'<div><strong>'+esc(p.name)+'</strong><small>'+esc(p.category)+' • '+fmt(p.price)+(tab==='produtos'?' • Estoque: '+esc(p.stock):'')+'</small>'+
   (tab==='cardapio'&&p.description?'<p class="muted small">'+esc(p.description)+'</p>':'')+'</div><div class="actions">'+editBtn('product',p.id)+'</div></div>').join('')+'</div>':empty('Cadastre o primeiro produto.')
}

function salesDateRange(period=salesPeriod,selected=salesDay){
 const parts=String(selected).split('-').map(Number);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(selected)||parts.length!==3)throw Error('Data inválida.');
 const [y,m,d]=parts,start=new Date(y,m-1,d);
 if(start.getFullYear()!==y||start.getMonth()!==m-1||start.getDate()!==d)throw Error('Data inválida.');
 start.setHours(0,0,0,0);
 let end;
 if(period==='day')end=new Date(y,m-1,d+1);
 else if(period==='week'){
   start.setDate(start.getDate()-((start.getDay()+6)%7));
   end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+7);
 }else if(period==='month'){
   start.setDate(1);
   end=new Date(start.getFullYear(),start.getMonth()+1,1);
 }else throw Error('Período inválido.');
 const dateText=date=>date.toLocaleDateString('pt-BR');
 return {start:start.toISOString(),end:end.toISOString(),
  label:dateText(start)+(period==='day'?'':' a '+dateText(new Date(end.getTime()-1)))};
}
function saleLineFinancial(item){
 const quantity=Number(item.quantity),unitPrice=Number(item.unit_price);
 const current=products.find(p=>p.id===item.product_id);
 const historicCost=item.unit_cost===null||item.unit_cost===undefined?null:Number(item.unit_cost);
 const canEstimate=historicCost===null&&current&&Number.isFinite(Number(current.cost));
 const unitCost=historicCost!==null?historicCost:canEstimate?Number(current.cost):null;
 const valid=unitCost!==null&&Number.isFinite(unitCost)&&Number.isFinite(unitPrice)&&Number.isFinite(quantity);
 const revenue=unitPrice*quantity;
 return {quantity,unitPrice,revenue,cost:valid?unitCost*quantity:null,
  profit:valid?revenue-unitCost*quantity:null,
  estimated:historicCost===null&&canEstimate,missing:!valid};
}
function reportFigures(lines){
 return lines.reduce((sum,entry)=>{
   const money=entry.financial;
   sum.revenue+=money.revenue;
   sum.quantity+=money.quantity;
   if(money.missing)sum.missing++;
   else{sum.cost+=money.cost;sum.profit+=money.profit}
   if(money.estimated)sum.estimated++;
   return sum;
 },{revenue:0,cost:0,profit:0,quantity:0,estimated:0,missing:0});
}
function cardFeeInfo(sale){
 if(!['credito','debito'].includes(sale.payment_method))return {known:true,percent:0,amount:0};
 const raw=sale.card_fee_amount;
 if(raw===null||raw===undefined||raw===''||!Number.isFinite(Number(raw)))
   return {known:false,percent:null,amount:0};
 return {known:true,
  percent:sale.card_fee_percent===null||sale.card_fee_percent===undefined?null:Number(sale.card_fee_percent),
  amount:Number(raw)};
}
function salesPaymentTotals(salesList){
 return salesList.reduce((sum,sale)=>{
  const gross=Number(sale.total||0),fee=cardFeeInfo(sale);
  sum.gross+=gross;
  sum.cardFees+=fee.amount;
  sum.net+=gross-fee.amount;
  if(!fee.known)sum.unknownFees++;
  return sum;
 },{gross:0,cardFees:0,net:0,unknownFees:0});
}
function salesProfitInfo(figures,paymentTotals,missingSales=0){
 // Uma taxa histórica não informada não bloqueia o valor que já é calculável.
 return {value:figures.missing||missingSales?null:figures.profit-paymentTotals.cardFees,
  partial:!!(figures.estimated||paymentTotals.unknownFees)};
}
function salesProfitLabel(info){
 return info.value===null?'—':fmt(info.value)+(info.partial?' *':'');
}
function salesReportData(salesList=salesReport?.sales||[],itemsList=salesReport?.items||[]){
 // Uma venda = um carrinho finalizado, com seus itens agrupados pelo identificador da venda.
 const byDay=new Map(),saleGroups=new Map();
 for(const sale of salesList){
   const day=localReportDate(new Date(sale.created_at));
   if(!byDay.has(day))byDay.set(day,[]);
   const group={sale,lines:[]};
   byDay.get(day).push(group);
   saleGroups.set(sale.id,group);
 }
 for(const item of itemsList){
   const group=saleGroups.get(item.sale_id);
   if(!group)continue;
   group.lines.push({item,sale:group.sale,financial:saleLineFinancial(item)});
 }
 const days=[...byDay.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,groups])=>{
   // #1 é a primeira venda do dia, #2 a segunda, mesmo ao consultar semana ou mês.
   groups.sort((a,b)=>new Date(a.sale.created_at)-new Date(b.sale.created_at)||
    String(a.sale.id).localeCompare(String(b.sale.id)));
   const sales=groups.map((group,index)=>({...group,number:index+1,total:reportFigures(group.lines)}));
   const lines=sales.flatMap(group=>group.lines);
   return {day,sales,lines,total:reportFigures(lines),
    paymentTotals:salesPaymentTotals(sales.map(group=>group.sale)),
    salesTotal:sales.reduce((total,group)=>total+Number(group.sale.total||0),0)};
 });
 const figures=reportFigures(days.flatMap(day=>day.lines));
 const unmatchedSales=salesList.filter(s=>!saleGroups.get(s.id)?.lines.length);
 return {sales:salesList,days,figures,paymentTotals:salesPaymentTotals(salesList),salesCount:salesList.length,unmatchedSales};
}
async function salesPaginated(table,query,pageSize=200){
 const result=[];
 for(let offset=0;offset<200000;offset+=pageSize){
   const batch=await rest(table,{query:{...query,limit:String(pageSize),offset:String(offset)}});
   if(!Array.isArray(batch))throw Error('Resposta inválida ao consultar vendas.');
   result.push(...batch);
   if(batch.length<pageSize)return result;
 }
 throw Error('Relatório muito extenso. Escolha um período menor.');
}
async function loadSalesReport(){
 if(tab!=='vendas'||!shop||!hasAccess())return;
 const req=++salesRequestId,selectedShop=shop.id,period=salesPeriod,reference=salesDay;
 salesLoading=true;salesReport=null;renderPage();
 try{
   const range=salesDateRange(period,reference);
   const found=await salesPaginated('shop_sales',{
     select:'id,shop_id,total,payment_method,card_fee_percent,card_fee_amount,created_at',
     shop_id:'eq.'+selectedShop,
     and:'(created_at.gte.'+range.start+',created_at.lt.'+range.end+')',
     order:'created_at.desc'
   });
   const saleItems=[];
   for(let i=0;i<found.length;i+=70){
     const ids=found.slice(i,i+70).map(s=>s.id).join(',');
     const values=await salesPaginated('shop_sale_items',{
       select:'id,sale_id,shop_id,product_id,product_name,quantity,unit_price,unit_cost',
       shop_id:'eq.'+selectedShop,sale_id:'in.('+ids+')',order:'id.asc'
     },500);
     saleItems.push(...values);
   }
   if(req!==salesRequestId||shop?.id!==selectedShop)return;
   salesReport={sales:found,items:saleItems,range};
 }catch(error){
   if(req!==salesRequestId)return;
   salesReport={error:error.message||'Não foi possível consultar as vendas.'};
 }finally{
   if(req===salesRequestId){salesLoading=false;if(tab==='vendas')renderPage();}
 }
}

function salesRecordInfo(group,day){
 const sale=group.sale,fee=cardFeeInfo(sale),summary=group.total;
 const unknownCost=summary.missing>0||!group.lines.length;
 const netProfit=salesProfitInfo(summary,{cardFees:fee.amount,unknownFees:fee.known?0:1},unknownCost?1:0);
 return {
  number:group.number,
  date:day,
  time:new Date(sale.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
  units:summary.quantity,
  gross:Number(sale.total||0),
  cost:unknownCost?null:summary.cost,
  profit:netProfit.value,
  profitPartial:netProfit.partial,
  items:group.lines.map(({item,financial})=>({
   name:String(item.product_name||''),qty:financial.quantity,
   total:financial.revenue
  }))
 };
}
function salesRecordDetails(group,day){
 const sale=group.sale,info=salesRecordInfo(group,day);
 const pay={dinheiro:'Dinheiro',pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito'};
 const payment=pay[sale.payment_method]||sale.payment_method||'Não informado';
 const fee=cardFeeInfo(sale);
 const feeLine=['credito','debito'].includes(sale.payment_method)?
  (fee.known?
    '<p class="sales-inline-fee">Taxa do cartão registrada: '+fmt(fee.amount)+
      (fee.percent===null?'':' ('+esc(fee.percent.toLocaleString('pt-BR',{maximumFractionDigits:2}))+'%)')+'</p>':
    '<p class="sales-inline-fee">Taxa do cartão ainda não registrada. O lucro (*) é parcial.</p>'):'';
 const rows=group.lines.map(({item,financial:x})=>{
  const cost=x.missing?'Indisponível':fmt(x.cost)+(x.estimated?' *':'');
  return '<tr><td><strong>'+esc(item.product_name)+'</strong><small>Preço unit.: '+fmt(x.unitPrice)+'</small></td>'+
   '<td>'+esc(x.quantity)+'</td><td>'+cost+'</td><td>'+fmt(x.revenue)+'</td></tr>';
 }).join('');
 return '<div class="sales-inline-detail" aria-label="Detalhes da venda #'+group.number+'">'+
  '<div class="sales-inline-heading"><strong>Produtos da venda #'+group.number+'</strong>'+
  '<span>'+esc(payment)+' · '+esc(info.time)+'</span></div>'+
  (group.lines.length?'<div class="sales-inline-scroll"><table class="sales-inline-products">'+
   '<thead><tr><th>Produto</th><th>Qtd.</th><th>Custo</th><th>Preço vendido</th></tr></thead>'+
   '<tbody>'+rows+'</tbody></table></div>':
   '<p class="sales-checkout-empty">Os itens desta venda não estão disponíveis no histórico detalhado.</p>')+
  feeLine+
  '<div class="sales-inline-summary">'+
  '<span>Unidades vendidas: <strong>'+info.units+'</strong></span>'+
  '<span>Total vendido: <strong>'+fmt(info.gross)+'</strong></span>'+
  '<span>Custo: <strong>'+(info.cost===null?'—':fmt(info.cost))+'</strong></span>'+
  '<span>Lucro: <strong>'+salesProfitLabel({value:info.profit,partial:info.profitPartial})+'</strong></span>'+
  '</div>'+
  (['credito','debito'].includes(sale.payment_method)&&!fee.known?
   '<div class="sales-fee-editor">'+
    '<label>Taxa real desta venda (%)<input type="number" inputmode="decimal" min="0" max="100" step="0.01" placeholder="Ex.: 3,99" aria-label="Taxa real da venda #'+group.number+'"></label>'+
    '<button type="button" class="ghost" data-sales-save-fee="'+esc(sale.id)+'">Salvar taxa e recalcular</button>'+
    '<small>Informe apenas a taxa real para apurar o lucro completo desta venda antiga.</small>'+
   '</div>':'')+
  '</div>';
}
function salesRecordRow(group,day){
 const item=salesRecordInfo(group,day);
 const date=new Date(day+'T12:00:00').toLocaleDateString('pt-BR');
 const detailsId='sales-details-'+String(group.sale.id);
 return '<tr class="sales-record-row" data-sales-open="'+esc(group.sale.id)+'">'+
  '<td><button type="button" class="sales-record-toggle" aria-expanded="false" aria-controls="'+esc(detailsId)+'"'+
  ' aria-label="Ver detalhes da venda #'+item.number+' de '+esc(date)+'">'+
  '<strong>Venda #'+item.number+'</strong><span class="sales-record-arrow" aria-hidden="true">⌄</span></button></td>'+
  '<td>'+esc(date+' '+item.time)+'</td>'+
  '<td>'+item.units+'</td><td>'+fmt(item.gross)+'</td>'+
  '<td>'+(item.cost===null?'—':fmt(item.cost))+'</td>'+
  '<td class="sales-record-profit">'+salesProfitLabel({value:item.profit,partial:item.profitPartial})+'</td></tr>'+
  '<tr class="sales-record-details-row" id="'+esc(detailsId)+'" hidden>'+
   '<td colspan="6">'+salesRecordDetails(group,day)+'</td></tr>';
}
function salesPrintableHtml(report,format,storeName,rangeLabel){
 if(!['receipt','a4'].includes(format))throw Error('Formato de exportação inválido.');
 const narrow=format==='receipt',width=narrow?'80mm':'210mm';
 const pageSize=narrow?'80mm 297mm':'A4';
 const pageMargin=narrow?'2mm':'12mm';
 const money=value=>value===null?'—':fmt(value);
 const rows=report.days.flatMap(day=>day.sales.map(group=>{
  const info=salesRecordInfo(group,day.day);
  const date=new Date(day.day+'T12:00:00').toLocaleDateString('pt-BR');
  return {...info,displayDate:date};
 }));
 const totals=report.paymentTotals,figures=report.figures;
 const profit=salesProfitInfo(figures,totals,report.unmatchedSales.length);
 const dataRows=rows.map(item=>
  '<tr><td>Venda #'+item.number+'</td><td>'+esc(item.displayDate+' '+item.time)+'</td>'+
  '<td>'+item.units+'</td><td>'+money(item.gross)+'</td>'+
  '<td>'+money(item.cost)+'</td><td>'+salesProfitLabel({value:item.profit,partial:item.profitPartial})+'</td></tr>').join('');
 const summary=[
  ['Vendas',String(report.salesCount)],
  ['Unidades vendidas',String(figures.quantity)],
  ['Total vendido',money(totals.gross)],
  ['Custo',money(figures.missing||report.unmatchedSales.length?null:figures.cost)],
  ['Lucro',salesProfitLabel(profit)]
 ];
 const title='RELATÓRIO DE VENDAS';
 const detail=rows.map(item=>
  '<section class="print-sale"><h3>Venda #'+item.number+' · '+esc(item.displayDate+' '+item.time)+'</h3>'+
  item.items.map(line=>
   '<div class="print-line"><span>'+esc(line.qty+'× '+line.name)+'</span><span>'+money(line.total)+'</span></div>').join('')+
  '<div class="print-line"><b>Unidades vendidas</b><b>'+item.units+'</b></div>'+
  '<div class="print-line"><b>Total vendido</b><b>'+money(item.gross)+'</b></div>'+
  '<div class="print-line"><b>Custo</b><b>'+money(item.cost)+'</b></div>'+
  '<div class="print-line"><b>Lucro</b><b>'+salesProfitLabel({value:item.profit,partial:item.profitPartial})+'</b></div>'+
  '</section>').join('');
 const a4Details=report.days.flatMap(day=>day.sales.map(group=>{
  const sale=group.sale,info=salesRecordInfo(group,day.day);
  const date=new Date(day.day+'T12:00:00').toLocaleDateString('pt-BR');
  const payments={dinheiro:'Dinheiro',pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito'};
  const payment=payments[sale.payment_method]||sale.payment_method||'Não informado';
  const fee=cardFeeInfo(sale);
  const products=group.lines.map(({item,financial:x})=>
   '<tr><td>'+esc(item.product_name)+'</td><td>'+esc(x.quantity)+'</td>'+
   '<td>'+money(x.unitPrice)+'</td><td>'+(x.missing?'—':money(x.cost)+(x.estimated?' *':''))+'</td>'+
   '<td>'+money(x.revenue)+'</td></tr>').join('');
  return '<article class="a4-sale">'+
   '<div class="a4-sale-heading"><h3>Venda #'+group.number+'</h3>'+
   '<span>'+esc(date+' · '+info.time+' · '+payment)+'</span></div>'+
   (group.lines.length?
    '<table class="a4-products"><thead><tr><th>Produto</th><th>Qtd.</th><th>Preço un.</th><th>Custo</th><th>Vendido</th>'+
    '</tr></thead><tbody>'+products+'</tbody></table>':
    '<p>Produtos não disponíveis no histórico detalhado.</p>')+
   (['credito','debito'].includes(sale.payment_method)?
     '<p class="a4-fee">'+(fee.known?
       'Taxa da maquininha: '+money(fee.amount)+(fee.percent===null?'':' ('+
        esc(fee.percent.toLocaleString('pt-BR',{maximumFractionDigits:2}))+'%)'):
       'Taxa do cartão não registrada; lucro parcial (*)')+'</p>':'')+
   '<div class="a4-sale-totals"><span>Unidades: <b>'+info.units+'</b></span>'+
   '<span>Total vendido: <b>'+money(info.gross)+'</b></span>'+
   '<span>Custo: <b>'+money(info.cost)+'</b></span>'+
   '<span>Lucro: <b>'+salesProfitLabel({value:info.profit,partial:info.profitPartial})+'</b></span></div>'+
   '</article>';
 })).join('');
 const warning=(totals.unknownFees||figures.missing||figures.estimated||report.unmatchedSales.length)?
  '<p class="warning">* Lucro parcial ou estimado: custos históricos estimados ou taxa de cartão antiga sem registro. Informe a taxa real no painel para fechar o cálculo. — indica custo desconhecido.</p>':'';
 const summaryHtml=summary.map(([label,value])=>
  '<div><span>'+esc(label)+'</span><strong>'+value+'</strong></div>').join('');
 const body='<main class="sheet"><header class="print-header"><strong>'+esc(storeName)+'</strong>'+
  '<h1>'+title+'</h1><p>PERÍODO: '+esc(rangeLabel)+'</p>'+
  '<p class="nonfiscal">RELATÓRIO GERENCIAL · NÃO FISCAL</p></header>'+
  '<section class="print-summary">'+summaryHtml+'</section>'+
  '<h2>Lista de vendas</h2>'+
  (narrow?detail:
   '<table class="print-records"><thead><tr><th>Venda</th><th>Data e hora</th>'+
   '<th>Unidades</th><th>Total vendido</th><th>Custo</th><th>Lucro</th>'+
   '</tr></thead><tbody>'+dataRows+'</tbody></table>'+
   '<section class="a4-details"><h2>Produtos vendidos por carrinho</h2>'+
   '<p class="a4-details-note">Detalhamento das vendas numeradas no período selecionado.</p>'+
   a4Details+'</section>')+
  warning+'<footer>Lucro após taxas da maquininha registradas. Não inclui impostos e outras despesas.<br>'+
  'Documento gerencial, não substitui NF-e, NFC-e ou nota fiscal.</footer></main>';
 const toolbar='<div class="toolbar">'+
  (narrow?'':'<label class="print-option"><input type="checkbox" id="includeProducts"'+
   ' onchange="document.body.classList.toggle(&quot;include-products&quot;,this.checked)">'+
   ' Incluir produtos das vendas no A4</label>')+
  '<button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button></div>';
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+title+' · '+esc(storeName)+'</title>'+
  '<style>@page{size:'+pageSize+';margin:'+pageMargin+'}'+
  '*,*::before,*::after{box-sizing:border-box}'+
  'body{margin:0;padding:20px;background:#eef0f2;color:#142017;font:12px Arial,sans-serif}'+
  '.toolbar{display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap;margin:0 auto 18px}'+
  '.toolbar button{padding:11px 19px;border:0;border-radius:8px;background:#22472f;color:white;font-weight:bold;cursor:pointer}'+
  '.print-option{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;cursor:pointer}'+
  '.print-option input{width:17px;height:17px;accent-color:#225b38}'+
  '.sheet{width:100%;max-width:'+width+';margin:0 auto;padding:'+(narrow?'4mm':'10mm')+';background:white;box-shadow:0 3px 18px #0001}'+
  '.print-header{text-align:center;border-bottom:2px solid #234b32;padding-bottom:12px}'+
  '.print-header strong{font-size:15px;overflow-wrap:anywhere}'+
  '.print-header h1{font-size:'+(narrow?'14':'20')+'px;margin:9px 0;letter-spacing:.025em}'+
  '.print-header p{margin:4px 0}.nonfiscal{font-size:10px;font-weight:bold;color:#59665c}'+
  '.print-summary{margin:14px 0}'+
  (narrow?
   '.print-summary>div{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px dashed #aaa}':
   '.print-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}'+
   '.print-summary>div{display:flex;flex-direction:column;justify-content:center;gap:7px;min-height:55px;padding:9px 7px;border:1px solid #d9e2da;border-radius:5px;background:#f3f7f4;text-align:center}'+
   '.print-summary>div span{font-size:10px;line-height:1.3}'+
   '.print-summary>div strong{font-size:13px}'+
   '.print-summary>div:last-child{background:#e7f4e9;border-color:#9ac7a2}')+
  '.print-summary strong{white-space:nowrap}h2{font-size:14px;margin:19px 0 10px}'+
  '.print-records{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed}'+
  '.print-records th,.print-records td{text-align:right;padding:8px 4px;border-bottom:1px solid #dbe3dd;overflow-wrap:anywhere;vertical-align:top}'+
  '.print-records th{background:#e8f0ea;color:#163e25;font-weight:bold;white-space:nowrap}'+
  '.print-records tbody tr:nth-child(even){background:#f8faf8}'+
  '.print-records th:nth-child(-n+2),.print-records td:nth-child(-n+2){text-align:left}'+
  '.print-records th:nth-child(1){width:15%}.print-records th:nth-child(2){width:22%}'+
  '.print-records th:nth-child(3){width:12%}.print-records th:nth-child(4){width:19%}'+
  '.print-records th:nth-child(5){width:16%}.print-records th:nth-child(6){width:16%}'+
  '.print-records thead{display:table-header-group}.print-records tr{break-inside:avoid;page-break-inside:avoid}'+
  '.print-sale{margin:13px 0 0;border-top:1px dashed #222;padding-top:9px;break-inside:avoid}'+
  '.print-sale h3{font-size:12px;margin:0 0 7px}.print-line{display:flex;justify-content:space-between;gap:10px;padding:4px 0;overflow-wrap:anywhere}'+
  '.print-line span:first-child,.print-line b:first-child{min-width:0}'+
  '.print-line span:last-child,.print-line b:last-child{white-space:nowrap}'+
  '.a4-details{display:none;margin-top:22px}.include-products .a4-details{display:block}'+
  '.a4-details-note{color:#59665c;font-size:10px;margin:-4px 0 12px}'+
  '.a4-sale{border:1px solid #dce5dc;border-radius:6px;margin:0 0 11px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}'+
  '.a4-sale-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;background:#edf4ee}'+
  '.a4-sale-heading h3{margin:0;font-size:12px}.a4-sale-heading span{font-size:10px;color:#425848;text-align:right}'+
  '.a4-products{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}'+
  '.a4-products th,.a4-products td{padding:7px 9px;border-bottom:1px solid #e6ebe6;text-align:right;overflow-wrap:anywhere}'+
  '.a4-products th:first-child,.a4-products td:first-child{text-align:left;width:41%}'+
  '.a4-products th:nth-child(2){width:9%}'+
  '.a4-sale-totals{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px;background:#f7faf7;font-size:10px}'+
  '.a4-fee{margin:7px 10px;font-size:10px;color:#5a6045}'+
  'footer{border-top:1px solid #aaa;margin-top:16px;padding-top:10px;font-size:10px;text-align:center;line-height:1.5}'+
  '.warning{font-size:10px;border:1px solid #aaa;padding:8px;margin-top:13px;line-height:1.5}'+
  '@media(max-width:650px){.sheet{padding:12px}.print-records{font-size:9px}'+
  '.print-records th,.print-records td{padding:6px 3px}.print-summary{gap:4px}'+
  '.print-summary>div{padding:6px 3px}.print-summary>div strong{font-size:11px}}'+
  '@media print{body{padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
  '.toolbar{display:none}.sheet{max-width:none;box-shadow:none;padding:0}'+
  'thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}'+
  '.a4-sale{break-inside:avoid-page}.a4-details h2{break-after:avoid-page}}'+
  '</style></head><body>'+toolbar+body+'</body></html>';
}
function printSalesReport(format){
 if(tab!=='vendas'||salesLoading||!shop||!hasAccess()||!salesReport||salesReport.error)
  return msg('Aguarde o carregamento das vendas para exportar.',true);
 if(!['receipt','a4'].includes(format))return;
 const report=salesReportData();
 if(!report.salesCount)return msg('Não há vendas neste período para exportar.',true);
 const popup=window.open('','_blank');
 if(!popup)return msg('Seu navegador bloqueou a exportação. Permita janelas pop-up e tente novamente.',true);
 popup.document.open();
 popup.document.write(salesPrintableHtml(report,format,shop.name,salesDateRange().label));
 popup.document.close();
 popup.focus();
 // O A4 abre uma prévia para escolher se os produtos entram no PDF.
 // O cupom térmico mantém a impressão direta.
 if(format==='receipt')popup.setTimeout(()=>{try{popup.print()}catch{}},350);
}
function renderSalesReport(){
 const range=salesDateRange();
 const controls='<div class="sales-report-controls"><div class="sales-period-switch" aria-label="Período do relatório">'+
  [['day','Dia'],['week','Semana'],['month','Mês']].map(([key,label])=>
   '<button type="button" data-sales-period="'+key+'" class="'+(key===salesPeriod?'active':'')+'" aria-pressed="'+(key===salesPeriod)+'">'+label+'</button>').join('')+
   '</div><label><span class="sr-only">Selecionar data</span><input type="date" id="salesReferenceDate" value="'+esc(salesDay)+'"></label>'+
   '<button class="ghost" type="button" data-sales-refresh>↻ Atualizar</button></div>';
 let content=heading('Vendas','Vendas por carrinho, custos, taxas do cartão e lucro após desconto da maquininha.');
 content+=controls+'<p class="sales-period-label">Período: <strong>'+esc(range.label)+'</strong> · Horário local</p>';
 if(salesLoading)return content+'<div class="empty">Carregando vendas do período...</div>';
 if(!salesReport)return content+'<div class="empty">Selecione o período para carregar o relatório.</div>';
 if(salesReport.error)return content+'<div class="empty">'+esc(salesReport.error)+'</div>';
 const report=salesReportData();
 const figures=report.figures;
 const paymentTotals=report.paymentTotals;
 const calculatedProfit=salesProfitInfo(figures,paymentTotals,report.unmatchedSales.length);
 content+='<div class="grid sales-period-totals">'+
  tile('Vendas',report.salesCount)+
  tile('Unidades vendidas',figures.quantity)+
  tile('Total vendido',fmt(paymentTotals.gross))+
  tile('Custo',figures.missing||report.unmatchedSales.length?'—':fmt(figures.cost))+
  tile('Lucro',salesProfitLabel(calculatedProfit))+'</div>';
 content+='<p class="sales-disclaimer">Lucro = total vendido − custo dos produtos − taxas da maquininha registradas. Não inclui impostos e outras despesas.</p>';
 if(figures.estimated)
  content+='<p class="sales-disclaimer">Em '+figures.estimated+
   ' item(ns) antigos, o custo foi estimado com o cadastro atual.</p>';
 if(figures.missing||paymentTotals.unknownFees||report.unmatchedSales.length)
  content+='<p class="sales-disclaimer">'+
   (figures.missing?figures.missing+' item(ns) sem custo conhecido. ':'')+
   (paymentTotals.unknownFees?paymentTotals.unknownFees+' venda(s) antiga(s) com taxa de cartão não registrada. ':'')+
   'O lucro calculável aparece como parcial (*) até a taxa real ser informada. — indica custo desconhecido.</p>';
 if(report.unmatchedSales.length)
  content+='<p class="sales-disclaimer">Há '+report.unmatchedSales.length+' venda(s) sem itens detalhados; elas entram no faturamento, mas não no lucro calculado.</p>';
 if(!report.days.length)return content+empty('Nenhuma venda registrada neste período.');
 content+='<div class="sales-export-actions" role="group" aria-label="Exportar relatório de vendas">'+
  '<button type="button" class="button" data-sales-export="receipt">Exportar cupom 80 mm</button>'+
  '<button type="button" class="ghost" data-sales-export="a4">Exportar folha A4 / PDF</button></div>'+
  '<section class="sales-records-section" aria-label="Lista de todas as vendas">'+
  '<h3>Lista de vendas</h3>'+
  '<p class="muted small">Clique em uma venda para conferir os produtos e os detalhes do carrinho.</p>'+
  '<div class="sales-records-scroll"><table class="sales-records-table"><thead><tr>'+
  '<th>Venda</th><th>Data e hora</th><th>Unidades vendidas</th><th>Total vendido</th><th>Custo</th><th>Lucro</th>'+
  '</tr></thead><tbody>'+
  report.days.flatMap(day=>day.sales.map(group=>salesRecordRow(group,day.day))).join('')+
  '</tbody></table></div></section>';
 return content;
}
function restockProducts(){
 return products.filter(p=>productStockState(p).state!=='ok').map(product=>{
   const now=Math.max(0,Number(product.stock)||0),minimum=Math.max(0,Number(product.min_stock??5)||0);
   const target=Math.max(1,minimum+1),needed=Math.max(0,target-now);
   const unitCost=Math.max(0,Number(product.cost)||0);
   return {product,now,minimum,target,needed,unitCost,estimatedCost:needed*unitCost};
 }).filter(row=>row.needed>0).sort((a,b)=>a.now-b.now||String(a.product.name).localeCompare(String(b.product.name),'pt-BR'));
}
function renderRestockList(){
 const rows=restockProducts();
 const total=rows.reduce((n,r)=>n+r.estimatedCost,0);
 let content='<section class="restock-section" id="restockDetails"><div class="restock-heading"><div><h3>Lista de reposição</h3>'+
   '</div>'+
   '<div class="restock-total"><small>Investimento estimado</small><strong>'+fmt(total)+'</strong></div></div>';
 if(!rows.length)return content+empty('Nenhum produto precisa de reposição no momento.')+'</section>';
 content+='<div class="restock-list">'+rows.map(({product,now,minimum,needed,unitCost,estimatedCost})=>
  '<div class="restock-item"><div class="restock-name"><strong>'+esc(product.name)+'</strong><small>'+
  esc(product.category||'Geral')+' · Atual: '+esc(now)+' · Mínimo: '+esc(minimum)+'</small></div>'+
  '<div><small>Repor</small><strong>'+esc(needed)+' un.</strong></div>'+
  '<div><small>Custo unitário</small><strong>'+fmt(unitCost)+'</strong></div>'+
  '<div><small>Valor da reposição</small><strong>'+fmt(estimatedCost)+'</strong></div></div>').join('')+'</div>'+
  '<p class="muted restock-note">Estimativa baseada nos custos cadastrados. Confira preços e disponibilidade com o fornecedor antes de comprar.</p></section>';
 return content;
}

function productStockState(product){
 const stock=Math.max(0,Number(product.stock)||0);
 const minimum=Math.max(0,Number(product.min_stock??5)||0);
 if(stock<=0)return {label:'Sem estoque',state:'out'};
 if(stock<=minimum)return {label:'Estoque baixo',state:'low'};
 return {label:'Estoque normal',state:'ok'};
}
function stockSummaryCards(){
 const low=products.filter(p=>productStockState(p).state==='low').length;
 const out=products.filter(p=>productStockState(p).state==='out').length;
 const restock=restockProducts().length;
 const stats=[
  ['all','Produtos cadastrados',products.length],
  ['low','Estoque baixo',low],
  ['out','Sem estoque',out],
  ['restock','Reposição',restock]
 ];
 return '<div class="stock-summary-grid" role="group" aria-label="Resumo do estoque">'+
  stats.map(([key,label,count])=>{
   const active=selectedStockPanel===key;
   const expanded=key==='restock'?' aria-expanded="'+active+'" aria-controls="restockDetails"':'';
   return '<button type="button" class="stock-summary-card'+(active?' active':'')+'"'+
    ' data-stock-summary="'+key+'" aria-pressed="'+active+'"'+expanded+'>'+
    '<span class="stock-summary-label">'+label+'</span>'+
    '<strong class="stock-summary-number">'+count+'</strong></button>';
  }).join('')+'</div>';
}
function productCard(product){
 const {label,state}=productStockState(product);
 const photo=product.image_path?
   '<img class="inventory-photo" src="'+esc(imageUrl(product.image_path))+'" alt="Foto de '+esc(product.name)+'" loading="lazy">':
   '<div class="inventory-photo inventory-photo-placeholder" role="img" aria-label="Produto sem foto">📦</div>';
 return '<article class="inventory-card" data-stock-state="'+state+'">'+
  '<div class="inventory-photo-wrap">'+photo+'</div>'+
  '<div class="inventory-card-body">'+
  '<div class="inventory-card-heading"><small>'+esc(product.category||'Geral')+'</small><h3>'+esc(product.name)+'</h3></div>'+
  '<div class="inventory-card-prices"><strong>'+fmt(product.price)+'</strong><small>Custo: '+fmt(product.cost)+'</small></div>'+
  (product.online_enabled===false?'<small class="inventory-online-status offline">Somente PDV · Não aparece no cardápio online</small>':
   '<small class="inventory-online-status">Venda online: Sim · '+fmt(product.menu_price_enabled&&product.menu_price!=null?product.menu_price:product.price)+'</small>')+
  '<div class="inventory-stock-meta"><span>Atual: <strong>'+esc(product.stock??0)+' un</strong></span>'+
   '<span aria-hidden="true">•</span><span>Mínimo: <strong>'+esc(product.min_stock??5)+' un</strong></span></div>'+
  '<div class="inventory-status '+state+'" role="status">'+label+'</div>'+
  '<div class="inventory-actions">'+editBtn('product',product.id)+'</div>'+
  '</div></article>';
}
function normalizedProductCategory(product){
 return String(product.category||'Geral').trim()||'Geral';
}
function filteredProductList(selected='all'){
 return selected==='all'?products:products.filter(product=>normalizedProductCategory(product)===selected);
}
function categoryKey(name){
 return String(name||'Geral').trim().toLocaleLowerCase('pt-BR');
}
function categoryThumbnail(name){
 const saved=categories.find(c=>categoryKey(c.name)===categoryKey(name));
 const product=products.find(p=>categoryKey(p.category)===categoryKey(name)&&p.image_path);
 const path=saved?.image_path||product?.image_path;
 return path?'<img class="category-image-thumb" src="'+esc(imageUrl(path))+'" alt="" loading="lazy">':
  '<span class="category-image-thumb category-image-empty" aria-hidden="true">▣</span>';
}
function categoryImageActions(name){
 if(!proAccess()||!menuSchemaReady||categoryKey(name)==='todos')return '';
 return '<div class="category-image-actions">'+
  '<button type="button" data-category-image-paste="'+esc(name)+'" title="Clique e pressione Ctrl+V para colar uma imagem">📋 Colar imagem</button>'+
  '<label class="category-image-file">Escolher foto<input data-category-image-file="'+esc(name)+'" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>';
}
function categoryImagesSettings(){
 if(shop?.model!=='pdv')return '';
 if(!proAccess())return '<section class="category-image-settings"><h3>Imagens das categorias</h3><p class="muted">Personalização de imagens disponível no Plano Premium.</p></section>';
 if(!menuSchemaReady)return '<section class="category-image-settings"><h3>Imagens das categorias</h3><p class="warn">As categorias estão aguardando a atualização do banco. Não é possível alterar as imagens agora.</p></section>';
 const names=new Map();
 for(const cat of categories){
  const key=categoryKey(cat.name),name=String(cat.name||'').trim();
  if(name&&!names.has(key))names.set(key,name);
 }
 for(const product of products){
  const name=normalizedProductCategory(product),key=categoryKey(name);
  if(name&&!names.has(key))names.set(key,name);
 }
 const ordered=[...names.values()].filter(name=>categoryKey(name)!=='todos').sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const rows=ordered.map(name=>
  '<div class="category-image-setting-row">'+
   categoryThumbnail(name)+
   '<div class="category-image-setting-info"><strong>'+esc(name)+'</strong><small>Foto exibida no cardápio online</small></div>'+
   categoryImageActions(name)+
  '</div>').join('');
 return '<section class="category-image-settings" id="categoryImagesSettings">'+
  '<h3>Imagens das categorias</h3>'+
  '<p class="muted">Personalize as fotos de cada categoria do cardápio. Copie uma imagem, clique em "Colar imagem" e pressione Ctrl+V, ou escolha um arquivo JPG, PNG ou WebP de até 5 MB.</p>'+
  '<div class="category-image-settings-list">'+(rows||'<p class="muted">Cadastre uma categoria ou um produto para escolher a imagem.</p>')+'</div>'+
  '</section>';
}
function productCategoryCards(selected='all'){
 if(!products.length)return '';
 const names=[...new Set(products.map(normalizedProductCategory))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 return '<div class="inventory-category-section"><div class="inventory-category-heading"><strong>Categorias</strong><small>Selecione para filtrar os produtos</small></div>'+
  '<div class="inventory-category-grid" aria-label="Filtrar produtos por categoria">'+
  ['all',...names].map(name=>{
   const count=filteredProductList(name).length;
   const chosen=name===selected;
   return '<button type="button" class="inventory-category-card'+(chosen?' active':'')+'" data-category-filter="'+esc(name)+'" aria-pressed="'+chosen+'">'+
    '<strong>'+esc(name==='all'?'Todos':name)+'</strong><small>'+count+' produto(s)</small></button>';
  }).join('')+'</div></div>';
}
function productGrid(selected='all',stockMode='all'){
 const visible=filteredProductList(selected).filter(product=>
  !['low','out'].includes(stockMode)||productStockState(product).state===stockMode);
 const emptyMessage=stockMode==='low'?'Nenhum produto com estoque baixo nesta categoria.':
  stockMode==='out'?'Nenhum produto sem estoque nesta categoria.':
  products.length?'Nenhum produto encontrado nesta categoria.':'Nenhum produto cadastrado. Clique em Novo produto para começar.';
 return visible.length?'<div class="inventory-grid compact">'+visible.map(productCard).join('')+'</div>':
  empty(emptyMessage);
}
function categoryOptions(selected){
  const names=[...new Set(['Geral',...categories.filter(c=>categoryKey(c.name)!=='todos').map(c=>c.name),...products.map(p=>p.category||'Geral')])];
  return names.map(name=>'<option value="'+esc(name)+'"'+(name===selected?' selected':'')+'>'+esc(name)+'</option>').join('');
}
function cardapioLogoEditor(){
 if(!proAccess())return '';
 const own=!!shop.logo_path;
 const photo=own?imageUrl(shop.logo_path):'/bipstart-marca-icon.png';
 return '<section class="menu-editor-panel menu-logo-editor" aria-labelledby="menuLogoTitle">'+
  '<div class="menu-logo-editor-heading"><div><h3 id="menuLogoTitle">Logo cadastrada da loja</h3>'+
   '<p class="muted">Esta logo aparece no card redondo no canto superior direito do cardápio online.</p></div>'+
   '<img class="menu-logo-editor-preview" src="'+esc(photo)+'" alt="'+(own?'Logo atual da loja':'Símbolo padrão BipStart')+'" loading="lazy"></div>'+
  '<form id="cardapioLogoForm">'+
   '<label>Escolher logo (JPG, PNG ou WebP, até 5 MB)<input type="file" name="logo" accept="image/jpeg,image/png,image/webp"></label>'+
   (own?'<label class="menu-logo-remove"><input type="checkbox" name="remove_logo"> Usar logo padrão BipStart</label>':'')+
   '<button type="submit" class="button">Salvar logo do cardápio</button></form>'+
  '</section>';
}

const menuEstablishmentTypes=[["outros","Outro estabelecimento"],["bar_petiscaria","Bar e petiscaria"],["adega_conveniencia","Adega e conveniência"],["hamburgueria","Hamburgueria"],["pizzaria","Pizzaria"],["lanchonete","Lanchonete"],["marmitaria","Marmitaria"],["restaurante","Restaurante"],["doceria","Doceria"],["acaiteria","Açaíteria"],["espetaria","Espetaria"],["mercado","Mercado"]];
function establishmentTypeField(){
 const savedEstablishment=shop.establishment_type||'outros';
 const establishment=menuEstablishmentTypes.find(([key])=>key===savedEstablishment)?.[1]||savedEstablishment;
 return '<label>Tipo de estabelecimento<input type="text" name="establishment_type" list="menuEstablishmentSuggestions" value="'+esc(establishment)+'" maxlength="65" required placeholder="Ex.: Adega, cafeteria ou petiscaria">'+
  '<datalist id="menuEstablishmentSuggestions">'+menuEstablishmentTypes.map(([,label])=>'<option value="'+esc(label)+'"></option>').join('')+'</datalist></label>';
}
function cardapioLayoutSettings(){
 if(!proAccess())return '';
 const isSubtitle=shop.show_logo_subtitle===true;
 return '<section class="menu-editor-panel menu-layout-settings" id="menuLayoutSettings" aria-labelledby="menuLayoutTitle">'+
  '<h3 id="menuLayoutTitle">Personalização do cardápio</h3>'+
  '<div class="menu-layout-fields">'+
   '<fieldset class="menu-layout-subtitle"><legend>Exibir frase abaixo do nome da loja?</legend>'+
    '<label><input type="radio" name="show_logo_subtitle" value="true"'+(isSubtitle?' checked':'')+'> Sim</label>'+
    '<label><input type="radio" name="show_logo_subtitle" value="false"'+(!isSubtitle?' checked':'')+'> Não</label>'+
   '</fieldset>'+
   '<label class="menu-layout-tagline">Frase abaixo do nome da loja<input type="text" name="logo_subtitle" maxlength="100" value="'+esc(shop.logo_subtitle||'')+'" placeholder="Ex.: Sabor que conquista"></label>'+
   '</div></section>';
}

function cardapioEditor(){
 if(!proAccess())return heading('Cardápio online','Disponível exclusivamente no Plano Premium.')+
   '<div class="empty">Faça upgrade para Premium nas Configurações para publicar o cardápio. Seus produtos permanecem salvos.</div>';
 const visibleCategories=categories.filter(cat=>categoryKey(cat.name)!=='todos');
 const list=visibleCategories.length?visibleCategories.map(cat=>{
  const count=products.filter(p=>p.category.toLocaleLowerCase('pt-BR')===cat.name.toLocaleLowerCase('pt-BR')).length;
  return '<div class="menu-category-line"><strong>'+esc(cat.name)+'</strong><small>'+count+' item(ns)</small></div>';
 }).join(''):'<p class="muted">Comece adicionando uma categoria, como Salgados ou Bebidas.</p>';
 const details=[
  ['Horário',shop.opening_hours||'Configurar'],
  ['Localização',shop.location_text||'Configurar'],
  ['Pagamento',(shop.payment_methods||[]).join(', ')||'Configurar'],
  ['Entrega',fmt(shop.delivery_fee||0)]
 ];
 return heading('Meu cardápio','Organize categorias, produtos, descrições e preços.')+
 (menuSchemaReady?'':'<p class="warn">A nova versão do cardápio está aguardando a atualização do banco de dados. Não salve alterações até a configuração terminar.</p>')+
 cardapioLogoEditor()+
 '<div class="menu-editor-meta">'+details.map(([label,value])=>'<button type="button" data-nav="configuracoes" title="Editar nas configurações"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></button>').join('')+'</div>'+
 '<div class="menu-editor-grid'+(showForm?.kind==='product'?'':' menu-editor-grid--single')+'"><section class="menu-editor-panel"><h3>Categorias</h3>'+
 '<form id="categoryForm" class="menu-category-form"><label>Nova categoria<input type="text" name="name" placeholder="Ex.: Bebidas" required maxlength="65"></label>'+
 '<button class="button" type="submit">+ Adicionar categoria</button></form>'+
 '<div class="menu-category-list">'+list+'</div></section>'+
 (showForm?.kind==='product'?'<section class="menu-editor-panel"><h3>Adicionar ou editar item</h3>'+productForm(showForm.value)+'</section>':'')+
 '</div>';
}


/* Comprovante não fiscal: preferências locais isoladas por loja e impressão sem credenciais. */
let lastReceipt=null;
const receiptPaperOptions=['58','80','a4'];
function receiptSettingsKey(){
 return 'bipstart_receipt_settings_v1:'+(shop?.id||'sem-loja');
}
function receiptSettings(){
 const standard={paper:'80',preview:true,footer:'Obrigado pela preferência!'};
 try{
  const parsed=JSON.parse(localStorage.getItem(receiptSettingsKey())||'null');
  if(!parsed||typeof parsed!=='object')return standard;
  return {
   paper:receiptPaperOptions.includes(parsed.paper)?parsed.paper:'80',
   preview:parsed.preview!==false,
   footer:typeof parsed.footer==='string'?parsed.footer.slice(0,120):standard.footer
  };
 }catch{return standard;}
}
function receiptSettingsPanel(){
 const prefs=receiptSettings();
 return '<section class="receipt-settings-panel" aria-labelledby="receiptSettingsTitle">'+
  '<h3 id="receiptSettingsTitle">Formato do comprovante de venda</h3>'+
  '<p class="muted">Escolha o papel para impressão ou PDF. A configuração vale para esta loja neste navegador.</p>'+
  '<div class="receipt-settings-fields">'+
  '<label>Tamanho da nota<select name="paper">'+
   [['58','Bobina térmica 58 mm'],['80','Bobina térmica 80 mm'],['a4','Folha A4']].map(([value,label])=>
    '<option value="'+value+'"'+(prefs.paper===value?' selected':'')+'>'+label+'</option>').join('')+
   '</select></label>'+
  '<label>Mensagem no rodapé<input type="text" name="footer" maxlength="120" value="'+esc(prefs.footer)+'" placeholder="Ex.: Obrigado pela preferência!"></label>'+
  '<label class="receipt-settings-check"><input type="checkbox" name="preview"'+(prefs.preview?' checked':'')+'> Abrir comprovante após finalizar cada venda</label>'+
  '</div>'+
  '<p class="muted small">Documento comercial sem valor fiscal; não substitui NFC-e ou nota fiscal.</p>'+
  '</section>';
}
function receiptSnapshot(sale,method,received,sold,recorded){
 const total=Number(sale?.total);
 const serverItems=Array.isArray(recorded)&&recorded.length===sold.length&&recorded.every(row=>
  row&&typeof row.product_name==='string'&&Number.isFinite(Number(row.unit_price))&&Number(row.unit_price)>=0&&
  Number.isInteger(Number(row.quantity))&&Number(row.quantity)>0);
 const items=serverItems?recorded.map(row=>({
   name:String(row.product_name),qty:Number(row.quantity),price:Number(row.unit_price)
  })):sold.map(item=>({name:String(item.name),qty:Number(item.qty),price:Number(item.price)}));
 const computed=items.reduce((acc,item)=>acc+item.qty*item.price,0);
 const validTotal=Number.isFinite(total)&&total>=0?total:computed;
 return {
  shopId:shop.id,shopName:String(shop.name||''),address:String(shop.location_text||''),
  whatsapp:String(shop.whatsapp||''),id:String(sale?.sale_id||''),
  issuedAt:new Date().toISOString(),payment:method,items,total:validTotal,
  received:method==='dinheiro'&&received!==''?Number(received):null,
  priceVerified:serverItems&&Math.abs(computed-validTotal)<.011
 };
}
function receiptMarkup(receipt){
 const pay={dinheiro:'Dinheiro',pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito'};
 const subtotal=receipt.items.reduce((sum,item)=>sum+item.qty*item.price,0);
 const cash=receipt.payment==='dinheiro'&&Number.isFinite(receipt.received);
 const footer=receiptSettings().footer.trim();
 const date=new Date(receipt.issuedAt);
 return '<article class="receipt-paper"><header class="receipt-shop">'+
  '<strong>'+esc(receipt.shopName)+'</strong>'+
  (receipt.address?'<p>'+esc(receipt.address)+'</p>':'')+
  (receipt.whatsapp?'<p>Contato: '+esc(receipt.whatsapp)+'</p>':'')+
  '</header><h3>COMPROVANTE DE VENDA</h3><p class="receipt-subtitle">NÃO FISCAL</p>'+
  '<div class="receipt-meta"><span>Emissão</span><strong>'+esc(Number.isNaN(date.getTime())?'—':date.toLocaleString('pt-BR'))+'</strong></div>'+
  (receipt.id?'<div class="receipt-meta"><span>Venda</span><strong>'+esc(receipt.id)+'</strong></div>':'')+
  '<table class="receipt-items"><thead><tr><th>Qtd.</th><th>Item</th><th>Un.</th><th>Total</th></tr></thead><tbody>'+
  receipt.items.map(item=>'<tr><td>'+esc(item.qty)+'</td><td>'+esc(item.name)+'</td>'+
   '<td>'+fmt(item.price)+'</td><td>'+fmt(item.price*item.qty)+'</td></tr>').join('')+
  '</tbody></table>'+
  '<div class="receipt-meta"><span>Itens</span><strong>'+receipt.items.reduce((sum,item)=>sum+item.qty,0)+'</strong></div>'+
  '<div class="receipt-meta"><span>Subtotal dos itens</span><strong>'+fmt(subtotal)+'</strong></div>'+
  '<div class="receipt-meta receipt-grand"><span>TOTAL DA VENDA</span><strong>'+fmt(receipt.total)+'</strong></div>'+
  '<div class="receipt-meta"><span>Pagamento</span><strong>'+esc(pay[receipt.payment]||receipt.payment)+'</strong></div>'+
  (cash?'<div class="receipt-meta"><span>Valor recebido</span><strong>'+fmt(receipt.received)+'</strong></div>'+
   '<div class="receipt-meta"><span>Troco</span><strong>'+fmt(Math.max(0,receipt.received-receipt.total))+'</strong></div>':'')+
  (!receipt.priceVerified?'<p class="receipt-warning">Valores unitários de referência. Confirme os itens com o registro da venda.</p>':'')+
  (footer?'<p class="receipt-footer">'+esc(footer)+'</p>':'')+
  '<p class="receipt-legal">Comprovante comercial sem valor fiscal.<br>Não substitui nota fiscal ou NFC-e.</p></article>';
}
function receiptStandaloneHtml(receipt,paper){
 const choice=receiptPaperOptions.includes(paper)?paper:'80';
 const narrow=choice==='58';
 const printWidth=choice==='a4'?'185mm':choice+'mm';
 const printHeight=choice==='a4'?'auto':Math.min(1000,Math.max(150,105+receipt.items.reduce((n,item)=>
   n+Math.ceil(String(item.name).length/(narrow?13:20))*6+7,0)))+'mm';
 const pageSize=choice==='a4'?'A4':printWidth+' '+printHeight;
 const pageMargin=choice==='a4'?'12mm':'2mm';
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>Comprovante '+esc(receipt.id||'de venda')+'</title>'+
  '<style>@page{size:'+pageSize+';margin:'+pageMargin+'}'+
  '*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:12px;background:#ececec;font:12px Arial,sans-serif;color:#111}'+
  '.print-actions{text-align:center;margin:0 auto 15px}.print-actions button{padding:9px 16px;cursor:pointer}'+
  '.receipt-paper{max-width:'+printWidth+';margin:auto;background:white;padding:'+(choice==='a4'?'15mm':'2mm')+';color:#111;overflow-wrap:anywhere}'+
  '.receipt-shop,.receipt-paper>h3,.receipt-subtitle,.receipt-footer,.receipt-legal{text-align:center}'+
  '.receipt-shop strong{font-size:1.32em}.receipt-shop p{margin:4px 0}'+
  '.receipt-paper h3{font-size:1.1em;margin:14px 0 2px}'+
  '.receipt-subtitle{font-size:.85em;margin:0 0 12px;font-weight:bold}'+
  '.receipt-meta{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px dashed #aaa}'+
  '.receipt-meta strong{text-align:right;overflow-wrap:anywhere;min-width:0}'+
  '.receipt-items{width:100%;border-collapse:collapse;margin:13px 0;font-size:inherit;table-layout:fixed}'+
  '.receipt-items th,.receipt-items td{padding:6px 2px;border-bottom:1px dotted #aaa;vertical-align:top;text-align:right;overflow-wrap:anywhere}'+
  '.receipt-items th:nth-child(1),.receipt-items td:nth-child(1){width:12%;text-align:left}'+
  '.receipt-items th:nth-child(2),.receipt-items td:nth-child(2){width:40%;text-align:left}'+
  '.receipt-items th:nth-child(3),.receipt-items td:nth-child(3){width:24%}'+
  '.receipt-items th:nth-child(4),.receipt-items td:nth-child(4){width:24%}'+
  '.receipt-grand{font-size:1.18em;font-weight:bold;border-top:2px solid #111;border-bottom:2px solid #111}'+
  '.receipt-footer{margin:18px 0 7px;font-weight:bold}.receipt-legal{font-size:.8em;color:#333}'+
  '.receipt-warning{font-weight:bold;border:1px solid #111;padding:5px}'+
  '@media print{body{padding:0;background:white}.print-actions{display:none}.receipt-paper{max-width:none;margin:0;padding:0}}'+
  '</style></head><body><div class="print-actions"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>'+
  receiptMarkup(receipt)+'</body></html>';
}
function showReceiptDialog(receipt){
 if(!receipt||receipt.shopId!==shop?.id)return;
 const modal=$('receiptModal');
 modal.querySelector('[data-receipt-content]').innerHTML=receiptMarkup(receipt);
 modal.querySelector('[data-receipt-paper-label]').textContent=
  ({'58':'58 mm','80':'80 mm','a4':'A4'})[receiptSettings().paper];
 modal.classList.remove('hidden');
 document.body.classList.add('receipt-open');
 modal.querySelector('[data-receipt-close]').focus();
}
function closeReceiptDialog(){
 $('receiptModal').classList.add('hidden');
 document.body.classList.remove('receipt-open');
 document.querySelector('[data-receipt-last]')?.focus({preventScroll:true});
}
function printReceipt(receipt){
 if(!receipt||receipt.shopId!==shop?.id)return;
 const popup=window.open('','_blank');
 if(!popup)return msg('Seu navegador bloqueou a impressão. Libere pop-ups e tente novamente.',true);
 popup.document.open();
 popup.document.write(receiptStandaloneHtml(receipt,receiptSettings().paper));
 popup.document.close();
 popup.focus();
 popup.setTimeout(()=>{try{popup.print()}catch{}},350);
}
function downloadReceipt(receipt){
 if(!receipt||receipt.shopId!==shop?.id)return;
 const html=receiptStandaloneHtml(receipt,receiptSettings().paper);
 const blob=new Blob([html],{type:'text/html;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;
 link.download='comprovante-'+String(receipt.id||'venda').replace(/[^a-zA-Z0-9_-]/g,'')+'.html';
 document.body.append(link);
 link.click();
 link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}

/* Frente de caixa inspirada no fluxo visual da Godzilla Adega.
   Todas as gravações continuam na API isolada da loja BipStart. */
function filteredPdvProducts(){
 const term=pdvQuery.trim().toLocaleLowerCase('pt-BR');
 return products.filter(p=>p.active!==false
   &&(!pdvInStockOnly||Number(p.stock)>0)
   &&(!pdvCategory||String(p.category||'Geral')===pdvCategory)
   &&(!term||[p.name,p.category].some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(term))));
}
function pdvBestSellerProducts(){
 // Destaques escolhidos pela loja, independentes dos filtros de busca do catálogo.
 return products.filter(p=>p.active!==false&&p.is_best_seller===true)
   .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
}
function pdvBestSellers(){
 const featured=pdvBestSellerProducts();
 if(!featured.length)return '';
 return '<section class="pdv-best-sellers" aria-label="Acesso rápido aos mais vendidos">'+
  '<div class="pdv-best-sellers-title"><strong>★ Mais vendidos</strong><small>Acesso rápido · toque para adicionar</small></div>'+
  '<div class="pdv-best-sellers-list">'+featured.map(p=>{
   const qty=cart.find(c=>c.id===p.id)?.qty||0;
   const outOfStock=Number(p.stock)<=qty;
   const photo=p.image_path?'<img src="'+esc(imageUrl(p.image_path))+'" alt="" loading="lazy">':'<span class="pdv-best-seller-placeholder" aria-hidden="true">★</span>';
   return '<button type="button" class="pdv-best-seller" data-cart="'+esc(p.id)+'"'+(outOfStock?' disabled':'')+
    ' aria-label="'+esc(outOfStock?'Sem estoque: '+p.name:'Adicionar '+p.name+' ao carrinho')+'">'+
    '<span class="pdv-best-seller-photo">'+photo+'</span>'+
    '<span class="pdv-best-seller-text"><strong>'+esc(p.name)+'</strong><small>'+
    (outOfStock?'Sem estoque':fmt(p.price))+'</small></span>'+
    '<span class="pdv-best-seller-plus" aria-hidden="true">'+(outOfStock?'×':'+')+'</span></button>';
  }).join('')+'</div></section>';
}
function pdvProductCards(){
 const available=filteredPdvProducts();
 return available.length?available.map(p=>{
  const count=cart.find(c=>c.id===p.id)?.qty||0;
  const soldOut=Number(p.stock)<=count;
  const photo=p.image_path?'<img src="'+esc(imageUrl(p.image_path))+'" alt="'+esc(p.name)+'" loading="lazy">':'<div class="pdv-no-photo" aria-hidden="true">▣</div>';
  return '<article class="pdv-product">'+
   '<div class="pdv-product-media">'+photo+'</div>'+
   '<div class="pdv-product-info"><h3>'+esc(p.name)+'</h3>'+
   '<p>'+esc(p.category||'Geral')+' · Estoque: '+esc(p.stock)+'</p>'+
   '<strong class="pdv-product-price">'+fmt(p.price)+'</strong>'+
   '<button type="button" class="button pdv-add" data-cart="'+esc(p.id)+'" '+(soldOut?'disabled':'')+'>'+
   (soldOut?'Sem estoque':'+ Adicionar')+'</button></div></article>';
 }).join(''):'<div class="empty pdv-empty">Nenhum produto corresponde à busca. Cadastre produtos ou altere os filtros.</div>';
}
function renderGodzillaPDV(){
 const sum=cart.reduce((a,c)=>a+c.qty*c.price,0);
 const count=cart.reduce((a,c)=>a+c.qty,0);
 const categoriesList=[...new Set(products.map(p=>String(p.category||'Geral')))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const categoriesHtml='<option value="">Todas as categorias</option>'+
   categoriesList.map(name=>'<option value="'+esc(name)+'"'+(pdvCategory===name?' selected':'')+'>'+esc(name)+'</option>').join('');
 const cash=pdvPayment==='dinheiro',isCard=['credito','debito'].includes(pdvPayment);
 const cartItems=cart.map(c=>{
  const p=products.find(p=>p.id===c.id);
  return '<div class="pdv-sale-item"><div><strong>'+esc(c.name)+'</strong><small>'+
   fmt(c.price)+' por unidade'+(p?' · Estoque '+esc(p.stock):'')+'</small></div>'+
   '<div class="pdv-sale-qty">'+
   '<button type="button" data-qty-less="'+esc(c.id)+'" aria-label="Diminuir '+esc(c.name)+'">−</button>'+
   '<b>'+c.qty+'</b><button type="button" data-cart="'+esc(c.id)+'" aria-label="Aumentar '+esc(c.name)+'">+</button>'+
   '<button type="button" data-remove="'+esc(c.id)+'" aria-label="Remover '+esc(c.name)+'">×</button>'+
   '</div><strong>'+fmt(c.qty*c.price)+'</strong></div>';
 }).join('');
 const paymentChoices=[['dinheiro','Dinheiro'],['cartao','Cartão'],['pix','Pix']];
 const activePayment=isCard?'cartao':pdvPayment;
 const paymentButtons=paymentChoices.map(([code,label])=>
  '<button type="button" class="pdv-payment-chip'+(activePayment===code?' selected':'')+
  '" data-payment-option="'+code+'" aria-pressed="'+(activePayment===code)+'">'+label+'</button>'
 ).join('');
 const cardTypeButtons=[['credito','Crédito'],['debito','Débito']].map(([code,label])=>
  '<button type="button" class="pdv-card-kind'+(pdvPayment===code?' selected':'')+
  '" data-card-method="'+code+'" aria-pressed="'+(pdvPayment===code)+'">'+label+'</button>'
 ).join('');
 return '<div class="godzilla-pdv">'+
 '<div class="pdv-title"><h2>PDV</h2></div>'+
 '<div class="pdv-two-panels"><section class="pdv-panel pdv-catalog" aria-label="Produtos da loja">'+
 '<div class="pdv-filters">'+
 '<label class="pdv-search-label"><span class="sr-only">Buscar produtos</span><input type="search" id="pdvSearch" placeholder="Buscar produto ou categoria" value="'+esc(pdvQuery)+'" autocomplete="off"></label>'+
 '<label class="pdv-category-label"><span class="sr-only">Filtrar categoria</span><select id="pdvCategory">'+categoriesHtml+'</select></label>'+
 '<button type="button" id="pdvStockToggle" class="ghost'+(pdvInStockOnly?' active':'')+'">'+
 (pdvInStockOnly?'✓ Só disponíveis':'Todos os produtos')+'</button></div>'+
 pdvBestSellers()+
 '<div class="pdv-list-head"><strong>Produtos da loja</strong><small>'+products.length+' cadastrados</small></div>'+
 '<div id="pdvProducts" class="pdv-products">'+pdvProductCards()+'</div>'+
 '</section><aside class="pdv-panel pdv-sale-panel" aria-label="Venda atual">'+
 '<div class="pdv-sale-head"><div><span class="kicker">CAIXA</span><h2>Venda atual</h2></div><span aria-hidden="true">🛒</span></div>'+
 '<div class="pdv-sale-list">'+(cartItems||'<div class="pdv-sale-empty">Seu carrinho está vazio. Selecione um produto à esquerda.</div>')+'</div>'+
 '<div class="pdv-sale-total"><span>'+count+' item(ns) · Total</span><strong>'+fmt(sum)+'</strong></div>'+
 '<form id="saleForm" class="pdv-payment-form">'+
 '<div class="pdv-payment-selector"><span class="pdv-payment-label" id="pdvPaymentLabel">Forma de pagamento</span>'+
 '<div class="pdv-payment-options" role="group" aria-labelledby="pdvPaymentLabel">'+paymentButtons+'</div>'+
 '<input type="hidden" name="payment_method" id="pdvPaymentMethod" value="'+esc(pdvPayment)+'"></div>'+
 '<div id="pdvCashFields" class="'+(cash?'':'hidden')+'"><label>Valor recebido (R$)<input type="number" id="pdvReceived" name="received" min="0" step="0.01" placeholder="0,00"></label>'+
 '<div class="pdv-calculation">Troco <strong id="pdvChange">'+fmt(0)+'</strong></div></div>'+
 '<div id="pdvCardFields" class="'+(isCard?'':'hidden')+'">'+
 '<span class="pdv-card-kind-label" id="pdvCardKindLabel">Tipo de cartão</span>'+
 '<div class="pdv-card-kinds" role="group" aria-labelledby="pdvCardKindLabel">'+cardTypeButtons+'</div>'+
 '<label>Taxa da maquininha (%)<input id="pdvFeePercent" name="card_fee_percent" type="number" min="0" max="100" step="0.01" value="'+esc(pdvCardFeePercent)+'"></label>'+
 '<div class="pdv-calculation">Desconto da maquininha <strong id="pdvFeeAmount">−'+fmt(Math.round(sum*Number(pdvCardFeePercent||0))/100)+'</strong></div>'+
 '<div class="pdv-calculation">Líquido estimado <strong id="pdvNet">'+fmt(sum-Math.round(sum*Number(pdvCardFeePercent||0))/100)+'</strong></div>'+
 '<small class="muted">Taxa registrada na venda e descontada do lucro no relatório; a BipStart não processa pagamentos.</small></div>'+
 '<button type="submit" class="button pdv-finish" '+(!cart.length?'disabled':'')+'>Finalizar venda ↗</button>'+
 '<p class="muted small">Registre apenas pagamentos recebidos fora da BipStart. O sistema atualiza o estoque após confirmar a venda.</p></form>'+
 ((typeof lastReceipt!=='undefined'&&lastReceipt?.shopId===shop?.id)?'<button class="ghost pdv-last-receipt" type="button" data-receipt-last>🧾 Reimprimir último comprovante</button>':'')+
 '</aside></div></div>';
}
function selectPdvPayment(method){
 if(method==='cartao')pdvPayment=['credito','debito'].includes(pdvPayment)?pdvPayment:'credito';
 else if(['dinheiro','pix','credito','debito'].includes(method))pdvPayment=method;
 else return false;
 return true;
}
function updatePdvEstimates(){
 const total=cart.reduce((a,c)=>a+c.qty*c.price,0);
 const received=document.getElementById('pdvReceived');
 const change=document.getElementById('pdvChange');
 if(received&&change)change.textContent=fmt(Math.max(0,Number(received.value||0)-total));
 const fee=document.getElementById('pdvFeePercent');
 const net=document.getElementById('pdvNet');
 if(fee&&net){
   const percent=Math.min(100,Math.max(0,Number(fee.value||0)));
   const discounted=Math.round(total*percent)/100;
   const feeAmount=document.getElementById('pdvFeeAmount');
   if(feeAmount)feeAmount.textContent='−'+fmt(discounted);
   net.textContent=fmt(total-discounted);
 }
}

// A ação principal de cada etapa só mostra o passo seguinte após a confirmação da loja.
function nextOnlineOrderStep(status,deliveryMethod){
 const stages={
  awaiting_confirmation:{next:'confirmed',label:'Confirmar pedido'},
  confirmed:{next:'preparing',label:'Iniciar preparo'},
  preparing:deliveryMethod==='delivery'
   ?{next:'out_for_delivery',label:'Saiu para entrega'}
   :{next:'fulfilled',label:'Finalizar pedido'},
  out_for_delivery:{next:'fulfilled',label:'Finalizar pedido'}
 };
 return stages[status]||null;
}
function nextOnlinePaymentStep(status){
 return status==='pending'?{next:'paid',label:'Confirmar pagamento'}:null;
}
function onlineOrderCard(order){
 const label={awaiting_confirmation:'Aguardando confirmação',confirmed:'Confirmado',preparing:'Em preparo',
  out_for_delivery:'Saiu para entrega',fulfilled:'Finalizado',cancelled:'Cancelado'};
 const payLabel={a_combinar:'A combinar',pix:'Pix',dinheiro:'Dinheiro',credito:'Crédito',debito:'Débito'};
 const paymentLabel={pending:'Aguardando pagamento',paid:'Pago',cancelled:'Pagamento cancelado'};
 const status=Object.hasOwn(label,order.status)?order.status:'awaiting_confirmation';
 const paymentStatus=Object.hasOwn(paymentLabel,order.payment_status)?order.payment_status:'pending';
 const orderNext=nextOnlineOrderStep(status,order.delivery_method),paymentNext=nextOnlinePaymentStep(paymentStatus);
 const orderOpen=status!=='cancelled'&&status!=='fulfilled';
 const finishLabel=typeof proAccess==='function'&&proAccess()?'Finalizar pela loja':'Finalizar pedido';
 const items=Array.isArray(order.items)?order.items:[];
 const phone=String(order.customer_phone||'').replace(/\D/g,'');
 const phoneUri=/^\d{10,13}$/.test(phone)?'<a class="online-order-phone" href="tel:+'+esc(phone.startsWith('55')?phone:'55'+phone)+'">'+esc(order.customer_phone)+'</a>':esc(order.customer_phone);
 const contact=phone&&/^\d{10,13}$/.test(phone)?
    '<a class="online-order-whatsapp" target="_blank" rel="noopener noreferrer" href="https://wa.me/'+esc(phone.startsWith('55')?phone:'55'+phone)+'" aria-label="Conversar com '+esc(order.customer_name)+' no WhatsApp" title="Conversar pelo WhatsApp">'+
    '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" focusable="false" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.058-.174-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.496.1-.198.05-.372-.025-.52-.075-.15-.669-1.612-.916-2.206-.242-.58-.487-.502-.669-.512-.173-.009-.372-.01-.57-.01-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.073c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.49 1.693.627.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.5h-.004a9.866 9.866 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.861 9.861 0 0 1-1.51-5.26C2.169 6.564 6.598 2.14 12.022 2.14c2.633 0 5.109 1.027 6.97 2.89a9.798 9.798 0 0 1 2.884 6.995c-.003 5.425-4.427 9.857-9.825 9.857m8.394-18.305A11.935 11.935 0 0 0 12.018.086C5.433.086.073 5.446.07 12.03c0 2.12.554 4.188 1.606 6.012L0 24l6.094-1.598a11.976 11.976 0 0 0 5.918 1.508h.005c6.585 0 11.946-5.36 11.949-11.945a11.932 11.932 0 0 0-3.491-8.45z"/></svg></a>':'';
 return '<article class="online-order-card" data-order-id="'+esc(order.id)+'">'+
  '<header class="online-order-top"><div class="online-order-identifier">'+
   '<span class="online-order-eyebrow">Pedido</span>'+
   '<h3>#'+esc(String(order.id).slice(0,8))+'</h3>'+
   '<small>'+esc(new Date(order.created_at).toLocaleString('pt-BR'))+'</small>'+
  '</div></header>'+
  '<section class="online-order-section online-order-products" aria-label="Dados do pedido">'+
   '<h4>Dados do pedido</h4>'+
   '<div class="online-order-overview">'+
    '<div><span>Recebimento</span><strong>'+esc(order.delivery_method==='delivery'?'Entrega':'Retirada na loja')+'</strong></div>'+
    '<div><span>Situação</span><strong class="online-state-pill'+(status==='cancelled'?' is-cancelled':status==='fulfilled'?' is-done':'')+'">'+esc(label[status])+'</strong></div>'+
   '</div>'+
   '<div class="online-order-items" aria-label="Itens vendidos"><h5>Itens vendidos</h5>'+items.map(item=>
    '<div class="online-order-item"><span class="online-order-item-name"><b class="online-order-item-qty">'+esc(item.qty)+'×</b> '+esc(item.name)+'</span><strong>'+fmt(item.total)+'</strong></div>'
   ).join('')+'</div>'+
   (order.notes?'<p class="online-order-notes"><strong>Observações:</strong> '+esc(order.notes)+'</p>':'')+
  '</section>'+
  '<section class="online-order-section online-order-payment" aria-label="Pagamento e total">'+
   '<h4>Pagamento e total</h4>'+
   '<div class="online-order-payment-meta">'+
    '<div><span>Pagamento combinado</span><strong>'+esc(payLabel[order.payment_method]||'A combinar')+'</strong></div>'+
    '<div><span>Status do pagamento</span><strong class="online-state-pill'+(paymentStatus==='cancelled'?' is-cancelled':paymentStatus==='paid'?' is-done':'')+'">'+esc(paymentLabel[paymentStatus])+'</strong></div>'+
   '</div>'+
   '<p class="online-order-fees"><span>Subtotal <strong>'+fmt(order.subtotal)+'</strong></span><span>Entrega <strong>'+fmt(order.delivery_fee)+'</strong></span></p>'+
   '<div class="online-order-total-row"><span>Total do pedido</span><strong class="online-order-total">'+fmt(order.total)+'</strong></div>'+
  '</section>'+
  '<section class="online-order-section online-order-customer" aria-label="Dados do cliente">'+
   '<h4>Dados do cliente</h4>'+
   '<h3>'+esc(order.customer_name)+'</h3>'+
   '<div class="online-order-details"><div><span>Telefone</span><strong class="online-phone-line">'+phoneUri+contact+'</strong></div></div>'+
   (order.delivery_method==='delivery'?'<p class="online-order-address"><strong>📍 Endereço:</strong> '+esc(order.delivery_address||'Não informado')+'</p>':'')+
  '</section>'+
  '<section class="online-order-actions" aria-label="Ações do pedido">'+
   '<h4 class="online-order-actions-heading">Ações</h4>'+
   '<div class="online-status-block" aria-label="Gerenciar situação do pedido">'+
    '<span class="online-status-title">Pedido</span>'+
    '<div class="online-status-controls">'+
     (orderOpen?(
       (orderNext&&orderNext.next!=='fulfilled'?'<button type="button" class="button online-advance" data-order-advance="'+esc(order.id)+'">'+esc(orderNext.label)+' →</button>':'')+
       '<button type="button" class="button online-manual-finish" data-order-finish="'+esc(order.id)+'">'+esc(finishLabel)+'</button>'
      ):'<span class="online-status-end">'+(status==='cancelled'?'Pedido cancelado':'Pedido finalizado')+'</span>')+
     '<button type="button" class="ghost online-cancel" data-order-cancel="'+esc(order.id)+'"'+(!orderOpen?' disabled':'')+'>Cancelar pedido</button>'+
    '</div></div>'+
   '<div class="online-status-block" aria-label="Gerenciar pagamento">'+
    '<span class="online-status-title">Pagamento</span>'+
    '<div class="online-status-controls">'+
     (paymentNext?'<button type="button" class="button online-advance" data-payment-advance="'+esc(order.id)+'">'+esc(paymentNext.label)+' →</button>':
      '<span class="online-status-end">'+(paymentStatus==='cancelled'?'Pagamento cancelado':'Pagamento confirmado')+'</span>')+
     '<button type="button" class="ghost online-cancel" data-payment-cancel="'+esc(order.id)+'"'+(paymentStatus==='cancelled'?' disabled':'')+'>Cancelar pagamento</button>'+
    '</div></div>'+
   ((typeof proAccess==='function'&&proAccess()&&order.delivery_method==='delivery'&&
      !['cancelled','fulfilled'].includes(status)&&!deliveries.some(d=>d.online_order_id===order.id))?
    '<button type="button" class="ghost online-order-dispatch" data-online-delivery="'+esc(order.id)+'">🛵 Criar entrega para este pedido</button>':'')+
   (order.whatsapp_updates_opt_in===true?'<button type="button" class="ghost online-notification-optout" data-order-optout="'+esc(order.id)+'">Desativar avisos WhatsApp</button>':'')+
   (orderNotificationLinks.has(order.id)?'<a class="ghost online-order-notification-link" target="_blank" rel="noopener noreferrer" href="'+esc(orderNotificationLinks.get(order.id))+'">Enviar atualização ao cliente no WhatsApp ↗</a>':'')+
  '</section></article>';
}

function courierAccessUrl(c,origin=location.origin){
 const base=origin+'/motoboy';
 return c?.account_id||!c?.invite_code?base:base+'?convite='+encodeURIComponent(c.invite_code);
}
function renderPage(){
  if(!hasAccess()){hiding('workspace',false);hiding('accessGate',true);renderAccessGate();return}
  if(!pages().some(([key])=>key===tab))tab='resumo';
  renderNav();
  let content='';
  if(tab==='resumo'){
    content=heading('Bem-vindo à BipStart',proAccess()?'PDV com estoque e cardápio online integrados. Seus dados ficam separados das demais lojas.':'PDV, estoque e vendas integrados. Ative o Premium para publicar seu cardápio online.')
      +'<div class="grid">'+tile('Modelo',proAccess()?'PDV + Cardápio online':'PDV + Estoque')+tile('Plano solicitado',plans[shop.requested_plan])+tile('Status',trialValid()?'Teste gratuito':'Ativo')+'</div>';
    if(shop.model==='pdv')content+='<div class="grid">'+tile('Produtos',products.length)+tile('Vendas',sales.length)+tile('Total vendido',fmt(sales.reduce((a,s)=>a+Number(s.total),0)))+'</div>';
    if(shop.model==='pdv')content+='<div class="grid public-overview-grid">'+tile('Itens cadastrados',products.length)+publicLinkTile()+'</div>';
  }else if(tab==='cardapio'){
    content=cardapioEditor();
  }else if(tab==='produtos'){
    content='<div class="inventory-kicker">CONTROLE</div>'+heading('Cadastro de produtos','',
      '<button type="button" class="button" data-new="product">+ Novo produto</button>');
    content+=stockSummaryCards();
    if(selectedStockPanel==='restock')content+=renderRestockList();
    if(selectedStockPanel==='all'){
      if(selectedCategoryFilter!=='all'&&!products.some(p=>normalizedProductCategory(p)===selectedCategoryFilter))selectedCategoryFilter='all';
      content+=productCategoryCards(selectedCategoryFilter);
    }
    if(['all','low','out'].includes(selectedStockPanel)){
      content+=showForm?.kind==='product'?productForm(showForm.value):'';
      if(selectedStockPanel==='all')content+=productGrid(selectedCategoryFilter);
      else content+=productGrid('all',selectedStockPanel);
    }
  }else if(tab==='pedidos'){
    const awaiting=onlineOrders.filter(o=>o.status==='awaiting_confirmation').length;
    const active=onlineOrders.filter(o=>['confirmed','preparing','out_for_delivery'].includes(o.status)).length;
    const paid=onlineOrders.filter(o=>o.payment_status==='paid').length;
    content=heading('Pedidos online','Pedidos registrados pelo cardápio antes da abertura do WhatsApp.',
      '<button type="button" class="ghost" data-orders-refresh>↻ Atualizar pedidos</button>');
    content+='<div class="grid online-order-stats">'+tile('Aguardando confirmação',awaiting)+tile('Em andamento',active)+tile('Pagamentos marcados como recebidos',paid)+'</div>';
    content+='<p class="muted online-order-notice">O registro ocorre antes de abrir o WhatsApp; não comprova que a mensagem foi enviada. Confirme o pedido com o cliente. O pagamento não é automático e deve ser marcado manualmente depois de recebido.</p>';
    content+='<div class="online-order-list">'+(onlineOrders.length?
      onlineOrders.map(onlineOrderCard).join(''):
      empty('Nenhum pedido online registrado. Compartilhe seu cardápio para receber pedidos.'))+'</div>';
    if(proAccess())content+='<div class="orders-premium"><strong>Entregas com motoboys</strong><p>Use “Criar entrega para este pedido” para vincular o motoboy. Ao marcar “Entregue”, ele finalizará o pedido online automaticamente.</p>'+
      '<button type="button" class="ghost" data-nav="entregas">Abrir fila de entregas</button></div>';
  }else if(tab==='caixa'){
    content=renderGodzillaPDV();
  }else if(tab==='vendas'){
    content=renderSalesReport();
  }else if(tab==='motoboys'){
    content=heading('Motoboys • Plano Premium','Cadastre entregadores e defina o login pelo telefone e a senha individual.','<button class="button" data-new="courier">+ Novo motoboy</button>');
    content+='<p class="muted">O telefone cadastrado será usado para entrar no aplicativo do motoboy. Escolha uma senha no cadastro e compartilhe o link de login. O acesso é somente por usuário e senha cadastrados pelo responsável.</p>';
    content+=showForm?.kind==='courier'?courierForm(showForm.value):'';
    content+=couriers.length?'<div class="stack">'+couriers.map(c=>{
      const link=location.origin+'/motoboy';
      const pending=!c.account_id,managed=c.account_id&&c.login_managed;
      return '<div class="item courier-access-item"><div class="courier-access-info"><strong>'+esc(c.name)+'</strong><small>'+esc(c.phone||'Sem telefone')+
        ' • '+(managed?'Login por telefone':c.account_id?'Conta antiga — atualize o cadastro':'Aguardando criação do login')+
        ' • '+(c.active?'Ativo':'Desativado')+'</small>'+
        '<p class="courier-access-label">'+'Link de login do motoboy:'+'</p>'+
        '<a class="courier-access-url" target="_blank" rel="noopener noreferrer" href="'+esc(link)+'">'+esc(link)+'</a>'+
        (managed?'<small>Usuário: '+esc(c.phone)+'. A senha foi definida no cadastro e pode ser alterada em Editar.</small>':
         pending?'<small>Edite o motoboy para definir uma senha e ativar o login pelo telefone.</small>':'')+
        '</div><div class="actions courier-access-actions">'+
         '<button type="button" class="button" data-share-courier="'+esc(link)+'" data-courier-name="'+esc(c.name)+'">Compartilhar link</button>'+
         '<button type="button" class="ghost" data-copy-invite="'+esc(link)+'">Copiar link</button>'+
         editBtn('courier',c.id)+
         '<button type="button" class="ghost" data-delete-courier="'+esc(c.id)+'">Remover</button></div></div>';
    }).join('')+'</div>':empty();
  }else if(tab==='entregas'){
    content=heading('Fila de entregas • Plano Premium','Entregas pendentes são oferecidas aos motoboys disponíveis.','<button class="button" data-new="delivery">+ Nova entrega</button>');
    content+='<p class="muted">Vincule a entrega ao pedido online para sincronizar o status automaticamente. Entregas manuais sem vínculo não alteram pedidos.</p>';
    content+=showForm?.kind==='delivery'?deliveryForm(showForm.value):'';
    const statusNames={pendente:'Aguardando motoboy',atribuida:'Aceita',a_caminho:'Saiu para entrega',entregue:'Entregue',cancelada:'Cancelada'};
    content+=deliveries.length?'<div class="stack">'+deliveries.map(d=>{
      const name=couriers.find(c=>c.id===d.courier_id)?.name||'Ainda não atribuída';
      const mapUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d.address);
      return '<div class="item"><div><strong>'+esc(d.customer_name||'Entrega')+'</strong>'+
        '<small>'+esc(d.address)+' • '+esc(statusNames[d.status]||d.status)+'</small>'+
        '<small>Motoboy: '+esc(name)+' • '+fmt(d.total||0)+'</small>'+
        (d.items_text?'<p class="muted small">'+esc(d.items_text)+'</p>':'')+
        '</div><div class="actions"><a class="ghost" href="'+esc(mapUrl)+'" target="_blank" rel="noopener noreferrer">Mapa ↗</a>'+
        (d.status==='pendente'?editBtn('delivery',d.id):'')+'</div></div>';
    }).join('')+'</div>':empty();
  }else if(tab==='configuracoes'){
    const isMenu=shop.model==='pdv';
    const paymentChoices=[['pix','Pix'],['credito','Cartão de crédito'],['debito','Cartão de débito'],['dinheiro','Dinheiro']];
    const currentMethods=Array.isArray(shop.payment_methods)?shop.payment_methods:['pix','dinheiro'];
    const logoAllowed=canCustomize()&&isMenu;
    const logoSection=logoAllowed?
      '<div class="menu-logo-settings"><h3>Logo do estabelecimento</h3>'+
      (shop.logo_path?'<img class="menu-logo-preview" src="'+esc(imageUrl(shop.logo_path))+'" alt="Logo atual">':'')+
      '<label>Inserir logo próprio (JPG, PNG ou WebP, até 5 MB)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>'+
      (shop.logo_path?'<label><input type="checkbox" name="remove_logo"> Remover logo atual</label>':'')+
      '</div>':
      '';
    content=heading('Configurações da loja','')
      +planManagementCard()
      +'<div class="data-form"><form id="settingsForm">'
      +field('name','Nome da empresa','text',shop.name,'required maxlength="120"')
      +field('whatsapp','WhatsApp comercial com DDD','tel',shop.whatsapp||'','placeholder="11999999999"')
      +(isMenu?establishmentTypeField():'')
      +(canCustomize()?field('brand_color','COR DO SITE','color',shop.brand_color||'#7c3aed')+'<p class="muted small">Uma cor para todo o ambiente da loja: PDV, pedidos, cardápio e entregas dos motoboys vinculados.</p>':'')
      +(isMenu?'<div class="menu-settings">'
       +field('opening_hours','Horário de atendimento','text',shop.opening_hours||'','maxlength="160" placeholder="Ex.: Segunda a sábado, 18h às 23h"')
       +field('location_text','Localização ou endereço','text',shop.location_text||'','maxlength="240" placeholder="Ex.: Rua das Flores, 100 — Centro"')
       +field('delivery_fee','Taxa de entrega (R$)','number',shop.delivery_fee??0,'min="0" max="9999.99" step="0.01"')
       +'<fieldset class="menu-payments"><legend>Formas de pagamento aceitas</legend>'+
        paymentChoices.map(([value,label])=>'<label><input type="checkbox" name="payment_methods" value="'+value+'"'+(currentMethods.includes(value)?' checked':'')+'> '+label+'</label>').join('')+'</fieldset>'
       +logoSection+'</div>':'')
      +(isMenu?cardapioLayoutSettings()+receiptSettingsPanel()+categoryImagesSettings():'')+
      '<button type="submit" class="button settings-save-button">Salvar</button></form></div>';
  }else if(tab==='personalizar'){
    content=heading('Mudanças e suporte mensal','Conte suas necessidades e solicite ajustes na logo, cores, páginas e funcionalidades.')
      +'<div class="data-form"><form id="customForm"><label>Descreva sua solicitação<textarea name="details" minlength="10" maxlength="3000" placeholder="Envie sua logo e conte as mudanças desejadas..." required></textarea></label><button class="button">Enviar solicitação</button></form></div>'
      +'<p class="muted small">Sua solicitação ficará registrada para atendimento pela BipStart. O contato e os prazos serão combinados com você.</p>'
      +(requests.length?'<div class="stack">'+requests.map(r=>'<div class="item"><div><strong>'+esc(r.status)+'</strong><small>'+new Date(r.created_at).toLocaleDateString('pt-BR')+'</small><p>'+esc(r.details)+'</p></div></div>').join('')+'</div>':'');
  }
  $('page').innerHTML=content;
}
function field(name,label,type='text',value='',extra=''){return '<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value)+'" '+extra+'></label>'}
function formShell(kind,id,inside){return '<div class="data-form"><form id="'+kind+'Form" data-id="'+esc(id||'')+'"><div class="columns">'+inside+'</div><button class="button">Salvar</button> <button type="button" class="ghost" data-cancel>Cancelar</button></form></div>'}
function productForm(p){
 p=p||{};
 const isMenu=tab==='cardapio';
 const categoryField=isMenu?
  '<label>Categoria<select name="category" required>'+categoryOptions(p.category||'Geral')+'</select></label>':
  field('category','Categoria','text',p.category||'Geral');
 return formShell('product',p.id,
  field('name','Nome do item', 'text',p.name,'required maxlength="160"')+
  categoryField+
  field('price','Preço de venda no PDV (R$)','number',p.price??0,'required min="0" step="0.01"')+
  '<label class="product-best-seller-option"><input type="checkbox" name="is_best_seller" value="true"'+(p.is_best_seller===true?' checked':'')+'>'+
  '<span><strong>★ Mais vendido</strong><small>Exibir este produto no acesso rápido do PDV.</small></span></label>'+
  (proAccess()?'<div class="menu-price-controls"><label class="online-sale-question">Venda online?'+
   '<select name="online_enabled" required>'+
    '<option value=""'+(!p.id?' selected':'')+' disabled>Selecione Sim ou Não</option>'+
    '<option value="true"'+(p.id&&p.online_enabled!==false?' selected':'')+'>Sim — colocar no cardápio online</option>'+
    '<option value="false"'+(p.id&&p.online_enabled===false?' selected':'')+'>Não — vender somente no PDV</option>'+
   '</select></label>'+
   '<div class="online-sale-price'+(p.id&&p.online_enabled!==false?'':' hidden')+'">'+
    field('menu_price','Valor no cardápio online (R$)','number',p.menu_price??(p.id?(p.price??0):''),'min="0" max="9999999999.99" step="0.01"'+(p.id&&p.online_enabled!==false?' required':' disabled'))+
    '</div>'+
   '</div>':
   '<div class="online-sale-locked"><strong>Cardápio online exclusivo Premium</strong></div>')+
  (isMenu?'<label>Descrição<textarea name="description" maxlength="1000" placeholder="Ingredientes, opções e informações do produto">'+esc(p.description||'')+'</textarea></label>':
  field('cost','Preço de custo (R$)','number',p.cost||0,'min="0" step="0.01"')+
  field('stock','Quantidade em estoque','number',p.stock??0,'required min="0" step="1"')+
  field('min_stock','Estoque mínimo (unidades)','number',p.min_stock??5,'required min="0" max="999999999" step="1"'))+
  '<label>Imagem do item (até 5 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>'+
  '<div class="paste-area" data-image-paste tabindex="0" role="button" aria-label="Colar imagem do produto" style="border:1px dashed #9068c8;border-radius:12px;padding:16px;cursor:pointer;min-height:75px">Clique aqui e pressione Ctrl+V para colar uma imagem copiada.<div data-image-preview aria-live="polite" style="margin-top:8px"></div></div>'
 );
}
function courierForm(c){
 c=c||{};
 const legacy=!!c.account_id&&!c.login_managed;
 const canChoosePassword=!legacy;
 return formShell('courier',c.id,
  field('name','Nome completo','text',c.name,'required maxlength="100"')+
  field('phone','Telefone (login)','tel',c.phone||'','required minlength="10" maxlength="20" autocomplete="tel"')+
  (canChoosePassword?
   '<label>Senha do motoboy '+(c.account_id?'(opcional para alterar)':'(obrigatória)')+
   '<input type="password" name="login_password" autocomplete="new-password" minlength="8" maxlength="72"'+
   (!c.account_id?' required':'')+' placeholder="'+(c.account_id?'Deixe vazio para manter a senha':'Mínimo de 8 caracteres')+'"></label>'+
   '<label>Confirmar senha'+(c.account_id?' (se for alterar)':'')+
   '<input type="password" name="login_password_confirm" autocomplete="new-password" minlength="8" maxlength="72"'+
   (!c.account_id?' required':'')+' placeholder="Repita a senha"></label>'+
   '<small class="courier-credential-help">O telefone será o login. A senha fica protegida no Supabase Auth e não é exibida depois de salva.</small>':
   '<p class="muted small">Esta conta foi criada no sistema antigo. Remova e cadastre novamente para definir usuário e senha.</p>')+
  '<label>Disponibilidade<select name="active"><option value="true"'+(c.active!==false?' selected':'')+'>Ativo</option><option value="false"'+(c.active===false?' selected':'')+'>Desativado</option></select></label>'
)}
function eligibleOnlineDeliveryOrders(currentDelivery){
 const linked=new Set(deliveries.filter(d=>d.online_order_id&&d.id!==currentDelivery?.id).map(d=>d.online_order_id));
 return onlineOrders.filter(o=>o.delivery_method==='delivery'&&!['cancelled','fulfilled'].includes(o.status)&&!linked.has(o.id));
}
function onlineOrderDeliveryDefaults(order){
 return {
  online_order_id:order.id,customer_name:order.customer_name||'',
  customer_phone:order.customer_phone||'',address:order.delivery_address||'',
  items_text:Array.isArray(order.items)?order.items.map(i=>i.qty+'x '+i.name).join(', ').slice(0,3000):'',
  total:Number(order.total)||0
 };
}
function deliveryForm(d){
 d=d||{};
 return formShell('delivery',d.id,
   '<label>Vincular ao pedido online<select name="online_order_id">'+
     '<option value="">Entrega manual sem vínculo</option>'+
     eligibleOnlineDeliveryOrders(d).map(o=>'<option value="'+esc(o.id)+'"'+(d.online_order_id===o.id?' selected':'')+'>'+
       '#'+esc(o.id.slice(0,8))+' • '+esc(o.customer_name)+' • '+fmt(o.total)+'</option>').join('')+
   '</select></label>'+
   field('customer_name','Cliente','text',d.customer_name||'','required maxlength="120"')+
   field('customer_phone','Telefone do cliente','tel',d.customer_phone||'','maxlength="20"')+
   field('address','Endereço da entrega','text',d.address||'','required maxlength="500"')+
   field('total','Valor do pedido (R$)','number',d.total??0,'min="0" step="0.01"')+
   '<label>Itens ou observações<textarea name="items_text" maxlength="3000" placeholder="Ex.: 2x Combo e 1x Refrigerante">'+esc(d.items_text||'')+'</textarea></label>'+
   '<label>Oferecer para<select name="offered_courier_id"><option value="">Qualquer motoboy disponível</option>'+
    couriers.filter(c=>c.active).map(c=>'<option value="'+esc(c.id)+'"'+(c.id===d.offered_courier_id?' selected':'')+'>'+esc(c.name)+'</option>').join('')+
   '</select></label>'
 );
}
async function saveCategoryImage(name,file){
 if(!shop||shop.model!=='pdv'||!hasAccess()||!proAccess()||!menuSchemaReady)
  throw Error('Imagens de categorias disponíveis apenas no Premium com o cardápio configurado.');
 const normalized=String(name||'').trim();
 if(!normalized||normalized.length>65||categoryKey(normalized)==='todos'||
   (!categories.some(c=>categoryKey(c.name)===categoryKey(normalized))&&
    !products.some(p=>categoryKey(p.category)===categoryKey(normalized))))
  throw Error('Categoria inválida. Atualize a página e tente novamente.');
 if(!await ensureSession())throw Error('Sua sessão expirou. Entre novamente.');
 const image_path=await uploadImage(file);
 const found=categories.find(c=>categoryKey(c.name)===categoryKey(normalized));
 if(found?.id){
  await rest('shop_menu_categories',{method:'PATCH',
   query:{id:'eq.'+found.id,shop_id:'eq.'+shop.id},body:{image_path}});
 }else{
  const sort_order=Math.min(10000,categories.reduce((max,c)=>Math.max(max,Number(c.sort_order)||0),0)+10);
  await rest('shop_menu_categories',{method:'POST',body:{shop_id:shop.id,name:normalized,sort_order,image_path}});
 }
 await reloadData();
 renderPage();
 msg('Imagem da categoria "'+normalized+'" salva! Ela já pode aparecer no cardápio online.');
}
async function uploadImage(file){
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Selecione uma imagem JPG, PNG ou WebP de até 5 MB.');
  const ext={ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
  const name=shop.id+'/'+crypto.randomUUID()+'.'+ext;
  const res=await fetch(cfg.supabaseUrl+'/storage/v1/object/bipstart-images/'+name,{
    method:'POST',headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':file.type},body:file
  });
  if(!res.ok)throw Error('Não foi possível enviar a imagem. Verifique as permissões do Storage.');
  return name;
}
async function storeForm(form,table,body,id){if(id)await rest(table,{method:'PATCH',query:{id:'eq.'+id,shop_id:'eq.'+shop.id},body});else await rest(table,{method:'POST',body:{...body,shop_id:shop.id}})}
async function provisionCourierAccess(body){
 if(!await ensureSession())throw Error('Sua sessão expirou. Entre novamente.');
 const response=await fetch(cfg.supabaseUrl+'/functions/v1/bipstart-courier-credentials',{
  method:'POST',
  headers:{'Content-Type':'application/json',apikey:cfg.publishableKey,
   Authorization:'Bearer '+session.access_token},
  body:JSON.stringify(body),cache:'no-store'
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.message||'Não foi possível criar o login do motoboy.');
 return data;
}
async function handleSubmit(form,contractWindow=null){
  const v=formVal(form),id=form.dataset.id;
  switch(form.id){
    case 'loginForm':{
      const captcha=await captchaFor('login');
      let result;
      try{result=await api('/auth/v1/token?grant_type=password',{method:'POST',token:null,body:{email:v.email,password:v.password,...captcha}})}
      finally{resetCaptcha('login')}
      session={...result,expires_at:Date.now()/1000+Number(result.expires_in||3600)};
      saveSession();await loadShops();break;
    }
    case 'signupForm':{
      if(v.password!==v.confirm)throw Error('As senhas não coincidem. Confira e tente novamente.');
      const captcha=await captchaFor('signup');
      const callback=encodeURIComponent(location.origin+'/cliente');
      let response;
      try{response=await api('/auth/v1/signup?redirect_to='+callback,{method:'POST',token:null,body:{email:v.email,password:v.password,...captcha}})}
      finally{resetCaptcha('signup')}
      authTab(false);msg('Cadastro realizado! Confirme seu e-mail e depois entre para iniciar os 7 dias gratuitos.');
      break;
    }
    case 'resetPassForm':{
      if(v.password!==v.confirm)throw Error('As senhas não coincidem.');
      if(v.password.length<8)throw Error('Crie uma senha com pelo menos 8 caracteres.');
      await api('/auth/v1/user',{method:'PUT',body:{password:v.password}});
      msg('Senha atualizada com sucesso.');
      await loadShops();break;
    }
    case 'shopForm':{
      const normalized=v.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,35)||'loja';
      const slug=normalized+'-'+crypto.randomUUID().slice(0,7);
      const user=await requireVerifiedEmail();
      if(!['trial','whatsapp'].includes(v.signup_choice))throw Error('Escolha entre experimentar 7 dias ou contratar pelo WhatsApp.');
      if(!plans[v.requested_plan]||v.model!=='pdv')throw Error('Escolha um plano válido para PDV e cardápio.');
      const created=await rest('shops',{method:'POST',body:{owner_id:user.id,name:v.name.trim(),whatsapp:v.whatsapp?.replace(/\D/g,'')||null,slug,model:v.model,requested_plan:v.requested_plan,signup_choice:v.signup_choice}});
      shop=created?.[0];if(!shop)throw Error('A loja não pôde ser criada.');
      await openShop();
      if(v.signup_choice==='whatsapp'){
        const url=contactUrl('contratacao',user.email);
        // Aba aberta diretamente no envio do formulário, antes das chamadas assíncronas.
        if(contractWindow&&!contractWindow.closed){
          try{contractWindow.location.replace(url)}
          catch{window.location.assign(url)}
        }else window.location.assign(url);
        msg('Loja cadastrada! Envie a mensagem preparada no WhatsApp e aguarde as instruções de pagamento.');
      }else msg('Loja criada! Seus 7 dias gratuitos começaram.');
      break;
    }
    case 'categoryForm':{
      if(!proAccess())throw Error('Cardápio online exclusivo Premium.');
      if(!menuSchemaReady)throw Error('Categorias aguardando atualização do banco de dados.');
      if(shop.model!=='pdv')throw Error('Categorias disponíveis somente para lojas.');
      const name=String(v.name||'').trim();
      if(name.length<1||name.length>65||categoryKey(name)==='todos')throw Error('Informe uma categoria válida (até 65 caracteres). Todos é um filtro automático.');
      if(categories.some(c=>c.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw Error('Esta categoria já está cadastrada.');
      const order=categories.reduce((max,c)=>Math.max(max,Number(c.sort_order)||0),0)+10;
      await rest('shop_menu_categories',{method:'POST',body:{shop_id:shop.id,name,sort_order:order}});
      break;
    }
    case 'productForm':{
      if(tab==='cardapio'&&!proAccess())throw Error('Cardápio online exclusivo Premium.');
      if(tab==='cardapio'&&!menuSchemaReady)throw Error('Aguarde a atualização do banco de dados para editar o cardápio.');
      const file=pastedProductImage||form.querySelector('input[name=image]').files[0];
      const p=products.find(p=>p.id===id);
      const image_path=file?await uploadImage(file):p?.image_path||null;
      const isMenu=tab==='cardapio';
      const body={
       name:v.name.trim(),category:v.category.trim()||'Geral',price:Number(v.price),image_path,
       is_best_seller:v.is_best_seller==='true',
       online_enabled:proAccess()?v.online_enabled==='true':(p?.online_enabled===true),
       menu_price_enabled:proAccess()?v.online_enabled==='true':(p?.menu_price_enabled===true),
       menu_price:proAccess()?(v.online_enabled==='true'?Number(v.menu_price):p?.menu_price??null):(p?.menu_price??null),
       ...(isMenu?{description:String(v.description||'').trim()}:{
        cost:Number(v.cost),stock:Number(v.stock),min_stock:Number(v.min_stock)
       })
      };
      if(!body.name||!Number.isFinite(body.price)||body.price<0)throw Error('Confira o nome e o preço.');
      if(proAccess()&&!['true','false'].includes(v.online_enabled))
        throw Error('Selecione Sim ou Não em Venda online.');
      if(proAccess()&&body.online_enabled&&(!String(v.menu_price??'').trim()||!Number.isFinite(body.menu_price)||
        body.menu_price<0||body.menu_price>9999999999.99))
        throw Error('Para vender online, informe o valor do cardápio.');
      if(proAccess()&&body.menu_price!==null&&(!Number.isFinite(body.menu_price)||body.menu_price<0||body.menu_price>9999999999.99))
        throw Error('Preço do cardápio online inválido.');
      if(isMenu){
        if(![...categories.map(c=>c.name),'Geral',...products.map(p=>p.category)].includes(body.category))throw Error('Categoria inválida.');
        if(body.description.length>1000)throw Error('Descrição muito longa.');
      }else if(!Number.isInteger(body.stock)||body.stock<0||!Number.isFinite(body.cost)||body.cost<0||
        !Number.isInteger(body.min_stock)||body.min_stock<0||body.min_stock>999999999)
        throw Error('Confira custo, estoque atual e estoque mínimo.');
      await storeForm(form,'shop_products',body,id);
      break;
    }
    case 'saleForm':{
      if(!cart.length)throw Error('Adicione produtos ao carrinho.');
      if(v.payment_method==='dinheiro'){
        const total=cart.reduce((a,c)=>a+c.qty*c.price,0);
        if(!Number.isFinite(Number(v.received))||v.received===''||Number(v.received)+0.001<total)
          throw Error('Informe um valor recebido suficiente para finalizar a venda em dinheiro.');
      }
      const cardMethod=['credito','debito'].includes(v.payment_method);
      const feePercent=cardMethod?Number(v.card_fee_percent):0;
      if(!['dinheiro','pix','credito','debito'].includes(v.payment_method))throw Error('Forma de pagamento inválida.');
      if(cardMethod&&(v.card_fee_percent===''||!Number.isFinite(feePercent)||feePercent<0||feePercent>100))
        throw Error('Informe uma taxa da maquininha válida, entre 0% e 100%.');
      pdvPayment=v.payment_method;
      const sold=cart.map(c=>({id:c.id,name:c.name,qty:c.qty,price:c.price}));
      const data=await rpc('bipstart_complete_sale',{p_shop_id:shop.id,p_items:cart.map(c=>({product_id:c.id,quantity:c.qty})),
        p_payment_method:v.payment_method,p_card_fee_percent:feePercent});
      let recorded=[];
      try{
        if(data?.sale_id)recorded=await rest('shop_sale_items',{query:{
          select:'product_name,quantity,unit_price',shop_id:'eq.'+shop.id,sale_id:'eq.'+data.sale_id
        }});
      }catch(error){console.warn('Detalhes da venda não disponíveis para a nota:',error.message)}
      lastReceipt=receiptSnapshot(data,v.payment_method,v.received||'',sold,recorded);
      cart=[];
      if(receiptSettings().preview)showReceiptDialog(lastReceipt);
      msg('Venda registrada: '+fmt(data.total)+
        (cardMethod?' · Taxa: '+fmt(data.card_fee_amount||0)+' · Líquido: '+fmt(data.net_total):'')+
        '. Comprovante disponível para impressão.');
      break;
    }
    case 'courierForm':{
      if(!proAccess())throw Error('Motoboys disponíveis somente no Plano Premium vigente.');
      const phone=String(v.phone||'').replace(/\D/g,'');
      const normalized=/^55\d{10,11}$/.test(phone)?phone.slice(2):phone;
      const old=id?couriers.find(c=>c.id===id):null;
      if(!v.name?.trim()||!/^[1-9]\d{9,10}$/.test(normalized))
        throw Error('Informe nome e telefone brasileiro com DDD.');
      const password=String(v.login_password||'');
      if(!old||!old.account_id||old.login_managed){
        if(password!==String(v.login_password_confirm||''))throw Error('A confirmação da senha do motoboy não confere.');
        if((!old||!old.account_id)&&password.length<8)throw Error('Crie uma senha de pelo menos 8 caracteres para o motoboy.');
        if(password&&password.length<8)throw Error('A senha precisa ter pelo menos 8 caracteres.');
        await provisionCourierAccess({
          action:old?(old.account_id?'update':'provision'):'create',
          shop_id:shop.id,...(id?{courier_id:id}:{}),
          name:v.name.trim(),phone:normalized,active:v.active!=='false',
          ...(password?{password}:{})
        });
        msg('Acesso do motoboy salvo. Login: '+normalized+'.');
      }else{
        await storeForm(form,'shop_couriers',
          {name:v.name.trim(),phone:normalized,active:v.active!=='false'},id);
      }
      break;
    }
    case 'deliveryForm':{
      if(!proAccess())throw Error('Entregas disponíveis somente no Plano Premium vigente.');
      const total=Number(v.total||0);
      if(!v.customer_name?.trim()||!v.address?.trim()||!Number.isFinite(total)||total<0)
        throw Error('Informe cliente, endereço e valor válido.');
      if(v.online_order_id&&!eligibleOnlineDeliveryOrders(deliveries.find(d=>d.id===id)).some(o=>o.id===v.online_order_id))
        throw Error('Pedido online indisponível para vincular. Atualize a lista.');
      const payload={
        online_order_id:v.online_order_id||null,
        customer_name:v.customer_name.trim(),customer_phone:String(v.customer_phone||'').trim(),
        address:v.address.trim(),items_text:String(v.items_text||'').trim(),total,
        offered_courier_id:v.offered_courier_id||null,status:'pendente',courier_id:null
      };
      if(id){
        const current=deliveries.find(d=>d.id===id);
        if(!current||current.status!=='pendente')throw Error('Somente entregas pendentes podem ser editadas.');
        await rest('shop_deliveries',{method:'PATCH',query:{id:'eq.'+id,shop_id:'eq.'+shop.id,status:'eq.pendente'},body:payload});
      }else await storeForm(form,'shop_deliveries',payload,null);
      break;
    }
    case 'cardapioLogoForm':{
      if(tab!=='cardapio'||shop?.model!=='pdv'||!canCustomize())throw Error('Logo personalizada exclusiva do plano Premium.');
      const file=form.querySelector('input[name=logo]')?.files?.[0];
      const removeLogo=form.querySelector('input[name=remove_logo]')?.checked===true;
      if(file&&removeLogo)throw Error('Escolha entre enviar uma logo ou usar a logo padrão.');
      if(!file&&!removeLogo)throw Error('Selecione uma imagem ou escolha usar a logo padrão BipStart.');
      const logo_path=file?await uploadImage(file):null;
      await rest('shops',{method:'PATCH',query:{id:'eq.'+shop.id},body:{logo_path}});
      shop={...shop,logo_path};
      break;
    }
    case 'settingsForm':{
      const whatsapp=(v.whatsapp||'').replace(/\D/g,'');
      if(whatsapp&&!/^\d{10,13}$/.test(whatsapp))throw Error('Informe um telefone WhatsApp com DDD.');
      if(!v.name?.trim())throw Error('Informe o nome do estabelecimento.');
      const body={name:v.name.trim(),whatsapp:whatsapp||null};
      if(canCustomize()){
        if(!/^#[0-9a-f]{6}$/i.test(String(v.brand_color||'')))throw Error('Selecione uma cor válida.');
        body.brand_color=v.brand_color;
        // Sincroniza o campo legado para não haver cores divergentes entre vitrines.
        body.menu_theme_color=v.brand_color;
      }
      let receiptPreference=null;
      if(shop.model==='pdv'){
        if(!receiptPaperOptions.includes(String(v.paper||''))||String(v.footer||'').length>120)
          throw Error('Escolha um tamanho de papel válido e um rodapé com até 120 caracteres.');
        receiptPreference={paper:v.paper,preview:form.elements.namedItem('preview')?.checked===true,footer:String(v.footer||'')};
        if(proAccess()){
          const show_logo_subtitle=v.show_logo_subtitle==='true';
          const logo_subtitle=String(v.logo_subtitle||'').trim();
          if(!['true','false'].includes(v.show_logo_subtitle)||logo_subtitle.length>100||(show_logo_subtitle&&!logo_subtitle))
            throw Error('Confira a frase abaixo do nome da loja.');
          Object.assign(body,{menu_layout_style:'round',show_logo_subtitle,logo_subtitle});
        }
        const enteredEstablishment=String(v.establishment_type||'').trim();
        if(!enteredEstablishment||enteredEstablishment.length>65)throw Error('Informe um tipo de estabelecimento com até 65 caracteres.');
        const savedOption=menuEstablishmentTypes.find(([key,label])=>key===enteredEstablishment||label.toLocaleLowerCase('pt-BR')===enteredEstablishment.toLocaleLowerCase('pt-BR'));
        body.establishment_type=savedOption?.[0]||enteredEstablishment;
        const methods=[...form.querySelectorAll('input[name=payment_methods]:checked')].map(input=>input.value);
        const fee=Number(v.delivery_fee||0);
        if(!Number.isFinite(fee)||fee<0||fee>9999.99)throw Error('Informe uma taxa de entrega válida.');
        if(String(v.opening_hours||'').length>160||String(v.location_text||'').length>240)throw Error('Confira o horário e o endereço.');
        Object.assign(body,{opening_hours:String(v.opening_hours||'').trim(),location_text:String(v.location_text||'').trim(),
         payment_methods:methods,delivery_fee:fee});
        const file=form.querySelector('input[name=logo]')?.files?.[0];
        const removeLogo=form.querySelector('input[name=remove_logo]')?.checked===true;
        if(file&&removeLogo)throw Error('Escolha entre enviar uma logo ou remover a atual.');
        if((file||removeLogo)&&!canCustomize())throw Error('Logo próprio disponível apenas no Premium.');
        if(file)body.logo_path=await uploadImage(file);
        else if(removeLogo)body.logo_path=null;
      }
      await rest('shops',{method:'PATCH',query:{id:'eq.'+shop.id},body});
      shop={...shop,...body};
      $('sideShopName').textContent=shop.name;
      if(receiptPreference){
        try{localStorage.setItem(receiptSettingsKey(),JSON.stringify(receiptPreference));}
        catch{
          await reloadData();renderPage();
          msg('Dados da loja salvos, mas a preferência de impressão não pôde ser salva neste navegador.',true);
          return;
        }
      }
      break;
    }
    case 'customForm':{
      if(!canCustomize())throw Error('Mudanças e suporte estão disponíveis apenas no Premium vigente.');
      await rest('shop_customization_requests',{method:'POST',body:{shop_id:shop.id,details:v.details.trim()}});
      msg('Solicitação recebida para acompanhamento.');break;
    }
  }
  if(!['loginForm','signupForm','shopForm','resetPassForm'].includes(form.id)){showForm=null;pastedProductImage=null;await reloadData();renderPage();if(form.id!=='saleForm'&&form.id!=='courierForm')msg('Dados salvos com sucesso.');}
}
document.addEventListener('submit',async e=>{
 const form=e.target;if(!form.matches('form'))return;
 e.preventDefault();
 const btn=form.querySelector('button[type=submit],button.button');
 if(btn?.disabled)return;
 let contractWindow=null;
 if(form.id==='shopForm'&&form.elements.namedItem('signup_choice')?.value==='whatsapp'){
   try{
     contractWindow=window.open('about:blank','_blank');
     if(contractWindow){
       contractWindow.opener=null;
       contractWindow.document.title='Abrindo WhatsApp • BipStart';
       contractWindow.document.body.textContent='Preparando sua solicitação de contratação...';
     }
   }catch{contractWindow=null}
 }
 if(btn)btn.disabled=true;
 try{await handleSubmit(form,contractWindow)}
 catch(err){
   if(contractWindow&&!contractWindow.closed)contractWindow.close();
   msg(err.message||'Erro ao salvar',true);
 }finally{if(btn?.isConnected)btn.disabled=false}
});
document.addEventListener('paste',e=>{
  const categoryTarget=e.target.closest?.('[data-category-image-paste]');
  if(categoryTarget){
   const item=Array.from(e.clipboardData?.items||[]).find(item=>item.kind==='file'&&item.type.startsWith('image/'));
   if(!item)return msg('Copie uma imagem e pressione Ctrl+V neste botão.',true);
   e.preventDefault();
   const file=item.getAsFile();
   if(!file)return msg('Não foi possível ler a imagem copiada.',true);
   if(categoryTarget.disabled)return;
   categoryTarget.disabled=true;
   void saveCategoryImage(categoryTarget.dataset.categoryImagePaste,file)
    .catch(error=>msg(error.message||'Não foi possível salvar a imagem.',true))
    .finally(()=>{if(categoryTarget.isConnected)categoryTarget.disabled=false});
   return;
  }
  const area=document.querySelector('#productForm [data-image-paste]');
  if(!area||(!area.contains(e.target)&&e.target!==area))return;
  const item=Array.from(e.clipboardData?.items||[]).find(item=>item.kind==='file'&&item.type.startsWith('image/'));
  if(!item)return msg('Copie uma imagem antes de colar.',true);
  e.preventDefault();
  const file=item.getAsFile();
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)return msg('Use uma imagem JPG, PNG ou WebP de até 5 MB.',true);
  pastedProductImage=file;
  const preview=area.querySelector('[data-image-preview]');
  const url=URL.createObjectURL(file);
  preview.replaceChildren();
  const img=document.createElement('img');img.src=url;img.alt='Imagem colada';img.style.cssText='max-width:160px;max-height:120px;border-radius:8px;display:block';img.onload=()=>URL.revokeObjectURL(url);
  preview.append(img,document.createTextNode(' Imagem pronta para salvar'));
  msg('Imagem colada! Agora salve o produto.');
});
document.addEventListener('input',e=>{
 if(e.target.id==='pdvSearch'){
  pdvQuery=e.target.value;
  const grid=$('pdvProducts');if(grid)grid.innerHTML=pdvProductCards();
 }else if(e.target.id==='pdvReceived'||e.target.id==='pdvFeePercent'){
   if(e.target.id==='pdvFeePercent')pdvCardFeePercent=e.target.value;
   updatePdvEstimates();
 }
});
document.addEventListener('change',e=>{
 if(e.target.id==='pdvCategory'){pdvCategory=e.target.value;const grid=$('pdvProducts');if(grid)grid.innerHTML=pdvProductCards();}
});
document.addEventListener('change',e=>{
 const categoryFile=e.target.closest?.('[data-category-image-file]');
 if(categoryFile){
  const file=categoryFile.files?.[0];
  if(file){
   categoryFile.disabled=true;
   void saveCategoryImage(categoryFile.dataset.categoryImageFile,file)
    .catch(error=>msg(error.message||'Não foi possível salvar a imagem.',true))
    .finally(()=>{if(categoryFile.isConnected)categoryFile.disabled=false});
  }
  return;
 }
 if(e.target.matches('#deliveryForm select[name="online_order_id"]')){
   const order=onlineOrders.find(o=>o.id===e.target.value);
   if(order){
     const form=e.target.closest('form'),values=onlineOrderDeliveryDefaults(order);
     for(const key of ['customer_name','customer_phone','address','items_text','total']){
       const input=form?.elements.namedItem(key);
       if(input)input.value=values[key];
     }
   }
 }
 if(e.target.matches('#productForm select[name="online_enabled"]')){
  const form=e.target.closest('form'),online=e.target.value==='true';
  const group=form.querySelector('.online-sale-price'),input=form.elements.namedItem('menu_price');
  group.classList.toggle('hidden',!online);
  input.disabled=!online;
  input.required=online;
  if(online)input.focus();
 }
 if(e.target.matches('#productForm input[name=image]')){
  pastedProductImage=null;
  const preview=document.querySelector('[data-image-preview]');
  if(preview)preview.replaceChildren();
 }
});
document.addEventListener('change',async event=>{
 if(event.target.id!=='salesReferenceDate'||tab!=='vendas')return;
 salesDay=event.target.value;
 await loadSalesReport();
});
document.addEventListener('click',async e=>{
  const paymentButton=e.target.closest('[data-payment-option]');
  if(paymentButton){
    if(tab==='caixa'&&selectPdvPayment(paymentButton.dataset.paymentOption))renderPage();
    return;
  }
  const cardKindButton=e.target.closest('[data-card-method]');
  if(cardKindButton){
    if(tab==='caixa'&&['credito','debito'].includes(cardKindButton.dataset.cardMethod)){
      selectPdvPayment(cardKindButton.dataset.cardMethod);
      renderPage();
    }
    return;
  }
  const salesRow=e.target.closest('tr[data-sales-open]');
  if(salesRow&&tab==='vendas'){
    const button=salesRow.querySelector('.sales-record-toggle');
    const detail=button&&document.getElementById(button.getAttribute('aria-controls'));
    if(!button||!detail)return;
    const expanded=button.getAttribute('aria-expanded')==='true';
    document.querySelectorAll('#workspace .sales-record-toggle[aria-expanded="true"]').forEach(other=>{
      other.setAttribute('aria-expanded','false');
      const opened=document.getElementById(other.getAttribute('aria-controls'));
      if(opened)opened.hidden=true;
    });
    if(!expanded){detail.hidden=false;button.setAttribute('aria-expanded','true');}
    return;
  }
  const feeSaveButton=e.target.closest('[data-sales-save-fee]');
  if(feeSaveButton){
    if(tab!=='vendas'||!shop||salesLoading)return;
    const saleId=feeSaveButton.dataset.salesSaveFee;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saleId||''))return;
    const sale=salesReport?.sales?.find(s=>s.id===saleId);
    if(!sale||cardFeeInfo(sale).known||!['credito','debito'].includes(sale.payment_method))return;
    const raw=feeSaveButton.closest('.sales-fee-editor')?.querySelector('input')?.value?.trim()||'';
    const percent=Number(raw);
    if(!raw||!Number.isFinite(percent)||percent<0||percent>100||
       Math.abs(percent*100-Math.round(percent*100))>1e-7)
      return msg('Informe a taxa real entre 0% e 100%, com até duas casas decimais.',true);
    if(!window.confirm('Registrar '+percent.toLocaleString('pt-BR')+'% de taxa nesta venda antiga e recalcular o lucro?'))return;
    feeSaveButton.disabled=true;
    try{
      await rpc('bipstart_set_missing_card_fee',{p_shop_id:shop.id,p_sale_id:saleId,p_percent:percent});
      await loadSalesReport();
      msg('Taxa registrada. O lucro das vendas foi recalculado.');
    }catch(error){msg(error.message||'Não foi possível registrar a taxa.',true)}
    finally{if(feeSaveButton.isConnected)feeSaveButton.disabled=false}
    return;
  }
  const exportButton=e.target.closest('[data-sales-export]');
  if(exportButton){
    if(tab==='vendas')printSalesReport(exportButton.dataset.salesExport);
    return;
  }
  if(e.target.closest('[data-receipt-close]')){closeReceiptDialog();return;}
  if(e.target.closest('[data-receipt-print]')){printReceipt(lastReceipt);return;}
  if(e.target.closest('[data-receipt-download]')){downloadReceipt(lastReceipt);return;}
  if(e.target.closest('[data-receipt-last]')){
    if(lastReceipt?.shopId===shop?.id)showReceiptDialog(lastReceipt);
    return;
  }
  if(e.target.id==='receiptModal'){closeReceiptDialog();return;}
  const trialUpgradeButton=e.target.closest('[data-plan-trial-request]');
  if(trialUpgradeButton){
    if(!shop||ent?.plan_code!=='basic'||!trialValid()||
      trialUpgradeButton.dataset.planTrialRequest!=='pro')return;
    const end=new Date(ent.trial_until).toLocaleString('pt-BR');
    if(!window.confirm('Solicitar teste Premium até '+end+
      '? Os dias já usados no Básico continuam contando. Os 7 dias NÃO reiniciam, e a liberação depende de aprovação da BipStart.'))return;
    trialUpgradeButton.disabled=true;
    try{
      const ok=await rpc('bipstart_request_premium_trial',{p_shop_id:shop.id});
      if(ok!==true)throw Error('O pedido de teste não foi confirmado.');
      shop.requested_plan='pro';
      shop.upgrade_request_type='trial';
      renderPage();
      msg('Teste Premium solicitado. A data de suspensão permanece em '+end+'. Aguarde a liberação no Admin.');
    }catch(error){trialUpgradeButton.disabled=false;msg(error.message,true)}
    return;
  }
  const planButton=e.target.closest('[data-plan-request]');
  if(planButton){
    if(!shop||!hasAccess()||ent?.plan_code!=='basic'||planButton.dataset.planRequest!=='pro')return;
    const target='pro';
    if(!window.confirm('Solicitar mudança desta mesma loja para o plano '+plans[target]+
       '? Todos os produtos e configurações serão mantidos. O plano novo só será liberado após a confirmação da BipStart.'))return;
    planButton.disabled=true;
    try{
      const success=await rpc('bipstart_request_plan_change',{p_shop_id:shop.id,p_plan:target});
      if(success!==true)throw Error('Não foi possível registrar a solicitação de plano.');
      shop.requested_plan=target;
      shop.upgrade_request_type='paid';
      renderPage();
      msg('Solicitação do plano '+plans[target]+' registrada. Entre em contato para concluir a ativação.');
    }catch(error){planButton.disabled=false;msg(error.message,true);}
    return;
  }
  const dispatch=e.target.closest('[data-online-delivery]');
  if(dispatch){
    if(!proAccess())return msg('Entregas com motoboys são exclusivas do Premium.',true);
    const order=onlineOrders.find(o=>o.id===dispatch.dataset.onlineDelivery);
    if(!order||order.delivery_method!=='delivery'||['cancelled','fulfilled'].includes(order.status)||
       deliveries.some(d=>d.online_order_id===order.id))
      return msg('Este pedido não está disponível para criar outra entrega.',true);
    showForm={kind:'delivery',value:onlineOrderDeliveryDefaults(order)};
    tab='entregas';renderPage();
    document.getElementById('deliveryForm')?.scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  const optout=e.target.closest('[data-order-optout]');
  if(optout){
    const id=optout.dataset.orderOptout,order=onlineOrders.find(item=>item.id===id);
    if(!order||!shop||!hasAccess()||!order.whatsapp_updates_opt_in)return;
    if(!window.confirm('Desativar os avisos de WhatsApp para este pedido?'))return;
    optout.disabled=true;
    try{
      await rest('shop_online_orders',{method:'PATCH',query:{id:'eq.'+id,shop_id:'eq.'+shop.id},
       body:{whatsapp_updates_opt_in:false}});
      order.whatsapp_updates_opt_in=false;
      orderNotificationLinks.delete(id);
      renderPage();msg('Avisos de WhatsApp desativados para este pedido.');
    }catch(error){optout.disabled=false;msg(error.message,true);}
    return;
  }
  const advanceOrder=e.target.closest('[data-order-advance]');
  const cancelOrder=e.target.closest('[data-order-cancel]');
  const finishOrder=e.target.closest('[data-order-finish]');
  const advancePayment=e.target.closest('[data-payment-advance]');
  const cancelPayment=e.target.closest('[data-payment-cancel]');
  const clicked=advanceOrder||cancelOrder||finishOrder||advancePayment||cancelPayment;
  if(clicked){
    const id=clicked.dataset.orderAdvance||clicked.dataset.orderCancel||clicked.dataset.orderFinish||clicked.dataset.paymentAdvance||clicked.dataset.paymentCancel;
    const order=onlineOrders.find(o=>o.id===id);
    if(!order||!shop||!hasAccess())return;
    const payment=!!(advancePayment||cancelPayment);
    const field=payment?'payment_status':'status';
    const previous=order[field];
    const cancelled=!!(cancelOrder||cancelPayment);
    const step=payment?nextOnlinePaymentStep(previous):nextOnlineOrderStep(previous,order.delivery_method);
    if(!cancelled&&!finishOrder&&!step)return;
    if(cancelled&&(previous==='cancelled'||(!payment&&previous==='fulfilled')))return;
    const next=cancelled?'cancelled':finishOrder?'fulfilled':step.next;
    if(cancelled){
      const detail=payment?'Cancelar o registro deste pagamento? Isso não realiza estorno ou reembolso.':'Cancelar este pedido? Esta ação encerra o andamento do pedido.';
      if(!window.confirm(detail))return;
    }else if(finishOrder){
      const hasCourier=typeof proAccess==='function'&&proAccess()&&deliveries.some(d=>d.online_order_id===id&&d.status!=='entregue');
      const detail='Confirma que o pedido foi concluído e pode ser marcado como Finalizado?'+
        ' Isso atualizará o acompanhamento do cliente, mas não confirmará o pagamento.'+
        (hasCourier?' A tarefa do motoboy continuará separada e não será marcada como entregue.':'');
      if(!window.confirm(detail))return;
    }else if(payment&&next==='paid'){
      if(!window.confirm('Confirma que o pagamento foi realmente recebido pela loja?'))return;
    }
    const key=field+':'+id;
    if(pendingOrderUpdates.has(key))return;
    pendingOrderUpdates.add(key);
    const controls=clicked.closest('.online-status-controls');
    for(const button of controls?.querySelectorAll('button')||[])button.disabled=true;
    try{
      // Filtra o valor anterior para não sobrescrever alterações feitas em outra sessão.
      if(!await ensureSession())throw Error('Sua sessão expirou. Entre novamente.');
      const response=await fetch('/api/online-order-update',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
        body:JSON.stringify({orderId:id,shopId:shop.id,field,action:cancelled?'cancel':finishOrder?'finish':'advance',expected:previous})
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result?.updated){
        if(response.status===409){await reloadData();renderPage();}
        throw Error(result?.error||'Não foi possível atualizar o pedido.');
      }
      order[field]=result.status;
      orderNotificationLinks.delete(id);
      if(result.notification==='manual'&&result.manualUrl)orderNotificationLinks.set(id,result.manualUrl);
      renderPage();
      const info=result.notification==='accepted'?' Aviso solicitado ao WhatsApp.':
        result.notification==='manual'?' Clique em "Enviar atualização ao cliente no WhatsApp" para concluir o envio.':
        result.notification==='opt_out'?' Cliente não autorizou notificações automáticas.':
        ' Aviso não enviado: verifique o número do cliente.';
      msg((payment?'Status do pagamento atualizado.':'Situação do pedido atualizada.')+info);
    }catch(error){
      for(const button of controls?.querySelectorAll('button')||[])button.disabled=false;
      msg(error.message,true);
    }finally{pendingOrderUpdates.delete(key);}
    return;
  }
  const salePeriod=e.target.closest('[data-sales-period]');
  if(salePeriod&&tab==='vendas'){
    if(!['day','week','month'].includes(salePeriod.dataset.salesPeriod))return;
    salesPeriod=salePeriod.dataset.salesPeriod;
    await loadSalesReport();return;
  }
  if(e.target.closest('[data-sales-refresh]')&&tab==='vendas'){
    await loadSalesReport();return;
  }

  if(e.target.closest('[data-orders-refresh]')){
    try{await reloadData();renderPage();msg('Pedidos atualizados.');}catch(error){msg(error.message,true);}
    return;
  }
  if(e.target.closest('#sideToggle')){toggleSideMenu();return}
  if(e.target.closest('#sideBackdrop')){closeSideMenu();return}
  if(e.target.closest('#sideLogout')){closeSideMenu();$('logout').click();return}
  if(e.target.closest('#pdvStockToggle')){
    pdvInStockOnly=!pdvInStockOnly;renderPage();return;
  }
  const less=e.target.closest('[data-qty-less]');
  if(less){
    const found=cart.find(c=>c.id===less.dataset.qtyLess);
    if(found){found.qty--;if(found.qty<=0)cart=cart.filter(c=>c.id!==found.id);renderPage();}
    return;
  }
  const share=e.target.closest('[data-share-shop]');
  const copy=e.target.closest('[data-copy-shop]');
  if(share||copy){
    if(!shop||shop.model!=='pdv'||!hasAccess()||!proAccess())return;
    const url=publicShopUrl();
    if(share&&typeof navigator.share==='function'){
      try{
        await navigator.share({title:shareTitle(),text:shareTitle(),url});
        return;
      }catch(error){
        if(error?.name==='AbortError')return;
      }
    }
    try{
      if(!navigator.clipboard?.writeText)throw Error('Área de transferência indisponível');
      await navigator.clipboard.writeText(url);
      msg('Link do cardápio copiado! Compartilhe onde quiser.');
    }catch{
      window.prompt('Copie o link do cardápio:',url);
    }
    return;
  }
  const deleteCourier=e.target.closest('[data-delete-courier]');
  if(deleteCourier){
    if(tab!=='motoboys'||!proAccess()||!shop)return;
    const courier=couriers.find(c=>c.id===deleteCourier.dataset.deleteCourier);
    if(!courier)return;
    if(!window.confirm('Remover o motoboy '+courier.name+'? O acesso será encerrado e o histórico das entregas será preservado.'))return;
    deleteCourier.disabled=true;
    try{
      const current=await ensureSession();
      if(!current)throw Error('Faça login novamente.');
      const response=await fetch(cfg.supabaseUrl+'/functions/v1/bipstart-courier-credentials',{
        method:'POST',
        headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({action:'remove',shop_id:shop.id,courier_id:courier.id})
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw Error(data?.message||'Não foi possível remover o motoboy.');
      if(showForm?.kind==='courier'&&showForm.value?.id===courier.id)showForm=null;
      await reloadData();
      renderPage();
      msg('Motoboy removido. O histórico das entregas foi preservado.');
    }catch(error){msg(error.message||'Falha ao remover motoboy.',true)}
    finally{if(deleteCourier.isConnected)deleteCourier.disabled=false}
    return;
  }
  const courierShare=e.target.closest('[data-share-courier]');
  const invite=e.target.closest('[data-copy-invite]');
  if(courierShare||invite){
    if(tab!=='motoboys'||!proAccess())return;
    const link=courierShare?.dataset.shareCourier||invite?.dataset.copyInvite;
    if(!link||!(link===location.origin+'/motoboy'||link.startsWith(location.origin+'/motoboy?convite=')))return;
    if(courierShare&&typeof navigator.share==='function'){
      try{
        await navigator.share({title:'Acesso motoboy • '+(courierShare.dataset.courierName||'BipStart'),text:'Seu acesso às entregas da loja:',url:link});
        return;
      }catch(error){if(error?.name==='AbortError')return;}
    }
    try{
      if(!navigator.clipboard?.writeText)throw Error('Cópia indisponível');
      await navigator.clipboard.writeText(link);
      msg('Link de acesso do motoboy copiado. Compartilhe com o entregador.');
    }catch{window.prompt('Copie o link de acesso do motoboy:',link)}
    return;
  }
  const categoryPaste=e.target.closest('[data-category-image-paste]');
  if(categoryPaste){
   categoryPaste.focus();
   msg('Imagem copiada? Pressione Ctrl+V para salvar nesta categoria.');
   return;
  }
  const pasteArea=e.target.closest('[data-image-paste]');if(pasteArea){pasteArea.focus();return}
  const stockSummary=e.target.closest('[data-stock-summary]');
  if(stockSummary&&tab==='produtos'){
    const choice=stockSummary.dataset.stockSummary;
    if(!['all','low','out','restock'].includes(choice))return;
    selectedStockPanel=selectedStockPanel===choice?'':choice;
    renderPage();
    document.querySelector('[data-stock-summary="'+selectedStockPanel+'"]')?.focus({preventScroll:true});
    return;
  }
  const category=e.target.closest('[data-category-filter]');
  if(category){
    if(tab!=='produtos')return;
    selectedCategoryFilter=category.dataset.categoryFilter||'all';
    renderPage();
    return;
  }
  const nav=e.target.closest('[data-nav]');if(nav){
    if(['cardapio','pedidos','motoboys'].includes(nav.dataset.nav)&&!proAccess())return;
    if(!pages().some(([key])=>key===nav.dataset.nav))return;
    tab=nav.dataset.nav;if(tab==='produtos')selectedStockPanel='';showForm=null;pastedProductImage=null;closeSideMenu();renderPage();
    if(tab==='vendas')await loadSalesReport();
    return
  }
  const add=e.target.closest('[data-new]');if(add){if(tab==='cardapio'&&!proAccess())return msg('Cardápio online exclusivo Premium.',true);if(tab==='produtos'&&add.dataset.new==='product')selectedStockPanel='all';showForm={kind:add.dataset.new,value:null};pastedProductImage=null;renderPage();if(add.dataset.new==='product')document.getElementById('productForm')?.scrollIntoView({behavior:'smooth',block:'start'});return}
  const edit=e.target.closest('[data-edit]');if(edit){
    const lists={product:products,service:services,appointment:appointments,courier:couriers,delivery:deliveries};
    showForm={kind:edit.dataset.edit,value:(lists[edit.dataset.edit]||[]).find(v=>v.id===edit.dataset.id)||null};pastedProductImage=null;renderPage();if(edit.dataset.edit==='product')document.getElementById('productForm')?.scrollIntoView({behavior:'smooth',block:'start'});return
  }
  if(e.target.closest('[data-cancel]')){showForm=null;renderPage();return}
  const c=e.target.closest('[data-cart]');if(c){const p=products.find(p=>p.id===c.dataset.cart);if(!p)return;const old=cart.find(x=>x.id===p.id);if((old?.qty||0)>=p.stock)return msg('Estoque insuficiente',true);if(old)old.qty++;else cart.push({id:p.id,name:p.name,qty:1,price:Number(p.price)});renderPage();return}
  const rm=e.target.closest('[data-remove]');if(rm){cart=cart.filter(x=>x.id!==rm.dataset.remove);renderPage()}
});
// Validação instantânea antes de enviar o cadastro para o Supabase.
$('signupForm').addEventListener('input',()=>{
  const form=$('signupForm');
  const password=form.elements.namedItem('password');
  const confirm=form.elements.namedItem('confirm');
  const info=$('signupPasswordMatch');
  if(!confirm.value){
    confirm.setCustomValidity('');
    info.textContent='';
    return;
  }
  const matches=confirm.value===password.value;
  confirm.setCustomValidity(matches?'':'As senhas não coincidem.');
  info.textContent=matches?'✓ As senhas coincidem.':'As senhas não coincidem.';
  info.style.color=matches?'var(--ok)':'var(--danger)';
});
$('showLogin').onclick=()=>authTab(false);
$('showSignup').onclick=()=>authTab(true);
$('logout').onclick=()=>{closeSideMenu();closeReceiptDialog();lastReceipt=null;session=null;shop=null;cart=[];saveSession();showAuth();msg('Você saiu com segurança.')};
$('refreshAccess').onclick=async()=>{try{await openShop();msg(hasAccess()?'Seu acesso está liberado!':'Ainda aguardando liberação. Confira o WhatsApp.')}catch(e){msg(e.message,true)}};
window.addEventListener('focus',()=>{
 if(shop&&ent&&!hasAccess()){hiding('workspace',false);hiding('accessGate',true);renderAccessGate();}
 if(shop&&session)void refreshActivatedPlan();
});
setInterval(()=>{if(shop&&ent&&!hasAccess()){hiding('workspace',false);hiding('accessGate',true);renderAccessGate()}},60000);
setInterval(()=>{void refreshOnlineOrdersIfVisible()},15000);
setInterval(()=>{if(document.visibilityState==='visible')void refreshActivatedPlan()},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshOnlineOrdersIfVisible()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('receiptModal').classList.contains('hidden'))closeReceiptDialog();else if($('sidebar').classList.contains('open'))closeSideMenu();}});
$('forgotPassword').onclick=async()=>{
  const email=$('loginForm').querySelector('input[name=email]').value.trim();
  if(!email)return msg('Informe seu e-mail para receber a recuperação.',true);
  let attempted=false;
  try{
    const captcha=await captchaFor('login');
    attempted=true;
    await api('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+'/cliente'),{method:'POST',token:null,body:{email,...captcha}});
    msg('Confira seu e-mail para recuperar a senha.');
  }catch(e){msg(e.message,true)}
  finally{if(attempted)resetCaptcha('login')}
};
begin().catch(e=>{status(e.message||'Falha ao conectar ao Supabase.');showAuth()});
