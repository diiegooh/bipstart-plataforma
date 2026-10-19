'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const paymentLabels={pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito',dinheiro:'Dinheiro'};
let menu=null,cart=new Map(),config=null;
function showErr(text){$('error').classList.remove('hidden');$('error').textContent=String(text)}
function imageUrl(path){
 if(!path||!menu?.src)return '';
 return menu.src+'/'+String(path).split('/').map(encodeURIComponent).join('/');
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
 const image=item.image_path?'<img src="'+esc(imageUrl(item.image_path))+'" loading="lazy" alt="'+esc(item.name)+'">':'';
 return '<article class="product">'+image+'<div class="product-copy"><h3>'+esc(item.name)+'</h3>'+
  (item.description?'<p>'+esc(item.description)+'</p>':'')+
  '<div class="product-bottom"><strong>'+money(item.price)+'</strong>'+
  '<button type="button" class="add-button" data-add="'+esc(item.id)+'" aria-label="Adicionar '+esc(item.name)+'">+ Adicionar</button>'+
  '</div></div></article>';
}
function categoryCard(category){
 return '<details class="category"><summary><span>'+esc(category.name)+
  ' <span class="category-hint">('+category.items.length+')</span></span>'+
  '<span class="chevron" aria-hidden="true">⌄</span></summary>'+
  '<div class="category-items">'+(category.items.length?category.items.map(productCard).join(''):'<p class="empty">Nenhum produto cadastrado nesta categoria.</p>')+
  '</div></details>';
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
function deliveryCost(){return $('shippingMode').value==='delivery'?Number(menu?.delivery_fee||0):0}
function render(){
 if(/^#[0-9a-fA-F]{6}$/.test(String(menu.brand_color||''))){
  document.documentElement.style.setProperty('--purple',menu.brand_color);
  document.documentElement.style.setProperty('--violet',menu.brand_color);
 }
 $('store').textContent=menu.name;
 document.title='CARDÁPIO ('+menu.name+')';
 $('hours').textContent=menu.opening_hours||'Consulte a loja';
 $('locationText').textContent=menu.location||'Não informada';
 const locationLink=$('locationLink');
 if(menu.location){
  locationLink.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(menu.location);
  locationLink.classList.remove('hidden');
 }else locationLink.classList.add('hidden');
 const paymentSelect=$('paymentMethod');
 const availablePayments=(menu.payment_methods||[]).filter(p=>Object.hasOwn(paymentLabels,p));
 paymentSelect.innerHTML='<option value="a_combinar">A combinar com a loja</option>'+
  availablePayments.map(p=>'<option value="'+esc(p)+'">'+esc(paymentLabels[p])+'</option>').join('');
 const payments=availablePayments.map(p=>paymentLabels[p]);
 $('paymentMethods').textContent=payments.length?payments.join(', '):'A combinar com a loja';
 $('deliveryFee').textContent=Number(menu.delivery_fee)>0?money(menu.delivery_fee):'Grátis / a combinar';
 const logo=menu.logo_path?imageUrl(menu.logo_path):'';
 $('brandMark').innerHTML=logo?'<img src="'+esc(logo)+'" alt="Logo da loja '+esc(menu.name)+'">':
   '<img src="/bipstart-logo.svg" alt="Logo BipStart">';
 const first=(menu.items||[]).find(p=>p.image_path)?.image_path;
 if(first)$('coverPicture').style.backgroundImage='url("'+imageUrl(first).replace(/["\\()]/g,'')+'")';
 $('categories').innerHTML=categoryGroups(menu).map(categoryCard).join('')||'<p class="empty">Este estabelecimento ainda não cadastrou produtos.</p>';
 renderCart();
}
function renderCart(){
 const qty=totalItems(),sub=subtotal(),fee=deliveryCost();
 $('cartBadge').textContent=String(qty);
 $('barCount').textContent=String(qty);
 $('barTotal').textContent=money(sub);
 $('subtotal').textContent=money(sub);
 $('deliveryTotal').textContent=money(fee);
 $('grandTotal').textContent=money(sub+fee);
 $('finishOrder').disabled=qty===0;
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
 $('cartBackdrop').classList.remove('hidden');
 $('cartPanel').classList.remove('hidden');
 $('cartClose').focus();
}
function closeCart(){
 $('cartBackdrop').classList.add('hidden');
 $('cartPanel').classList.add('hidden');
 $('cartOpen').focus();
}
function checkoutMessage(orderId,trackingUrl){
 const mode=$('shippingMode').value,delivery=mode==='delivery';
 const address=$('deliveryAddress').value.trim(),name=$('customerName').value.trim();
 const phone=$('customerPhone').value.trim(),notes=$('orderNotes').value.trim();
 if(!totalItems())throw Error('Adicione ao menos um item ao pedido.');
 if(name.length<2)throw Error('Informe seu nome.');
 if(phone.replace(/\\D/g,'').length<10)throw Error('Informe um telefone válido com DDD.');
 if(delivery&&address.length<8)throw Error('Informe seu endereço completo de entrega.');
 const lines=['Olá! Enviei um pedido pelo CARDÁPIO ('+menu.name+').','Pedido #'+String(orderId).slice(0,8),'Cliente: '+name,'Telefone: '+phone,''];
 for(const [id,qty] of cart){
  const p=(menu.items||[]).find(x=>x.id===id);
  if(p)lines.push(qty+'x '+p.name+' — '+money(Number(p.price)*qty));
 }
 lines.push('','Subtotal: '+money(subtotal()));
 lines.push('Recebimento: '+(delivery?'Entrega':'Retirada'));
 if(delivery){lines.push('Taxa de entrega: '+money(deliveryCost()));lines.push('Endereço: '+address)}
 lines.push('Pagamento: '+(paymentLabels[$('paymentMethod').value]||'A combinar'));
 lines.push('Total: '+money(subtotal()+deliveryCost()));
 if(notes)lines.push('Observações: '+notes);
 lines.push('Acompanhe o status do pedido: '+trackingUrl);
 return lines.join('\\n');
}
async function placeOnlineOrder(){
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
 const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/bipstart_place_online_order',{
  method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
  body:JSON.stringify({p_slug:slug,p_client_token:token,p_name:name,p_phone:phone,p_delivery_method:mode,p_address:address,p_payment_method:payment,p_notes:notes,p_items:items})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.id)throw Error(result?.message||result?.details||result?.hint||'Não foi possível registrar o pedido. Confira os dados e tente novamente.');
 const trackingUrl=location.origin+'/acompanhar#pedido='+encodeURIComponent(result.id)+'&chave='+encodeURIComponent(token);
 return {id:result.id,trackingUrl};
}
document.addEventListener('click',event=>{
 const add=event.target.closest('[data-add]');
 const inc=event.target.closest('[data-inc]');
 const dec=event.target.closest('[data-dec]');
 if(add||inc||dec){
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
  const whatsappUrl='https://wa.me/'+number+'?text='+encodeURIComponent(checkoutMessage(order.id,order.trackingUrl));
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
 }catch(e){$('store').textContent='Cardápio indisponível';showErr(e.message)}
}
boot();
