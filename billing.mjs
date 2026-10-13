// Checkout central da BipStart. Não importa credenciais da Salgatti.
import crypto from 'node:crypto';
const prices=Object.freeze({basic:29.99,personalizado:49.99});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supa=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=()=>String(process.env.SUPABASE_SECRET_KEY||'');
const publicKey=()=>String(process.env.SUPABASE_PUBLISHABLE_KEY||'');
const token=()=>String(process.env.MERCADO_PAGO_ACCESS_TOKEN||'');
const base=()=>String(process.env.BIPSTART_BASE_URL||'').replace(/\/$/,'');
function json(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));}
async function readBody(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)throw Error('Corpo muito grande');}return JSON.parse(raw||'{}');}
async function sb(path,method='GET',body,userAccess=null){
 // A chave sb_secret_ moderna NÃO é um JWT e não deve entrar em Authorization.
 // Leituras como usuário usam a publishable key + JWT para respeitar RLS.
 const headers={
   apikey:userAccess?publicKey():key(),
   'Content-Type':'application/json',
   Prefer:'return=representation'
 };
 if(userAccess)headers.Authorization='Bearer '+userAccess;
 const r=await fetch(supa()+'/rest/v1/'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);
 if(!r.ok)throw Error('Falha na persistência ('+r.status+')');
 return d;
}
async function mp(path,method='GET',body,idempotency){
 const headers={'Authorization':'Bearer '+token(),'Content-Type':'application/json'};
 if(idempotency)headers['X-Idempotency-Key']=idempotency;
 const r=await fetch('https://api.mercadopago.com'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json().catch(()=>null);if(!r.ok){const err=new Error('Mercado Pago indisponível ('+r.status+')');err.httpStatus=r.status;throw err;}return d;
}
function signatureManifestDebugMatches(secret,hash,id,requestId,ts,notificationId){
  // Somente diagnóstico no staging: nunca habilitar validação dessas variantes.
  if(!/^[a-f0-9]{64}$/i.test(hash)||!/^[0-9]{10,15}$/.test(ts)||!secret)return [];
  const variants={
    sem_id:'request-id:'+requestId+';ts:'+ts+';',
    sem_request_id:'id:'+id+';ts:'+ts+';',
    apenas_timestamp:'ts:'+ts+';',
    id_notificacao:'id:'+notificationId+';request-id:'+requestId+';ts:'+ts+';',
    com_data_ponto_id:'data.id:'+id+';request-id:'+requestId+';ts:'+ts+';'
  };
  const received=Buffer.from(hash,'hex');
  return Object.entries(variants).filter(([,manifest])=>{
    const signed=crypto.createHmac('sha256',secret).update(manifest).digest();
    return crypto.timingSafeEqual(signed,received);
  }).map(([name])=>name);
}
function webhookSignatureDiagnostics(req,url,payload){
 // Apenas metadados não sensíveis: NÃO registrar chaves, tokens, HMAC,
 // x-request-id nem identificadores dos pagamentos.
 const signature=String(req.headers['x-signature']||'');
 const secret=String(process.env.MERCADO_PAGO_WEBHOOK_SECRET||'');
 const query=url.searchParams;
 const parts=Object.fromEntries(signature.split(',').map(v=>{
  const i=v.indexOf('=');
  return i<0?['','']:[v.slice(0,i).trim(),v.slice(i+1).trim()];
 }));
 const ts=String(parts.ts||''),hash=String(parts.v1||'');
 const bodyId=payload?.data?.id;
 const id=query.get('data.id')||String(bodyId||'');
 const rid=String(req.headers['x-request-id']||'');
 return {
   hasQueryDataId:query.has('data.id'),
   hasQueryDataUnderscoreId:query.has('data_id'),
   hasQueryId:query.has('id'),
   hasBodyDataId:bodyId!==undefined&&bodyId!==null,
   queryMatchesBodyId:query.has('data.id')&&bodyId!==undefined
     ?String(query.get('data.id'))===String(bodyId):null,
   hasRequestId:Boolean(rid),
   requestIdLength:rid.length,
   requestIdLooksLikeUuid:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rid),
   requestIdHeaderCount:Array.isArray(req.rawHeaders)?req.rawHeaders.filter((value,index)=>index%2===0&&String(value).toLowerCase()==='x-request-id').length:null,
   hasSignature:Boolean(signature),
   signatureTsLength:ts.length,
   signatureDigestLength:hash.length,
   secretConfigured:Boolean(secret),
   secretHasSurroundingWhitespace:secret!==secret.trim(),
   secretWrappedInQuotes:/^(['"]).*\1$/.test(secret),
   alternativeManifestMatches:signatureManifestDebugMatches(secret.trim(),hash,id,rid,ts,String(payload?.id||''))
 };
}
export function verifySignature(req,url,payload,overrideSecret){
 // Mercado Pago assina apenas campos presentes na query e nos headers.
 // Se data.id faltar na URL, uma assinatura sem ID nunca autoriza pagamento.
 const secret=overrideSecret===undefined?String(process.env.MERCADO_PAGO_WEBHOOK_SECRET||'').trim():String(overrideSecret||'').trim();
 const signature=String(req.headers['x-signature']||'');
 const requestId=String(req.headers['x-request-id']||'');
 const parts=Object.fromEntries(signature.split(',').map(v=>{
  const at=v.indexOf('=');
  return at<0?['','']:[v.slice(0,at).trim(),v.slice(at+1).trim()];
 }));
 const ts=String(parts.ts||''),hash=String(parts.v1||'');
 if(!secret||!/^[0-9]{10,15}$/.test(ts)||!/^[a-f0-9]{64}$/i.test(hash))
   return {valid:false,reason:'assinatura_ausente_ou_invalida'};
 const millis=ts.length>=13?Number(ts):Number(ts)*1000;
 if(!Number.isFinite(millis)||Math.abs(Date.now()-millis)>10*60*1000)
   return {valid:false,reason:'timestamp_fora_da_janela'};
 const queryId=url.searchParams.get('data.id');
 const bodyId=payload?.data?.id==null?'':String(payload.data.id);
 if(queryId!==null&&!/^[0-9]+$/.test(queryId))
   return {valid:false,reason:'id_url_invalido'};
 if(queryId!==null&&bodyId&&queryId!==bodyId)
   return {valid:false,reason:'id_divergente'};
 const suffix=(requestId?'request-id:'+requestId+';':'')+'ts:'+ts+';';
 const matches=id=>{
  const manifest=(id?'id:'+id.toLowerCase()+';':'')+suffix;
  const expected=crypto.createHmac('sha256',secret).update(manifest).digest();
  return crypto.timingSafeEqual(expected,Buffer.from(hash,'hex'));
 };
 if(queryId!==null){
  if(!matches(queryId))return {valid:false,reason:'hmac_invalido'};
  return {valid:true,paymentId:queryId,signedId:true};
 }
 // Formatos alternativos do simulador: aceitar ID no corpo só se for
 // explicitamente coberto pela assinatura HMAC.
 if(/^[0-9]+$/.test(bodyId)&&matches(bodyId))
   return {valid:true,paymentId:bodyId,signedId:true};
 if(matches(''))return {valid:true,paymentId:null,signedId:false};
 return {valid:false,reason:'hmac_invalido'};
}
export async function billing(req,res,url){
 const pathname=url.pathname;
 if(!['/api/billing/checkout','/api/billing/webhook'].includes(pathname))return false;
 if(!supa()||!key()||!publicKey()||!token()||!process.env.MERCADO_PAGO_WEBHOOK_SECRET||!base().startsWith('https://')||process.env.BIPSTART_BILLING_MODE!=='test'||process.env.BIPSTART_STAGING_MODE!=='1'){json(res,503,{error:'Pagamento da BipStart ainda não configurado.'});return true;}
 try{
  if(pathname==='/api/billing/checkout'){
   if(req.method!=='POST'){json(res,405,{error:'Método inválido'});return true;}
   // Impede que a homologação crie checkout com webhook/retorno para produção.
   const forwarded=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase();
   const expected=new URL(base()).host.toLowerCase();
   if(forwarded&&forwarded!==expected){json(res,409,{error:'BIPSTART_BASE_URL deve ser a URL deste ambiente de homologação.'});return true;}
   const bearer=/^Bearer (.+)$/.exec(String(req.headers.authorization||''))?.[1];
   if(!bearer){json(res,401,{error:'Faça login antes de contratar.'});return true;}
   const u=await fetch(supa()+'/auth/v1/user',{headers:{apikey:publicKey(),Authorization:'Bearer '+bearer}});
   if(!u.ok){json(res,401,{error:'Sessão inválida.'});return true;}
   const user=await u.json();
   if(!user?.email_confirmed_at){json(res,403,{error:'Confirme seu e-mail antes de contratar.'});return true;}
   const input=await readBody(req),shopId=String(input.shopId||''),plan=String(input.plan||'');
   if(!uuid.test(shopId)||!Object.hasOwn(prices,plan)){json(res,400,{error:'Loja ou plano inválido.'});return true;}
   const shops=await sb('shops?id=eq.'+encodeURIComponent(shopId)+'&owner_id=eq.'+encodeURIComponent(user.id)+'&select=id,name', 'GET',undefined,bearer);
   if(!shops?.length){json(res,403,{error:'Esta loja não pertence à sua conta.'});return true;}
   const entitlements=await sb('shop_entitlements?shop_id=eq.'+encodeURIComponent(shopId)+'&select=status,plan_code');
   if(entitlements?.[0]?.status==='active'){json(res,409,{error:'A loja já possui um plano ativo.'});return true;}
   const rows=await sb('shop_billing_orders','POST',{shop_id:shopId,plan_code:plan,amount:prices[plan],status:'pending',provider:'mercado_pago'});
   const order=rows?.[0];if(!order?.id)throw Error('Não foi possível criar pedido.');
   const preference=await mp('/checkout/preferences','POST',{
    items:[{id:'bipstart-'+plan,title:'Plano BipStart '+(plan==='basic'?'Básico':'Personalizado'),quantity:1,currency_id:'BRL',unit_price:prices[plan]}],
    external_reference:'bipstart:'+order.id,
    notification_url:base()+'/api/billing/webhook',
    back_urls:{success:base()+'/cliente',failure:base()+'/cliente',pending:base()+'/cliente'}
   },order.id);
   if(!/^https:\/\//.test(preference.sandbox_init_point||''))throw Error('Checkout de teste não disponível.');
   json(res,200,{checkoutUrl:preference.sandbox_init_point,orderId:order.id});return true;
  }
  if(req.method!=='POST'){json(res,405,{error:'Método inválido'});return true;}
  const body=await readBody(req);
  const verified=verifySignature(req,url,body);
  if(!verified.valid){
   console.warn('BipStart webhook rejeitado:',verified.reason,webhookSignatureDiagnostics(req,url,body));
   json(res,401,{error:'Assinatura inválida.'});return true;
  }
  if(body?.type&&body.type!=='payment'){
   json(res,200,{ok:true,ignored:true,reason:'evento_nao_suportado'});return true;
  }
  // Uma assinatura válida sem ID vinculado não autoriza consultar
  // o pagamento nem ativar um plano.
  if(!verified.signedId){
   json(res,200,{ok:true,ignored:true,reason:'id_nao_assinado'});return true;
  }
  const id=verified.paymentId;
  let payment;
  try{payment=await mp('/v1/payments/'+encodeURIComponent(id));}
  catch(error){
   // Notificações simuladas com um Data ID fictício não correspondem a
   // pagamentos reais. Aceitar a assinatura sem conceder nenhum acesso.
   if(error.httpStatus===404){json(res,200,{ok:true,ignored:true});return true;}
   throw error;
  }
  const match=/^bipstart:([0-9a-f-]{36})$/.exec(String(payment.external_reference||''));
  if(!match||!uuid.test(match[1])){json(res,200,{ok:true});return true;}
  const order=(await sb('shop_billing_orders?id=eq.'+match[1]+'&select=*'))?.[0];
  if(!order){json(res,200,{ok:true});return true;}
  if(payment.status!=='approved'){json(res,200,{ok:true});return true;}
  // Em modo de teste, nunca ativar plano com pagamento real.
  if(payment.live_mode===true){json(res,422,{error:'Pagamento real recusado no ambiente de teste.'});return true;}
  if(order.status==='test_approved'){
   if(order.provider_ref!==String(payment.id)){json(res,409,{error:'Pedido de teste já confirmado com outro pagamento.'});return true;}
   json(res,200,{ok:true,test:true});return true;
  }
  if(order.status!=='pending'){json(res,409,{error:'Pedido não está pendente.'});return true;}
  if(!Object.hasOwn(prices,order.plan_code)||Number(order.amount)!==prices[order.plan_code]||Number(payment.transaction_amount)!==prices[order.plan_code]||payment.currency_id!=='BRL'){json(res,422,{error:'Pagamento incompatível.'});return true;}
  // Não ativar plano definitivo com dinheiro simulado em base de dados real.
  const updated=await sb('shop_billing_orders?id=eq.'+encodeURIComponent(order.id)+'&status=eq.pending','PATCH',{status:'test_approved',provider_ref:String(payment.id)});
  if(!updated?.length)throw Error('Pedido de teste não registrado.');
  json(res,200,{ok:true,test:true,planActivated:false});return true;
 }catch(error){console.error('BipStart billing:',error.message);json(res,500,{error:'Não foi possível processar a operação.'});return true;}
}
