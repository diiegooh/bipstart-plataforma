'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const currency=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const STORAGE='bipstart_courier_session';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let cfg=null,session=null,captchaToken='',captchaWidget=null,loading=false;
function message(value,err=false){
 const box=$('courierMessage');
 box.classList.remove('hidden');
 box.style.borderColor=err?'#d76c8f':'var(--store-accent,#7c3aed)';
 box.textContent=String(value);
}
function storeSession(){
 try{
  if(session)localStorage.setItem(STORAGE,JSON.stringify(session));
  else localStorage.removeItem(STORAGE);
 }catch{}
}
function authView(isAuthed){
 $('authPanel').classList.toggle('hidden',isAuthed);
 $('dashboard').classList.toggle('hidden',!isAuthed);
 $('logout').classList.toggle('hidden',!isAuthed);
}
function resetCaptcha(){
 captchaToken='';
 if(captchaWidget!==null&&window.turnstile)window.turnstile.reset(captchaWidget);
}
function setupCaptcha(){
 if(!cfg?.turnstileSiteKey)return;
 const script=document.createElement('script');
 script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
 script.async=true;script.defer=true;
 script.onload=()=>{
  if(!window.turnstile)return;
  captchaWidget=window.turnstile.render('#captcha',{
   sitekey:cfg.turnstileSiteKey,
   callback:token=>{captchaToken=token},
   'expired-callback':()=>{captchaToken=''},
   'error-callback':()=>{captchaToken=''}
  });
 };
 document.head.appendChild(script);
}
async function api(path,{method='GET',body,token,headers={}}={}){
 const h={apikey:cfg.publishableKey,...headers};
 const bearer=token===undefined?session?.access_token:token;
 if(bearer)h.Authorization='Bearer '+bearer;
 if(body!==undefined)h['Content-Type']='application/json';
 const response=await fetch(cfg.supabaseUrl+path,{
  method,headers:h,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(result?.message||result?.msg||result?.error_description||result?.error||'Não foi possível concluir a solicitação.');
 return result;
}
async function validSession(){
 if(!session)return false;
 if(Number(session.expires_at)>Date.now()/1000+90)return true;
 if(!session.refresh_token)return false;
 try{
  const data=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token},token:null});
  session={...data,expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)};
  storeSession();return true;
 }catch{
  session=null;storeSession();return false;
 }
}
async function rpc(name,body={}){
 if(!await validSession())throw Error('Sua sessão expirou. Entre novamente.');
 return api('/rest/v1/rpc/'+name,{method:'POST',body});
}
function mapUrl(address){
 return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(address)+'&travelmode=driving';
}
function wazeUrl(address){
 return 'https://waze.com/ul?q='+encodeURIComponent(address)+'&navigate=yes';
}
function themeColor(color){return /^#[0-9a-f]{6}$/i.test(String(color||''))?String(color):'#7c3aed';}
function themeContrast(color){
 const c=themeColor(color),values=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255);
 const linear=values.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
 return luminance>.35?'#101510':'#ffffff';
}
function themeVars(color){
 const safe=themeColor(color);
 return '--courier-shop-accent:'+safe+';--courier-shop-ink:'+themeContrast(safe);
}
function applyCourierTheme(color){
 const safe=themeColor(color);
 document.documentElement.style.setProperty('--store-accent',safe);
 document.documentElement.style.setProperty('--store-accent-ink',themeContrast(safe));
 document.body.classList.toggle('courier-themed',true);
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',safe);
}
function whatsappUrl(phone){
 const digits=String(phone||'').replace(/\D/g,'');
 if(!digits)return '';
 const br=digits.startsWith('55')?digits:'55'+digits;
 return 'https://wa.me/'+br;
}
function deliveryCard(d,offer){
 const name=esc(d.customer_name||'Cliente');
 const address=String(d.address||'');
 const contact=whatsappUrl(d.customer_phone);
 const button=offer?
  '<button class="button" type="button" data-job-action="accept" data-id="'+esc(d.delivery_id)+'">Aceitar entrega</button>':
  d.status==='atribuida'?
   '<button class="button" type="button" data-job-action="start" data-id="'+esc(d.delivery_id)+'" data-address="'+esc(address)+'">INICIAR ROTA</button>':
   '<button class="button" type="button" data-job-action="complete" data-id="'+esc(d.delivery_id)+'">ENTREGUE</button>';
 const orderNumber=String(d.delivery_id||'').replace(/-/g,'').slice(-6).toUpperCase();
 const items=String(d.items_text||'').trim();
 return '<article class="courier-delivery" style="'+themeVars(d.shop_color)+'">'+
  '<h3>Pedido #'+esc(orderNumber||'—')+'</h3>'+
  '<p><strong>Cliente:</strong> '+name+'</p>'+
  '<p><strong>Endereço:</strong> '+esc(address||'Endereço não informado')+'</p>'+
  '<p><strong>Itens do pedido:</strong></p>'+
  '<p class="courier-order-items">'+esc(items||'Itens não informados').replace(/\n/g,'<br>')+'</p>'+
  '<div class="courier-actions courier-order-actions">'+
   button+
   (contact?'<a class="button courier-whatsapp" target="_blank" rel="noopener noreferrer" href="'+esc(contact)+'">WhatsApp</a>':'')+
  '</div></article>';
}
async function refresh(){
 if(!session)return;
 if(loading)return;
 loading=true;
 try{
  const [memberships,jobs,themes]=await Promise.all([
   rpc('bipstart_courier_my_shops'),
   rpc('bipstart_courier_queue'),
   rpc('bipstart_courier_shop_theme').catch(error=>{
    console.warn('Tema das lojas temporariamente indisponível:',error.message);
    return [];
   })
  ]);
  const shops=Array.isArray(memberships)?memberships:[];
  const rows=Array.isArray(jobs)?jobs:[];
  const colors=new Map((Array.isArray(themes)?themes:[]).map(t=>[t.shop_id,themeColor(t.brand_color)]));
  applyCourierTheme(shops.length===1?colors.get(shops[0].shop_id):'#7c3aed');
  const coloredRows=rows.map(d=>({...d,shop_color:colors.get(d.shop_id)||'#7c3aed'}));
  $('courierIdentity').textContent='';
  const root=$('deliveries');
  root.innerHTML=coloredRows.length?coloredRows.map(d=>deliveryCard(d,d.is_offer===true)).join(''):
   '<div class="courier-empty">Sem pedidos</div>';
 }catch(err){
  message(err.message,true);
  if(!await validSession())authView(false);
 }finally{loading=false}
}
function courierLoginEmail(input){
 const value=String(input||'').trim().toLowerCase();
 let digits=value.replace(/\D/g,'');
 if(/^55\d{10,11}$/.test(digits))digits=digits.slice(2);
 if(!/^[1-9]\d{9,10}$/.test(digits))throw Error('Informe seu usuário (telefone com DDD).');
 return 'courier-55'+digits+'@login.bipstart.example';
}
$('loginForm').onsubmit=async event=>{
 event.preventDefault();
 const form=event.currentTarget;
 const submit=form.querySelector('button[type=submit]');
 submit.disabled=true;
 try{
  if(cfg.turnstileSiteKey&&!captchaToken)throw Error('Complete a verificação de segurança.');
  const email=courierLoginEmail(form.elements.namedItem('login').value);
  const password=form.elements.namedItem('password').value;
  const data=await api('/auth/v1/token?grant_type=password',{
   method:'POST',token:null,
   body:{email,password,...(captchaToken?{gotrue_meta_security:{captcha_token:captchaToken}}:{})}
  });
  session={...data,expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)};
  storeSession();authView(true);
  message('Acesso individual confirmado.');
  await refresh();
 }catch(e){message(e.message,true)}
 finally{resetCaptcha();submit.disabled=false}
};
$('logout').onclick=()=>{
 session=null;storeSession();authView(false);resetCaptcha();
 applyCourierTheme('#7c3aed');
 $('loginForm').reset();message('Você saiu com segurança.');
};
$('refresh').onclick=refresh;
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-job-action]');
 if(!button)return;
 const id=button.dataset.id;
 const action=button.dataset.jobAction;
 if(!UUID.test(id)||!['accept','start','complete'].includes(action))return;
 button.disabled=true;
 try{
  if(action==='accept')await rpc('bipstart_courier_accept',{p_delivery_id:id});
  else {
   await rpc('bipstart_courier_set_status',{
    p_delivery_id:id,
    p_status:action==='start'?'a_caminho':'entregue'
   });
   if(action==='start'){
    const destination=button.dataset.address||'';
    if(destination.trim())window.open(mapUrl(destination),'_blank','noopener,noreferrer');
   }
  }
  message(action==='accept'?'Entrega aceita com sucesso.':
   action==='start'?'Rota iniciada. Boa entrega!':'Entrega concluída e pedido finalizado.');
  await refresh();
 }catch(err){message(err.message,true)}
 finally{button.disabled=false}
});
async function boot(){
 try{
  cfg=await fetch('/api/public-config',{cache:'no-store'}).then(r=>r.json());
  if(!cfg?.enabled)throw Error('Serviço de login temporariamente indisponível.');
  setupCaptcha();
  try{session=JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{session=null}
  if(await validSession()){authView(true);await refresh()}
  else authView(false);
 }catch(err){message(err.message,true);authView(false)}
}
setInterval(()=>{if(session&&!loading)refresh()},20000);
boot();
