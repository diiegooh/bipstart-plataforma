// Server-side notifications for status changes on the public menu.
// Requires a Meta-approved WhatsApp utility template and customer opt-in.
const ORDER_STEPS=Object.freeze({awaiting_confirmation:'confirmed',confirmed:'preparing',out_for_delivery:'fulfilled'});
const ORDER_LABELS=Object.freeze({confirmed:'Confirmado',preparing:'Em preparo',out_for_delivery:'Saiu para entrega',fulfilled:'Finalizado',cancelled:'Cancelado'});
const PAYMENT_LABELS=Object.freeze({paid:'Pago',cancelled:'Pagamento cancelado'});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function orderUpdateMessage({shopName,orderId,customerName,field,status}){
 const kind=field==='status'?'pedido':'pagamento';
 const label=(field==='status'?ORDER_LABELS:PAYMENT_LABELS)[status]||status;
 return 'Olá, '+customerName+'! A loja '+shopName+' informa que o '+kind+' do pedido #'+String(orderId).slice(0,8)+' foi atualizado para: '+label+'. Em caso de dúvidas, responda a esta mensagem.';
}

export function templatePayload({to,shopName,orderId,customerName,field,status,templateName='bipstart_atualizacao_pedido'}){
 const label=(field==='status'?ORDER_LABELS:PAYMENT_LABELS)[status]||status;
 return {
  messaging_product:'whatsapp',to,type:'template',
  template:{
   name:templateName,language:{code:'pt_BR'},
   components:[{type:'body',parameters:[
    {type:'text',text:String(customerName).slice(0,120)},
    {type:'text',text:String(shopName).slice(0,120)},
    {type:'text',text:field==='status'?'pedido':'pagamento'},
    {type:'text',text:String(orderId).slice(0,8)},
    {type:'text',text:label}
   ]}]
  }
 };
}

function recipientNumber(phone){
 const value=String(phone||'').replace(/\D/g,'');
 if(/^\d{10,11}$/.test(value))return '55'+value;
 if(/^55\d{10,11}$/.test(value))return value;
 return null;
}

function sendJson(res,code,data){
 res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
 res.end(JSON.stringify(data));
}
async function readJson(req,maxBytes=2048){
 let input='';
 for await(const chunk of req){
  input+=chunk.toString('utf8');
  if(Buffer.byteLength(input)>maxBytes)throw Object.assign(Error('Requisição muito grande.'),{status:413});
 }
 try{return JSON.parse(input);}catch{throw Object.assign(Error('JSON inválido.'),{status:400});}
}
function makeError(code,message){return Object.assign(Error(message),{status:code})}
async function fetchRows(fetcher,url,headers,options={}){
 const response=await fetcher(url,{...options,headers:{...headers,...(options.headers||{})},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw makeError(response.status===401?401:502,'Não foi possível consultar o pedido com segurança.');
 const rows=await response.json();
 if(!Array.isArray(rows))throw makeError(502,'Resposta inválida da consulta.');
 return rows;
}

export async function updateOnlineOrderAndNotify(req,res,{env=process.env,fetcher=fetch}={}){
 try{
  const bearer=String(req.headers.authorization||'');
  if(!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer))throw makeError(401,'Entre na conta para alterar pedidos.');
  const apiUrl=String(env.SUPABASE_URL||'').replace(/\/$/,'');
  const apiKey=String(env.SUPABASE_PUBLISHABLE_KEY||'');
  if(!/^https:\/\//.test(apiUrl)||!apiKey)throw makeError(503,'Integração do banco não configurada.');
  const {orderId,shopId,field,action,expected}=await readJson(req);
  if(!UUID.test(orderId||'')||!UUID.test(shopId||'')||!['status','payment_status'].includes(field)||
     !['advance','cancel','finish'].includes(action)||typeof expected!=='string'||
     (action==='finish'&&field!=='status'))
    throw makeError(400,'Etapa ou pedido inválido.');
  const headers={apikey:apiKey,Authorization:bearer};
  const getUrl=new URL(apiUrl+'/rest/v1/shop_online_orders');
  getUrl.searchParams.set('select','id,shop_id,customer_name,customer_phone,delivery_method,status,payment_status,whatsapp_updates_opt_in');
  getUrl.searchParams.set('id','eq.'+orderId);
  getUrl.searchParams.set('shop_id','eq.'+shopId);
  getUrl.searchParams.set('limit','1');
  const [order]=await fetchRows(fetcher,getUrl.toString(),headers);
  if(!order)throw makeError(404,'Pedido não encontrado ou sem permissão.');
  if(order[field]!==expected)throw makeError(409,'A situação foi alterada. Atualize os pedidos.');
  const terminal=field==='status'?['cancelled','fulfilled']:['cancelled'];
  if(terminal.includes(expected))throw makeError(409,'Este status já foi encerrado.');
  const next=action==='cancel'?'cancelled':action==='finish'?'fulfilled':
    field==='status'?(expected==='preparing'?
      (order.delivery_method==='delivery'?'out_for_delivery':'fulfilled'):ORDER_STEPS[expected]):
      expected==='pending'?'paid':null;
  if(!next)throw makeError(409,'Não há uma próxima etapa para este status.');
  const patchUrl=new URL(getUrl);
  patchUrl.searchParams.set('select','id,'+field);
  patchUrl.searchParams.set(field,'eq.'+expected);
  const updated=await fetchRows(fetcher,patchUrl.toString(),headers,{method:'PATCH',headers:{Prefer:'return=representation','Content-Type':'application/json'},body:JSON.stringify({[field]:next})});
  if(updated.length!==1)throw makeError(409,'Outro atendente alterou o pedido. Atualize para continuar.');

  let notification='opt_out',manualUrl=null;
  if(order.whatsapp_updates_opt_in===true){
   const phone=recipientNumber(order.customer_phone);
   const shopsUrl=new URL(apiUrl+'/rest/v1/shops');
   shopsUrl.searchParams.set('select','name');shopsUrl.searchParams.set('id','eq.'+shopId);shopsUrl.searchParams.set('limit','1');
   let shopName='Estabelecimento';
   try{const [shop]=await fetchRows(fetcher,shopsUrl.toString(),headers);if(shop?.name)shopName=String(shop.name);}catch{ /* status already changed */ }
   const message=orderUpdateMessage({shopName,orderId,customerName:order.customer_name,field,status:next});
   manualUrl=phone?'https://wa.me/'+phone+'?text='+encodeURIComponent(message):null;
   const metaToken=String(env.WHATSAPP_CLOUD_ACCESS_TOKEN||''),phoneId=String(env.WHATSAPP_CLOUD_PHONE_NUMBER_ID||'');
   if(!phone){notification='invalid_phone';manualUrl=null;}
   else if(!metaToken||!/^\d+$/.test(phoneId)){notification='manual';}
   else{
    const version=/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_API_VERSION||'')?env.WHATSAPP_GRAPH_API_VERSION:'v23.0';
    const templateName=String(env.WHATSAPP_TEMPLATE_ORDER_UPDATE||'bipstart_atualizacao_pedido');
    try{
     const m=await fetcher('https://graph.facebook.com/'+version+'/'+phoneId+'/messages',{
      method:'POST',
      headers:{Authorization:'Bearer '+metaToken,'Content-Type':'application/json'},
      body:JSON.stringify(templatePayload({to:phone,shopName,orderId,customerName:order.customer_name,field,status:next,templateName})),
      signal:AbortSignal.timeout(12000)
     });
     const result=await m.json().catch(()=>null);
     notification=m.ok&&result?.messages?.[0]?.id?'accepted':'manual';
     if(notification!=='accepted')console.error('WhatsApp não aceitou atualização do pedido:',m.status,result?.error?.code||'sem codigo');
     else manualUrl=null;
    }catch(error){
     notification='manual';
     console.error('Falha ao solicitar atualização via WhatsApp:',error?.name||'erro');
    }
   }
  }
  sendJson(res,200,{updated:true,field,status:next,notification,manualUrl});
 }catch(error){
  const code=[400,401,403,404,409,413,503].includes(error?.status)?error.status:500;
  if(code===500)console.error('Falha na atualização de pedido:',error?.message||'erro');
  sendJson(res,code,{updated:false,error:code===500?'Não foi possível atualizar o pedido.':error.message});
 }
}
