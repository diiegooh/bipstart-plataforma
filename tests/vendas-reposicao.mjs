import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/cliente.js','utf8');
const css=readFileSync('public/cliente.css','utf8');
const page=readFileSync('public/cliente.html','utf8');
const migration=readFileSync('sql/bipstart_sales_cost_snapshot_20261014.sql','utf8');
const mkDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const products=[
 {id:'p1',name:'Coxinha',category:'Salgados',price:12,cost:5,stock:4,min_stock:10},
 {id:'p2',name:'Água',category:'Bebidas',price:6,cost:2,stock:13,min_stock:10},
 {id:'p3',name:'Sem estoque',category:'Geral',price:8,cost:3,stock:0,min_stock:0}
];
function fns(productsList=products,loadedReport=null){
 const start=source.indexOf('function salesDateRange(');
 const end=source.indexOf('function productStockState(product)',start);
 assert.ok(start>=0&&end>start);
 return new Function('products','salesReport','salesPeriod','salesDay','localReportDate','productStockState','fmt','esc','heading','tile','empty','salesLoading',
  source.slice(start,end)+';return {salesDateRange,saleLineFinancial,cardFeeInfo,salesPaymentTotals,salesReportData,reportFigures,restockProducts,renderRestockList,renderSalesReport,salesRecordInfo,salesRecordRow,salesPrintableHtml};')(
  productsList,loadedReport,'day','2026-10-14',mkDate,product=>{
   if(Number(product.stock)<=0)return {state:'out'};
   return Number(product.stock)<=Number(product.min_stock)?{state:'low'}:{state:'ok'};
  },amount=>'R$ '+Number(amount||0).toFixed(2),v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  (title)=>'<h2>'+title+'</h2>',
  (title,amount)=>'<span>'+title+': '+amount+'</span>',
  txt=>'<p>'+txt+'</p>',false);
}
const sales=[
 {id:'v1',total:24,payment_method:'pix',created_at:'2026-10-14T12:30:00Z'},
 {id:'v2',total:6,payment_method:'dinheiro',created_at:'2026-10-13T12:40:00Z'}
];
const items=[
 {sale_id:'v1',product_id:'p1',product_name:'Coxinha',quantity:2,unit_price:12,unit_cost:5},
 {sale_id:'v2',product_id:'p2',product_name:'Água',quantity:1,unit_price:6,unit_cost:null}
];

test('as funções compõem JavaScript válido e os arquivos usam versão nova',()=>{
 new vm.Script(source,{filename:'cliente.js'});
 assert.match(page,/cliente\.js\?v=63/);
 assert.match(page,/cliente\.css\?v=40/);
 assert.match(css,/\.sales-table-wrap/);
 assert.match(css,/\.restock-list/);
});

test('datas dia, semana segunda-domingo e mês são calculadas sem cruzar períodos',()=>{
 const f=fns();
 const day=f.salesDateRange('day','2026-10-14');
 assert.equal(new Date(day.start).getDate(),14);
 assert.equal(new Date(day.end)-new Date(day.start),86400000);
 const week=f.salesDateRange('week','2026-10-14');
 assert.equal(new Date(week.start).getDay(),1);
 assert.equal(new Date(week.end).getDay(),1);
 assert.equal((new Date(week.end)-new Date(week.start))/86400000,7);
 const month=f.salesDateRange('month','2026-10-14');
 assert.equal(new Date(month.start).getDate(),1);
 assert.equal(new Date(month.end).getMonth(),10);
 assert.throws(()=>f.salesDateRange('day','2026-02-30'),/Data inválida/);
});

test('custos históricos exatos são usados; vendas antigas são identificadas como estimativa',()=>{
 const f=fns();
 const exact=f.saleLineFinancial(items[0]);
 assert.deepEqual({revenue:exact.revenue,cost:exact.cost,profit:exact.profit,estimated:exact.estimated},
  {revenue:24,cost:10,profit:14,estimated:false});
 const old=f.saleLineFinancial(items[1]);
 assert.equal(old.revenue,6);
 assert.equal(old.cost,2);
 assert.equal(old.profit,4);
 assert.equal(old.estimated,true);
 const noCost=fns(products.filter(p=>p.id!=='p2')).saleLineFinancial(items[1]);
 assert.equal(noCost.profit,null);
 assert.equal(noCost.missing,true);
});

test('cada dia agrupa linhas, soma lucro bruto e sinaliza estimativas',()=>{
 const f=fns();
 const report=f.salesReportData(sales,items);
 assert.equal(report.days.length,2);
 assert.equal(report.figures.revenue,30);
 assert.equal(report.figures.cost,12);
 assert.equal(report.figures.profit,18);
 assert.equal(report.figures.estimated,1);
 assert.equal(report.figures.quantity,3);
 assert.equal(report.salesCount,2);
 assert.deepEqual(report.sales,sales);
 assert.deepEqual(report.days.map(day=>day.sales[0].number),[1,1]);
 assert.equal(report.days.reduce((sum,d)=>sum+d.total.profit,0),18);
 assert.match(source,/Lucro/);
 assert.match(source,/Custo/);
 assert.match(source,/Preço vendido/);
 assert.match(source,/Pagamento/);
});

test('Vendas abre após carregar registros e mostra faturamento, custo e lucro sem travar',()=>{
 const f=fns(products,{sales,items});
 const markup=f.renderSalesReport();
 assert.match(markup,/Vendas: 2/);
 assert.match(markup,/Total vendido: R\$ 30\.00/);
 assert.match(markup,/Custo: R\$ 12\.00/);
 assert.match(markup,/Lucro: R\$ 18\.00/);
 assert.match(markup,/Coxinha/);
 assert.match(markup,/Pix/);
 assert.match(markup,/Dinheiro/);
 assert.match(markup,/data-sales-period="day"/);
 assert.match(markup,/data-sales-period="week"/);
 assert.match(markup,/data-sales-period="month"/);
 const empty=fns(products,{sales:[],items:[]}).renderSalesReport();
 assert.match(empty,/Nenhuma venda registrada neste período/);
});

test('cada carrinho tem número próprio no dia e reúne produtos na mesma venda',()=>{
 const mixedSales=[
  {id:'v3',total:35,payment_method:'credito',created_at:'2026-10-17T14:00:00Z'},
  {id:'v2',total:8,payment_method:'dinheiro',created_at:'2026-10-17T12:00:00Z'},
  {id:'v4',total:6,payment_method:'pix',created_at:'2026-10-16T12:00:00Z'},
  {id:'v1',total:18,payment_method:'pix',created_at:'2026-10-17T09:00:00Z'}
 ];
 const mixedItems=[
  {sale_id:'v3',product_id:'p1',product_name:'Produto A',quantity:2,unit_price:15,unit_cost:5},
  {sale_id:'v3',product_id:'p2',product_name:'Produto B',quantity:1,unit_price:5,unit_cost:3},
  {sale_id:'v2',product_id:'p1',product_name:'Produto C',quantity:1,unit_price:8,unit_cost:4},
  {sale_id:'v1',product_id:'p1',product_name:'Produto D',quantity:2,unit_price:9,unit_cost:5},
  {sale_id:'v4',product_id:'p2',product_name:'Produto E',quantity:1,unit_price:6,unit_cost:2}
 ];
 const f=fns(products,{sales:mixedSales,items:mixedItems});
 const report=f.salesReportData();
 assert.equal(report.days.length,2);
 assert.deepEqual(report.days[0].sales.map(s=>s.sale.id),['v1','v2','v3']);
 assert.deepEqual(report.days[0].sales.map(s=>s.number),[1,2,3]);
 assert.deepEqual(report.days[1].sales.map(s=>s.number),[1]);
 assert.deepEqual(report.days[0].sales[2].lines.map(l=>l.item.product_name),['Produto A','Produto B']);
 assert.equal(report.days[0].sales[2].total.revenue,35);
 assert.equal(report.days[0].salesTotal,61);
 const html=f.renderSalesReport();
 const day=html.slice(html.indexOf('17 de outubro'),html.indexOf('16 de outubro'));
 assert.match(day,/Venda #1/);
 assert.match(day,/Venda #2/);
 assert.match(day,/Venda #3/);
 const sale3=day.slice(day.indexOf('aria-label="Venda #3"'));
 assert.match(sale3,/Produto A/);
 assert.match(sale3,/Produto B/);
 assert.match(sale3,/Total da venda: <strong>R\$ 35\.00/);
 assert.match(sale3,/Cartão de crédito/);
 assert.match(html,/1 venda\(s\)/);
 assert.match(css,/#workspace \.sales-checkout-heading/);
});

test('desconta a taxa por carrinho no líquido e no lucro, sem somar taxa por produto',()=>{
 const salesWithFees=[
  {id:'card',total:100,payment_method:'credito',card_fee_percent:3.99,card_fee_amount:3.99,created_at:'2026-10-14T12:30:00Z'},
  {id:'debit',total:40,payment_method:'debito',card_fee_percent:1.5,card_fee_amount:0.6,created_at:'2026-10-14T11:30:00Z'},
  {id:'pix',total:20,payment_method:'pix',card_fee_percent:0,card_fee_amount:0,created_at:'2026-10-14T10:30:00Z'}
 ];
 const itemsWithFees=[
  {sale_id:'card',product_id:'p1',product_name:'Produto A',quantity:1,unit_price:60,unit_cost:20},
  {sale_id:'card',product_id:'p2',product_name:'Produto B',quantity:1,unit_price:40,unit_cost:10},
  {sale_id:'debit',product_id:'p1',product_name:'Produto C',quantity:1,unit_price:40,unit_cost:15},
  {sale_id:'pix',product_id:'p1',product_name:'Produto D',quantity:1,unit_price:20,unit_cost:5}
 ];
 const f=fns(products,{sales:salesWithFees,items:itemsWithFees});
 const report=f.salesReportData();
 assert.equal(report.paymentTotals.gross,160);
 assert.ok(Math.abs(report.paymentTotals.cardFees-4.59)<0.001);
 assert.ok(Math.abs(report.paymentTotals.net-155.41)<0.001);
 assert.equal(report.paymentTotals.unknownFees,0);
 assert.equal(report.days[0].sales.length,3);
 assert.equal(report.days[0].sales.find(x=>x.sale.id==='card').lines.length,2);
 const html=f.renderSalesReport();
 assert.match(html,/Vendas: 3/);
 assert.match(html,/Unidades vendidas: 4/);
 assert.match(html,/Lucro: R\$ 105\.41/);
 const sale=html.slice(html.indexOf('Cartão de crédito'));
 assert.match(sale,/Taxa da maquininha \(3,99%\): <strong>−R\$ 3\.99/);
 assert.match(sale,/Recebimento líquido: <strong>R\$ 96\.01/);
 assert.match(sale,/Lucro: <strong>R\$ 66\.01/);
 assert.match(html,/Taxa da maquininha \(1,5%\): <strong>−R\$ 0\.60/);
 assert.match(html,/Lucro bruto<\/th>/);
});
test('venda antiga no cartão sem taxa continua sem dedução inventada',()=>{
 const old={id:'old',total:20,payment_method:'credito',card_fee_percent:null,
  card_fee_amount:null,created_at:'2026-10-14T14:30:00Z'};
 const f=fns(products,{sales:[old],items:[{sale_id:'old',product_id:'p1',
  product_name:'Antigo',quantity:1,unit_price:20,unit_cost:8}]});
 const r=f.salesReportData();
 assert.equal(r.paymentTotals.unknownFees,1);
 assert.equal(f.cardFeeInfo(old).known,false);
 const markup=f.renderSalesReport();
 assert.match(markup,/Taxa da maquininha: <strong>Não registrada/);
 assert.match(markup,/Recebimento líquido: <strong>Não informado/);
 assert.match(markup,/Lucro: <strong>—/);
 assert.match(markup,/venda\(s\) antiga\(s\) com taxa de cartão não registrada/);
 assert.equal(f.cardFeeInfo({payment_method:'pix',card_fee_amount:null}).amount,0);
 const migration=readFileSync('sql/bipstart_card_payment_fees_20261017.sql','utf8');
 assert.match(migration,/add column if not exists card_fee_percent numeric\(5,2\)/);
 assert.match(migration,/add column if not exists card_fee_amount numeric\(12,2\)/);
 assert.match(migration,/v_card_fee:=case when p_payment_method in \('credito','debito'\)/);
 assert.match(migration,/grant execute on function public\.bipstart_complete_sale\(uuid,jsonb,text,numeric\) to authenticated/);
 assert.match(source,/p_card_fee_percent:feePercent/);
 assert.match(source,/select:'id,shop_id,total,payment_method,card_fee_percent,card_fee_amount,created_at'/);
});

test('relatório visível apresenta só cinco indicadores e lista com todas as vendas',()=>{
 const f=fns(products,{sales,items});
 const html=f.renderSalesReport();
 const summary=html.match(/<div class="grid sales-period-totals">([\s\S]*?)<\/div>/)?.[1]||'';
 for(const name of ['Vendas','Unidades vendidas','Total vendido','Custo','Lucro'])
  assert.match(summary,new RegExp(name+':'));
 for(const unwanted of ['Taxas da maquininha','Recebimento líquido','Lucro bruto','Lucro após taxa'])
  assert.doesNotMatch(summary,new RegExp(unwanted));
 assert.match(html,/class="sales-records-table"/);
 assert.match(html,/Lista de vendas/);
 assert.match(html,/data-sales-export="receipt"/);
 assert.match(html,/data-sales-export="a4"/);
 assert.match(html,/<th>Venda<\/th><th>Data e hora<\/th><th>Unidades vendidas<\/th><th>Total vendido<\/th><th>Custo<\/th><th>Lucro<\/th>/);
 const visibleRows=html.match(/class="sales-record-profit"/g)||[];
 assert.equal(visibleRows.length,2);
 assert.match(css,/#workspace \.sales-records-table/);
});
test('exportação cupom não fiscal e A4/PDF contém registros do período sem alterar vendas',()=>{
 const date='2026-10-14T12:30:00Z';
 const sale={id:'card',total:100,payment_method:'credito',card_fee_percent:3.99,card_fee_amount:3.99,created_at:date};
 const items=[{sale_id:'card',product_id:'p1',product_name:'Produto <Promo>',quantity:2,unit_price:50,unit_cost:20}];
 const f=fns(products,{sales:[sale],items});
 const report=f.salesReportData();
 const receipt=f.salesPrintableHtml(report,'receipt','Loja <Exemplo>','14/10/2026');
 assert.match(receipt,/@page\{size:80mm 297mm;margin:2mm\}/);
 assert.match(receipt,/RELATÓRIO GERENCIAL · NÃO FISCAL/);
 assert.match(receipt,/Venda #1/);
 assert.match(receipt,/2× Produto &lt;Promo&gt;/);
 assert.match(receipt,/Lucro<\/b><b>R\$ 56\.01/);
 assert.match(receipt,/Imprimir \/ Salvar como PDF/);
 assert.doesNotMatch(receipt,/<Exemplo>|<Promo>/);
 const a4=f.salesPrintableHtml(report,'a4','Loja Teste','14/10/2026');
 assert.match(a4,/@page\{size:A4;margin:12mm\}/);
 assert.match(a4,/<table class="print-records">/);
 assert.match(a4,/<th>Venda<\/th><th>Data e hora<\/th>/);
 assert.match(a4,/R\$ 56\.01/);
 assert.match(a4,/NÃO FISCAL/);
 assert.throws(()=>f.salesPrintableHtml(report,'invalid','Loja','14/10/2026'),/Formato de exportação inválido/);
 assert.match(source,/if\(tab==='vendas'\)printSalesReport\(exportButton\.dataset\.salesExport\)/);
});
test('vendas do período carregam todas as páginas e somente itens da própria loja',()=>{
 assert.match(source,/async function salesPaginated\(/);
 assert.match(source,/offset:String\(offset\)/);
 assert.match(source,/sale_id:'in\.\('\+ids\+'\)'/);
 assert.match(source,/shop_id:'eq\.'\+selectedShop/);
 assert.match(source,/created_at\.gte\./);
 assert.match(source,/created_at\.lt\./);
 assert.match(source,/data-sales-period/);
 assert.match(source,/salesReferenceDate/);
 assert.doesNotMatch(source,/Data de referência/);
 assert.match(source,/<span class="sr-only">Selecionar data<\/span><input type="date" id="salesReferenceDate"/);
 assert.match(source,/if\(tab==='vendas'\)await loadSalesReport\(\)/);
});

test('reposição contempla baixo estoque, esgotados e soma o custo necessário',()=>{
 const f=fns();
 const rows=f.restockProducts();
 assert.equal(rows.length,2);
 const cox=rows.find(x=>x.product.id==='p1');
 assert.equal(cox.needed,7);
 assert.equal(cox.estimatedCost,35);
 const empty=rows.find(x=>x.product.id==='p3');
 assert.equal(empty.needed,1);
 assert.equal(empty.estimatedCost,3);
 assert.equal(rows.reduce((sum,x)=>sum+x.estimatedCost,0),38);
 const html=f.renderRestockList();
 assert.match(html,/Lista de reposição/);
 assert.doesNotMatch(html,/Produtos esgotados ou no mínimo\.|Quantidade necessária para ficar acima do estoque mínimo\./);
 assert.match(html,/R\$ 38\.00/);
 assert.match(html,/Custo unitário/);
 assert.match(html,/Valor da reposição/);
 assert.doesNotMatch(html,/Água/);
});

test('migração adiciona snapshot de custo, sem preencher valores históricos ou alterar estoque existente',()=>{
 assert.match(migration,/add column if not exists unit_cost numeric\(12,2\)/);
 assert.match(migration,/unit_cost is null or unit_cost>=0/);
 assert.match(migration,/create or replace function public\.bipstart_complete_sale/);
 assert.match(migration,/if not public\.can_write_shop\(p_shop_id\)/);
 assert.match(migration,/where id=v_item\.id and shop_id=p_shop_id and active=true for update/);
 assert.match(migration,/quantity,unit_price,unit_cost/);
 assert.match(migration,/v_product\.price,v_product\.cost/);
 assert.match(migration,/stock=stock-v_item\.qty/);
 assert.doesNotMatch(migration,/update public\.shop_sale_items set unit_cost/i);
 assert.match(migration,/notify pgrst, 'reload schema'/);
});


test('filtros de Vendas padronizam altura, cores, alinhamento e mobile',()=>{
 const css=readFileSync('public/cliente.css','utf8');
 assert.match(css,/#workspace \.sales-report-controls\{\s*--sales-filter-height:50px;/);
 assert.match(css,/--sales-filter-surface:#20152f/);
 assert.match(css,/--sales-filter-border:#594477/);
 assert.match(css,/align-items:flex-end/);
 assert.match(css,/#workspace \.sales-period-switch\{[\s\S]*height:var\(--sales-filter-height\)/);
 assert.match(css,/#workspace \.sales-report-controls>label\{[\s\S]*min-width:160px;margin:0/);
 assert.match(css,/#workspace \.sales-report-controls input\[type="date"\]\{[\s\S]*height:var\(--sales-filter-height\)/);
 assert.match(css,/#workspace \.sales-report-controls input\[type="date"\]\{[\s\S]*margin:0/);
 assert.match(css,/#workspace \.sales-report-controls>\[data-sales-refresh\]\{[\s\S]*height:var\(--sales-filter-height\)/);
 assert.match(css,/#workspace \.sales-report-controls>\[data-sales-refresh\]:focus-visible/);
 assert.match(css,/#workspace \.sales-report-controls>\.sales-period-switch\{flex:1 1 100%/);
 assert.match(css,/@media\(max-width:390px\)\{/);
 assert.match(source,/data-sales-period/);
 assert.match(source,/id="salesReferenceDate"/);
 assert.match(source,/data-sales-refresh/);
});
