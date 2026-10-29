'use strict';
// Comandas por loja. Armazenamento local: esta versão não sincroniza entre dispositivos.
let comandaSelected=null;
function comandaStoreKey(){return 'bipstart_comandas_v1_'+shop.id}
function comandaRead(){
 try{const data=JSON.parse(localStorage.getItem(comandaStoreKey())||'null');return data&&Array.isArray(data.items)?data:{next:1,items:[]}}catch{return {next:1,items:[]}}
}
function comandaWrite(data){localStorage.setItem(comandaStoreKey(),JSON.stringify(data))}
function comandaTotal(c){return c.items.reduce((s,i)=>s+Number(i.price)*Number(i.qty),0)}
function renderComandas(){
 const state=comandaRead(),selected=state.items.find(c=>c.number===comandaSelected);
 const cards=state.items.filter(c=>c.status==='open').map(c=>
 '<button type="button" class="comanda-card'+(selected?.number===c.number?' selected':'')+'" data-comanda-open="'+c.number+'"><strong>#'+c.number+'</strong><span>'+esc(c.client||'Sem nome')+'</span><b>'+fmt(comandaTotal(c))+'</b></button>').join('');
 const chooser=selected?'<section class="comanda-editor"><div class="comanda-head"><h3>Comanda #'+selected.number+'</h3><span>Aberta</span></div>'+
 '<label>Nome do cliente<input id="comandaClient" maxlength="120" value="'+esc(selected.client)+'" placeholder="Nome do cliente"></label>'+
 '<form id="comandaAddForm" class="comanda-add"><label>Produto<select name="product_id" required><option value="">Selecione um produto</option>'+
 products.filter(p=>p.active!==false).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' — '+fmt(p.price)+'</option>').join('')+'</select></label>'+
 '<label>Quantidade<input type="number" min="1" max="999999" step="1" name="quantity" value="1" required></label>'+
 '<button type="submit" class="button">Adicionar produto</button></form>'+
 '<div class="comanda-lines">'+(selected.items.length?selected.items.map(i=>
 '<div class="comanda-line"><div><strong>'+esc(i.name)+'</strong><small>'+fmt(i.price)+' un.</small></div>'+
 '<div class="comanda-line-controls"><button type="button" data-comanda-less="'+esc(i.id)+'">−</button><strong>'+i.qty+'×</strong><button type="button" data-comanda-more="'+esc(i.id)+'">+</button><button type="button" data-comanda-remove="'+esc(i.id)+'" aria-label="Remover produto">×</button></div><b>'+fmt(i.price*i.qty)+'</b></div>').join(''):'<p class="muted">Nenhum produto adicionado.</p>')+'</div>'+
 '<div class="comanda-total"><strong>Total</strong><strong>'+fmt(comandaTotal(selected))+'</strong></div>'+
 '<button type="button" class="button comanda-close" data-comanda-close '+(!selected.items.length?'disabled':'')+'>Fechar comanda e enviar ao carrinho</button>'+
 '</section>':'<section class="comanda-editor"><p>Crie ou selecione uma comanda para incluir produtos.</p></section>';
 return '<div class="comandas-page"><div class="comandas-top"><div><h2>Comandas</h2><p class="muted">Controle de consumo antes do pagamento.</p></div><button class="button" type="button" data-comanda-new>+ Nova comanda</button></div>'+
 '<div class="comandas-layout"><section><h3>Comandas abertas</h3><div class="comanda-list">'+(cards||'<p class="muted">Nenhuma comanda aberta.</p>')+'</div></section>'+chooser+'</div></div>';
}
function comandaModify(action,id){
 const state=comandaRead(),c=state.items.find(x=>x.number===comandaSelected&&x.status==='open');
 if(!c)return;
 const line=c.items.find(x=>String(x.id)===String(id));if(!line)return;
 if(action==='remove')c.items=c.items.filter(x=>x.id!==line.id);
 if(action==='less'){line.qty--;if(line.qty===0)c.items=c.items.filter(x=>x.id!==line.id)}
 if(action==='more'){
  const stock=Number(products.find(p=>p.id===line.id)?.stock||0);
  if(line.qty+cart.filter(x=>x.id===line.id).reduce((n,x)=>n+x.qty,0)>=stock)return msg('Estoque insuficiente.',true);
  line.qty++;
 }
 comandaWrite(state);renderPage();
}
document.addEventListener('input',e=>{
 if(e.target.id!=='comandaClient'||tab!=='comandas')return;
 const state=comandaRead(),c=state.items.find(x=>x.number===comandaSelected&&x.status==='open');
 if(c){c.client=e.target.value.slice(0,120);comandaWrite(state)}
});
document.addEventListener('submit',e=>{
 if(e.target.id!=='comandaAddForm'||tab!=='comandas')return;
 e.preventDefault();const form=e.target,values=new FormData(form),id=String(values.get('product_id')),qty=Number(values.get('quantity'));
 const p=products.find(p=>p.id===id&&p.active!==false);
 if(!p||!Number.isSafeInteger(qty)||qty<1)return msg('Escolha produto e quantidade válida.',true);
 const state=comandaRead(),c=state.items.find(x=>x.number===comandaSelected&&x.status==='open');if(!c)return;
 const old=c.items.find(x=>x.id===id);
 const other=state.items.filter(x=>x.status==='open').reduce((n,x)=>n+x.items.filter(i=>i.id===id).reduce((t,i)=>t+i.qty,0),0);
 const cartQty=cart.filter(i=>i.id===id).reduce((n,i)=>n+i.qty,0);
 if(other+cartQty+qty>Number(p.stock||0))return msg('Estoque insuficiente para a quantidade escolhida.',true);
 if(old)old.qty+=qty;else c.items.push({id:p.id,name:p.name,price:Number(p.price),qty});
 comandaWrite(state);renderPage();
});
document.addEventListener('click',e=>{
 if(tab!=='comandas')return;
 const btn=e.target.closest('[data-comanda-new],[data-comanda-open],[data-comanda-less],[data-comanda-more],[data-comanda-remove],[data-comanda-close]');
 if(!btn)return;
 if(btn.hasAttribute('data-comanda-new')){
  const state=comandaRead(),number=state.next++;state.items.push({number,client:'',status:'open',items:[]});
  comandaSelected=number;comandaWrite(state);renderPage();return;
 }
 if(btn.hasAttribute('data-comanda-open')){comandaSelected=Number(btn.dataset.comandaOpen);renderPage();return}
 for(const action of ['less','more','remove'])if(btn.hasAttribute('data-comanda-'+action)){comandaModify(action,btn.getAttribute('data-comanda-'+action));return}
 if(btn.hasAttribute('data-comanda-close')){
  const state=comandaRead(),c=state.items.find(x=>x.number===comandaSelected&&x.status==='open');
  if(!c||!c.items.length)return;
  if(cart.length&&!window.confirm('O carrinho já tem produtos. Deseja adicionar os itens desta comanda à venda atual?'))return;
  for(const item of c.items){
   const p=products.find(p=>p.id===item.id);
   const inCart=cart.find(x=>x.id===item.id);
   if(!p||p.active===false||Number(p.stock||0)<item.qty+(inCart?.qty||0))return msg('Estoque insuficiente para '+item.name+'. Atualize a comanda.',true);
  }
  c.status='closed';c.closedAt=new Date().toISOString();
  c.items.forEach(item=>{const existing=cart.find(x=>x.id===item.id);if(existing)existing.qty+=item.qty;else cart.push({...item})});
  comandaWrite(state);comandaSelected=null;tab='caixa';pdvCheckoutOpen=true;renderPage();msg('Comanda #'+c.number+' enviada ao carrinho. Escolha a forma de pagamento.');
 }
});
