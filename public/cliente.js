'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>Number(x||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let cfg=null,session=null,shop=null,ent=null,products=[],services=[],appointments=[],sales=[],requests=[],couriers=[],deliveries=[];
let tab='resumo',cart=[],showForm=null,toastTimer,pastedProductImage=null;
const captchaTokens={login:'',signup:''},captchaWidgets={login:null,signup:null};
const storageKey='bipstart_customer_session';
const plans={basic:'Básico',personalizado:'Personalizado',pro:'Pro'};
const models={pdv:'PDV com estoque',agenda:'Agenda',cardapio:'Cardápio online'};
const hiding=(id,on)=>$(id).classList.toggle('hidden',!on);
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
  if(!r.ok)throw Error(data?.msg||data?.message||data?.error_description||data?.error||'Erro de conexão com o banco.');
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
function hideAll(){['auth','setup','createShop','workspace','resetPass'].forEach(id=>hiding(id,false));}
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
    callback:token=>{captchaTokens[kind]=token;},
    'expired-callback':()=>{captchaTokens[kind]='';},
    'error-callback':()=>{captchaTokens[kind]='';}
  });
}
function resetCaptcha(kind){
  captchaTokens[kind]='';
  if(captchaWidgets[kind]!==null&&window.turnstile)window.turnstile.reset(captchaWidgets[kind]);
}
function captchaFor(kind){
  if(!cfg?.turnstileSiteKey)return {};
  if(!captchaTokens[kind])throw Error('Conclua a verificação anti-robô antes de continuar.');
  return {gotrue_meta_security:{captcha_token:captchaTokens[kind]}};
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
  const rows=await rest('shops',{query:{select:'id,name,slug,model,requested_plan,brand_color,whatsapp,created_at',order:'created_at.desc',limit:'20'}});
  if(!rows?.length){hideAll();hiding('createShop',true);hiding('logout',true);return}
  shop=rows[0];await openShop();
}
async function openShop(){
  hideAll();hiding('workspace',true);hiding('logout',true);
  const [access]=await rest('shop_entitlements',{query:{select:'plan_code,status,trial_until,active_until',shop_id:'eq.'+shop.id,limit:'1'}});
  ent=access||null;
  $('shopName').textContent=shop.name;
  const trial=ent?.status==='trialing'&&new Date(ent.trial_until)>new Date();
  $('shopStatus').textContent=trial?'Avaliação gratuita até '+new Date(ent.trial_until).toLocaleDateString('pt-BR'):ent?.status==='active'?'Plano '+(plans[ent.plan_code]||'')+' ativo':'Plano inativo — aguarde a contratação';
  hiding('publicMenuLink',shop.model==='cardapio');
  if(shop.model==='cardapio')$('publicMenuLink').href='/cardapio?loja='+encodeURIComponent(shop.slug);
  await reloadData();renderNav();renderPage();
}
async function reloadData(){
  products=[];services=[];appointments=[];sales=[];requests=[];couriers=[];deliveries=[];
  const get=(t,fields='*')=>rest(t,{query:{select:fields,shop_id:'eq.'+shop.id,order:'created_at.desc',limit:'200'}});
  if(shop.model==='pdv'||shop.model==='cardapio')products=await get('shop_products');
  if(shop.model==='pdv')sales=await get('shop_sales');
  if(shop.model==='agenda'){
    services=await rest('shop_services',{query:{select:'*',shop_id:'eq.'+shop.id}});
    appointments=await get('shop_appointments');
  }
  requests=await get('shop_customization_requests');
  if(ent?.plan_code==='pro'&&ent.status==='active'){
    couriers=await rest('shop_couriers',{query:{select:'*',shop_id:'eq.'+shop.id}});
    deliveries=await get('shop_deliveries');
  }
}
function pages(){
  const a=[['resumo','Visão geral']];
  if(shop.model==='pdv')a.push(['caixa','Frente de caixa'],['produtos','Produtos e estoque'],['vendas','Histórico de vendas']);
  if(shop.model==='agenda')a.push(['agenda','Agendamentos'],['servicos','Serviços']);
  if(shop.model==='cardapio')a.push(['cardapio','Itens e fotos']);
  if(ent?.plan_code==='pro'&&ent.status==='active')a.push(['motoboys','Motoboys'],['entregas','Entregas']);
  a.push(['personalizar','Solicitar personalização'],['configuracoes','Configurações']);
  return a;
}
function renderNav(){
  $('nav').innerHTML='<nav>'+pages().map(([id,name])=>'<button type="button" data-nav="'+esc(id)+'" class="'+(tab===id?'active':'')+'">'+esc(name)+'</button>').join('')+'</nav>';
}
function heading(title,subtitle,action=''){return '<div class="toolbar"><div><h2>'+esc(title)+'</h2><p class="muted">'+esc(subtitle)+'</p></div>'+action+'</div>'}
function empty(t='Nenhum registro até agora.'){return '<div class="empty">'+esc(t)+'</div>'}
function tile(t,v,sub){return '<div class="tile"><small>'+esc(t)+'</small><strong>'+esc(v)+'</strong><small>'+esc(sub||'')+'</small></div>'}
function imageUrl(path){if(!path)return '';return cfg.supabaseUrl+'/storage/v1/object/public/bipstart-images/'+path.split('/').map(encodeURIComponent).join('/')}
function editBtn(kind,id){return '<button data-edit="'+esc(kind)+'" data-id="'+esc(id)+'">Editar</button>'}
function productRows(){
  return products.length?'<div class="stack">'+products.map(p=>'<div class="item">'+(p.image_path?'<img src="'+esc(imageUrl(p.image_path))+'" alt="">':'')+'<div><strong>'+esc(p.name)+'</strong><small>'+esc(p.category)+' • '+fmt(p.price)+' • Estoque: '+esc(p.stock)+'</small></div><div class="actions">'+editBtn('product',p.id)+'</div></div>').join('')+'</div>':empty('Cadastre o primeiro produto.')
}
function renderPage(){
  renderNav();
  let content='';
  if(tab==='resumo'){
    content=heading('Bem-vindo à BipStart','Seus dados ficam salvos no Supabase e são separados dos demais clientes.')
      +'<div class="grid">'+tile('Modelo',models[shop.model])+tile('Plano solicitado',plans[shop.requested_plan])+tile('Status',ent?.status==='active'?'Ativo':'Em avaliação')+'</div>'
      +'<p class="warn">A cobrança dos planos BipStart ainda não está ativa. Esta conta usa a avaliação gratuita. Pedidos dos clientes são enviados pelo WhatsApp e pagamentos das lojas são combinados diretamente com cada estabelecimento.</p>';
    if(shop.model==='pdv')content+='<div class="grid">'+tile('Produtos',products.length)+tile('Vendas',sales.length)+tile('Total vendido',fmt(sales.reduce((a,s)=>a+Number(s.total),0)))+'</div>';
    if(shop.model==='agenda')content+='<div class="grid">'+tile('Serviços',services.length)+tile('Agendamentos',appointments.length)+'</div>';
    if(shop.model==='cardapio')content+='<div class="grid">'+tile('Itens cadastrados',products.length)+tile('Link público',shop.slug)+'</div>';
  }else if(tab==='produtos'||tab==='cardapio'){
    content=heading(tab==='cardapio'?'Meu cardápio':'Produtos e estoque','Cadastre itens, preços, imagens e quantidades.','<button class="button" data-new="product">+ Novo item</button>');
    content+=showForm?.kind==='product'?productForm(showForm.value):'';
    content+=productRows();
    if(tab==='cardapio')content+='<p class="muted">O cardápio público pode receber pedidos pelo WhatsApp quando você informar seu número comercial.</p>';
  }else if(tab==='caixa'){
    content=heading('Frente de caixa','As vendas registradas são reais no sistema e atualizam o estoque, mas NÃO cobram o cartão ou Pix.');
    content+='<div class="stack">'+(products.filter(p=>p.active&&p.stock>0).map(p=>'<div class="item"><div><strong>'+esc(p.name)+'</strong><small>'+fmt(p.price)+' • Disponível: '+p.stock+'</small></div><button data-cart="'+esc(p.id)+'">Adicionar</button></div>').join('')||empty('Cadastre produtos com estoque disponível.'))+'</div>';
    content+='<div class="cart"><h3>Carrinho</h3>'+cart.map(c=>'<div class="item"><span>'+esc(c.name)+' × '+c.qty+'</span><span>'+fmt(c.price*c.qty)+' <button data-remove="'+esc(c.id)+'">Remover</button></span></div>').join('')+'<div class="total">Total: '+fmt(cart.reduce((a,c)=>a+c.qty*c.price,0))+'</div><form id="saleForm"><label>Forma de pagamento<select name="payment_method"><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="credito">Cartão de crédito</option><option value="debito">Cartão de débito</option></select></label><button class="button" '+(!cart.length?'disabled':'')+'>Registrar venda</button></form><small class="muted">Registre aqui somente pagamentos que você já recebeu fora da plataforma.</small></div>';
  }else if(tab==='vendas'){
    content=heading('Histórico de vendas','Vendas registradas no PDV e seus totais.')
      +(sales.length?'<div class="stack">'+sales.map(s=>'<div class="item"><span>'+new Date(s.created_at).toLocaleString('pt-BR')+'</span><span>'+fmt(s.total)+' • '+esc(s.payment_method)+'</span></div>').join('')+'</div>':empty());
  }else if(tab==='servicos'){
    content=heading('Serviços e preços','Defina os serviços e o tempo de atendimento.','<button class="button" data-new="service">+ Novo serviço</button>');
    content+=showForm?.kind==='service'?serviceForm(showForm.value):'';
    content+=services.length?'<div class="stack">'+services.map(s=>'<div class="item"><div><strong>'+esc(s.name)+'</strong><small>'+fmt(s.price)+' • '+s.duration_minutes+' minutos</small></div>'+editBtn('service',s.id)+'</div>').join('')+'</div>':empty();
  }else if(tab==='agenda'){
    content=heading('Agendamentos','Organize horários e clientes.','<button class="button" data-new="appointment">+ Novo agendamento</button>');
    content+=showForm?.kind==='appointment'?appointmentForm(showForm.value):'';
    content+=appointments.length?'<div class="stack">'+appointments.map(a=>'<div class="item"><div><strong>'+esc(a.customer_name)+'</strong><small>'+new Date(a.starts_at).toLocaleString('pt-BR')+' • '+esc(a.status)+'</small></div>'+editBtn('appointment',a.id)+'</div>').join('')+'</div>':empty();
  }else if(tab==='motoboys'){
    content=heading('Motoboys fixos','Disponível no Plano Pro ativo.','<button class="button" data-new="courier">+ Novo motoboy</button>');
    content+=showForm?.kind==='courier'?courierForm(showForm.value):'';
    content+=couriers.length?'<div class="stack">'+couriers.map(c=>'<div class="item"><div><strong>'+esc(c.name)+'</strong><small>'+esc(c.phone||'Sem telefone')+'</small></div>'+editBtn('courier',c.id)+'</div>').join('')+'</div>':empty();
  }else if(tab==='entregas'){
    content=heading('Entregas','Acompanhe o andamento das entregas próprias.','<button class="button" data-new="delivery">+ Nova entrega</button>');
    content+=showForm?.kind==='delivery'?deliveryForm(showForm.value):'';
    content+=deliveries.length?'<div class="stack">'+deliveries.map(d=>'<div class="item"><div><strong>'+esc(d.address)+'</strong><small>'+esc(d.status)+'</small></div></div>').join('')+'</div>':empty();
  }else if(tab==='configuracoes'){
    content=heading('Configurações da loja','Nome da empresa, WhatsApp e cor principal.')
      +'<div class="data-form"><form id="settingsForm">'
      +field('name','Nome da empresa','text',shop.name,'required maxlength="120"')
      +field('whatsapp','WhatsApp comercial com DDD','tel',shop.whatsapp||'','placeholder="11999999999"')
      +field('brand_color','Cor principal','color',shop.brand_color||'#7c3aed')
      +'<button class="button">Salvar configurações</button></form></div>'
      +'<p class="muted">Seu endereço do cardápio é: '+esc(location.origin+'/cardapio?loja='+shop.slug)+'</p>';
  }else if(tab==='personalizar'){
    content=heading('Solicitar personalização','Conte como quer sua logo, cores, páginas e funcionalidades.')
      +'<div class="data-form"><form id="customForm"><label>Descreva sua solicitação<textarea name="details" minlength="10" maxlength="3000" placeholder="Envie sua logo e conte as mudanças desejadas..." required></textarea></label><button class="button">Enviar solicitação</button></form></div>'
      +'<p class="muted small">Sua solicitação ficará registrada para atendimento pela BipStart. O contato e os prazos serão combinados com você.</p>'
      +(requests.length?'<div class="stack">'+requests.map(r=>'<div class="item"><div><strong>'+esc(r.status)+'</strong><small>'+new Date(r.created_at).toLocaleDateString('pt-BR')+'</small><p>'+esc(r.details)+'</p></div></div>').join('')+'</div>':'');
  }
  $('page').innerHTML=content;
}
function field(name,label,type='text',value='',extra=''){return '<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value)+'" '+extra+'></label>'}
function formShell(kind,id,inside){return '<div class="data-form"><form id="'+kind+'Form" data-id="'+esc(id||'')+'"><div class="columns">'+inside+'</div><button class="button">Salvar</button> <button type="button" class="ghost" data-cancel>Cancelar</button></form></div>'}
function productForm(p){p=p||{};return formShell('product',p.id,
  field('name','Nome', 'text',p.name,'required maxlength="160"')+field('category','Categoria','text',p.category||'Geral')
  +field('price','Preço de venda (R$)','number',p.price||0,'required min="0" step="0.01"')
  +field('cost','Preço de custo (R$)','number',p.cost||0,'min="0" step="0.01"')
  +field('stock','Quantidade em estoque','number',p.stock||0,'required min="0" step="1"')
  +'<label>Foto do item (até 5 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>'
  +'<div class="paste-area" data-image-paste tabindex="0" role="button" aria-label="Colar imagem do produto" style="border:1px dashed #9068c8;border-radius:12px;padding:16px;cursor:pointer;min-height:75px">Clique aqui e pressione Ctrl+V para colar uma imagem copiada.<div data-image-preview aria-live="polite" style="margin-top:8px"></div></div>'
);
}
function serviceForm(p){p=p||{};return formShell('service',p.id,
 field('name','Serviço','text',p.name,'required')+field('price','Valor (R$)','number',p.price||0,'required min="0" step=".01"')
 +field('duration_minutes','Duração (minutos)','number',p.duration_minutes||30,'required min="5" max="480"'))}
function appointmentForm(a){a=a||{};let dt='';if(a.starts_at){const d=new Date(a.starts_at);const pad=n=>String(n).padStart(2,'0');dt=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());}return formShell('appointment',a.id,
 field('customer_name','Nome do cliente','text',a.customer_name,'required')+field('customer_phone','Telefone','tel',a.customer_phone||'')
 +'<label>Serviço<select name="service_id" required>'+services.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===a.service_id?'selected':'')+'>'+esc(s.name)+'</option>').join('')+'</select></label>'
 +field('starts_at','Data e hora','datetime-local',dt,'required')+field('notes','Observação','text',a.notes||''))}
function courierForm(c){c=c||{};return formShell('courier',c.id,field('name','Nome','text',c.name,'required')+field('phone','Telefone','tel',c.phone||''))}
function deliveryForm(d){d=d||{};return formShell('delivery',d.id,field('address','Endereço da entrega','text',d.address,'required')
 +'<label>Motoboy<select name="courier_id"><option value="">Sem atribuição</option>'+couriers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></label>'
 +'<label>Status<select name="status">'+['pendente','atribuida','a_caminho','entregue','cancelada'].map(s=>'<option value="'+s+'">'+s+'</option>').join('')+'</select></label>')}
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
      const captcha=captchaFor('login');
      let result;
      try{result=await api('/auth/v1/token?grant_type=password',{method:'POST',token:null,body:{email:v.email,password:v.password,...captcha}})}
      finally{resetCaptcha('login')}
      session={...result,expires_at:Date.now()/1000+Number(result.expires_in||3600)};
      saveSession();await loadShops();break;
    }
    case 'signupForm':{
      if(v.password!==v.confirm)throw Error('As senhas não coincidem. Confira e tente novamente.');
      const captcha=captchaFor('signup');
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
      const created=await rest('shops',{method:'POST',body:{owner_id:user.id,name:v.name.trim(),whatsapp:v.whatsapp?.replace(/\D/g,'')||null,slug,model:v.model,requested_plan:v.requested_plan}});
      shop=created?.[0];if(!shop)throw Error('A loja não pôde ser criada.');
      await openShop();msg('Loja criada! Sua avaliação gratuita começou.');break;
    }
    case 'productForm':{
      const file=pastedProductImage||form.querySelector('input[name=image]').files[0];
      const p=products.find(p=>p.id===id);
      const image_path=file?await uploadImage(file):p?.image_path||null;
      const body={name:v.name.trim(),category:v.category.trim()||'Geral',price:Number(v.price),cost:Number(v.cost),stock:Number(v.stock),image_path};
      if(!body.name||!Number.isInteger(body.stock)||body.stock<0||body.price<0||body.cost<0)throw Error('Confira nome, preços e estoque.');
      await storeForm(form,'shop_products',body,id);
      break;
    }
    case 'serviceForm':await storeForm(form,'shop_services',{name:v.name.trim(),price:Number(v.price),duration_minutes:Number(v.duration_minutes)},id);break;
    case 'appointmentForm':{
      const service=services.find(s=>s.id===v.service_id);
      if(!service)throw Error('Cadastre um serviço antes.');
      const starts=new Date(v.starts_at);
      if(!Number.isFinite(starts.getTime()))throw Error('Data inválida.');
      const ends=new Date(starts.getTime()+service.duration_minutes*60000);
      const overlap=appointments.some(a=>a.id!==id&&a.status!=='cancelado'&&new Date(a.starts_at)<ends&&new Date(a.ends_at)>starts);
      if(overlap)throw Error('Já existe um agendamento nesse horário.');
      await storeForm(form,'shop_appointments',{service_id:service.id,customer_name:v.customer_name.trim(),customer_phone:v.customer_phone,starts_at:starts.toISOString(),ends_at:ends.toISOString(),notes:v.notes},id);
      break;
    }
    case 'saleForm':{
      if(!cart.length)throw Error('Adicione produtos ao carrinho.');
      const data=await rpc('bipstart_complete_sale',{p_shop_id:shop.id,p_items:cart.map(c=>({product_id:c.id,quantity:c.qty})),p_payment_method:v.payment_method});
      cart=[];msg('Venda registrada: '+fmt(data.total));break;
    }
    case 'courierForm':await storeForm(form,'shop_couriers',{name:v.name.trim(),phone:v.phone},id);break;
    case 'deliveryForm':await storeForm(form,'shop_deliveries',{address:v.address.trim(),courier_id:v.courier_id||null,status:v.status},id);break;
    case 'settingsForm':{
      const whatsapp=(v.whatsapp||'').replace(/\D/g,'');
      if(whatsapp&&!/^\d{10,13}$/.test(whatsapp))throw Error('Informe um telefone WhatsApp com DDD.');
      await rest('shops',{method:'PATCH',query:{id:'eq.'+shop.id},body:{name:v.name.trim(),whatsapp:whatsapp||null,brand_color:v.brand_color}});
      shop={...shop,name:v.name.trim(),whatsapp:whatsapp||null,brand_color:v.brand_color};
      $('shopName').textContent=shop.name;
      break;
    }
    case 'customForm':{
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
document.addEventListener('change',e=>{if(e.target.matches('#productForm input[name=image]')){pastedProductImage=null;const preview=document.querySelector('[data-image-preview]');if(preview)preview.replaceChildren();}});
document.addEventListener('click',async e=>{
  const pasteArea=e.target.closest('[data-image-paste]');if(pasteArea){pasteArea.focus();return}
  const nav=e.target.closest('[data-nav]');if(nav){tab=nav.dataset.nav;showForm=null;pastedProductImage=null;renderPage();return}
  const add=e.target.closest('[data-new]');if(add){showForm={kind:add.dataset.new,value:null};pastedProductImage=null;renderPage();return}
  const edit=e.target.closest('[data-edit]');if(edit){
    const lists={product:products,service:services,appointment:appointments,courier:couriers,delivery:deliveries};
    showForm={kind:edit.dataset.edit,value:(lists[edit.dataset.edit]||[]).find(v=>v.id===edit.dataset.id)||null};pastedProductImage=null;renderPage();return
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
$('logout').onclick=()=>{session=null;shop=null;saveSession();showAuth();msg('Você saiu com segurança.')};
$('switchShop').onclick=()=>{location.href='/#planos'};
$('forgotPassword').onclick=async()=>{
  const email=$('loginForm').querySelector('input[name=email]').value.trim();
  if(!email)return msg('Informe seu e-mail para receber a recuperação.',true);
  let attempted=false;
  try{
    const captcha=captchaFor('login');
    attempted=true;
    await api('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+'/cliente'),{method:'POST',token:null,body:{email,...captcha}});
    msg('Confira seu e-mail para recuperar a senha.');
  }catch(e){msg(e.message,true)}
  finally{if(attempted)resetCaptcha('login')}
};
begin().catch(e=>{status(e.message||'Falha ao conectar ao Supabase.');showAuth()});
