-- Ficha técnica de insumos para itens do PDV.
-- O RPC legado permanece intacto; somente PDVs atualizados usam o novo fluxo.

create table if not exists public.shop_product_ingredients (
  shop_id uuid not null,
  product_id uuid not null references public.shop_products(id) on delete cascade,
  ingredient_product_id uuid not null references public.shop_products(id) on delete cascade,
  quantity_per_unit integer not null
    constraint shop_product_ingredients_quantity_check check (quantity_per_unit between 1 and 10000),
  created_at timestamptz not null default now(),
  constraint shop_product_ingredients_pk primary key (shop_id, product_id, ingredient_product_id),
  constraint shop_product_ingredients_not_self check (product_id <> ingredient_product_id)
);

create index if not exists shop_product_ingredients_ingredient_idx
  on public.shop_product_ingredients (shop_id, ingredient_product_id);

alter table public.shop_product_ingredients enable row level security;

revoke all on public.shop_product_ingredients from public, anon, authenticated;
grant select on public.shop_product_ingredients to authenticated;

drop policy if exists shop_product_ingredients_owner_read
  on public.shop_product_ingredients;

create policy shop_product_ingredients_owner_read
  on public.shop_product_ingredients
  for select
  to authenticated
  using (
    public.is_shop_owner(shop_id)
    and public.is_shop_enabled(shop_id)
  );

create or replace function public.bipstart_save_product_ingredients(
  p_shop_id uuid,
  p_product_id uuid,
  p_ingredients jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lock_id uuid;
  v_ingredient record;
  v_count integer := 0;
begin
  if not public.can_write_shop(p_shop_id) then
    raise exception 'Loja sem permissão para editar a ficha de insumos.';
  end if;

  if p_product_id is null then
    raise exception 'Produto inválido.' using errcode='22023';
  end if;

  if jsonb_typeof(p_ingredients) is distinct from 'array' then
    raise exception 'Informe uma lista válida de insumos.' using errcode='22023';
  end if;

  if jsonb_array_length(p_ingredients) > 50 then
    raise exception 'Adicione no máximo 50 insumos por item.' using errcode='22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_ingredients) as i(
      ingredient_product_id uuid,
      quantity_per_unit integer
    )
    where i.ingredient_product_id is null
       or i.quantity_per_unit is null
       or i.quantity_per_unit not between 1 and 10000
  ) then
    raise exception 'Cada insumo precisa ter um item e uma quantidade entre 1 e 10.000.'
      using errcode='22023';
  end if;

  if exists (
    select i.ingredient_product_id
    from jsonb_to_recordset(p_ingredients) as i(
      ingredient_product_id uuid,
      quantity_per_unit integer
    )
    group by i.ingredient_product_id
    having count(*) > 1
  ) then
    raise exception 'Cada insumo pode aparecer somente uma vez na ficha.'
      using errcode='22023';
  end if;

  -- Trava produto e insumos em ordem estável para evitar conflitos de concorrência.
  for v_lock_id in
    select p_product_id
    union
    select (value->>'ingredient_product_id')::uuid
    from jsonb_array_elements(p_ingredients)
    order by 1
  loop
    perform 1
    from public.shop_products
    where id = v_lock_id
      and shop_id = p_shop_id
    for update;

    if not found then
      raise exception 'Produto ou insumo não pertence a esta loja.'
        using errcode='22023';
    end if;
  end loop;

  if not exists (
    select 1
    from public.shop_products
    where id = p_product_id
      and shop_id = p_shop_id
  ) then
    raise exception 'Produto não encontrado nesta loja.';
  end if;

  if jsonb_array_length(p_ingredients) > 0
     and exists (
       select 1
       from public.shop_product_ingredients
       where shop_id = p_shop_id
         and ingredient_product_id = p_product_id
     ) then
    raise exception 'Este item já é usado como insumo. Remova-o das outras fichas antes de criar uma ficha própria.'
      using errcode='22023';
  end if;

  for v_ingredient in
    select i.ingredient_product_id
    from jsonb_to_recordset(p_ingredients) as i(
      ingredient_product_id uuid,
      quantity_per_unit integer
    )
  loop
    if v_ingredient.ingredient_product_id = p_product_id then
      raise exception 'Um item não pode ser insumo de si mesmo.'
        using errcode='22023';
    end if;

    if exists (
      select 1
      from public.shop_product_ingredients
      where shop_id = p_shop_id
        and product_id = v_ingredient.ingredient_product_id
    ) then
      raise exception 'Itens com ficha de insumos não podem ser usados como insumos de outro item.'
        using errcode='22023';
    end if;
  end loop;

  delete from public.shop_product_ingredients
  where shop_id = p_shop_id
    and product_id = p_product_id;

  insert into public.shop_product_ingredients (
    shop_id,
    product_id,
    ingredient_product_id,
    quantity_per_unit
  )
  select
    p_shop_id,
    p_product_id,
    i.ingredient_product_id,
    i.quantity_per_unit
  from jsonb_to_recordset(p_ingredients) as i(
    ingredient_product_id uuid,
    quantity_per_unit integer
  );

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'product_id', p_product_id,
    'ingredients_saved', v_count
  );
end
$function$;

revoke all on function public.bipstart_save_product_ingredients(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.bipstart_save_product_ingredients(uuid, uuid, jsonb)
  to authenticated, service_role;

create or replace function public.bipstart_complete_sale_with_ingredients(
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
  v_recipe record;
  v_lock_id uuid;
  v_product public.shop_products%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_sale uuid;
  v_count integer := 0;
  v_card_fee numeric(12,2) := 0;
  v_fee_percent numeric(5,2) := 0;
  v_stock_before integer := 0;
  v_uncovered boolean := false;
  v_unit_price numeric(12,2) := 0;
  v_recipe_count integer := 0;
  v_recipe_unit_cost numeric := 0;
  v_required_quantity integer := 0;
begin
  if not public.can_write_shop(p_shop_id) then
    raise exception 'Loja sem permissão para registrar vendas.';
  end if;

  if p_payment_method is null
     or p_payment_method not in ('dinheiro','pix','credito','debito') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if p_card_fee_percent is null
     or p_card_fee_percent < 0
     or p_card_fee_percent > 100 then
    raise exception 'Taxa da maquininha inválida.'
      using errcode='22023';
  end if;

  if p_payment_method not in ('credito','debito')
     and p_card_fee_percent <> 0 then
    raise exception 'Taxa de cartão só pode ser aplicada a pagamentos por cartão.'
      using errcode='22023';
  end if;

  if p_discount_amount is null
     or p_discount_amount < 0
     or p_discount_amount <> round(p_discount_amount,2) then
    raise exception 'Desconto inválido: informe um valor em reais com até dois decimais.'
      using errcode='22023';
  end if;

  if p_payment_method = 'pix' and p_discount_amount <> 0 then
    raise exception 'O desconto está disponível para dinheiro e cartão.'
      using errcode='22023';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'A venda deve conter entre 1 e 100 itens.';
  end if;

  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'A venda deve conter entre 1 e 100 itens.';
  end if;

  v_fee_percent := round(p_card_fee_percent,2);

  -- Trava todos os produtos e insumos da venda em ordem estável.
  for v_lock_id in
    select ids.product_id
    from (
      select (i.value->>'product_id')::uuid as product_id
      from jsonb_array_elements(p_items) as i
      union
      select r.ingredient_product_id
      from public.shop_product_ingredients as r
      where r.shop_id = p_shop_id
        and r.product_id in (
          select (i.value->>'product_id')::uuid
          from jsonb_array_elements(p_items) as i
        )
    ) as ids
    order by ids.product_id
  loop
    perform 1
    from public.shop_products
    where id = v_lock_id
      and shop_id = p_shop_id
    for update;
  end loop;

  for v_item in
    select
      (i.value->>'product_id')::uuid as id,
      sum((i.value->>'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) as i
    group by (i.value->>'product_id')::uuid
    order by (i.value->>'product_id')::uuid
  loop
    if v_item.id is null or v_item.qty < 1 or v_item.qty > 10000 then
      raise exception 'Quantidade inválida.';
    end if;

    select *
    into v_product
    from public.shop_products
    where id = v_item.id
      and shop_id = p_shop_id
      and active = true
    for update;

    if not found then
      raise exception 'Produto não encontrado ou inativo.';
    end if;

    v_unit_price := case
      when v_product.wholesale_price is not null
       and v_product.wholesale_min_quantity is not null
       and v_item.qty >= v_product.wholesale_min_quantity
        then v_product.wholesale_price
      else v_product.price
    end;

    v_subtotal := v_subtotal + (v_unit_price * v_item.qty);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Sem itens válidos.';
  end if;

  if p_discount_amount > v_subtotal then
    raise exception 'O desconto não pode superar o subtotal da venda.'
      using errcode='22023';
  end if;

  v_total := v_subtotal - p_discount_amount;
  v_card_fee := case
    when p_payment_method in ('credito','debito')
      then round(v_total * v_fee_percent / 100,2)
    else 0
  end;

  insert into public.shop_sales (
    shop_id,
    total,
    payment_method,
    card_fee_percent,
    card_fee_amount,
    discount_amount
  )
  values (
    p_shop_id,
    v_total,
    p_payment_method,
    v_fee_percent,
    v_card_fee,
    p_discount_amount
  )
  returning id into v_sale;

  for v_item in
    select
      (i.value->>'product_id')::uuid as id,
      sum((i.value->>'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) as i
    group by (i.value->>'product_id')::uuid
    order by (i.value->>'product_id')::uuid
  loop
    select *
    into v_product
    from public.shop_products
    where id = v_item.id
      and shop_id = p_shop_id;

    v_unit_price := case
      when v_product.wholesale_price is not null
       and v_product.wholesale_min_quantity is not null
       and v_item.qty >= v_product.wholesale_min_quantity
        then v_product.wholesale_price
      else v_product.price
    end;

    select
      count(*)::integer,
      coalesce(sum(r.quantity_per_unit * ingredient.cost),0)
    into v_recipe_count, v_recipe_unit_cost
    from public.shop_product_ingredients as r
    join public.shop_products as ingredient
      on ingredient.id = r.ingredient_product_id
     and ingredient.shop_id = r.shop_id
    where r.shop_id = p_shop_id
      and r.product_id = v_item.id;

    if v_recipe_count > 0 then
      -- O custo unitário da venda vira a soma do custo de cada insumo usado.
      insert into public.shop_sale_items (
        sale_id,
        shop_id,
        product_id,
        product_name,
        quantity,
        unit_price,
        unit_cost,
        cost_pending
      )
      values (
        v_sale,
        p_shop_id,
        v_item.id,
        v_product.name,
        v_item.qty,
        v_unit_price,
        v_recipe_unit_cost,
        false
      );

      for v_recipe in
        select
          r.ingredient_product_id,
          r.quantity_per_unit
        from public.shop_product_ingredients as r
        where r.shop_id = p_shop_id
          and r.product_id = v_item.id
        order by r.ingredient_product_id
      loop
        v_required_quantity := v_recipe.quantity_per_unit * v_item.qty;

        update public.shop_products
        set stock = greatest(0, stock - v_required_quantity)
        where id = v_recipe.ingredient_product_id
          and shop_id = p_shop_id;

        insert into public.shop_stock_movements (
          shop_id,
          product_id,
          sale_id,
          quantity,
          reason
        )
        values (
          p_shop_id,
          v_recipe.ingredient_product_id,
          v_sale,
          -v_required_quantity,
          'Consumo de insumo pela venda de ' || v_product.name
        );
      end loop;
    else
      v_stock_before := v_product.stock;
      v_uncovered := v_stock_before < v_item.qty;

      insert into public.shop_sale_items (
        sale_id,
        shop_id,
        product_id,
        product_name,
        quantity,
        unit_price,
        unit_cost,
        cost_pending
      )
      values (
        v_sale,
        p_shop_id,
        v_item.id,
        v_product.name,
        v_item.qty,
        v_unit_price,
        case when v_uncovered then null else v_product.cost end,
        v_uncovered
      );

      update public.shop_products
      set stock = greatest(0, stock - v_item.qty)
      where id = v_item.id
        and shop_id = p_shop_id;

      insert into public.shop_stock_movements (
        shop_id,
        product_id,
        sale_id,
        quantity,
        reason
      )
      values (
        p_shop_id,
        v_item.id,
        v_sale,
        -v_item.qty,
        case
          when v_uncovered then 'Venda pelo PDV sem estoque suficiente'
          else 'Venda pelo PDV'
        end
      );
    end if;
  end loop;

  return jsonb_build_object(
    'sale_id', v_sale,
    'subtotal', v_subtotal,
    'discount_amount', p_discount_amount,
    'total', v_total,
    'card_fee_percent', v_fee_percent,
    'card_fee_amount', v_card_fee,
    'net_total', v_total - v_card_fee
  );
end
$function$;

revoke all on function public.bipstart_complete_sale_with_ingredients(uuid, jsonb, text, numeric, numeric)
  from public, anon;
grant execute on function public.bipstart_complete_sale_with_ingredients(uuid, jsonb, text, numeric, numeric)
  to authenticated, service_role;

notify pgrst, 'reload schema';