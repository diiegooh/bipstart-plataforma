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
function fns(productsList=products){
 const start=source.indexOf('function salesDateRange(');
 const end=source.indexOf('function productStockState(product)',start);
 assert.ok(start>=0&&end>start);
 return new Function('products','salesReport','salesPeriod','salesDay','localReportDate','productStockState','fmt','esc','heading','tile','empty',
  source.slice(start,end)+';return {salesDateRange,saleLineFinancial,salesReportData,reportFigures,restockProducts,renderRestockList,renderSalesReport};')(
  productsList,null,'day','2026-10-14',mkDate,product=>{
   if(Number(product.stock)<=0)return {state:'out'};
   return Number(product.stock)<=Number(product.min_stock)?{state:'low'}:{state:'ok'};
  },amount=>'R$ '+Number(amount||0).toFixed(2),v=>String(v??'').replace(/</g,'&lt;'),
  (title)=>'<h2>'+title+'</h2>',
  (title,amount)=>'<span>'+title+': '+amount+'</span>',
  txt=>'<p>'+txt+'</p>');
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
 assert.match(page,/cliente\.js\?v=43/);
 assert.match(page,/cliente\.css\?v=28/);
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
 assert.equal(report.days.reduce((sum,d)=>sum+d.total.profit,0),18);
 assert.match(source,/Lucro bruto estimado/);
 assert.match(source,/Custo dos itens/);
 assert.match(source,/Preço vendido/);
 assert.match(source,/Pagamento/);
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
