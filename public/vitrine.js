'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const paymentLabels={pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito',dinheiro:'Dinheiro',a_combinar:'A combinar'};
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
let menu=null,products=[],cart=new Map(),lastFocus=null,publicConfig=null,orderToken=null;
function showErr(text){$('error').textContent=String(text);$('error').classList.remove('hidden');}
function imageUrl(path){
 if(!path||!menu?.src)return '';
 return menu.src+'/'+String(path).split('/').map(encodeURIComponent).join('/');
}
function logoUrl(){return menu?.logo_path?imageUrl(menu.logo_path):'/bipstart-logo.svg';}
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
 $('deliveryBadge').textContent=Number(menu.delivery_fee)>0?'Taxa '+money(menu.delivery_fee):'Entrega: grátis / a combinar';
 const pay=(menu.payment_methods||[]).filter(x=>Object.hasOwn(paymentLabels,x)).map(x=>paymentLabels[x]);
 $('paymentMethods').textContent=pay.length?pay.join(', '):'Consulte a loja';
 if(pay.length){
  $('pay').innerHTML='<option value="a_combinar">A combinar</option>'+Object.entries(paymentLabels).filter(([key])=>key!=='a_combinar'&&(menu.payment_methods||[]).includes(key)).map(([key,label])=>'<option value="'+key+'">'+esc(label)+'</option>').join('');
 }
 const categories=categoryNames();
 $('category').innerHTML='<option value="">Todas as categorias</option>'+categories.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
 $('quickCategories').innerHTML=categories.map(name=>'<button type="button" class="category-tile" data-cat="'+esc(name)+'"><span>'+categoryEmoji(name)+'</span><b>'+esc(name)+'</b><i>›</i></button>').join('');
 const combos=categories.find(name=>/combo/i.test(fold(name)));
 $('comboBanner').classList.toggle('hidden',!combos);
 $('seeCombos').dataset.category=combos||'';
 renderProducts();
 renderCart();
}
function itemCard(item){
 const soldOut=item.in_stock===false;
 const image=item.image_path?'<img src="'+esc(imageUrl(item.image_path))+'" alt="'+esc(item.name)+'" loading="lazy">':'<div class="product-img-placeholder" aria-hidden="true">🛍️</div>';
 return '<article class="dproduct">'+image+'<div class="body"><span class="pill">'+esc(item.category||'Produto')+'</span>'+
  '<h3>'+esc(item.name)+'</h3>'+(item.description?'<p class="description">'+esc(item.description)+'</p>':'')+
  '<div class="price">'+money(item.price)+'</div>'+
  (soldOut?'<span class="stock-notice" role="status">Produto esgotado</span>':'')+
  '<button type="button" class="btn add" data-add="'+esc(item.id)+'"'+(soldOut?' disabled aria-disabled="true"':'')+'>'+(soldOut?'Esgotado':'🛒 Adicionar')+'</button></div></article>';
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
 const lines=['Olá! Gostaria de fazer um pedido pelo cardápio '+menu.name+':',''];
 if(orderId)lines.push('Pedido BipStart: #'+String(orderId).slice(0,8),'');
 const name=$('name').value.trim();
 if(name)lines.push('Cliente: '+name,'');
 const phone=$('phone')?.value.trim();
 if(phone)lines.push('Telefone: '+phone);
 for(const [id,qty] of cart){
  const item=products.find(x=>x.id===id);
  if(item)lines.push(qty+'x '+item.name+' — '+money(Number(item.price)*qty));
 }
 lines.push('','Subtotal: '+money(subtotal()));
 lines.push('Recebimento: '+(delivery?'Entrega':'Retirada no estabelecimento'));
 if(delivery)lines.push('Taxa de entrega: '+money(deliveryCost()),'Endereço: '+address);
 lines.push('Total: '+money(subtotal()+deliveryCost()));
 lines.push('Forma de pagamento: '+(paymentLabels[$('pay').value]||'A combinar'));
 const notes=$('notes').value.trim();
 if(notes)lines.push('Observações: '+notes);
 lines.push('Por favor, confirme a disponibilidade e os detalhes do pagamento.');
 return lines.join('\n');
}
document.addEventListener('click',event=>{
 const add=event.target.closest('[data-add]'),inc=event.target.closest('[data-inc]'),dec=event.target.closest('[data-dec]');
 if(add||inc||dec){
  const button=add||inc||dec;
  const id=button.dataset.add||button.dataset.inc||button.dataset.dec;
  const product=products.find(p=>p.id===id);
  if(!product||(product.in_stock===false&&!dec))return;
  orderToken=null;
  const next=(cart.get(id)||0)+(dec?-1:1);
  if(next<=0)cart.delete(id);else if(next<=99)cart.set(id,next);
  renderCart();
  if(add)openCart();
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
$('sendOrder').addEventListener('click',async()=>{
 const button=$('sendOrder');
 button.disabled=true;
 try{
  const digits=normalizeWhatsApp(menu?.whatsapp);
  if(!digits)throw Error('O estabelecimento ainda não configurou o WhatsApp comercial.');
  await checkAvailabilityBeforeCheckout();
  const receipt=await registerOnlineOrder();
  const url='https://wa.me/'+digits+'?text='+encodeURIComponent(checkoutMessage(receipt.id));
  // O pedido foi registrado, mas apenas o cliente pode confirmar o envio pelo WhatsApp.
  location.assign(url);
 }catch(error){showErr(error.message);closeCart();window.scrollTo({top:0,behavior:'smooth'});}
 finally{renderCart();}
});
// Exibe a área administrativa apenas se uma sessão autenticada consegue ler esta loja via RLS.
// A verificação nunca dá acesso por si: a página /cliente revalida o plano e as permissões.
async function revealOwnerEditorLink(config,slug){
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
  if(Array.isArray(rows)&&rows.some(row=>row.slug===slug))$('ownerEditorLink').classList.remove('hidden');
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
  await revealOwnerEditorLink(config,slug);
 }catch(error){
  $('storeName').textContent='Cardápio indisponível';
  $('catalog').innerHTML='<p class="summary catalog-empty">Não foi possível apresentar os produtos.</p>';
  showErr(error.message||'Falha ao carregar.');
 }
}
boot();
