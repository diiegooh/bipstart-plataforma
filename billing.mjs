// Checkout central da BipStart. Não importa credenciais da Salgatti.
import crypto from 'node:crypto';
const prices=Object.freeze({basic:29.99,personalizado:49.99});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supa=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>String(process.env.SUPABASE_SECRET_KEY||'');
const token=()=>String(process.env.MERCADO_PAGO_ACCESS_TOKEN||'');
const base=()=>String(process.env.BIPSTART_BASE_URL||'').replace(/\/$/,'');
function json(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));}
async function readBody(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)throw Error('Corpo muito grande');}return JSON.parse(raw||'{}');}
async function sb(path,method='GET',body,access=key()){
 const r=await fetch(supa()+'/rest/v1/'+path,{method,headers:{apikey:key(),Authorization:'Bearer '+access,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);if(!r.ok)throw Error('Falha na persistência ('+r.status+')');return d;
}
async function mp(path,method='GET',body,idempotency){
 const headers={'Authorization':'Bearer '+token(),'Content-Type':'application/json'};
 if(idempotency)headers['X-Idempotency-Key']=idempotency;
 const r=await fetch('https://api.mercadopago.com'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);if(!r.ok)throw Error('Mercado Pago indisponível ('+r.status+')');return d;
}
function validSignature(req,url){
 const secret=String(process.env.MERCADO_PAGO_WEBHOOK_SECRET||'');
 const signature=String(req.headers['x-signature']||'');
 const requestId=String(req.headers['x-request-id']||'');
 const parts=Object.fromEntries(signature.split(',').map(v=>v.trim().split('=')));
 const id=String(url.searchParams.get('data.id')||'').toLowerCase();
 if(!secret||!id||!requestId||!/^\d{10,15}$/.test(parts.ts||'')||!/^[a-f0-9]{64}$/i.test(parts.v1||''))return false;
 const delta=Math.abs(Date.now()-Number(parts.ts)*1000);
 if(!Number.isFinite(delta)||delta>10*60*1000)return false;
 const manifest='id:'+id+';request-id:'+requestId+';ts:'+parts.ts+';';
 const expected=crypto.createHmac('sha256',secret).update(manifest).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(parts.v1,'hex'));
}
export async function billing(req,res,url){
 const pathname=url.pathname;
 if(!['/api/billing/checkout','/api/billing/webhook'].includes(pathname))return false;
 if(!supa()||!key()||!token()||!base().startsWith('https://')){json(res,503,{error:'Pagamento da BipStart ainda não configurado.'});return true;}
 try{
  if(pathname==='/api/billing/checkout'){
   if(req.method!=='POST'){json(res,405,{error:'Método inválido'});return true;}
   const bearer=/^Bearer (.+)$/.exec(String(req.headers.authorization||''))?.[1];
   if(!bearer){json(res,401,{error:'Faça login antes de contratar.'});return true;}
   const u=await fetch(supa()+'/auth/v1/user',{headers:{apikey:key(),Authorization:'Bearer '+bearer}});
   if(!u.ok){json(res,401,{error:'Sessão inválida.'});return true;}
   const user=await u.json();
   const input=await readBody(req),shopId=String(input.shopId||''),plan=String(input.plan||'');
   if(!uuid.test(shopId)||!Object.hasOwn(prices,plan)){json(res,400,{error:'Loja ou plano inválido.'});return true;}
   const shops=await sb('shops?id=eq.'+encodeURIComponent(shopId)+'&owner_id=eq.'+encodeURIComponent(user.id)+'&select=id,name', 'GET',undefined,bearer);
   if(!shops?.length){json(res,403,{error:'Esta loja não pertence à sua conta.'});return true;}
   const rows=await sb('shop_billing_orders','POST',{shop_id:shopId,plan_code:plan,amount:prices[plan],status:'pending',provider:'mercado_pago'});
   const order=rows?.[0];if(!order?.id)throw Error('Não foi possível criar pedido.');
   const preference=await mp('/checkout/preferences','POST',{
    items:[{id:'bipstart-'+plan,title:'Plano BipStart '+(plan==='basic'?'Básico':'Personalizado'),quantity:1,currency_id:'BRL',unit_price:prices[plan]}],
    external_reference:'bipstart:'+order.id,
    notification_url:base()+'/api/billing/webhook',
    back_urls:{success:base()+'/cliente',failure:base()+'/cliente',pending:base()+'/cliente'}
   },order.id);
   if(!/^https:\/\//.test(preference.init_point||''))throw Error('Checkout não disponível.');
   json(res,200,{checkoutUrl:preference.init_point,orderId:order.id});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'Método inválido'});return true;}
  if(!validSignature(req,url)){json(res,401,{error:'Assinatura inválida.'});return true;}
  const id=url.searchParams.get('data.id');
  if(!/^\d+$/.test(id||'')){json(res,400,{error:'ID inválido'});return true;}
  const payment=await mp('/v1/payments/'+encodeURIComponent(id));
  const match=/^bipstart:([0-9a-f-]{36})$/.exec(String(payment.external_reference||''));
  if(!match||!uuid.test(match[1])){json(res,200,{ok:true});return true;}
  const order=(await sb('shop_billing_orders?id=eq.'+match[1]+'&select=*'))?.[0];
  if(!order){json(res,200,{ok:true});return true;}
  if(payment.status!=='approved'){json(res,200,{ok:true});return true;}
  if(order.status==='approved'){json(res,200,{ok:true});return true;}
  if(!Object.hasOwn(prices,order.plan_code)||Number(order.amount)!==prices[order.plan_code]||Number(payment.transaction_amount)!==prices[order.plan_code]||payment.currency_id!=='BRL'){json(res,422,{error:'Pagamento incompatível.'});return true;}
  const result=await sb('rpc/bipstart_confirm_plan_payment','POST',{p_order_id:order.id,p_payment_ref:String(payment.id),p_amount:Number(payment.transaction_amount),p_plan:order.plan_code});
  if(result!==true)throw Error('Ativação não confirmada.');
  json(res,200,{ok:true});return true;
 }catch(error){console.error('BipStart billing:',error.message);json(res,500,{error:'Não foi possível processar a operação.'});return true;}
}
