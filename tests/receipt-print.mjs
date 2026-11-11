import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync('public/cliente.js','utf8');
const css=readFileSync('public/cliente.css','utf8');
const html=readFileSync('public/cliente.html','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const start=js.indexOf('/* Comprovante não fiscal:');
const end=js.indexOf('/* Frente de caixa inspirada',start);
assert.ok(start>0&&end>start);

function createReceipt(shopName='Minha Loja <Teste>',shopId='store-1',settings={}){
 const data=new Map();
 if(Object.keys(settings).length)data.set('bipstart_receipt_settings_v1:'+shopId,JSON.stringify(settings));
 const shop={id:shopId,name:shopName,whatsapp:'11999998888',location_text:'Av. Teste, 100'};
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 const make=new Function('shop','localStorage','fmt','esc',
  js.slice(start,end)+';return {receiptSettings,receiptSettingsPanel,receiptSnapshot,receiptMarkup,receiptStandaloneHtml,receiptSettingsKey};');
 return {...make(shop,localStorage,v=>'R$ '+Number(v).toFixed(2),esc),data};
}
const sold=[{id:'p1',name:'Coxinha',qty:2,price:5},{id:'p2',name:'Suco',qty:1,price:7}];
const recorded=[{product_name:'Coxinha',quantity:2,unit_price:5},{product_name:'Suco',quantity:1,unit_price:7}];

test('comprovante é JavaScript válido e formato configurável por loja sem modificar banco',()=>{
 new vm.Script(js,{filename:'public/cliente.js'});
 assert.match(pkg.scripts.test,/tests\/receipt-print\.mjs/);
 const receipt=createReceipt();
 assert.equal(receipt.receiptSettings().paper,'80');
 assert.equal(receipt.receiptSettings().preview,true);
 assert.match(receipt.receiptSettingsPanel(),/Bobina térmica 58 mm/);
 assert.match(receipt.receiptSettingsPanel(),/Bobina térmica 80 mm/);
 assert.match(receipt.receiptSettingsPanel(),/Folha A4/);
 assert.match(receipt.receiptSettingsPanel(),/Abrir comprovante após finalizar cada venda/);
 assert.match(receipt.receiptSettingsPanel(),/Mensagem no rodapé/);
 assert.doesNotMatch(js,/case 'receiptSettingsForm':/);
 assert.match(js,/receiptPreference=\{paper:v\.paper/);
 assert.match(js,/class="receipt-settings-fields"/);
 assert.match(js,/localStorage\.setItem\(receiptSettingsKey\(\),JSON\.stringify\(/);
 assert.match(html,/id="receiptModal"/);
 assert.match(html,/data-receipt-content/);
 assert.match(html,/data-receipt-print/);
 assert.match(html,/data-receipt-download/);
 assert.match(css,/\.receipt-dialog\{/);
});
test('cada estabelecimento tem configuração isolada no navegador',()=>{
 const a=createReceipt('Loja A','loja-a',{paper:'58',preview:false,footer:'Volte sempre!'});
 const b=createReceipt('Loja B','loja-b',{paper:'a4',preview:true,footer:'Obrigado'});
 assert.equal(a.receiptSettings().paper,'58');
 assert.equal(a.receiptSettings().preview,false);
 assert.equal(a.receiptSettings().footer,'Volte sempre!');
 assert.equal(b.receiptSettings().paper,'a4');
 assert.notEqual(a.receiptSettingsKey(),b.receiptSettingsKey());
 assert.match(a.receiptSettingsPanel(),/value="58" selected/);
 assert.doesNotMatch(a.receiptSettingsPanel(),/name="preview" checked/);
 const invalid=createReceipt('C','loja-c',{paper:'arquivo-malicioso',footer:'X'.repeat(300)});
 assert.equal(invalid.receiptSettings().paper,'80');
 assert.equal(invalid.receiptSettings().footer.length,120);
});
test('venda registrada usa itens persistidos e pagamento real, incluindo troco',()=>{
 const f=createReceipt();
 const data=f.receiptSnapshot({sale_id:'8b11-1234',total:17},'dinheiro','20',sold,recorded);
 assert.equal(data.shopId,'store-1');
 assert.equal(data.total,17);
 assert.equal(data.id,'8b11-1234');
 assert.deepEqual(data.items,[{name:'Coxinha',qty:2,price:5},{name:'Suco',qty:1,price:7}]);
 assert.equal(data.priceVerified,true);
 const markup=f.receiptMarkup(data);
 assert.match(markup,/8b11-1234/);
 assert.match(markup,/Dinheiro/);
 assert.match(markup,/R\$ 20\.00/);
 assert.match(markup,/R\$ 3\.00/);
 assert.match(markup,/NÃO FISCAL/);
 assert.match(markup,/NFC-e/);
 assert.match(markup,/TOTAL DA VENDA/);
 assert.match(markup,/Coxinha/);
 assert.match(markup,/Suco/);
 assert.match(markup,/Av\. Teste, 100/);
 assert.doesNotMatch(markup,/Preço de custo|Lucro bruto/);
});
test('resumo jamais apresenta valores não confirmados como se fossem do servidor',()=>{
 const f=createReceipt();
 const bad=f.receiptSnapshot({sale_id:'a',total:22},'pix','',sold,[]);
 assert.equal(bad.priceVerified,false);
 assert.equal(bad.total,22);
 const content=f.receiptMarkup(bad);
 assert.match(content,/R\$ 22\.00/);
 assert.match(content,/Valores unitários de referência/);
 assert.doesNotMatch(content,/Valor recebido/);
 const trusted=f.receiptSnapshot({sale_id:'a',total:17},'pix','',sold,recorded);
 assert.equal(trusted.priceVerified,true);
 assert.doesNotMatch(f.receiptMarkup(trusted),/Valores unitários de referência/);
});
test('nome da loja, endereço, itens e rodapé são escapados para impedir HTML arbitrário',()=>{
 const f=createReceipt('<img src=x onerror=alert(1)>','shop-secret',{footer:'<script>alert(1)</script>'});
 const item=[{id:'1',name:'<script>alert(99)</script>',qty:1,price:9.9}];
 const receipt=f.receiptSnapshot({sale_id:'ab-cd',total:9.9},'credito','',item,
  [{product_name:'<script>alert(99)</script>',quantity:1,unit_price:9.9}]);
 const output=f.receiptStandaloneHtml(receipt,'80');
 assert.doesNotMatch(output,/<script>/);
 assert.doesNotMatch(output,/<img src=x/);
 assert.match(output,/&lt;script&gt;/);
 assert.match(output,/&lt;img src=x/);
 assert.match(output,/Cartão de crédito/);
 assert.doesNotMatch(output,/supabase|Bearer|access_token/);
});
test('exportação usa tamanhos de página térmica ou A4 e abre o diálogo de impressão',()=>{
 const f=createReceipt();
 const receipt=f.receiptSnapshot({sale_id:'123',total:17},'pix','',sold,recorded);
 assert.match(f.receiptStandaloneHtml(receipt,'58'),/@page\{size:58mm \d+mm;margin:2mm\}/);
 assert.match(f.receiptStandaloneHtml(receipt,'80'),/@page\{size:80mm \d+mm;margin:2mm\}/);
 assert.match(f.receiptStandaloneHtml(receipt,'a4'),/@page\{size:A4;margin:12mm\}/);
 assert.match(f.receiptStandaloneHtml(receipt,'outro'),/@page\{size:80mm \d+mm;margin:2mm\}/);
 assert.match(f.receiptStandaloneHtml(receipt,'80'),/onclick="window\.print\(\)"/);
 assert.match(js,/popup\.setTimeout\(\(\)=>\{try\{popup\.print\(\)\}/);
 assert.match(js,/new Blob\(\[html\],\{type:'text\/html;charset=utf-8'\}\)/);
 assert.match(js,/if\(receiptSettings\(\)\.preview\)showReceiptDialog\(lastReceipt\)/);
 assert.match(js,/if\(data\?\.sale_id\)recorded=await rest\('shop_sale_items'/);
 assert.match(js,/lastReceipt=receiptSnapshot\(data,v\.payment_method,v\.payment_method==='dinheiro'\?String\(parseMoneyInput\(v\.received\)\): '',sold,recorded\)/);
 assert.match(js,/data-receipt-last/);
 assert.match(js,/lastReceipt=null/);
});
