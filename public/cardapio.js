'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const paymentLabels={pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito',dinheiro:'Dinheiro'};
let menu=null,cart=new Map(),config=null,activeCategory='Todos',availabilityTimer=null;
const serviceDayLabels=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
function showErr(text){$('error').classList.remove('hidden');$('error').textContent=String(text)}
function imageUrl(path){
 if(!path||!menu?.src)return '';
 return menu.src+'/'+String(path).split('/').map(encodeURIComponent).join('/');
}

function parseConfiguredSchedules(value){
 const lines=String(value||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(!lines.length)return [];
 const dayMap=new Map(serviceDayLabels.map((label,index)=>[label,String(index)]));
 const schedules=[];
 for(const line of lines){
  const timeMarker=' • Horário: ',addressMarker=' • Endereço: ';
  const timeAt=line.indexOf(timeMarker),addressAt=line.indexOf(addressMarker,timeAt+timeMarker.length);
  if(!line.startsWith('Dias: ')||timeAt<0||addressAt<0)return [];
  const labels=line.slice(6,timeAt).split(', ').map(label=>label.trim());
  const days=labels.map(label=>dayMap.get(label));
  const times=/^([0-2]\d:[0-5]\d) às ([0-2]\d:[0-5]\d)$/.exec(line.slice(timeAt+timeMarker.length,addressAt));
  const address=line.slice(addressAt+addressMarker.length).trim();
  if(!labels.length||days.some(day=>day===undefined)||!times||!address)return [];
  const openHour=Number(times[1].slice(0,2)),closeHour=Number(times[2].slice(0,2));
  if(openHour>23||closeHour>23||times[1]===times[2])return [];
  schedules.push({address,days:[...new Set(days)],open:times[1],close:times[2]});
 }
 return schedules;
}
function scheduleDayText(schedule){
 return schedule.days.map(day=>serviceDayLabels[Number(day)]).filter(Boolean).join(', ');
}
function timeToMinutes(value){
 const parts=String(value||'').split(':').map(Number);
 return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:NaN;
}
function brazilClock(){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(new Date()).map(part=>[part.type,part.value]));
 const weekday={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[parts.weekday];
 if(weekday===undefined)return null;
 return {weekday,minutes:Number(parts.hour)*60+Number(parts.minute)};
}
function scheduleIsOpen(schedule,clock){
 if(!clock)return false;
 const open=timeToMinutes(schedule.open),close=timeToMinutes(schedule.close);
 const days=new Set(schedule.days.map(Number));
 if(!Number.isFinite(open)||!Number.isFinite(close)||open===close)return false;
 if(close>open)return days.has(clock.weekday)&&clock.minutes>=open&&clock.minutes<close;
 const previousDay=(clock.weekday+6)%7;
 return (days.has(clock.weekday)&&clock.minutes>=open)||(days.has(previousDay)&&clock.minutes<close);
}
function menuScheduleIsOpen(){
 const schedules=parseConfiguredSchedules(menu?.opening_hours);
 return !schedules.length||schedules.some(schedule=>scheduleIsOpen(schedule,brazilClock()));
}
function refreshMenuAvailability(){
 const overlay=$('closedOverlay');
 if(!overlay||!menu)return;
 const schedules=parseConfiguredSchedules(menu.opening_hours);
 const closed=schedules.length>0&&!schedules.some(schedule=>scheduleIsOpen(schedule,brazilClock()));
 const wasClosed=!overlay.classList.contains('hidden');
 if(closed){
  $('closedScheduleList').innerHTML=schedules.map(schedule=>
   '<li><strong>'+esc(schedule.address)+'</strong><span>Dias: '+esc(scheduleDayText(schedule))+'</span><span>Horário: '+esc(schedule.open)+' às '+esc(schedule.close)+'</span></li>'
  ).join('');
  if(!wasClosed&&!$('cartPanel').classList.contains('hidden'))closeCart();
 }
 overlay.classList.toggle('hidden',!closed);
 document.body.classList.toggle('menu-closed',closed);
 for(const id of ['menuTop','menuShell','bottomCart','cartPanel','cartBackdrop']){
  const element=$(id);
  if(element)element.inert=closed;
 }
 if(closed&&!wasClosed)$('closedTitle').focus({preventScroll:true});
 renderCart();
}

function categoryGroups(data){
 const groups=new Map();
 for(const c of data.categories||[]){
  const name=String(c?.name||'').trim();
  if(name&&!groups.has(name.toLocaleLowerCase('pt-BR')))groups.set(name.toLocaleLowerCase('pt-BR'),{name,items:[]});
 }
 for(const p of data.items||[]){
  const name=String(p.category||'Geral').trim()||'Geral';
  const key=name.toLocaleLowerCase('pt-BR');
  if(!groups.has(key))groups.set(key,{name,items:[]});
  groups.get(key).items.push(p);
 }
 return [...groups.values()];
}
function productCard(item){
 const image=item.image_path?'<img src="'+esc(imageUrl(item.image_path))+'" loading="lazy" alt="'+esc(item.name)+'">':'<div class="product-image-placeholder" aria-hidden="true">🍽️</div>';
 return '<article class="product">'+image+'<div class="product-copy"><h3>'+esc(item.name)+'</h3>'+
  (item.description?'<p>'+esc(item.description)+'</p>':'')+
  '<div class="product-bottom"><strong>'+money(item.price)+'</strong>'+
  '<button type="button" class="add-button" data-add="'+esc(item.id)+'" aria-label="Adicionar '+esc(item.name)+'">+</button>'+
  '</div></div></article>';
}
function renderCatalog(){
 const groups=categoryGroups(menu);
 const query=String($('menuSearch')?.value||'').trim().toLocaleLowerCase('pt-BR');
 const names=['Todos',...groups.map(g=>g.name)];
 $('categoryChips').innerHTML=names.map(name=>'<button type="button" class="category-chip'+(name===activeCategory?' active':'')+'" data-category="'+esc(name)+'">'+esc(name)+'</button>').join('');
 const filtered=groups.filter(g=>(activeCategory==='Todos'||g.name===activeCategory)&&g.items.some(item=>!query||(String(item.name||'')+' '+String(item.description||'')+' '+String(item.category||'')).toLocaleLowerCase('pt-BR').includes(query)));
 $('categories').innerHTML=filtered.map(group=>'<section class="category"><h2 class="category-title">'+esc(group.name)+'</h2><div class="category-items">'+group.items.filter(item=>!query||(String(item.name||'')+' '+String(item.description||'')+' '+String(item.category||'')).toLocaleLowerCase('pt-BR').includes(query)).map(productCard).join('')+'</div></section>').join('')||'<p class="empty">Nenhum produto encontrado.</p>';
}
function normalizeWhatsApp(v){
 let number=String(v||'').replace(/\D/g,'');
 if(/^\d{10,11}$/.test(number))number='55'+number;
 return /^55\d{10,11}$/.test(number)?number:'';
}
function totalItems(){return [...cart.values()].reduce((total,qty)=>total+qty,0)}
function subtotal(){return [...cart].reduce((total,[id,qty])=>{
 const item=menu?.items?.find(p=>p.id===id);
 return total+(item?Number(item.price)*qty:0);
},0)}
function deliveryFeeToAgree(){return menu?.delivery_fee_mode_homologation==='to_agree'}
function configuredDeliveryFee(){return Number(menu?.delivery_fee_homologation??menu?.delivery_fee??0)}
function deliveryCost(){return $('shippingMode').value==='delivery'&&!deliveryFeeToAgree()?configuredDeliveryFee():0}
function render(){
 if(/^#[0-9a-fA-F]{6}$/.test(String(menu.brand_color||''))){
  document.documentElement.style.setProperty('--purple',menu.brand_color);
  document.documentElement.style.setProperty('--violet',menu.brand_color);
 }
 $('store').textContent=menu.name;
 document.title='CARDÁPIO ('+menu.name+')';
 const schedules=parseConfiguredSchedules(menu.opening_hours);
 $('hours').textContent=schedules.length?
  schedules.map(schedule=>scheduleDayText(schedule)+' • '+schedule.open+' às '+schedule.close).join('\n'):
  (menu.opening_hours||'Consulte a loja');
 const serviceAddresses=[...new Set(schedules.map(schedule=>schedule.address))];
 const primaryLocation=serviceAddresses[0]||menu.location||'';
 $('locationText').textContent=serviceAddresses.length?serviceAddresses.join('\n'):(menu.location||'Não informada');
 const locationLink=$('locationLink');
 if(primaryLocation){
  locationLink.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(primaryLocation);
  locationLink.classList.remove('hidden');
 }else locationLink.classList.add('hidden');
 const paymentSelect=$('paymentMethod');
 const availablePayments=(menu.payment_methods||[]).filter(p=>Object.hasOwn(paymentLabels,p));
 paymentSelect.innerHTML='<option value="a_combinar">A combinar com a loja</option>'+
  availablePayments.map(p=>'<option value="'+esc(p)+'">'+esc(paymentLabels[p])+'</option>').join('');
 const payments=availablePayments.map(p=>paymentLabels[p]);
 $('paymentMethods').textContent=payments.length?payments.join(', '):'A combinar com a loja';
 const showDeliveryFee=Number(menu.delivery_fee_homologation??menu.delivery_fee??0);
 $('deliveryFee').textContent=deliveryFeeToAgree()?'A combinar com a loja':showDeliveryFee>0?money(showDeliveryFee):'Grátis';
 const logo=menu.logo_path?imageUrl(menu.logo_path):'';
 $('brandMark').innerHTML=logo?'<img src="'+esc(logo)+'" alt="Logo da loja '+esc(menu.name)+'">':
   '<img src="/bipstart-logo.svg" alt="Logo BipStart">';
 const first=(menu.items||[]).find(p=>p.image_path)?.image_path;
 if(first)$('coverPicture').style.backgroundImage='url("'+imageUrl(first).replace(/["\\()]/g,'')+'")';
 renderCatalog();
 refreshMenuAvailability();
}
function renderCart(){
 const qty=totalItems(),sub=subtotal(),fee=deliveryCost();
 $('cartBadge').textContent=String(qty);
 $('barCount').textContent=String(qty);
 $('barTotal').textContent=money(sub);
 $('subtotal').textContent=money(sub);
 const deliveryToAgree=$('shippingMode').value==='delivery'&&deliveryFeeToAgree();
 $('deliveryTotal').textContent=deliveryToAgree?'A combinar':money(fee);
 $('deliveryFeeNote').classList.toggle('hidden',!deliveryToAgree);
 $('grandTotal').textContent=money(sub+fee);
 $('finishOrder').disabled=qty===0||!menuScheduleIsOpen();
 $('deliveryLine').classList.toggle('hidden',$('shippingMode').value!=='delivery');
 $('addressField').classList.toggle('hidden',$('shippingMode').value!=='delivery');
 $('cartLines').innerHTML=qty?[...cart].map(([id,count])=>{
  const item=(menu.items||[]).find(p=>p.id===id);
  if(!item)return '';
  return '<div class="cart-line" data-product="'+esc(id)+'">'+
   '<strong>'+esc(item.name)+'</strong><small>'+money(item.price)+' cada</small>'+
   '<div class="cart-line-actions"><div class="qty">'+
   '<button type="button" data-dec="'+esc(id)+'" aria-label="Diminuir '+esc(item.name)+'">−</button>'+
   '<span>'+count+'</span>'+
   '<button type="button" data-inc="'+esc(id)+'" aria-label="Aumentar '+esc(item.name)+'">+</button></div>'+
   '<strong>'+money(count*Number(item.price))+'</strong></div></div>';
 }).join(''):'<p class="empty">Seu carrinho está vazio. Adicione produtos de uma categoria.</p>';
}
function openCart(){
 if(!menuScheduleIsOpen()){refreshMenuAvailability();return;}
 $('cartBackdrop').classList.remove('hidden');
 $('cartPanel').classList.remove('hidden');
 $('cartClose').focus();
}
function closeCart(){
 $('cartBackdrop').classList.add('hidden');
 $('cartPanel').classList.add('hidden');
 $('cartOpen').focus();
}
function checkoutMessage(orderId,trackingUrl,orderNumber){
 const mode=$('shippingMode').value,delivery=mode==='delivery';
 const address=$('deliveryAddress').value.trim(),name=$('customerName').value.trim();
 const phone=$('customerPhone').value.trim(),notes=$('orderNotes').value.trim();
 if(!totalItems())throw Error('Adicione ao menos um item ao pedido.');
 if(name.length<2)throw Error('Informe seu nome.');
 if(phone.replace(/\\D/g,'').length<10)throw Error('Informe um telefone válido com DDD.');
 if(delivery&&address.length<8)throw Error('Informe seu endereço completo de entrega.');
 const sequence=Number(orderNumber);
 const orderReference=orderNumber!==null&&orderNumber!==undefined&&Number.isSafeInteger(sequence)&&sequence>=0?String(sequence).padStart(3,'0'):String(orderId).slice(0,8);
 const lines=['Olá! Enviei um pedido pelo CARDÁPIO ('+menu.name+').','Pedido #'+orderReference,'Cliente: '+name,'Telefone: '+phone,''];
 for(const [id,qty] of cart){
  const p=(menu.items||[]).find(x=>x.id===id);
  if(p)lines.push(qty+'x '+p.name+' — '+money(Number(p.price)*qty));
 }
 lines.push('','Subtotal: '+money(subtotal()));
 lines.push('Recebimento: '+(delivery?'Entrega':'Retirada'));
 if(delivery){lines.push('Taxa de entrega: '+(deliveryFeeToAgree()?'A combinar com a loja':money(deliveryCost())));lines.push('Endereço: '+address)}
 lines.push('Pagamento: '+(paymentLabels[$('paymentMethod').value]||'A combinar'));
 lines.push('Total: '+money(subtotal()+deliveryCost())+(delivery&&deliveryFeeToAgree()?' — taxa de entrega a combinar com a loja':''));
 if(notes)lines.push('Observações: '+notes);
 lines.push('Acompanhe o status do pedido: '+trackingUrl);
 return lines.join('\\n');
}
async function placeOnlineOrder(){
 if(!menuScheduleIsOpen()){refreshMenuAvailability();throw Error('ATENDIMENTO NÃO DISPONÍVEL. Confira os dias e horários informados pela loja.');}
 const slug=new URLSearchParams(location.search).get('loja')||'';
 const name=$('customerName').value.trim(),phone=$('customerPhone').value.trim();
 const mode=$('shippingMode').value,address=$('deliveryAddress').value.trim();
 const notes=$('orderNotes').value.trim(),payment=$('paymentMethod').value;
 if(!totalItems())throw Error('Adicione ao menos um item ao pedido.');
 if(name.length<2)throw Error('Informe seu nome.');
 if(phone.replace(/\\D/g,'').length<10)throw Error('Informe um telefone válido com DDD.');
 if(mode==='delivery'&&address.length<8)throw Error('Informe seu endereço completo de entrega.');
 const token=crypto.randomUUID();
 const items=[...cart].map(([id,qty])=>({id,qty}));
 const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/bipstart_place_online_order_homologation',{
  method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
  body:JSON.stringify({p_slug:slug,p_client_token:token,p_name:name,p_phone:phone,p_delivery_method:mode,p_address:address,p_payment_method:payment,p_notes:notes,p_items:items})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.id)throw Error(result?.message||result?.details||result?.hint||'Não foi possível registrar o pedido. Confira os dados e tente novamente.');
 const trackingUrl=location.origin+'/acompanhar#pedido='+encodeURIComponent(result.id)+'&chave='+encodeURIComponent(token);
 let orderNumber=result.order_number??null;
 if(orderNumber===null){
  try{
   const trackedResponse=await fetch(config.supabaseUrl+'/rest/v1/rpc/bipstart_track_online_order',{
    method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({p_order_id:result.id,p_client_token:token}),cache:'no-store'
   });
   if(trackedResponse.ok){const trackedOrder=await trackedResponse.json();orderNumber=trackedOrder?.order_number??null;}
  }catch{}
 }
 return {id:result.id,orderNumber,trackingUrl};
}
$('menuSearch').addEventListener('input',renderCatalog);
$('categoryChips').addEventListener('click',event=>{
 const button=event.target.closest('[data-category]');
 if(!button)return;
 activeCategory=button.dataset.category;
 renderCatalog();
});
document.addEventListener('click',event=>{
 const add=event.target.closest('[data-add]');
 const inc=event.target.closest('[data-inc]');
 const dec=event.target.closest('[data-dec]');
 if(add||inc||dec){
  if(!menuScheduleIsOpen()){refreshMenuAvailability();return;}
  const id=(add||inc||dec).dataset.add||(add||inc||dec).dataset.inc||(add||inc||dec).dataset.dec;
  const item=(menu?.items||[]).find(p=>p.id===id);
  if(!item)return;
  const next=(cart.get(id)||0)+(dec?-1:1);
  if(next<=0)cart.delete(id);else if(next<=99)cart.set(id,next);
  renderCart();return;
 }
});
$('categories').addEventListener('toggle',event=>{
 if(event.target.tagName==='DETAILS'&&event.target.open){
  for(const section of $('categories').querySelectorAll('details'))if(section!==event.target)section.open=false;
 }
},true);
$('shippingMode').addEventListener('change',renderCart);
$('cartOpen').addEventListener('click',openCart);
$('showCart').addEventListener('click',openCart);
$('cartClose').addEventListener('click',closeCart);
$('cartBackdrop').addEventListener('click',closeCart);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('cartPanel').classList.contains('hidden'))closeCart()});
$('finishOrder').addEventListener('click',async()=>{
 const button=$('finishOrder');let whatsappWindow=null;
 try{
  const number=normalizeWhatsApp(menu?.whatsapp);
  if(!number)throw Error('Esta loja ainda não cadastrou um WhatsApp comercial.');
  if(!config?.enabled)throw Error('O sistema de pedidos está indisponível no momento.');
  button.disabled=true;button.textContent='REGISTRANDO PEDIDO…';
  whatsappWindow=window.open('about:blank','_blank');
  const order=await placeOnlineOrder();
  const whatsappUrl='https://wa.me/'+number+'?text='+encodeURIComponent(checkoutMessage(order.id,order.trackingUrl,order.orderNumber));
  if(whatsappWindow)whatsappWindow.location.href=whatsappUrl;else window.location.href=whatsappUrl;
 }catch(e){
  if(whatsappWindow)whatsappWindow.close();
  showErr(e.message);closeCart();window.scrollTo({top:0,behavior:'smooth'});
 }finally{button.disabled=totalItems()===0;button.textContent='ENVIAR PEDIDO ↗';}
});
async function boot(){
 try{
  const slug=new URLSearchParams(location.search).get('loja')||'';
  if(!/^[a-z0-9-]{3,60}$/.test(slug))throw Error('Endereço da loja inválido.');
  const cfg=await fetch('/api/public-config').then(r=>r.json());
  if(!cfg.enabled)throw Error('Cardápios em preparação.');
  config=cfg;
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/bipstart_public_menu',{
   method:'POST',
   headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},
   body:JSON.stringify({p_slug:slug})
  });
  if(!r.ok)throw Error('Não foi possível carregar este cardápio.');
  menu=await r.json();
  if(!menu)throw Error('Cardápio não encontrado ou indisponível.');
  menu.src=cfg.supabaseUrl+'/storage/v1/object/public/bipstart-images';
  render();
  if(availabilityTimer)clearInterval(availabilityTimer);
  availabilityTimer=setInterval(refreshMenuAvailability,30000);
 }catch(e){$('store').textContent='Cardápio indisponível';showErr(e.message)}
}
boot();

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshMenuAvailability()});
