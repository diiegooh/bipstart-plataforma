// Webhook de novos testes gratuitos. Configure um Database Webhook INSERT em public.shops.
// Nunca use chave da Meta ou segredo do webhook no navegador.
import {timingSafeEqual} from 'node:crypto';

const digits=v=>String(v||'').replace(/\D/g,'');
const phone=v=>{const p=digits(v);return /^55\d{10,11}$/.test(p)?p:/^\d{10,11}$/.test(p)?'55'+p:null};
const reply=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))};
function validSecret(given,expected){
 const a=Buffer.from(String(given||''));const b=Buffer.from(String(expected||''));
 return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);
}
async function json(req){
 let raw='',size=0;
 for await(const chunk of req){size+=chunk.length;if(size>8192)throw Error('payload too large');raw+=chunk.toString('utf8')}
 return JSON.parse(raw);
}
export function signupTemplate(to,shopName,templateName){
 return {messaging_product:'whatsapp',to,type:'template',template:{name:templateName,language:{code:'pt_BR'},components:[{type:'body',parameters:[{type:'text',text:String(shopName||'Loja').slice(0,120)}]}]}};
}
export async function notifyNewTrial(req,res,{env=process.env,fetcher=fetch}={}){
 const secret=String(env.TRIAL_WEBHOOK_SECRET||'');
 if(!secret||!validSecret(req.headers['x-bipstart-webhook-secret'],secret))return reply(res,401,{error:'unauthorized'});
 let body;
 try{body=await json(req)}catch{return reply(res,400,{error:'invalid_payload'})}
 const row=body?.record;
 if(body?.type!=='INSERT'||body?.table!=='shops'||body?.schema!=='public'||
    row?.signup_choice!=='trial'||typeof row?.id!=='string')return reply(res,200,{ignored:true});
 const recipient=phone(env.TRIAL_ALERT_WHATSAPP);
 const token=String(env.WHATSAPP_CLOUD_ACCESS_TOKEN||'');
 const phoneId=String(env.WHATSAPP_CLOUD_PHONE_NUMBER_ID||'');
 const template=String(env.WHATSAPP_TEMPLATE_NEW_TRIAL||'bipstart_novo_teste');
 if(!recipient||!token||!phoneId||!/^[a-z0-9_]+$/.test(template))return reply(res,503,{error:'notification_not_configured'});
 const ver=/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_API_VERSION||'')?env.WHATSAPP_GRAPH_API_VERSION:'v23.0';
 try{
  const response=await fetcher('https://graph.facebook.com/'+ver+'/'+encodeURIComponent(phoneId)+'/messages',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify(signupTemplate(recipient,row.name,template)),
   signal:AbortSignal.timeout(10000)
  });
  if(!response.ok){console.error('Aviso novo teste não aceito pela Meta:',response.status);return reply(res,502,{error:'provider_rejected'})}
  return reply(res,200,{accepted:true});
 }catch(error){console.error('Falha ao solicitar aviso novo teste:',error?.name);return reply(res,502,{error:'provider_unavailable'})}
}
