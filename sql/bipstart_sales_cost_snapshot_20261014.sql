-- BipStart: preserve product acquisition cost as a snapshot at the point of sale.
-- Existing items remain NULL: past cost/profit must not be presented as exact.
alter table public.shop_sale_items
  add column if not exists unit_cost numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.shop_sale_items'::regclass
      and conname='shop_sale_items_unit_cost_nonnegative'
  ) then
    alter table public.shop_sale_items
      add constraint shop_sale_items_unit_cost_nonnegative check (unit_cost is null or unit_cost>=0);
  end if;
end $$;

-- This function already authorizes the shop and locks product rows before stock changes.
-- The only behavioral change is capturing the same product's cost at sale time.
create or replace function public.bipstart_complete_sale(
 p_shop_id uuid,p_items jsonb,p_payment_method text
) returns jsonb
language plpgsql security definer set search_path='public'
as $function$
declare
 v_item record;
 v_product public.shop_products%rowtype;
 v_total numeric(12,2):=0;
 v_sale uuid;
 v_count integer:=0;
begin
 if not public.can_write_shop(p_shop_id) then
   raise exception 'Loja sem permissão para registrar vendas.';
 end if;
 if p_payment_method not in ('dinheiro','pix','credito','debito') then
   raise exception 'Forma de pagamento inválida.';
 end if;
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
   raise exception 'A venda deve conter entre 1 e 100 itens.';
 end if;
 -- Deterministic locking prevents competing sales from producing a negative balance.
 for v_item in
   select (i.value->>'product_id')::uuid as id,
          sum((i.value->>'quantity')::integer)::integer as qty
   from jsonb_array_elements(p_items) i
   group by (i.value->>'product_id')::uuid
   order by (i.value->>'product_id')::uuid
 loop
   if v_item.qty < 1 or v_item.qty > 10000 then
     raise exception 'Quantidade inválida.';
   end if;
   select * into v_product from public.shop_products
     where id=v_item.id and shop_id=p_shop_id and active=true for update;
   if not found then raise exception 'Produto não encontrado ou inativo.'; end if;
   if v_product.stock < v_item.qty then
     raise exception 'Estoque insuficiente para %.',v_product.name;
   end if;
   v_total:=v_total+(v_product.price*v_item.qty);
   v_count:=v_count+1;
 end loop;
 if v_count=0 then raise exception 'Sem itens válidos.'; end if;
 insert into public.shop_sales(shop_id,total,payment_method)
 values(p_shop_id,v_total,p_payment_method) returning id into v_sale;
 for v_item in
   select (i.value->>'product_id')::uuid as id,
          sum((i.value->>'quantity')::integer)::integer as qty
   from jsonb_array_elements(p_items) i
   group by (i.value->>'product_id')::uuid
   order by (i.value->>'product_id')::uuid
 loop
   select * into v_product from public.shop_products
     where id=v_item.id and shop_id=p_shop_id;
   insert into public.shop_sale_items(
     sale_id,shop_id,product_id,product_name,quantity,unit_price,unit_cost
   ) values (
     v_sale,p_shop_id,v_item.id,v_product.name,v_item.qty,v_product.price,v_product.cost
   );
   update public.shop_products set stock=stock-v_item.qty where id=v_item.id;
   insert into public.shop_stock_movements(shop_id,product_id,sale_id,quantity,reason)
   values(p_shop_id,v_item.id,v_sale,-v_item.qty,'Venda pelo PDV');
 end loop;
 return jsonb_build_object('sale_id',v_sale,'total',v_total);
end $function$;

notify pgrst, 'reload schema';
