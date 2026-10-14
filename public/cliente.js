'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let cfg=null,session=null,shop=null,ent=null,products=[],categories=[],services=[],appointments=[],sales=[],requests=[],couriers=[],deliveries=[];
let tab='resumo',cart=[],showForm=null,toastTimer,pastedProductImage=null,menuSchemaReady=false;
let pdvQuery='',pdvCategory='',pdvInStockOnly=true,pdvPayment='pix';
const captchaTokens={login:'',signup:''},captchaWidgets={login:null,signup:null},captchaIssuedAt={login:0,signup:0},captchaWaiters={login:null,signup:null};
const storageKey='bipstart_customer_session';
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
function hideAll(){['auth','setup','createShop','modeChooser','workspace','resetPass','accessGate'].forEach(id=>hiding(id,false));}
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
  const rows=await rest('shops',{query:{select:'id,name,slug,model,requested_plan,signup_choice,brand_color,whatsapp,opening_hours,location_text,payment_methods,delivery_fee,logo_path,created_at',order:'created_at.desc',limit:'20'}});
  if(!rows?.length){hideAll();hiding('createShop',true);hiding('logout',true);return}
  shop=rows[0];await openShop();
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
function contactUrl(reason='contratacao'){
  const chosen=plans[shop?.requested_plan]||'Básico';
  const price=planPrices[shop?.requested_plan]||planPrices.basic;
  const lines=[
    'Olá! Gostaria de '+(reason==='renovacao'?'renovar':'contratar')+' meu plano BipStart.',
    'Loja: '+String(shop?.name||''),
    'Plano de interesse: '+chosen+' — '+price,
    'Identificador da loja: '+String(shop?.id||''),
    'Por favor, envie as instruções de pagamento pelo WhatsApp.'
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
    'Envie sua solicitação pelo WhatsApp. Após confirmar o pagamento, a equipe BipStart liberará seu acesso manualmente.';
  $('gateShop').textContent=shop.name;
  $('gatePlan').textContent=(plans[shop.requested_plan]||'Básico')+' — '+(planPrices[shop.requested_plan]||planPrices.basic);
  $('gateWhatsapp').href=contactUrl(expiredPaid?'renovacao':'contratacao');
  $('gateStatus').textContent=waiting?'Aguardando confirmação':'Acesso temporariamente bloqueado';
}
async function openShop(){
  hideAll();hiding('logout',true);
  const [access]=await rest('shop_entitlements',{query:{select:'plan_code,status,trial_until,active_until',shop_id:'eq.'+shop.id,limit:'1'}});
  ent=access||null;
  if(!hasAccess()){hiding('accessGate',true);renderAccessGate();return}
  await reloadData();renderNav();hiding('modeChooser',true);
  $('modeChooserTitle').textContent='Como deseja começar na '+shop.name+'?';
  // Link de gestão do cardápio público: entrada direta no editor após verificar acesso.
  if(new URLSearchParams(location.search).get('editar')==='cardapio'){
    tab='cardapio';showForm=null;pastedProductImage=null;
    hiding('modeChooser',false);hiding('workspace',true);renderPage();
  }
}
async function reloadData(){
  products=[];categories=[];services=[];appointments=[];sales=[];requests=[];couriers=[];deliveries=[];
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
  requests=await get('shop_customization_requests');
  if(proAccess()){
    couriers=await rest('shop_couriers',{query:{select:'*',shop_id:'eq.'+shop.id}});
    deliveries=await get('shop_deliveries');
  }
}
function pages(){
  const a=[['resumo','Visão geral']];
  a.push(['caixa','Frente de caixa'],['produtos','Produtos e estoque'],['cardapio','Meu cardápio'],['vendas','Histórico de vendas']);
  a.push(['pedidos','Pedidos online']);
  if(proAccess())a.push(['motoboys','Motoboys'],['entregas','Entregas']);
  if(canCustomize())a.push(['personalizar','Mudanças e suporte']);
  a.push(['configuracoes','Configurações']);
  return a;
}
function operationalMenuItems(){
  return [
    ['caixa','PDV','🛒'],
    ['produtos','Produtos','📦'],
    ['pedidos','Pedidos online','🚚'],
    ['motoboys','Motoboys','🛵'],
    ['vendas','Vendas','💰']
  ];
}
function renderNav(){
  const current=tab==='cardapio'||tab==='entregas'?'pedidos':tab;
  $('nav').innerHTML='<nav aria-label="Navegação operacional">'+operationalMenuItems().map(([id,name,icon])=>{
    const premium=id==='motoboys'&&!proAccess();
    return '<button type="button" data-nav="'+esc(id)+'" class="'+(current===id?'active':premium?'locked':'')+'"'+(current===id?' aria-current="page"':'')+(premium?' aria-label="Motoboys: exclusivo Premium" title="Exclusivo do Premium"':'')+'>'+
      '<span class="side-nav-icon" aria-hidden="true">'+icon+'</span><b>'+esc(name)+'</b>'+(premium?'<small class="side-lock">Premium</small>':'')+'</button>';
  }).join('')+'</nav>';
  $('sideShopName').textContent=shop.name;
  $('sideOpenMenu').href=publicShopUrl();
  $('sideColorPremium').classList.toggle('hidden',canCustomize());
  $('sideColor').classList.toggle('locked',!canCustomize());
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
function heading(title,subtitle,action=''){return '<div class="toolbar"><div><h2>'+esc(title)+'</h2><p class="muted">'+esc(subtitle)+'</p></div>'+action+'</div>'}
function empty(t='Nenhum registro até agora.'){return '<div class="empty">'+esc(t)+'</div>'}
function tile(t,v,sub){return '<div class="tile"><small>'+esc(t)+'</small><strong>'+esc(v)+'</strong><small>'+esc(sub||'')+'</small></div>'}
function publicShopUrl(){
  return location.origin+'/cardapio?loja='+encodeURIComponent(shop.slug);
}
function shareTitle(){return 'CARDÁPIO ('+shop.name+')'}
function publicLinkTile(){
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
function productStockState(product){
 const stock=Math.max(0,Number(product.stock)||0);
 const minimum=Math.max(0,Number(product.min_stock??5)||0);
 if(stock<=0)return {label:'Sem estoque',state:'out'};
 if(stock<=minimum)return {label:'Estoque baixo',state:'low'};
 return {label:'Estoque normal',state:'ok'};
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
  '<div class="inventory-stock-meta"><span>Atual: <strong>'+esc(product.stock??0)+' un</strong></span>'+
   '<span aria-hidden="true">•</span><span>Mínimo: <strong>'+esc(product.min_stock??5)+' un</strong></span></div>'+
  '<div class="inventory-status '+state+'" role="status">'+label+'</div>'+
  '<div class="inventory-actions">'+editBtn('product',product.id)+'</div>'+
  '</div></article>';
}
function productGrid(){
 return products.length?'<div class="inventory-grid">'+products.map(productCard).join('')+'</div>':
  empty('Nenhum produto cadastrado. Clique em Novo produto para começar.');
}
function categoryOptions(selected){
  const names=[...new Set(['Geral',...categories.map(c=>c.name),...products.map(p=>p.category||'Geral')])];
  return names.map(name=>'<option value="'+esc(name)+'"'+(name===selected?' selected':'')+'>'+esc(name)+'</option>').join('');
}
function cardapioEditor(){
 const list=categories.length?categories.map(cat=>{
  const count=products.filter(p=>p.category.toLocaleLowerCase('pt-BR')===cat.name.toLocaleLowerCase('pt-BR')).length;
  return '<div class="menu-category-line"><strong>'+esc(cat.name)+'</strong><small>'+count+' item(ns)</small></div>';
 }).join(''):'<p class="muted">Comece adicionando uma categoria, como Salgados ou Bebidas.</p>';
 const details=[
  ['Horário',shop.opening_hours||'Configurar'],
  ['Localização',shop.location_text||'Configurar'],
  ['Pagamento',(shop.payment_methods||[]).join(', ')||'Configurar'],
  ['Entrega',fmt(shop.delivery_fee||0)]
 ];
 return heading('Meu cardápio','Organize categorias, produtos, descrições e preços.','<div class="menu-heading-actions"><a class="ghost" href="'+esc(publicShopUrl())+'" target="_blank" rel="noopener noreferrer">Abrir cardápio ↗</a><button class="button" data-new="product">+ Adicionar item</button></div>')+
 (menuSchemaReady?'':'<p class="warn">A nova versão do cardápio está aguardando a atualização do banco de dados. Não salve alterações até a configuração terminar.</p>')+
 '<section class="menu-live-preview" aria-label="Prévia do cardápio online"><div class="menu-live-head"><div><strong>Prévia do seu cardápio</strong><p>Este é o cardápio já pronto que seus clientes vão abrir pelo link público.</p></div>'+
 '<a class="ghost" target="_blank" rel="noopener noreferrer" href="'+esc(publicShopUrl())+'">Abrir em outra aba ↗</a></div>'+
 '<iframe src="'+esc(publicShopUrl())+'" title="Cardápio público de '+esc(shop.name)+'" loading="lazy"></iframe></section>'+
 '<div class="menu-editor-meta">'+details.map(([label,value])=>'<button type="button" data-nav="configuracoes" title="Editar nas configurações"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></button>').join('')+'</div>'+
 '<div class="menu-editor-grid"><section class="menu-editor-panel"><h3>Categorias</h3>'+
 '<form id="categoryForm" class="menu-category-form"><label>Nova categoria<input type="text" name="name" placeholder="Ex.: Bebidas" required maxlength="65"></label>'+
 '<button class="button" type="submit">+ Adicionar categoria</button></form>'+
 '<div class="menu-category-list">'+list+'</div></section>'+
 '<section class="menu-editor-panel"><h3>Adicionar ou editar item</h3>'+
 (showForm?.kind==='product'?productForm(showForm.value):'<p class="muted">Clique em "+ Adicionar item" para cadastrar nome, categoria, descrição, valor e imagem.</p>')+
 '</section></div><section class="menu-editor-panel menu-editor-items"><h3>Itens do cardápio</h3>'+productRows()+'</section>';
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
 const paymentChoices=[['pix','Pix'],['dinheiro','Dinheiro'],['credito','Cartão de crédito'],['debito','Cartão de débito']];
 const choiceHtml=paymentChoices.map(([code,label])=>'<option value="'+code+'"'+(pdvPayment===code?' selected':'')+'>'+label+'</option>').join('');
 return '<div class="godzilla-pdv">'+
 '<div class="pdv-title"><div><span class="kicker">VENDA PRESENCIAL</span><h2>PDV</h2>'+
 '<p>Produtos, estoque e vendas integrados ao seu cardápio.</p></div>'+
 '<a class="button pdv-menu-link" href="'+esc(publicShopUrl())+'" target="_blank" rel="noopener noreferrer">Abrir cardápio ↗</a></div>'+
 '<div class="pdv-two-panels"><section class="pdv-panel pdv-catalog" aria-label="Produtos da loja">'+
 '<div class="pdv-filters">'+
 '<label class="pdv-search-label"><span class="sr-only">Buscar produtos</span><input type="search" id="pdvSearch" placeholder="Buscar produto ou categoria" value="'+esc(pdvQuery)+'" autocomplete="off"></label>'+
 '<label class="pdv-category-label"><span class="sr-only">Filtrar categoria</span><select id="pdvCategory">'+categoriesHtml+'</select></label>'+
 '<button type="button" id="pdvStockToggle" class="ghost'+(pdvInStockOnly?' active':'')+'">'+
 (pdvInStockOnly?'✓ Só disponíveis':'Todos os produtos')+'</button></div>'+
 '<div class="pdv-list-head"><strong>Produtos da loja</strong><small>'+products.length+' cadastrados</small></div>'+
 '<div id="pdvProducts" class="pdv-products">'+pdvProductCards()+'</div>'+
 '</section><aside class="pdv-panel pdv-sale-panel" aria-label="Venda atual">'+
 '<div class="pdv-sale-head"><div><span class="kicker">CAIXA</span><h2>Venda atual</h2></div><span aria-hidden="true">🛒</span></div>'+
 '<div class="pdv-sale-list">'+(cartItems||'<div class="pdv-sale-empty">Seu carrinho está vazio. Selecione um produto à esquerda.</div>')+'</div>'+
 '<div class="pdv-sale-total"><span>'+count+' item(ns) · Total</span><strong>'+fmt(sum)+'</strong></div>'+
 '<form id="saleForm" class="pdv-payment-form"><label>Forma de pagamento<select name="payment_method" id="pdvPaymentMethod">'+choiceHtml+'</select></label>'+
 '<div id="pdvCashFields" class="'+(cash?'':'hidden')+'"><label>Valor recebido (R$)<input type="number" id="pdvReceived" name="received" min="0" step="0.01" placeholder="0,00"></label>'+
 '<div class="pdv-calculation">Troco <strong id="pdvChange">'+fmt(0)+'</strong></div></div>'+
 '<div id="pdvCardFields" class="'+(isCard?'':'hidden')+'"><label>Taxa do cartão (%) — simulação<input id="pdvFeePercent" name="card_fee_percent" type="number" min="0" max="100" step="0.01" value="3.99"></label>'+
 '<div class="pdv-calculation">Líquido estimado <strong id="pdvNet">'+fmt(sum*0.9601)+'</strong></div>'+
 '<small class="muted">Estimativa informativa; não é cobrada nem registrada na venda.</small></div>'+
 '<button type="submit" class="button pdv-finish" '+(!cart.length?'disabled':'')+'>Finalizar venda ↗</button>'+
 '<p class="muted small">Registre apenas pagamentos recebidos fora da BipStart. O sistema atualiza o estoque após confirmar a venda.</p></form>'+
 '</aside></div></div>';
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
   net.textContent=fmt(total*(1-percent/100));
 }
}
function renderPage(){
  if(!hasAccess()){hiding('workspace',false);hiding('accessGate',true);renderAccessGate();return}
  if(!pages().some(([key])=>key===tab))tab='resumo';
  renderNav();
  let content='';
  if(tab==='resumo'){
    content=heading('Bem-vindo à BipStart','PDV com estoque e cardápio online integrados. Seus dados ficam separados das demais lojas.')
      +'<div class="grid">'+tile('Modelo',models[shop.model])+tile('Plano solicitado',plans[shop.requested_plan])+tile('Status',trialValid()?'Teste gratuito':'Ativo')+'</div>';
    if(shop.model==='pdv')content+='<div class="grid">'+tile('Produtos',products.length)+tile('Vendas',sales.length)+tile('Total vendido',fmt(sales.reduce((a,s)=>a+Number(s.total),0)))+'</div>';
    if(shop.model==='pdv')content+='<div class="grid public-overview-grid">'+tile('Itens cadastrados',products.length)+publicLinkTile()+'</div>';
  }else if(tab==='cardapio'){
    content=cardapioEditor();
  }else if(tab==='produtos'){
    const lowStock=products.filter(p=>productStockState(p).state==='low').length;
    const outOfStock=products.filter(p=>productStockState(p).state==='out').length;
    content='<div class="inventory-kicker">CONTROLE</div>'+heading('Cadastro de produtos','Cadastre produtos e acompanhe fotos, preços, quantidades e estoque mínimo na mesma tela.',
      '<button type="button" class="button" data-new="product">+ Novo produto</button>');
    content+='<div class="grid stock-stats">'+tile('Produtos cadastrados',products.length)+tile('Estoque baixo',lowStock)+tile('Sem estoque',outOfStock)+'</div>';
    content+=showForm?.kind==='product'?productForm(showForm.value):'';
    content+=productGrid();
  }else if(tab==='pedidos'){
    const businessPhone=String(shop.whatsapp||'').replace(/\D/g,'');
    const whatsapp=businessPhone?(businessPhone.startsWith('55')?'https://wa.me/'+businessPhone:'https://wa.me/55'+businessPhone):'';
    content=heading('Pedidos online','Os clientes montam o carrinho no cardápio e enviam os pedidos diretamente para o WhatsApp da sua loja.');
    content+='<div class="orders-intro"><span aria-hidden="true">🚚</span><div><h3>Pedidos pelo WhatsApp</h3><p>Os pedidos recebidos por WhatsApp ainda não são importados automaticamente para o PDV nem dão baixa no estoque. Confirme a disponibilidade e registre a venda no caixa.</p></div></div>';
    content+='<div class="orders-actions"><a class="button" href="'+esc(publicShopUrl())+'" target="_blank" rel="noopener noreferrer">Abrir cardápio ↗</a>'+
      '<button type="button" class="ghost" data-nav="cardapio">Gerenciar cardápio</button>'+
      '<button type="button" class="ghost" data-nav="configuracoes">Configurar WhatsApp</button>'+
      (whatsapp?'<a class="ghost" href="'+esc(whatsapp)+'" target="_blank" rel="noopener noreferrer">Abrir WhatsApp ↗</a>':'')+'</div>';
    if(proAccess()){
      content+='<div class="orders-premium"><h3>Entregas do Premium</h3><p>'+deliveries.length+' entrega(s) registradas manualmente após contato com o cliente.</p>'+
        '<button type="button" class="button" data-nav="entregas">Acessar fila de entregas</button></div>';
    }else content+='<p class="muted small">Gerenciamento de motoboys e entregas próprias disponível no plano Premium.</p>';
    content+=publicLinkTile();
  }else if(tab==='caixa'){
    content=renderGodzillaPDV();
  }else if(tab==='vendas'){
    content=heading('Histórico de vendas','Vendas registradas no PDV e seus totais.')
      +(sales.length?'<div class="stack">'+sales.map(s=>'<div class="item"><span>'+new Date(s.created_at).toLocaleString('pt-BR')+'</span><span>'+fmt(s.total)+' • '+esc(s.payment_method)+'</span></div>').join('')+'</div>':empty());
  }else if(tab==='motoboys'){
    content=heading('Motoboys • Plano Premium','Cadastre entregadores e compartilhe os convites de acesso.','<button class="button" data-new="courier">+ Novo motoboy</button>');
    content+='<p class="muted">Cada motoboy cria sua própria conta e aceita o convite. O acesso é individual e restrito às entregas da loja.</p>';
    content+=showForm?.kind==='courier'?courierForm(showForm.value):'';
    content+=couriers.length?'<div class="stack">'+couriers.map(c=>{
      const link=c.invite_code?location.origin+'/motoboy?convite='+encodeURIComponent(c.invite_code):'';
      return '<div class="item"><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.phone||'Sem telefone')+
        ' • '+(c.account_id?'Conta vinculada':'Aguardando aceite do convite')+
        ' • '+(c.active?'Ativo':'Desativado')+'</small>'+
        (link?'<p class="muted small">Convite individual: <a target="_blank" rel="noopener noreferrer" href="'+esc(link)+'">'+esc(link)+'</a></p>':'')+
        '</div><div class="actions">'+(link?'<button type="button" data-copy-invite="'+esc(link)+'">Copiar convite</button>':'')+editBtn('courier',c.id)+'</div></div>';
    }).join('')+'</div>':empty();
  }else if(tab==='entregas'){
    content=heading('Fila de entregas • Plano Premium','Entregas pendentes são oferecidas aos motoboys disponíveis.','<button class="button" data-new="delivery">+ Nova entrega</button>');
    content+='<p class="muted">Depois de receber o pedido pelo WhatsApp, cadastre aqui a entrega. O primeiro motoboy autorizado que aceitar assume o pedido.</p>';
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
      (isMenu?'<p class="muted">Logo própria e cores personalizadas são exclusivas do Premium vigente. O Básico utiliza a identidade BipStart.</p>':'');
    content=heading('Configurações da loja',isMenu?'Defina horário, localização, pagamentos e entrega.':'Nome da empresa, WhatsApp e cor principal.')
      +'<div class="data-form"><form id="settingsForm">'
      +field('name','Nome da empresa','text',shop.name,'required maxlength="120"')
      +field('whatsapp','WhatsApp comercial com DDD','tel',shop.whatsapp||'','placeholder="11999999999"')
      +(canCustomize()?field('brand_color','Cor principal do cardápio','color',shop.brand_color||'#7c3aed'):'<p class="muted">Identidade BipStart padrão. A troca de cores é exclusiva do Premium.</p>')
      +(isMenu?'<div class="menu-settings">'
       +field('opening_hours','Horário de atendimento','text',shop.opening_hours||'','maxlength="160" placeholder="Ex.: Segunda a sábado, 18h às 23h"')
       +field('location_text','Localização ou endereço','text',shop.location_text||'','maxlength="240" placeholder="Ex.: Rua das Flores, 100 — Centro"')
       +field('delivery_fee','Taxa de entrega (R$)','number',shop.delivery_fee??0,'min="0" max="9999.99" step="0.01"')
       +'<fieldset class="menu-payments"><legend>Formas de pagamento aceitas</legend>'+
        paymentChoices.map(([value,label])=>'<label><input type="checkbox" name="payment_methods" value="'+value+'"'+(currentMethods.includes(value)?' checked':'')+'> '+label+'</label>').join('')+'</fieldset>'
       +logoSection+'</div>':'')
      +'<button class="button">Salvar configurações</button></form></div>'
      +(isMenu?'<p class="muted">Seu endereço do cardápio é: '+esc(publicShopUrl())+'</p>':'');
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
  field('price','Preço (R$)','number',p.price??0,'required min="0" step="0.01"')+
  (isMenu?'<label>Descrição<textarea name="description" maxlength="1000" placeholder="Ingredientes, opções e informações do produto">'+esc(p.description||'')+'</textarea></label>':
  field('cost','Preço de custo (R$)','number',p.cost||0,'min="0" step="0.01"')+
  field('stock','Quantidade em estoque','number',p.stock??0,'required min="0" step="1"')+
  field('min_stock','Estoque mínimo (unidades)','number',p.min_stock??5,'required min="0" max="999999999" step="1"'))+
  '<label>Imagem do item (até 5 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>'+
  '<div class="paste-area" data-image-paste tabindex="0" role="button" aria-label="Colar imagem do produto" style="border:1px dashed #9068c8;border-radius:12px;padding:16px;cursor:pointer;min-height:75px">Clique aqui e pressione Ctrl+V para colar uma imagem copiada.<div data-image-preview aria-live="polite" style="margin-top:8px"></div></div>'
 );
}
function courierForm(c){c=c||{};return formShell('courier',c.id,
  field('name','Nome completo','text',c.name,'required maxlength="100"')+
  field('phone','Telefone ou WhatsApp','tel',c.phone||'','required minlength="10" maxlength="20"')+
  '<label>Disponibilidade<select name="active"><option value="true"'+(c.active!==false?' selected':'')+'>Ativo</option><option value="false"'+(c.active===false?' selected':'')+'>Desativado</option></select></label>'
)}
function deliveryForm(d){d=d||{};return formShell('delivery',d.id,
  field('customer_name','Cliente','text',d.customer_name||'','required maxlength="120"')+
  field('customer_phone','Telefone do cliente','tel',d.customer_phone||'','maxlength="20"')+
  field('address','Endereço da entrega','text',d.address||'','required maxlength="500"')+
  field('total','Valor dos produtos (R$)','number',d.total??0,'min="0" step="0.01"')+
  '<label>Itens ou observações<textarea name="items_text" maxlength="3000" placeholder="Ex.: 2x Combo e 1x Refrigerante">'+esc(d.items_text||'')+'</textarea></label>'+
  '<label>Oferecer para<select name="offered_courier_id"><option value="">Qualquer motoboy disponível</option>'+
   couriers.filter(c=>c.active).map(c=>'<option value="'+esc(c.id)+'"'+(c.id===d.offered_courier_id?' selected':'')+'>'+esc(c.name)+'</option>').join('')+
  '</select></label>'
)}
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
async function handleSubmit(form){
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
      await openShop();msg(v.signup_choice==='trial'?'Loja criada! Seus 7 dias gratuitos começaram.':'Loja cadastrada! Peça a contratação pelo WhatsApp e aguarde a liberação.');break;
    }
    case 'categoryForm':{
      if(!menuSchemaReady)throw Error('Categorias aguardando atualização do banco de dados.');
      if(shop.model!=='pdv')throw Error('Categorias disponíveis somente para lojas.');
      const name=String(v.name||'').trim();
      if(name.length<1||name.length>65)throw Error('Informe uma categoria válida (até 65 caracteres).');
      if(categories.some(c=>c.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw Error('Esta categoria já está cadastrada.');
      const order=categories.reduce((max,c)=>Math.max(max,Number(c.sort_order)||0),0)+10;
      await rest('shop_menu_categories',{method:'POST',body:{shop_id:shop.id,name,sort_order:order}});
      break;
    }
    case 'productForm':{
      if(tab==='cardapio'&&!menuSchemaReady)throw Error('Aguarde a atualização do banco de dados para editar o cardápio.');
      const file=pastedProductImage||form.querySelector('input[name=image]').files[0];
      const p=products.find(p=>p.id===id);
      const image_path=file?await uploadImage(file):p?.image_path||null;
      const isMenu=tab==='cardapio';
      const body={
       name:v.name.trim(),category:v.category.trim()||'Geral',price:Number(v.price),image_path,
       ...(isMenu?{description:String(v.description||'').trim()}:{
        cost:Number(v.cost),stock:Number(v.stock),min_stock:Number(v.min_stock)
       })
      };
      if(!body.name||!Number.isFinite(body.price)||body.price<0)throw Error('Confira o nome e o preço.');
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
      pdvPayment=v.payment_method;
      const data=await rpc('bipstart_complete_sale',{p_shop_id:shop.id,p_items:cart.map(c=>({product_id:c.id,quantity:c.qty})),p_payment_method:v.payment_method});
      cart=[];msg('Venda registrada: '+fmt(data.total));break;
    }
    case 'courierForm':{
      if(!proAccess())throw Error('Motoboys disponíveis somente no Plano Premium vigente.');
      const phone=String(v.phone||'').replace(/\D/g,'');
      if(!v.name?.trim()||phone.length<10||phone.length>13)throw Error('Informe nome e telefone com DDD.');
      await storeForm(form,'shop_couriers',{name:v.name.trim(),phone,active:v.active!=='false'},id);
      break;
    }
    case 'deliveryForm':{
      if(!proAccess())throw Error('Entregas disponíveis somente no Plano Premium vigente.');
      const total=Number(v.total||0);
      if(!v.customer_name?.trim()||!v.address?.trim()||!Number.isFinite(total)||total<0)
        throw Error('Informe cliente, endereço e valor válido.');
      const payload={
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
    case 'settingsForm':{
      const whatsapp=(v.whatsapp||'').replace(/\D/g,'');
      if(whatsapp&&!/^\d{10,13}$/.test(whatsapp))throw Error('Informe um telefone WhatsApp com DDD.');
      if(!v.name?.trim())throw Error('Informe o nome do estabelecimento.');
      const body={name:v.name.trim(),whatsapp:whatsapp||null};
      if(canCustomize()){
        if(!/^#[0-9a-f]{6}$/i.test(String(v.brand_color||'')))throw Error('Selecione uma cor válida.');
        body.brand_color=v.brand_color;
      }
      if(shop.model==='pdv'){
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
      break;
    }
    case 'customForm':{
      if(!canCustomize())throw Error('Mudanças e suporte estão disponíveis apenas no Premium vigente.');
      await rest('shop_customization_requests',{method:'POST',body:{shop_id:shop.id,details:v.details.trim()}});
      msg('Solicitação recebida para acompanhamento.');break;
    }
  }
  if(!['loginForm','signupForm','shopForm','resetPassForm'].includes(form.id)){showForm=null;pastedProductImage=null;await reloadData();renderPage();msg('Dados salvos com sucesso.');}
}
document.addEventListener('submit',async e=>{const form=e.target;if(!form.matches('form'))return;e.preventDefault();const btn=form.querySelector('button[type=submit],button.button');if(btn)btn.disabled=true;try{await handleSubmit(form)}catch(err){msg(err.message||'Erro ao salvar',true)}finally{if(btn?.isConnected)btn.disabled=false}});
document.addEventListener('paste',e=>{
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
 }else if(e.target.id==='pdvReceived'||e.target.id==='pdvFeePercent')updatePdvEstimates();
});
document.addEventListener('change',e=>{
 if(e.target.id==='pdvCategory'){pdvCategory=e.target.value;const grid=$('pdvProducts');if(grid)grid.innerHTML=pdvProductCards();}
 if(e.target.id==='pdvPaymentMethod'){pdvPayment=e.target.value;renderPage();}
});
document.addEventListener('change',e=>{if(e.target.matches('#productForm input[name=image]')){pastedProductImage=null;const preview=document.querySelector('[data-image-preview]');if(preview)preview.replaceChildren();}});
document.addEventListener('click',async e=>{
  if(e.target.closest('#sideToggle')){toggleSideMenu();return}
  if(e.target.closest('#sideBackdrop')){closeSideMenu();return}
  if(e.target.closest('#sideLogout')){closeSideMenu();$('logout').click();return}
  if(e.target.closest('#sideColor')){
    closeSideMenu();
    if(!canCustomize())return msg('Alterar a cor do cardápio está disponível somente no plano Premium.',true);
    tab='configuracoes';showForm=null;pastedProductImage=null;renderPage();
    const colorInput=document.querySelector('#settingsForm input[name="brand_color"]');
    if(colorInput){colorInput.scrollIntoView({block:'center',behavior:'smooth'});colorInput.focus();}
    return;
  }
  const mode=e.target.closest('[data-open-mode]');
  if(mode){
    if(!shop||!hasAccess())return;
    if(mode.dataset.openMode==='cardapio'){
      // A opção Cardápio abre a vitrine pública em tela cheia, sem o editor intermediário.
      location.assign(publicShopUrl());
      return;
    }
    // O PDV entra diretamente na frente de caixa, mantendo estoque e vendas da loja.
    tab='caixa';
    showForm=null;pastedProductImage=null;
    hiding('modeChooser',false);hiding('workspace',true);
    renderPage();
    return;
  }
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
    if(!shop||shop.model!=='pdv'||!hasAccess())return;
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
  const invite=e.target.closest('[data-copy-invite]');
  if(invite){
    try{await navigator.clipboard.writeText(invite.dataset.copyInvite);msg('Link do convite copiado.')}
    catch{window.prompt('Copie o link do motoboy:',invite.dataset.copyInvite)}
    return;
  }
  const pasteArea=e.target.closest('[data-image-paste]');if(pasteArea){pasteArea.focus();return}
  const nav=e.target.closest('[data-nav]');if(nav){
    if(nav.dataset.nav==='motoboys'&&!proAccess())return msg('Motoboys disponíveis somente no plano Premium.',true);
    if(!pages().some(([key])=>key===nav.dataset.nav))return;
    tab=nav.dataset.nav;showForm=null;pastedProductImage=null;closeSideMenu();renderPage();return
  }
  const add=e.target.closest('[data-new]');if(add){showForm={kind:add.dataset.new,value:null};pastedProductImage=null;renderPage();if(add.dataset.new==='product')document.getElementById('productForm')?.scrollIntoView({behavior:'smooth',block:'start'});return}
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
$('logout').onclick=()=>{closeSideMenu();session=null;shop=null;cart=[];saveSession();showAuth();msg('Você saiu com segurança.')};
$('backToModes').onclick=()=>{if(!shop||!hasAccess())return;closeSideMenu();history.replaceState(null,'','/cliente');hiding('workspace',false);hiding('modeChooser',true);showForm=null;};
$('refreshAccess').onclick=async()=>{try{await openShop();msg(hasAccess()?'Seu acesso está liberado!':'Ainda aguardando liberação. Confira o WhatsApp.')}catch(e){msg(e.message,true)}};
window.addEventListener('focus',()=>{if(shop&&ent&&!hasAccess()){hiding('workspace',false);hiding('accessGate',true);renderAccessGate()}});
setInterval(()=>{if(shop&&ent&&!hasAccess()){hiding('workspace',false);hiding('accessGate',true);renderAccessGate()}},60000);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('sidebar').classList.contains('open'))closeSideMenu();});
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
