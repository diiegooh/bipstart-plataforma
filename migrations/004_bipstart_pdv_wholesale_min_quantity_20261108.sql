-- Preço de atacado automático no PDV de homologação.
-- O RPC legado continua intacto; somente a interface de homologação chama a função nova.
alter table public.shop_products
  add column if not exists wholesale_min_quantity integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shop_products'::regclass
      and conname = 'shop_products_wholesale_min_quantity_check'
  ) then
    alter table public.shop_products
      add constraint shop_products_wholesale_min_quantity_check
      check (
        wholesale_min_quantity is null
        or (
          wholesale_min_quantity between 1 and 10000
          and wholesale_price is not null
        )
      );
  end if;
end
$$;

create or replace function public.bipstart_complete_sale_with_wholesale(
  p_shop_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_card_fee_percent numeric,
  p_discount_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item record;
  v_product public.shop_products%rowtype;
  v_subtotal numeric(12,2):=0;
  v_total numeric(12,2):=0;
  v_sale uuid;
  v_count integer:=0;
  v_card_fee numeric(12,2):=0;
  v_fee_percent numeric(5,2):=0;
  v_stock_before integer:=0;
  v_uncovered boolean:=false;
  v_unit_price numeric(12,2):=0;
begin
  if not public.can_write_shop(p_shop_id) then
    raise exception 'Loja sem permissão para registrar vendas.';
  end if;
  if p_payment_method not in ('dinheiro','pix','credito','debito') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_card_fee_percent is null or p_card_fee_percent < 0 or p_card_fee_percent > 100 then
    raise exception 'Taxa da maquininha inválida.' using errcode='22023';
  end if;
  if p_payment_method not in ('credito','debito') and p_card_fee_percent <> 0 then
    raise exception 'Taxa de cartão só pode ser aplicada a pagamentos por cartão.' using errcode='22023';
  end if;
  if p_discount_amount is null or p_discount_amount < 0 or
     p_discount_amount <> round(p_discount_amount,2) then
    raise exception 'Desconto inválido: informe um valor em reais com até dois decimais.' using errcode='22023';
  end if;
  if p_payment_method = 'pix' and p_discount_amount <> 0 then
    raise exception 'O desconto está disponível para dinheiro e cartão.' using errcode='22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'A venda deve conter entre 1 e 100 itens.';
  end if;
  v_fee_percent:=round(p_card_fee_percent,2);

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
    if not found then
      raise exception 'Produto não encontrado ou inativo.';
    end if;
    v_unit_price:=case
      when v_product.wholesale_price is not null
       and v_product.wholesale_min_quantity is not null
       and v_item.qty >= v_product.wholesale_min_quantity
      then v_product.wholesale_price
      else v_product.price
    end;
    v_subtotal:=v_subtotal+(v_unit_price*v_item.qty);
    v_count:=v_count+1;
  end loop;

  if v_count=0 then
    raise exception 'Sem itens válidos.';
  end if;
  if p_discount_amount > v_subtotal then
    raise exception 'O desconto não pode superar o subtotal da venda.' using errcode='22023';
  end if;
  v_total:=v_subtotal-p_discount_amount;
  v_card_fee:=case when p_payment_method in ('credito','debito')
    then round(v_total*v_fee_percent/100,2) else 0 end;

  insert into public.shop_sales(shop_id,total,payment_method,card_fee_percent,card_fee_amount,discount_amount)
  values(p_shop_id,v_total,p_payment_method,v_fee_percent,v_card_fee,p_discount_amount)
  returning id into v_sale;

  for v_item in
    select (i.value->>'product_id')::uuid as id,
           sum((i.value->>'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) i
    group by (i.value->>'product_id')::uuid
    order by (i.value->>'product_id')::uuid
  loop
    select * into v_product from public.shop_products
      where id=v_item.id and shop_id=p_shop_id;
    v_stock_before:=v_product.stock;
    v_uncovered:=v_stock_before < v_item.qty;
    v_unit_price:=case
      when v_product.wholesale_price is not null
       and v_product.wholesale_min_quantity is not null
       and v_item.qty >= v_product.wholesale_min_quantity
      then v_product.wholesale_price
      else v_product.price
    end;
    insert into public.shop_sale_items(
      sale_id,shop_id,product_id,product_name,quantity,unit_price,unit_cost,cost_pending
    ) values (
      v_sale,p_shop_id,v_item.id,v_product.name,v_item.qty,v_unit_price,
      case when v_uncovered then null else v_product.cost end,
      v_uncovered
    );
    update public.shop_products set stock=greatest(0,stock-v_item.qty)
      where id=v_item.id and shop_id=p_shop_id;
    insert into public.shop_stock_movements(shop_id,product_id,sale_id,quantity,reason)
    values(p_shop_id,v_item.id,v_sale,-v_item.qty,
      case when v_uncovered then 'Venda pelo PDV sem estoque suficiente' else 'Venda pelo PDV' end);
  end loop;
  return jsonb_build_object('sale_id',v_sale,'subtotal',v_subtotal,
    'discount_amount',p_discount_amount,'total',v_total,
    'card_fee_percent',v_fee_percent,'card_fee_amount',v_card_fee,
    'net_total',v_total-v_card_fee);
end
$function$;

revoke all on function public.bipstart_complete_sale_with_wholesale(uuid,jsonb,text,numeric,numeric) from public, anon;
grant execute on function public.bipstart_complete_sale_with_wholesale(uuid,jsonb,text,numeric,numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
