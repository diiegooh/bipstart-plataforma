/* Consulta pública por GTIN. Nenhum preço ou dado da loja é enviado ao provedor. */
const memo=new Map();
let minuteStart=0, callsThisMinute=0;
const sources={food:'openfoodfacts.org',beauty:'openbeautyfacts.org',petfood:'openpetfoodfacts.org',product:'openproductsfacts.org'};
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
const clean=(v,n=160)=>typeof v==='string'?v.trim().slice(0,n):'';
export async function lookupBarcode(req,res,requestUrl){
 if(req.method!=='GET')return json(res,405,{error:'Método inválido.'});
 const code=String(requestUrl.searchParams.get('code')||'').trim();
 if(!/^[0-9]{8,14}$/.test(code))return json(res,400,{error:'Informe um código de barras numérico de 8 a 14 dígitos.'});
 const now=Date.now(),hit=memo.get(code);
 if(hit&&hit.exp>now)return json(res,200,hit.data);
 if(now-minuteStart>60000){minuteStart=now;callsThisMinute=0;}
 if(callsThisMinute>=10)return json(res,429,{error:'Muitas consultas. Aguarde um minuto e tente novamente.'});
 callsThisMinute++;
 const query=new URL('https://world.openfoodfacts.org/api/v3/product/'+encodeURIComponent(code));
 query.searchParams.set('product_type','all');
 query.searchParams.set('lc','pt');
 query.searchParams.set('cc','br');
 query.searchParams.set('fields','code,product_type,product_name,product_name_pt,brands,categories,quantity,image_front_url,image_url,generic_name,generic_name_pt');
 try{
  const response=await fetch(query,{headers:{'User-Agent':'BipStart/1.0 (https://bipstart.shop)','Accept':'application/json'},signal:AbortSignal.timeout(6500)});
  if(response.status===404){
   const data={found:false,code,message:'Produto não encontrado na base pública. Cadastre os dados manualmente.'};
   memo.set(code,{exp:now+15*60_000,data});
   return json(res,200,data);
  }
  if(!response.ok)throw Error('A base de produtos está indisponível ('+response.status+').');
  const payload=await response.json();
  const p=payload?.product;
  if(!p||!clean(p.product_name_pt||p.product_name||p.generic_name_pt||p.generic_name)){
   const data={found:false,code,message:'Produto não encontrado ou sem descrição cadastrada na base pública.'};
   memo.set(code,{exp:now+15*60_000,data});
   return json(res,200,data);
  }
  const type=sources[p.product_type]?p.product_type:'food';
  const photo=clean(p.image_front_url||p.image_url,500);
  let image_url=null;
  try{const u=new URL(photo);if(u.protocol==='https:')image_url=u.href;}catch{}
  const data={
   found:true,code,
   name:clean(p.product_name_pt||p.product_name||p.generic_name_pt||p.generic_name),
   brand:clean(p.brands,120),category:clean(p.categories,120),
   quantity:clean(p.quantity,90),
   description:clean(p.generic_name_pt||p.generic_name,500),
   image_url,product_type:type,
   source:'Open Facts',
   source_url:'https://world.'+sources[type]+'/product/'+encodeURIComponent(code)
  };
  if(memo.size>500)memo.clear();
  memo.set(code,{exp:now+60*60_000,data});
  return json(res,200,data);
 }catch(error){
  console.warn('Consulta pública de código de barras falhou:',error?.message||error);
  return json(res,503,{error:'Consulta externa indisponível. Você pode preencher os dados manualmente.'});
 }
}
