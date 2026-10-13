'use strict';
const $=id=>document.getElementById(id);
let busy=false;
const readSession=()=>{try{return JSON.parse(localStorage.getItem('bipstart_customer_session')||'null')}catch{return null}};
function msg(value,error=false){$('notice').textContent=value;$('notice').style.color=error?'#ff9caa':'#cdbfdf'}
function loading(on){busy=on;$('create').disabled=on;$('refresh').disabled=on}
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
$('create').addEventListener('click',()=>{
 if(!window.confirm('Criar uma cobrança PIX REAL de R$ 1,00 na aplicação BipStart? Só haverá transferência se você efetuar o pagamento. Este teste NÃO contrata plano.'))return;
 api('POST');
});
$('refresh').addEventListener('click',()=>api('GET'));
$('copyPix').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('pix').value);msg('Código PIX copiado. Verifique recebedor e valor no aplicativo do banco.')}
 catch{msg('Selecione o código PIX e copie manualmente.',true)}
});
if(readSession()?.access_token){msg('Conta localizada. Consulte para verificar um PIX anterior ou gere o teste de R$ 1,00.');api('GET')}
