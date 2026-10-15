import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync('public/vitrine.js','utf8');
const html=readFileSync('public/vitrine.html','utf8');
const css=readFileSync('public/vitrine.css','utf8');
const client=readFileSync('public/cliente.js','utf8');
const clientHtml=readFileSync('public/cliente.html','utf8');
const sql=readFileSync('sql/bipstart_public_menu_stock_20261014.sql','utf8');

test('JS da vitrine com verificação de disponibilidade compila e expõe o indicador sem revelar quantidades',()=>{
 new vm.Script(js,{filename:'public/vitrine.js'});
 assert.match(sql,/create or replace function public\.bipstart_public_menu\(p_slug text\)/);
 assert.match(sql,/'in_stock',\(coalesce\(p\.stock,0\)>0\)/);
 assert.doesNotMatch(sql,/'stock',p\.stock/);
 assert.match(sql,/e\.status='trialing'/);
 assert.match(sql,/e\.status='active'/);
 assert.match(sql,/revoke all on function public\.bipstart_public_menu\(text\) from public/);
 assert.match(js,/item\.in_stock===false/);
});

test('produto esgotado aparece marcado e não pode ser incluído pelo botão da vitrine',()=>{
 const start=js.indexOf('function itemCard(item){'),end=js.indexOf('function renderProducts(){',start);
 assert.ok(start>=0&&end>start);
 const render=new Function('esc','money','imageUrl',
  js.slice(start,end)+';return itemCard;')(
  value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
  value=>'R$ '+Number(value).toFixed(2),()=>'/produto.png');
 const soldOut=render({id:'1',name:'Sem estoque',category:'Bebidas',price:12,image_path:null,in_stock:false});
 assert.match(soldOut,/Produto esgotado/);
 assert.match(soldOut,/data-add="1" disabled aria-disabled="true"/);
 assert.match(soldOut,/>Esgotado<\/button>/);
 const available=render({id:'2',name:'Disponível',category:'Bebidas',price:12,in_stock:true});
 assert.doesNotMatch(available,/disabled aria-disabled="true"/);
 assert.match(available,/>🛒 Adicionar<\/button>/);
 assert.match(css,/\.dproduct \.btn:disabled/);
});

test('mensagem de WhatsApp nunca aceita um item conhecido como esgotado',()=>{
 const start=js.indexOf("function checkoutMessage(orderId=''){"),end=js.indexOf("document.addEventListener('click'",start);
 const make=new Function('$','cart','menu','products','subtotal','deliveryCost','money','paymentLabels',
  js.slice(start,end)+';return checkoutMessage;');
 const fn=make(()=>({value:'pickup'}),new Map([['1',1]]),{name:'Loja'},
  [{id:'1',name:'Esgotado',price:14,in_stock:false}],()=>14,()=>0,v=>'R$ '+v,{pix:'Pix'});
 assert.throws(fn,/esgotado/);
});

test('antes do WhatsApp, a vitrine remove os itens esgotados mesmo se mudaram após abrir a página',async()=>{
 const start=js.indexOf('async function checkAvailabilityBeforeCheckout(){');
 const end=js.indexOf("$('sendOrder').addEventListener",start);
 assert.ok(start>0&&end>start);
 const cart=new Map([['1',2],['2',1]]);
 let draws=0;
 const make=new Function('publicConfig','menu','cart','products','fetch','renderProducts','renderCart',
  js.slice(start,end)+';return checkAvailabilityBeforeCheckout;');
 const mockFetch=async()=>({
  ok:true,json:async()=>({items:[
   {id:'1',name:'Bebida',price:15,in_stock:false},
   {id:'2',name:'Suco',price:8,in_stock:true}
  ]})
 });
 const check=make({supabaseUrl:'https://example.supabase.co',publishableKey:'test'}, {slug:'loja-01'},cart,
  [{id:'1',price:15},{id:'2',price:8}],mockFetch,()=>draws++,()=>draws++);
 await assert.rejects(check(),/esgotou/);
 assert.equal(cart.has('1'),false);
 assert.equal(cart.get('2'),1);
 assert.equal(draws,2);
 assert.match(js,/location\.assign\(url\)/,'deve navegar sem popup bloqueado por await');
});

test('lojista autenticado e proprietário vê atalho seguro para editar o próprio cardápio',async()=>{
 assert.match(html,/id="ownerEditorLink"[^>]*class="owner-editor-link hidden"[^>]*href="\/cliente\?editar=cardapio"/);
 assert.match(client,/new URLSearchParams\(location\.search\)\.get\('editar'\)==='cardapio'/);
 assert.match(client,/hiding\('modeChooser',false\);hiding\('workspace',true\);renderPage\(\)/);
 assert.match(clientHtml,/cliente\.js\?v=20/);
 const start=js.indexOf('async function revealOwnerEditorLink(');
 const end=js.indexOf('async function boot(){',start);
 assert.ok(start>0&&end>start);
 const build=new Function('localStorage','fetch','$','URL','Date',
  js.slice(start,end)+';return revealOwnerEditorLink;');
 let visible=false;
 const link={classList:{remove(x){if(x==='hidden')visible=true;}}};
 const config={supabaseUrl:'https://example.supabase.co',publishableKey:'test'};
 const session={access_token:'jwt_test',expires_at:Math.floor(Date.now()/1000)+3600};
 const valid=build({getItem:()=>JSON.stringify(session)},async()=>({ok:true,json:async()=>[{slug:'loja-01'}]}),()=>link,URL,Date);
 await valid(config,'loja-01');
 assert.equal(visible,true);
 visible=false;
 const stranger=build({getItem:()=>JSON.stringify(session)},async()=>({ok:true,json:async()=>[]}),()=>link,URL,Date);
 await stranger(config,'loja-01');
 assert.equal(visible,false);
 const expired=build({getItem:()=>JSON.stringify({...session,expires_at:1})},async()=>{throw Error('token vencido não deve consultar');},()=>link,URL,Date);
 await expired(config,'loja-01');
 assert.equal(visible,false);
 assert.match(js,/Authorization:'Bearer '\+saved\.access_token/);
 assert.match(js,/url\.searchParams\.set\('slug','eq\.'\+slug\)/);
});
