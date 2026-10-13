// PIX real de diagnóstico: nunca ativa planos e nunca altera entitlements.
// Requer aprovação humana para pagar. Disponível SOMENTE no serviço de homologação.
import { verifySignature } from './billing.mjs';

const BASE='https://api.mercadopago.com';
const supa=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const base=()=>String(process.env.BIPSTART_BASE_URL||'').replace(/\/$/,'');
const secret=()=>String(process.env.SUPABASE_SECRET_KEY||'');
const publish=()=>String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
const rawProdToken=()=>String(process.env.MERCADO_PAGO_PROD_ACCESS_TOKEN||'');
const prodToken=()=>rawProdToken().trim();
const provider='mercado_pago_pix_diagnostic';
const amount=1.00;
const enabled=()=>process.env.BIPSTART_STAGING_MODE==='1'
 &&process.env.BIPSTART_BILLING_MODE==='test'
 &&process.env.BIPSTART_REAL_PIX_TEST_ENABLED==='1'
 &&Boolean(supa()&&secret()&&publish()&&prodToken().startsWith('APP_USR-')&&process.env.MERCADO_PAGO_PROD_WEBHOOK_SECRET&&base().startsWith('https://'))
 &&Boolean(String(process.env.BIPSTART_REAL_PIX_TEST_EMAIL||'').trim());

function reply(res,status,body){
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(JSON.stringify(body));
}
async function db(path,method='GET',body,access){
 const headers={apikey:access?publish():secret(),'Content-Type':'application/json',Prefer:'return=representation'};
 if(access)headers.Authorization='Bearer '+access;
 const response=await fetch(supa()+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok)throw Error('Supabase falhou ('+response.status+').');
 return response.json();
}
function safeCode(value){
 const code=typeof value==='number'?String(value):typeof value==='string'?value:'';
 return /^[a-zA-Z0-9_.-]{1,70}$/.test(code)?code:null;
}
function safeMpError(payload){
 return safeCode(payload?.error)||safeCode(payload?.cause?.[0]?.code)||safeCode(payload?.error_code)||null;
}
async function verifyProductionTokenReadOnly(){
 const r=await fetch('https://api.mercadolibre.com/users/me',{
   headers:{Authorization:'Bearer '+prodToken()},redirect:'error'
 });
 const payload=await r.json().catch(()=>({}));
 return {
   authorized:r.ok,httpStatus:r.status,providerErrorCode:r.ok?null:safeMpError(payload),
   tokenHasWhitespace:rawProdToken()!==prodToken(),
   tokenHasQuotes:/^(['"]).*\1$/.test(prodToken()),
   tokenLooksLikeProduction:prodToken().startsWith('APP_USR-')
 };
}
async function mp(path,method='GET',body,idempotency){
 const headers={'Authorization':'Bearer '+prodToken(),'Content-Type':'application/json'};
 if(idempotency)headers['X-Idempotency-Key']=idempotency;
 const r=await fetch(BASE+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){
  const code=safeMpError(d);
  throw Error('Mercado Pago recusou a operação ('+r.status+').'+(code?' Código: '+code+'.':'')+' Verifique as credenciais de produção da aplicação BipStart.');
 }
 return d;
}
async function owner(req){
 const bearer=/^Bearer\s+(.+)$/i.exec(String(req.headers.authorization||''))?.[1];
 if(!bearer)return null;
 const r=await fetch(supa()+'/auth/v1/user',{headers:{apikey:publish(),Authorization:'Bearer '+bearer}});
 if(!r.ok)return null;
 const user=await r.json();
 const email=String(user.email||'').trim().toLowerCase();
 if(!user.email_confirmed_at||email!==String(process.env.BIPSTART_REAL_PIX_TEST_EMAIL||'').trim().toLowerCase())return null;
 const shops=await db('shops?owner_id=eq.'+encodeURIComponent(user.id)+'&select=id,name&limit=1','GET',undefined,bearer);
 return shops?.length?{user,shop:shops[0]}:null;
}
async function getOrder(shopId){
 const rows=await db('shop_billing_orders?shop_id=eq.'+encodeURIComponent(shopId)+'&provider=eq.'+provider+'&select=id,provider_ref,amount,created_at&limit=1');
 return rows?.[0]||null;
}
function verifyPayment(p,order){
 return String(p.id)===String(order.provider_ref)
  &&p.live_mode===true &&p.payment_method_id==='pix'
  &&p.currency_id==='BRL' &&Number(p.transaction_amount)===amount
  &&p.external_reference==='bipstart-pix-diagnostic:'+order.id;
}
async function paymentResponse(order){
 if(!order.provider_ref)return {orderId:order.id,status:'preparing',amount,planActivated:false};
 const p=await mp('/v1/payments/'+encodeURIComponent(order.provider_ref));
 if(!verifyPayment(p,order))throw Error('Pagamento retornou dados incompatíveis; nenhuma ação foi tomada.');
 const td=p.point_of_interaction?.transaction_data||{};
 return {
  orderId:order.id,paymentId:String(p.id),status:p.status,statusDetail:p.status_detail,
  amount,planActivated:false,
  ticketUrl:typeof td.ticket_url==='string'&&td.ticket_url.startsWith('https://')?td.ticket_url:null,
  pixCopyPaste:typeof td.qr_code==='string'?td.qr_code:null
 };
}
async function createOnce(user,shop){
 let order=await getOrder(shop.id);
 if(!order){
  try{
   const rows=await db('shop_billing_orders','POST',{
    shop_id:shop.id,plan_code:'basic',amount,status:'pending',provider
   });
   order=rows?.[0]||null;
  }catch{
   // Corrida entre dois POSTs: índice único permite apenas um teste por loja.
   order=await getOrder(shop.id);
  }
 }
 if(!order?.id)throw Error('Não foi possível reservar a transação única.');
 if(order.provider_ref)return paymentResponse(order);
 const body={
  transaction_amount:amount,
  description:'BipStart - diagnostico tecnico PIX de R$ 1,00 (nao contrata plano)',
  payment_method_id:'pix',
  payer:{email:user.email},
  external_reference:'bipstart-pix-diagnostic:'+order.id,
  notification_url:base()+'/api/billing/pix-webhook'
 };
 const p=await mp('/v1/payments','POST',body,order.id);
 if(!/^[0-9]+$/.test(String(p.id||''))||p.live_mode!==true||p.payment_method_id!=='pix'
    ||Number(p.transaction_amount)!==amount||p.currency_id!=='BRL'
    ||p.external_reference!==body.external_reference)
  throw Error('Pagamento PIX retornou resposta incompatível; não realize nenhuma transferência.');
 await db('shop_billing_orders?id=eq.'+encodeURIComponent(order.id)+'&provider=eq.'+provider
  +'&provider_ref=is.null','PATCH',{provider_ref:String(p.id)});
 const td=p.point_of_interaction?.transaction_data||{};
 return {orderId:order.id,paymentId:String(p.id),status:p.status,
  amount,planActivated:false,
  ticketUrl:typeof td.ticket_url==='string'&&td.ticket_url.startsWith('https://')?td.ticket_url:null,
  pixCopyPaste:typeof td.qr_code==='string'?td.qr_code:null};
}
async function readBody(req){
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw Error('Requisição excessiva');}
 return JSON.parse(raw||'{}');
}
export async function pixDiagnostic(req,res,url){
 if(!['/api/billing/pix-diagnostic','/api/billing/pix-webhook','/api/billing/pix-auth-check','/api/billing/pix-proxy-check'].includes(url.pathname))return false;
 if(!enabled()){reply(res,503,{error:'Teste PIX real desativado na homologação.'});return true;}
 if(url.pathname==='/api/billing/pix-webhook'){
  if(req.method!=='POST'){reply(res,405,{error:'Método não permitido'});return true;}
  try{
   const body=await readBody(req);
   // Webhook só observa: nenhuma alteração de planos ou de pedidos.
   const result=verifySignature(req,url,body,String(process.env.MERCADO_PAGO_PROD_WEBHOOK_SECRET||'').trim());
   if(!result.valid){console.warn('BipStart PIX real webhook recusado:',result.reason);reply(res,401,{error:'Assinatura inválida'});return true;}
   console.info('BipStart PIX real webhook validado:',{signedPaymentId:result.signedId,eventType:body.type||null});
   reply(res,200,{ok:true,diagnostic:true,planActivated:false});
  }catch(error){console.error('BipStart PIX webhook:',error.message);reply(res,500,{error:'Falha na notificação'});}
  return true;
 }
 if(req.method!=='GET'&&req.method!=='POST'){reply(res,405,{error:'Método não permitido'});return true;}
 try{
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase();
  if(host&&host!==new URL(base()).host.toLowerCase()){reply(res,409,{error:'Domínio da homologação incompatível'});return true;}
  const current=await owner(req);
  if(!current){reply(res,403,{error:'Entre com a conta de teste autorizada e e-mail confirmado.'});return true;}
  if(url.pathname==='/api/billing/pix-proxy-check'){
   if(req.method!=='GET'){reply(res,405,{error:'Somente consulta é permitida.'});return true;}
   // Teste sem pagamentos nem segredos: compara o marcador no URL com
   // o x-request-id que efetivamente chegou ao Node.js.
   const submitted=String(url.searchParams.get('probe')||'');
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submitted)){
    reply(res,400,{error:'Marcador de teste inválido.'});return true;
   }
   const received=String(req.headers['x-request-id']||'');
   const alternative=String(req.headers['x-bipstart-original-request-id']||'');
   reply(res,200,{
    requestIdPreserved:received===submitted,
    requestIdPresent:Boolean(received),
    alternateHeaderPreserved:alternative===submitted,
    alternateHeaderPresent:Boolean(alternative),
    // Apenas metadados, sem publicar o identificador recebido.
    requestIdFormat:received?'UUID ou outro valor':'ausente',
    readsOnly:true,createsPayment:false,planActivated:false
   });
   return true;
  }
  if(url.pathname==='/api/billing/pix-auth-check'){
   if(req.method!=='GET'){reply(res,405,{error:'Somente consulta é permitida.'});return true;}
   const diagnostic=await verifyProductionTokenReadOnly();
   reply(res,200,{...diagnostic,createsPayment:false,planActivated:false});
   return true;
  }
  if(req.method==='GET'){
   const order=await getOrder(current.shop.id);
   if(!order){reply(res,200,{created:false,amount,planActivated:false});return true;}
   reply(res,200,{created:true,...await paymentResponse(order)});return true;
  }
  // O POST é explicitamente iniciado pelo usuário; nenhum pagamento é
  // autorizado. Só gera um PIX de R$1,00, no máximo uma vez por loja.
  reply(res,200,{created:true,...await createOnce(current.user,current.shop)});
 }catch(error){
  console.error('BipStart PIX diagnóstico:',error.message);
  reply(res,502,{error:error.message});
 }
 return true;
}
