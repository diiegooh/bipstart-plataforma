'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const paymentLabels={pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito',dinheiro:'Dinheiro',a_combinar:'A combinar'};
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
let menu=null,products=[],cart=new Map(),lastFocus=null;
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
 const logo=logoUrl();
 $('headerLogo').src=logo;
 $('headerLogo').alt='Logotipo '+menu.name;
 $('heroLogo').src=logo;
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
 const image=item.image_path?'<img src="'+esc(imageUrl(item.image_path))+'" alt="'+esc(item.name)+'" loading="lazy">':'<div class="product-img-placeholder" aria-hidden="true">🛍️</div>';
 return '<article class="dproduct">'+image+'<div class="body"><span class="pill">'+esc(item.category||'Produto')+'</span>'+
  '<h3>'+esc(item.name)+'</h3>'+(item.description?'<p class="description">'+esc(item.description)+'</p>':'')+
  '<div class="price">'+money(item.price)+'</div>'+
  '<button type="button" class="btn add" data-add="'+esc(item.id)+'">🛒 Adicionar</button></div></article>';
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
   '<strong>'+qty+'</strong><button type="button" class="btn alt" data-inc="'+esc(id)+'" aria-label="Aumentar '+esc(item.name)+'">+</button></div></div>');
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
function checkoutMessage(){
 if(!cart.size)throw Error('Adicione pelo menos um produto ao carrinho.');
 const delivery=$('shipping').value==='delivery';
 const address=$('address').value.trim();
 if(delivery&&address.length<8)throw Error('Informe o endereço completo para entrega.');
 const lines=['Olá! Gostaria de fazer um pedido pelo cardápio '+menu.name+':',''];
 const name=$('name').value.trim();
 if(name)lines.push('Cliente: '+name,'');
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
  if(!products.some(p=>p.id===id))return;
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
$('heroOrder').addEventListener('click',goToCatalogue);
$('focusSearch').addEventListener('click',()=>{goToCatalogue();$('search').focus({preventScroll:true});});
$('showAll').addEventListener('click',()=>{$('search').value='';filterCategory('');});
$('seeCombos').addEventListener('click',()=>filterCategory($('seeCombos').dataset.category));
$('jumpCategories').addEventListener('click',()=>document.getElementById('quickCategories').scrollIntoView({behavior:'smooth'}));
$('bottomCategories').addEventListener('click',()=>document.getElementById('quickCategories').scrollIntoView({behavior:'smooth'}));
$('bottomProducts').addEventListener('click',goToCatalogue);
$('bottomHome').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
$('sendOrder').addEventListener('click',()=>{
 try{
  const digits=normalizeWhatsApp(menu?.whatsapp);
  if(!digits)throw Error('O estabelecimento ainda não configurou o WhatsApp comercial.');
  const url='https://wa.me/'+digits+'?text='+encodeURIComponent(checkoutMessage());
  window.open(url,'_blank','noopener,noreferrer');
 }catch(error){showErr(error.message);closeCart();window.scrollTo({top:0,behavior:'smooth'});}
});
async function boot(){
 try{
  const slug=new URLSearchParams(location.search).get('loja')||'';
  if(!/^[a-z0-9-]{3,60}$/.test(slug))throw Error('Endereço do cardápio inválido.');
  const configResponse=await fetch('/api/public-config',{cache:'no-store'});
  if(!configResponse.ok)throw Error('Não foi possível consultar o cardápio.');
  const config=await configResponse.json();
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
 }catch(error){
  $('storeName').textContent='Cardápio indisponível';
  $('catalog').innerHTML='<p class="summary catalog-empty">Não foi possível apresentar os produtos.</p>';
  showErr(error.message||'Falha ao carregar.');
 }
}
boot();
