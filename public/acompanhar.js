'use strict';
const $=id=>document.getElementById(id);
const statuses={
 awaiting_confirmation:'Aguardando confirmação',
 confirmed:'Confirmado',
 preparing:'Em preparo',
 out_for_delivery:'Saiu para entrega',
 fulfilled:'Finalizado',
 cancelled:'Cancelado'
};
const payments={pending:'Aguardando pagamento',paid:'Pago',cancelled:'Pagamento cancelado'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const currency=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let refreshing=false;
function trackingCredentials(){
 // A parte após # nunca é enviada ao servidor web nem ao referenciador.
 const params=new URLSearchParams(location.hash.replace(/^#/,''));
 const id=params.get('pedido'),token=params.get('chave');
 return uuid.test(id||'')&&uuid.test(token||'')?{id,token}:null;
}
function renderTracking(order){
 $('trackingError').hidden=true;
 $('trackingData').hidden=false;
 $('shopName').textContent=String(order.shop_name||'Loja');
 $('orderReference').textContent='Pedido #'+String(order.id).slice(0,8);
 const label=statuses[order.status]||'Status indisponível';
 $('statusPill').textContent=label;
 $('statusPill').classList.toggle('cancelled',order.status==='cancelled');
 const stages=order.delivery_method==='delivery'?
  ['awaiting_confirmation','confirmed','preparing','out_for_delivery','fulfilled']:
  ['awaiting_confirmation','confirmed','preparing','fulfilled'];
 const current=stages.indexOf(order.status);
 const done=order.status==='fulfilled',cancelled=order.status==='cancelled';
 $('orderSteps').replaceChildren();
 for(let i=0;i<stages.length;i++){
  const code=stages[i],li=document.createElement('li');
  const completed=done||(!cancelled&&current>i),active=!cancelled&&current===i;
  li.className=completed?'done':active?'current':'pending';
  if(active)li.setAttribute('aria-current','step');
  const icon=document.createElement('span');icon.className='step-symbol';icon.textContent=completed?'✓':String(i+1);
  icon.setAttribute('aria-hidden','true');
  const title=document.createElement('span');title.className='step-label';title.textContent=statuses[code];
  li.append(icon,title);$('orderSteps').append(li);
 }
 $('paymentStatus').textContent=payments[order.payment_status]||'A confirmar';
 $('deliveryMethod').textContent=order.delivery_method==='delivery'?'Entrega':'Retirada na loja';
 $('orderTotal').textContent=currency(order.total);
}
async function refreshTracking(){
 if(refreshing||document.visibilityState==='hidden')return;
 refreshing=true;$('refresh').disabled=true;
 try{
  const credentials=trackingCredentials();
  if(!credentials)throw Error('Este link de acompanhamento está incompleto. Abra o link recebido no momento do pedido.');
  const config=await fetch('/api/public-config',{cache:'no-store'}).then(r=>r.json());
  if(!config.enabled)throw Error('O acompanhamento está temporariamente indisponível.');
  const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/bipstart_track_online_order',{
   method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
   body:JSON.stringify({p_order_id:credentials.id,p_client_token:credentials.token}),cache:'no-store'
  });
  if(!response.ok)throw Error('Não foi possível atualizar o acompanhamento. Tente novamente.');
  const order=await response.json();
  if(!order||!order.id)throw Error('Pedido não encontrado. Confira se o link de acompanhamento está completo.');
  renderTracking(order);
  $('lastUpdate').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
 }catch(error){
  $('trackingError').textContent=error.message;
  $('trackingError').hidden=false;
  $('lastUpdate').textContent='Falha na atualização';
 }finally{refreshing=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',refreshTracking);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshTracking();});
refreshTracking();
setInterval(refreshTracking,20000);
