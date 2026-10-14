'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let menu=null,cart=new Map();
function showErr(msg){$('error').classList.remove('hidden');$('error').textContent=msg;}
function render(){
  $('store').textContent=menu.name;document.title='CARDÁPIO ('+menu.name+')';
  $('items').innerHTML=(menu.items||[]).length?menu.items.map(p=>
    '<article class="menu-item">'+(p.image_path?'<img src="'+esc(menu.src+'/'+p.image_path.split('/').map(encodeURIComponent).join('/'))+'" alt="">':'')+
    '<h3>'+esc(p.name)+'</h3><span class="muted">'+esc(p.category||'Geral')+'</span><strong class="price">'+money(p.price)+'</strong><button class="button" data-add="'+esc(p.id)+'">Adicionar</button></article>'
  ).join(''):'<div class="empty">Nenhum item disponível no momento.</div>';
  updateCart();
}
function updateCart(){
  let count=0,total=0;
  for(const [id,qty] of cart){const item=(menu.items||[]).find(x=>x.id===id);if(item){count+=qty;total+=Number(item.price)*qty}}
  $('cartCount').textContent=count+' item(ns)';
  $('total').textContent=money(total);
  $('order').disabled=!count||!String(menu.whatsapp||'').replace(/\D/g,'');
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-add]');if(!button||!menu)return;
  const id=button.dataset.add;cart.set(id,(cart.get(id)||0)+1);updateCart();
});
$('order').onclick=()=>{
  const digits=String(menu.whatsapp||'').replace(/\D/g,'');
  if(!/^\d{10,13}$/.test(digits))return showErr('WhatsApp do estabelecimento indisponível.');
  const lines=['Olá! Gostaria de fazer um pedido pelo cardápio '+menu.name+':'];
  for(const [id,qty] of cart){const p=menu.items.find(x=>x.id===id);if(p)lines.push(qty+'x '+p.name+' — '+money(p.price*qty))}
  const total=[...cart].reduce((acc,[id,qty])=>{const p=menu.items.find(x=>x.id===id);return acc+Number(p?.price||0)*qty},0);
  lines.push('Total dos produtos: '+money(total));
  lines.push('Por favor, confirme disponibilidade, entrega e pagamento.');
  window.open('https://wa.me/'+digits+'?text='+encodeURIComponent(lines.join('\n')),'_blank','noopener,noreferrer');
};
async function boot(){
 try{
  const slug=new URLSearchParams(location.search).get('loja')||'';
  if(!/^[a-z0-9-]{3,60}$/.test(slug))throw Error('Endereço de loja inválido.');
  const cfg=await fetch('/api/public-config').then(r=>r.json());
  if(!cfg.enabled)throw Error('Cardápios em preparação.');
  const r=await fetch(cfg.supabaseUrl+'/rest/v1/rpc/bipstart_public_menu',{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_slug:slug})});
  if(!r.ok)throw Error('Não foi possível carregar este cardápio.');
  menu=await r.json();if(!menu)throw Error('Cardápio não encontrado ou temporariamente indisponível.');
  menu.src=cfg.supabaseUrl+'/storage/v1/object/public/bipstart-images';
  render();
 }catch(e){$('store').textContent='Cardápio indisponível';showErr(e.message);}
}
boot();