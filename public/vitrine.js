'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const paymentLabels={pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito',dinheiro:'Dinheiro',a_combinar:'A combinar'};
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
let menu=null,products=[],cart=new Map(),selectedQty=new Map(),lastFocus=null,publicConfig=null,orderToken=null,registeredOrderId=null;
function showErr(text){$('error').textContent=String(text);$('error').classList.remove('hidden');}
function imageUrl(path){
 if(!path||!menu?.src)return '';
 return menu.src+'/'+String(path).split('/').map(encodeURIComponent).join('/');
}
function normalizeWhatsApp(value){
 let digits=String(value||'').replace(/\D/g,'');
 if(/^\d{10,11}$/.test(digits))digits='55'+digits;
 return /^55\d{10,11}$/.test(digits)?digits:'';
}
function categoryNames(){
 const names=new Map();
 for(const item of menu?.categories||[]){
  const name=String(item?.name||'').trim();
  if(name&&!names.has(fold(name)))names.set(fold(name),name);
 }
 for(const item of products){
  const name=String(item.category||'Geral').trim()||'Geral';
  if(!names.has(fold(name)))names.set(fold(name),name);
 }
 return [...names.values()];
}
function categoryEmoji(value){
 const text=fold(value);
 if(/bebida|refrigerante|suco|agua|cerveja/.test(text))return '🥤';
 if(/pizza|lanche|hamburg/.test(text))return '🍔';
 if(/salgad|coxinha|pasteis/.test(text))return '🥟';
 if(/doce|sobremesa|bolo/.test(text))return '🍰';
 if(/combo|promocao/.test(text))return '🎁';
 if(/mercado|mercearia|mantimento/.test(text))return '🛍️';
 return '▣';
}
function categoryArtwork(name){
 // Prioriza uma foto real cadastrada nesta categoria; mantém o ícone se não houver foto.
 const photo=products.find(item=>fold(item.category||'Geral')===fold(name)&&item.image_path);
 if(photo)return '<span class="category-art category-art-photo" aria-hidden="true"><img src="'+esc(imageUrl(photo.image_path))+'" alt="" loading="lazy" decoding="async"></span>';
 return '<span class="category-art category-art-emoji" aria-hidden="true">'+categoryEmoji(name)+'</span>';
}
function applyBrand(){
 const color=String(menu.brand_color||'').trim();
 if(/^#[0-9a-fA-F]{6}$/.test(color)){
  document.documentElement.style.setProperty('--green',color);
  document.documentElement.style.setProperty('--green2',color);
  const parts=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
  const luminance=parts.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
  document.documentElement.style.setProperty('--theme-ink',luminance>.35?'#0a0d0b':'#ffffff');
 }
}
function drawPage(){
 applyBrand();
 document.title=menu.name+' • Cardápio digital';
 $('storeName').textContent=menu.name;
 $('storeLocation').textContent=menu.location||'Localização a combinar';
 $('openingHours').textContent=menu.opening_hours||'Consulte a loja';
 $('cartStore').textContent=menu.name.toLocaleUpperCase('pt-BR');
 const link=$('locationLink');
 if(menu.location){
  link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(menu.location);
  link.classList.remove('hidden');
 }else link.classList.add('hidden');
 const pay=(menu.payment_methods||[]).filter(x=>Object.hasOwn(paymentLabels,x)).map(x=>paymentLabels[x]);
 if(pay.length){
  $('pay').innerHTML='<option value="a_combinar">A combinar</option>'+Object.entries(paymentLabels).filter(([key])=>key!=='a_combinar'&&(menu.payment_methods||[]).includes(key)).map(([key,label])=>'<option value="'+key+'">'+esc(label)+'</option>').join('');
 }
 const categories=categoryNames();
 $('category').innerHTML='<option value="">Todas as categorias</option>'+categories.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
 $('quickCategories').innerHTML=categories.map(name=>'<button type="button" class="category-tile" data-cat="'+esc(name)+'">'+categoryArtwork(name)+'<b>'+esc(name)+'</b></button>').join('');
 const combos=categories.find(name=>/combo/i.test(fold(name)));
 $('comboBanner').classList.toggle('hidden',!combos);
 $('seeCombos').dataset.category=combos||'';
 renderProducts();
 renderCart();
}
function itemCard(item){
 const soldOut=item.in_stock===false;
 const qty=selectedQty.get(item.id)||1;
 const image=item.image_path?'<img src="'+esc(imageUrl(item.image_path))+'" alt="'+esc(item.name)+'" loading="lazy">':'<div class="product-img-placeholder" aria-hidden="true">🛍️</div>';
 return '<article class="dproduct">'+image+'<div class="body"><span class="pill">'+esc(item.category||'Produto')+'</span>'+
  '<h3>'+esc(item.name)+'</h3>'+(item.description?'<p class="description">'+esc(item.description)+'</p>':'')+
  '<div class="price">'+money(item.price)+' <small>/ unidade</small></div>'+
  (soldOut?'<span class="stock-notice" role="status">Produto esgotado</span>':'')+
  '<div class="product-quantity"><span>Quantidade</span><div class="product-quantity-buttons">'+
   '<button type="button" class="quantity-step" data-card-dec="'+esc(item.id)+'" aria-label="Diminuir quantidade de '+esc(item.name)+'"'+(soldOut||qty<=1?' disabled':'')+'>−</button>'+
   '<strong data-card-qty="'+esc(item.id)+'" aria-live="polite">'+qty+'</strong>'+
   '<button type="button" class="quantity-step" data-card-inc="'+esc(item.id)+'" aria-label="Aumentar quantidade de '+esc(item.name)+'"'+(soldOut||qty>=99?' disabled':'')+'>+</button></div></div>'+
  '<div class="card-item-total">Total: <strong data-card-total="'+esc(item.id)+'">'+money(Number(item.price)*qty)+'</strong></div>'+
  '<button type="button" class="btn add" data-add="'+esc(item.id)+'"'+(soldOut?' disabled aria-disabled="true"':'')+'>'+(soldOut?'Esgotado':'🛒 Adicionar ao pedido')+'</button>'+
  '<small class="card-feedback" data-card-feedback="'+esc(item.id)+'" role="status" aria-live="polite"></small></div></article>';
}
function renderProducts(){
 if(!menu)return;
 const query=fold($('search').value.trim()),category=fold($('category').value);
 const visible=products.filter(item=>(!query||fold(item.name).includes(query)||fold(item.category).includes(query))&&(!category||fold(item.category||'Geral')===category));
 $('catalog').innerHTML=visible.length?visible.map(itemCard).join(''):'<p class="summary catalog-empty">Nenhum produto encontrado nesta categoria.</p>';
 for(const btn of document.querySelectorAll('[data-cat]'))btn.classList.toggle('active',fold(btn.dataset.cat)===category&&!!category);
}
function subtotal(){
 return [...cart.entries()].reduce((total,[id,qty])=>{
  const item=products.find(p=>p.id===id);
  return total+(item?Number(item.price)*qty:0);
 },0);
}
function deliveryCost(){return $('shipping').value==='delivery'?Number(menu?.delivery_fee||0):0;}
function renderCart(){
 let count=0;
 const lines=[];
 for(const [id,qty] of cart){
  const item=products.find(x=>x.id===id);
  if(!item)continue;
  count+=qty;
  lines.push('<div class="cartline"><div><b>'+esc(item.name)+'</b><div class="muted">'+qty+' × '+money(item.price)+'</div></div>'+
   '<div class="qty-group"><button type="button" class="btn alt" data-dec="'+esc(id)+'" aria-label="Diminuir '+esc(item.name)+'">−</button>'+
   '<strong>'+qty+'</strong><button type="button" class="btn alt" data-inc="'+esc(id)+'"'+(item.in_stock===false?' disabled aria-disabled="true"':'')+' aria-label="Aumentar '+esc(item.name)+'">+</button></div></div>');
 }
 $('cartItems').innerHTML=lines.join('')||'<p class="muted">Seu carrinho está vazio.</p>';
 $('headerCartCount').textContent=String(count);
 $('cartCount').textContent=String(count);
 $('cartSubtotal').textContent=money(subtotal());
 $('deliveryTotal').textContent=money(deliveryCost());
 $('cartTotal').textContent=money(subtotal()+deliveryCost());
 $('deliveryLine').classList.toggle('hidden',$('shipping').value!=='delivery');
 $('addressField').classList.toggle('hidden',$('shipping').value!=='delivery');
 $('sendOrder').disabled=!count;
 if(!orderToken){$('trackingReady').classList.add('hidden');$('sendOrder').classList.remove('hidden');}
}
function openCart(){
 lastFocus=document.activeElement;
 $('cartDrawer').classList.add('show');
 $('cartDrawer').setAttribute('aria-hidden','false');
 $('cartBackdrop').classList.remove('hidden');
 document.body.style.overflow='hidden';
 $('closeCart').focus();
}
function closeCart(){
 $('cartDrawer').classList.remove('show');
 $('cartDrawer').setAttribute('aria-hidden','true');
 $('cartBackdrop').classList.add('hidden');
 document.body.style.overflow='';
 if(lastFocus?.isConnected)lastFocus.focus();
}
function goToCatalogue(){
 document.getElementById('catalogue').scrollIntoView({behavior:'smooth',block:'start'});
}
function filterCategory(name){
 $('category').value=name||'';
 renderProducts();
 goToCatalogue();
}
function checkoutMessage(orderId=''){
 for(const [id] of cart){
  const item=products.find(product=>product.id===id);
  if(!item||item.in_stock===false)throw Error('Um produto do pedido está esgotado. Revise o carrinho.');
 }
 if(!cart.size)throw Error('Adicione pelo menos um produto ao carrinho.');
 const delivery=$('shipping').value==='delivery';
 const address=$('address').value.trim();
 if(delivery&&address.length<8)throw Error('Informe o endereço completo para entrega.');
 const now=new Date();
 const orderNumber=orderId?' #'+String(orderId).slice(0,8):'';
 const row=(label,amount)=>label.padEnd(23,' ')+amount;
 const lines=[
  '=== '+String(menu.name||'LOJA').trim().toLocaleUpperCase('pt-BR')+' - PEDIDO'+orderNumber+' ===',
  'DATA: '+now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
  '',
  'CLIENTE: '+$('name').value.trim(),
  'TEL: '+String($('phone')?.value||'').replace(/\D/g,''),
  'TIPO: '+(delivery?'ENTREGA':'RETIRADA'),
  ''
 ];
 if(delivery)lines.push('END: '+address,'');
 for(const [id,qty] of cart){
  const item=products.find(product=>product.id===id);
  if(item){
   const description=qty+'x '+String(item.name).trim().toLocaleUpperCase('pt-BR');
   lines.push(row(description,money(Number(item.price)*qty)));
  }
 }
 lines.push('',
  row('SUBTOTAL',money(subtotal())),
  row('TAXA ENTREGA',money(deliveryCost())),
  row('TOTAL',money(subtotal()+deliveryCost())),
  'PAGTO: '+String(paymentLabels[$('pay').value]||'A combinar').toLocaleUpperCase('pt-BR')
 );
 const notes=$('notes').value.trim();
 if(notes)lines.push('','Obs: '+notes);
 // O WhatsApp preserva as colunas quando o texto é enviado em fonte monoespaçada.
 const message='```'+lines.join('\n')+'```';
 // Mantém o acompanhamento privado implementado no cardápio.
 return orderId&&orderToken?
  message+'\n\nACOMPANHE SEU PEDIDO: '+trackingLinkFor(orderId,orderToken):message;
}
document.addEventListener('click',event=>{
 const cardInc=event.target.closest('[data-card-inc]'),cardDec=event.target.closest('[data-card-dec]');
 if(cardInc||cardDec){
  const button=cardInc||cardDec;
  const id=button.dataset.cardInc||button.dataset.cardDec;
  const product=products.find(p=>p.id===id);
  if(!product||product.in_stock===false)return;
  const qty=Math.max(1,Math.min(99,(selectedQty.get(id)||1)+(cardInc?1:-1)));
  selectedQty.set(id,qty);
  const card=button.closest('.dproduct');
  card.querySelector('[data-card-qty]').textContent=String(qty);
  card.querySelector('[data-card-total]').textContent=money(Number(product.price)*qty);
  card.querySelector('[data-card-dec]').disabled=qty<=1;
  card.querySelector('[data-card-inc]').disabled=qty>=99;
  card.querySelector('[data-card-feedback]').textContent='';
  return;
 }
 const add=event.target.closest('[data-add]'),inc=event.target.closest('[data-inc]'),dec=event.target.closest('[data-dec]');
 if(add||inc||dec){
  const button=add||inc||dec;
  const id=button.dataset.add||button.dataset.inc||button.dataset.dec;
  const product=products.find(p=>p.id===id);
  if(!product||(product.in_stock===false&&!dec))return;
  const qty=add?(selectedQty.get(id)||1):1;
  const next=(cart.get(id)||0)+(dec?-1:qty);
  if(next>99){
   if(add)add.closest('.dproduct').querySelector('[data-card-feedback]').textContent='Limite de 99 unidades por produto no pedido.';
   return;
  }
  orderToken=null;
  registeredOrderId=null;
  if(next<=0)cart.delete(id);else cart.set(id,next);
  renderCart();
  if(add){
   add.closest('.dproduct').querySelector('[data-card-feedback]').textContent='✓ '+qty+' '+(qty===1?'unidade adicionada':'unidades adicionadas')+' ao pedido';
  }
  return;
 }
 const cat=event.target.closest('[data-cat]');
 if(cat)filterCategory(cat.dataset.cat);
});
$('search').addEventListener('input',renderProducts);
$('category').addEventListener('change',renderProducts);
$('shipping').addEventListener('change',renderCart);
$('openCart').addEventListener('click',openCart);
$('headerCart').addEventListener('click',openCart);
$('bottomOrders').addEventListener('click',openCart);
$('closeCart').addEventListener('click',closeCart);
$('cartBackdrop').addEventListener('click',closeCart);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('cartDrawer').classList.contains('show'))closeCart();});
$('focusSearch').addEventListener('click',()=>{goToCatalogue();$('search').focus({preventScroll:true});});
$('showAll').addEventListener('click',()=>{$('search').value='';filterCategory('');});
$('seeCombos').addEventListener('click',()=>filterCategory($('seeCombos').dataset.category));
$('jumpCategories').addEventListener('click',()=>document.getElementById('quickCategories').scrollIntoView({behavior:'smooth'}));
$('bottomCategories').addEventListener('click',()=>document.getElementById('quickCategories').scrollIntoView({behavior:'smooth'}));
$('bottomProducts').addEventListener('click',goToCatalogue);
$('bottomHome').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
// Confere preço/estoque no catálogo antes de registrar o pedido no banco.
// Pagamentos e envio efetivo dentro do WhatsApp seguem pendentes de confirmação.
async function checkAvailabilityBeforeCheckout(){
 if(!publicConfig||!menu?.slug)throw Error('Não foi possível conferir a disponibilidade.');
 const response=await fetch(publicConfig.supabaseUrl+'/rest/v1/rpc/bipstart_public_menu',{
  method:'POST',
  headers:{apikey:publicConfig.publishableKey,'Content-Type':'application/json'},
  body:JSON.stringify({p_slug:menu.slug}),
  cache:'no-store'
 });
 if(!response.ok)throw Error('Não foi possível atualizar o estoque. Tente novamente.');
 const updated=await response.json();
 if(!updated||!Array.isArray(updated.items))throw Error('O cardápio está temporariamente indisponível.');
 const items=new Map(updated.items.map(item=>[item.id,item]));
 const oldPrices=new Map(products.map(item=>[item.id,Number(item.price)]));
 let removed=false,priceChanged=false;
 for(const [id] of cart){
  const fresh=items.get(id);
  if(!fresh||fresh.in_stock===false){cart.delete(id);removed=true;continue;}
  if(Number(fresh.price)!==oldPrices.get(id))priceChanged=true;
 }
 products=updated.items;
 renderProducts();
 renderCart();
 if(removed)throw Error('Um produto esgotou e foi retirado do carrinho. Revise seu pedido.');
 if(priceChanged)throw Error('O preço de um produto mudou. Revise o total atualizado e envie novamente.');
}
async function registerOnlineOrder(){
 const name=$('name').value.trim();
 const phone=$('phone').value.replace(/\D/g,'');
 const method=$('shipping').value;
 const address=$('address').value.trim();
 if(name.length<2||name.length>120)throw Error('Informe seu nome completo para fazer o pedido.');
 if(phone.length<10||phone.length>13)throw Error('Informe um telefone com DDD válido.');
 if(method==='delivery'&&address.length<8)throw Error('Informe o endereço completo de entrega.');
 if(!orderToken)orderToken=crypto.randomUUID();
 const items=[...cart].map(([id,qty])=>({id,qty}));
 const r=await fetch(publicConfig.supabaseUrl+'/rest/v1/rpc/bipstart_place_online_order',{
  method:'POST',
  headers:{apikey:publicConfig.publishableKey,'Content-Type':'application/json'},
  body:JSON.stringify({
   p_slug:menu.slug,p_client_token:orderToken,p_name:name,p_phone:phone,
   p_delivery_method:method,p_address:address,p_payment_method:$('pay').value,
   p_notes:$('notes').value.trim(),p_items:items
  }),
  cache:'no-store'
 });
 const result=await r.json().catch(()=>null);
 if(!r.ok||!result?.id){
  throw Error(result?.message||result?.error||'Não foi possível registrar seu pedido. Tente novamente.');
 }
 // Não envie uma mensagem com valores divergentes dos que o servidor registrou.
 if(Math.abs(Number(result.total)-(subtotal()+deliveryCost()))>0.009)
  throw Error('O valor do pedido mudou. Atualize o cardápio e confira os preços.');
 return result;
}
function trackingLinkFor(orderId,token){
 // A chave fica no fragmento (#), fora da requisição HTTP e dos logs de acesso.
 return location.origin+'/acompanhar#pedido='+encodeURIComponent(orderId)+'&chave='+encodeURIComponent(token);
}
function showCheckoutNextStep(receipt){
 registeredOrderId=receipt.id;
 const link=trackingLinkFor(receipt.id,orderToken);
 const digits=normalizeWhatsApp(menu?.whatsapp);
 const url='https://wa.me/'+digits+'?text='+encodeURIComponent(checkoutMessage(receipt.id));
 $('trackingUrl').href=link;
 $('sendPreparedWhatsapp').href=url;
 $('trackingReady').classList.remove('hidden');
 $('sendOrder').classList.add('hidden');
 $('trackingCopyFeedback').textContent='O pedido só será comunicado à loja após confirmar a mensagem no WhatsApp.';
 $('trackingReady').scrollIntoView({block:'nearest',behavior:'smooth'});
}
// A autorização só é solicitada quando o cliente escolhe abrir o WhatsApp.
async function saveWhatsappUpdatesConsent(orderId,token){
 try{
  const response=await fetch(publicConfig.supabaseUrl+'/rest/v1/rpc/bipstart_set_online_order_whatsapp_optin',{
   method:'POST',
   headers:{apikey:publicConfig.publishableKey,'Content-Type':'application/json'},
   body:JSON.stringify({p_order_id:orderId,p_client_token:token,p_opt_in:true}),
   cache:'no-store',keepalive:true
  });
  if(!response.ok||await response.json().catch(()=>false)!==true)
   throw Error('Falha ao registrar autorização.');
 }catch{
  $('trackingCopyFeedback').textContent='O pedido ainda pode ser enviado. Não foi possível ativar os avisos automáticos deste pedido.';
 }
}
$('sendPreparedWhatsapp').addEventListener('click',()=>{
 // O clique abre o WhatsApp diretamente; o registro acontece em paralelo.
 if(registeredOrderId&&orderToken)void saveWhatsappUpdatesConsent(registeredOrderId,orderToken);
});
$('copyTrackingUrl').addEventListener('click',async()=>{
 try{
  const url=$('trackingUrl').href;
  if(!url.includes('/acompanhar#'))throw Error('Link indisponível.');
  await navigator.clipboard.writeText(url);
  $('trackingCopyFeedback').textContent='✓ Link copiado. Guarde para consultar seu pedido.';
 }catch{
  $('trackingCopyFeedback').textContent='Não foi possível copiar automaticamente. Abra o link para guardá-lo.';
 }
});
$('sendOrder').addEventListener('click',async()=>{
 const button=$('sendOrder');
 button.disabled=true;
 try{
  const digits=normalizeWhatsApp(menu?.whatsapp);
  if(!digits)throw Error('O estabelecimento ainda não configurou o WhatsApp comercial.');
  await checkAvailabilityBeforeCheckout();
  const receipt=await registerOnlineOrder();
  showCheckoutNextStep(receipt);
 }catch(error){showErr(error.message);closeCart();window.scrollTo({top:0,behavior:'smooth'});}
 finally{renderCart();}
});
// Exibe a área administrativa apenas se uma sessão autenticada consegue ler esta loja via RLS.
// A verificação nunca dá acesso por si: a página /cliente revalida o plano e as permissões.
async function revealOwnerNavigation(config,slug){
 try{
  const raw=localStorage.getItem('bipstart_customer_session');
  const saved=raw?JSON.parse(raw):null;
  if(!saved?.access_token||Number(saved.expires_at||0)<=(Date.now()/1000)+5)return;
  const url=new URL(config.supabaseUrl+'/rest/v1/shops');
  url.searchParams.set('select','slug');
  url.searchParams.set('slug','eq.'+slug);
  url.searchParams.set('limit','1');
  const response=await fetch(url,{headers:{apikey:config.publishableKey,Authorization:'Bearer '+saved.access_token},cache:'no-store'});
  if(!response.ok)return;
  const rows=await response.json();
  if(Array.isArray(rows)&&rows.some(row=>row.slug===slug))$('ownerNav').classList.remove('hidden');
 }catch{ /* A vitrine é pública e continua funcionando mesmo sem sessão de lojista. */ }
}
async function boot(){
 try{
  const slug=new URLSearchParams(location.search).get('loja')||'';
  if(!/^[a-z0-9-]{3,60}$/.test(slug))throw Error('Endereço do cardápio inválido.');
  const configResponse=await fetch('/api/public-config',{cache:'no-store'});
  if(!configResponse.ok)throw Error('Não foi possível consultar o cardápio.');
  const config=await configResponse.json();
  publicConfig=config;
  if(!config.enabled)throw Error('Cardápio digital em preparação.');
  const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/bipstart_public_menu',{
   method:'POST',
   headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
   body:JSON.stringify({p_slug:slug})
  });
  if(!response.ok)throw Error('Não foi possível carregar o cardápio deste estabelecimento.');
  menu=await response.json();
  if(!menu||typeof menu!=='object')throw Error('Cardápio não encontrado ou temporariamente indisponível.');
  products=Array.isArray(menu.items)?menu.items:[];
  menu.src=config.supabaseUrl+'/storage/v1/object/public/bipstart-images';
  drawPage();
  await revealOwnerNavigation(config,slug);
 }catch(error){
  $('storeName').textContent='Cardápio indisponível';
  $('catalog').innerHTML='<p class="summary catalog-empty">Não foi possível apresentar os produtos.</p>';
  showErr(error.message||'Falha ao carregar.');
 }
}
boot();
