/* Consulta pública de códigos GTIN. Não consulta dados de outras lojas.
 * Open Facts: limite público de 15 leituras de produto/minuto por IP.
 * Registros incompletos são sinalizados; preços/estoques não são inventados.
 */
const memo=new Map(), pending=new Map();
let minuteStart=0, remoteCalls=0;
const MAX_REMOTE_PER_MINUTE=12;
const hosts={food:'openfoodfacts.org',beauty:'openbeautyfacts.org',petfood:'openpetfoodfacts.org',product:'openproductsfacts.org'};
const fields=['code','product_type','product_name','product_name_pt','abbreviated_product_name','generic_name','generic_name_pt','brands','brand_owner','categories','categories_tags','main_category','quantity','product_quantity','product_quantity_unit','packaging','packaging_text','ingredients_text','ingredients_text_pt','labels','origins','countries','image_front_url','image_url'];
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
const clean=(x,limit=160)=>typeof x==='string'?x.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,limit):'';
const choose=(...values)=>values.map(x=>clean(x,500)).find(Boolean)||'';
const textTags=value=>Array.isArray(value)?value.map(v=>typeof v==='string'?v:typeof v?.lc_name==='string'?v.lc_name:'').filter(Boolean).join(', '):clean(value,500);
function checkDigitValid(code){
 if(!/^\d{8,14}$/.test(code))return false;
 const digits=[...code].map(Number);
 let sum=0;for(let i=digits.length-2,mult=3;i>=0;i--,mult=mult===3?1:3)sum+=digits[i]*mult;
 return (10-sum%10)%10===digits[digits.length-1];
}
function availableRequest(){
 const now=Date.now();
 if(now-minuteStart>=60000){minuteStart=now;remoteCalls=0;}
 if(remoteCalls>=MAX_REMOTE_PER_MINUTE)return false;
 remoteCalls++;return true;
}
function normalizeProduct(p,code,kind='food'){
 if(!p||typeof p!=='object')return null;
 const name=choose(p.product_name_pt,p.product_name,p.abbreviated_product_name,p.generic_name_pt,p.generic_name);
 const brand=textTags(p.brands).slice(0,120);
 const category=textTags(p.categories).slice(0,300);
 const quantity=choose(p.quantity,typeof p.product_quantity==='string'?p.product_quantity+' '+clean(p.product_quantity_unit):'').slice(0,90);
 const generic=choose(p.generic_name_pt,p.generic_name);
 const ingredients=choose(p.ingredients_text_pt,p.ingredients_text);
 const packaging=textTags(p.packaging_text||p.packaging).slice(0,160);
 const labels=textTags(p.labels).slice(0,120);
 const origins=textTags(p.origins).slice(0,120);
 if(!name&&!brand&&!category&&!quantity)return null;
 const product_type=hosts[p.product_type]?p.product_type:kind;
 const rawImage=choose(p.image_front_url,p.image_url);
 let image_url=null;
 try{const url=new URL(rawImage);if(url.protocol==='https:')image_url=url.href;}catch{}
 return {
  found:true,partial:!name,code,name:clean(name),brand,category,
  categories_tags:Array.isArray(p.categories_tags)?p.categories_tags.filter(x=>typeof x==='string').slice(0,16):[],
  quantity,generic_name:clean(generic,300),ingredients:clean(ingredients,400),
  packaging,labels,origins,product_type,image_url,
  source:'Open Facts',source_url:'https://world.'+hosts[product_type]+'/product/'+encodeURIComponent(code),
  barcode_valid:checkDigitValid(code)
 };
}
async function retrieve(code,host,version,kind){
 if(!availableRequest())throw Object.assign(new Error('Limite de consultas públicas temporariamente atingido. Tente novamente em um minuto.'),{throttled:true});
 const uri=new URL('https://world.'+hosts[host]+'/api/'+version+'/product/'+encodeURIComponent(code)+(version==='v2'?'.json':''));
 uri.searchParams.set('fields',fields.join(','));
 if(version==='v3'){uri.searchParams.set('product_type','all');uri.searchParams.set('lc','pt');uri.searchParams.set('cc','br');uri.searchParams.set('tags_lc','pt');}
 const response=await fetch(uri,{headers:{'User-Agent':'BipStart/1.1 (https://bipstart.shop)','Accept':'application/json'},signal:AbortSignal.timeout(5000)});
 if(response.status===404)return null;
 if(!response.ok)throw new Error('A base pública respondeu '+response.status+'.');
 const body=await response.json();
 if(body?.status===0||!body?.product)return null;
 return normalizeProduct(body.product,code,kind);
}
async function resolveProduct(code){
 let candidate=null,attempted=0,failed=0;
 const paths=[['food','v3','food'],['food','v2','food'],['beauty','v2','beauty'],['product','v2','product'],['petfood','v2','petfood']];
 for(const [host,version,kind] of paths){
  try{
   attempted++;
   const item=await retrieve(code,host,version,kind);
   if(item?.name)return item;
   if(item&&!candidate)candidate=item;
  }catch(error){
   if(error?.throttled)throw error;
   failed++;
   console.warn('GTIN: fonte pública sem resposta',host,version,error?.message);
  }
  // Open Facts v3 com product_type=all já consulta os quatro projetos.
  // Fallback v2 é usado apenas quando a consulta universal não encontrou nome.
 }
 if(candidate)return candidate;
 if(failed===attempted)throw new Error('As bases públicas estão indisponíveis no momento.');
 return {found:false,code,barcode_valid:checkDigitValid(code),message:'Código não localizado nas bases públicas. Confira o código e cadastre o produto manualmente.'};
}
export async function lookupBarcode(req,res,requestUrl){
 if(req.method!=='GET')return json(res,405,{error:'Método inválido.'});
 const code=String(requestUrl.searchParams.get('code')||'').trim();
 if(!/^\d{8,14}$/.test(code))return json(res,400,{error:'Use um GTIN numérico de 8 a 14 dígitos, preservando zeros à esquerda.'});
 const now=Date.now(),cached=memo.get(code);
 if(cached?.expires>now)return json(res,200,cached.data);
 if(pending.has(code)){
  try{return json(res,200,await pending.get(code));}
  catch(error){return json(res,error?.throttled?429:503,{error:error?.message||'Consulta indisponível.'});}
 }
 const work=resolveProduct(code);
 pending.set(code,work);
 try{
  const data=await work;
  if(memo.size>700)memo.clear();
  memo.set(code,{expires:now+(data.found?60:3)*60_000,data});
  return json(res,200,data);
 }catch(error){
  return json(res,error?.throttled?429:503,{error:error?.message||'Consulta indisponível. Preencha manualmente.'});
 }finally{pending.delete(code);}
}
