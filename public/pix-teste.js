'use strict';
const $=id=>document.getElementById(id);
let busy=false,credentialOk=false;
const readSession=()=>{try{return JSON.parse(localStorage.getItem('bipstart_customer_session')||'null')}catch{return null}};
function msg(value,error=false){$('notice').textContent=value;$('notice').style.color=error?'#ff9caa':'#cdbfdf'}
function loading(on){busy=on;$('create').disabled=on||!credentialOk;$('refresh').disabled=on;$('checkCredential').disabled=on;$('checkProxy').disabled=on}
async function checkCredential(){
 if(busy)return;
 const session=readSession();
 if(!session?.access_token){msg('Entre primeiro no painel da BipStart Homologação.',true);return}
 loading(true);
 credentialOk=false;
 try{
  const response=await fetch('/api/billing/pix-auth-check',{
   method:'GET',headers:{Authorization:'Bearer '+session.access_token}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Falha ao verificar credencial.');
  if(data.authorized){
   credentialOk=true;
   msg('Mercado Pago reconheceu a credencial de produção (HTTP '+data.httpStatus+'). Você pode prosseguir com o teste quando desejar.');
  }else{
   const hint=data.tokenHasWhitespace?' Verifique espaços extras no token.':
    data.tokenHasQuotes?' Verifique aspas copiadas junto da chave.':'';
   msg('Mercado Pago não autorizou a credencial: HTTP '+data.httpStatus
    +(data.providerErrorCode?', código '+data.providerErrorCode:'')+'.'+hint+' Confira o Access Token de produção da aplicação BipStart.',true);
  }
 }catch(e){msg(e.message,true)}
 finally{loading(false)}
}
async function checkProxy(){
 if(busy)return;
 const session=readSession();
 if(!session?.access_token){msg('Entre na conta BipStart antes de fazer o diagnóstico.',true);return}
 loading(true);
 try{
  const marker=crypto.randomUUID();
  const response=await fetch('/api/billing/pix-proxy-check?probe='+encodeURIComponent(marker),{
   method:'GET',cache:'no-store',
   headers:{Authorization:'Bearer '+session.access_token,'x-request-id':marker}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Não foi possível verificar o cabeçalho.');
  if(data.requestIdPreserved===true){
   msg('DIAGNÓSTICO: x-request-id PRESERVADO pelo proxy. Vamos investigar a chave e a assinatura do Mercado Pago.');
  }else{
   msg('DIAGNÓSTICO: x-request-id ALTERADO ou removido pelo proxy. Isso pode explicar o 401 do webhook: a assinatura depende do identificador original.',true);
  }
 }catch(error){msg('Falha no teste do proxy: '+error.message,true)}
 finally{loading(false)}
}
async function api(method){
 if(busy)return;
 const session=readSession();
 if(!session?.access_token){msg('Entre na BipStart pelo painel antes de continuar.',true);return}
 loading(true);
 try{
  const response=await fetch('/api/billing/pix-diagnostic',{
    method,headers:{Authorization:'Bearer '+session.access_token}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Não foi possível consultar o Mercado Pago');
  if(!data.created){msg('Nenhum PIX de diagnóstico criado.');return}
  $('result').classList.remove('hidden');
  $('paymentId').textContent=data.paymentId||'Aguardando criação';
  $('paymentStatus').textContent=data.status||'Aguardando';
  $('planWarning').textContent='Plano ativado: NÃO. Este é apenas um diagnóstico.';
  $('payInfo').classList.toggle('hidden',!data.paymentId||data.status==='approved');
  const link=String(data.ticketUrl||'');
  $('ticket').classList.toggle('hidden',!/^https:\/\/(?:www\.)?mercadopago\.com(\.br)?\//.test(link));
  if(link)$('ticket').href=link;
  const copy=String(data.pixCopyPaste||'');
  $('copyBox').classList.toggle('hidden',!copy);
  $('pix').value=copy;
  msg(data.status==='approved'?'Pagamento aprovado! Guarde o ID exibido. Nenhum plano foi ativado.':'Cobrança criada ou consultada. Pague somente se decidir continuar o teste.');
 }catch(e){msg(e.message,true)}
 finally{loading(false)}
}
$('checkCredential').addEventListener('click',checkCredential);
$('checkProxy').addEventListener('click',checkProxy);
$('create').addEventListener('click',()=>{
 if(!credentialOk){msg('Verifique a credencial antes de gerar o PIX.',true);return}
 if(!window.confirm('Criar uma cobrança PIX REAL de R$ 1,00 na aplicação BipStart? Só haverá transferência se você efetuar o pagamento. Este teste NÃO contrata plano.'))return;
 api('POST');
});
$('refresh').addEventListener('click',()=>api('GET'));
$('copyPix').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('pix').value);msg('Código PIX copiado. Verifique recebedor e valor no aplicativo do banco.')}
 catch{msg('Selecione o código PIX e copie manualmente.',true)}
});
if(readSession()?.access_token){msg('Conta localizada. Clique primeiro em Verificar credencial (sem cobrança).');api('GET')}
