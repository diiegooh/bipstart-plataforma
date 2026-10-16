-- Cardápio público e checkout apenas Premium ativo, inclusive em acesso por URL/RPC.
-- Uma troca de plano altera apenas shop_entitlements.plan_code; nada é excluído.
-- Funções regravadas a partir das definições reais do Supabase em 2026-10-15
-- preservando preços de menu, disponibilidade, imagens e segurança existentes.

CREATE OR REPLACE FUNCTION public.bipstart_public_menu(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
   'name',s.name,
   'slug',s.slug,
   'whatsapp',s.whatsapp,
   'brand_color',case when e.plan_code='pro' then s.brand_color else '#7c3aed' end,
   'opening_hours',s.opening_hours,
   'location',s.location_text,
   'payment_methods',to_jsonb(s.payment_methods),
   'delivery_fee',s.delivery_fee,
   'logo_path',case when e.plan_code='pro' then s.logo_path else null end,
   'categories',coalesce((
     select jsonb_agg(jsonb_build_object('name',c.name) order by c.sort_order,c.name)
     from public.shop_menu_categories c where c.shop_id=s.id
       and exists (
         select 1 from public.shop_products cp
         where cp.shop_id=s.id and cp.active=true and cp.online_enabled=true
           and lower(btrim(cp.category))=lower(btrim(c.name))
       )
   ),'[]'::jsonb),
   'items',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',p.id,'name',p.name,'category',p.category,'description',p.description,
       'price',case when p.menu_price_enabled and p.menu_price is not null then p.menu_price else p.price end,
       'image_path',p.image_path,
       'in_stock',(coalesce(p.stock,0)>0)
     ) order by p.category,p.name)
     from public.shop_products p where p.shop_id=s.id and p.active=true and p.online_enabled=true
   ),'[]'::jsonb)
 )
 from public.shops s
 join public.shop_entitlements e on e.shop_id=s.id
 where s.slug=p_slug and s.model='pdv' and e.plan_code='pro'
   and ((e.status='trialing' and e.trial_until>now())
     or (e.status='active' and (e.active_until is null or e.active_until>now())))
 limit 1
$function$;

CREATE OR REPLACE FUNCTION public.bipstart_place_online_order(p_slug text, p_client_token uuid, p_name text, p_phone text, p_delivery_method text, p_address text, p_payment_method text, p_notes text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop public.shops%rowtype;
  v_order public.shop_online_orders%rowtype;
  v_item jsonb;
  v_product public.shop_products%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_ids uuid[] := array[]::uuid[];
  v_quantity integer;
  v_total_qty integer := 0;
  v_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  v_name text := btrim(coalesce(p_name,''));
  v_address text := btrim(coalesce(p_address,''));
  v_notes text := btrim(coalesce(p_notes,''));
  v_method text := btrim(coalesce(p_payment_method,''));
  v_id uuid;
begin
  if p_client_token is null or p_slug is null or char_length(p_slug)>100 then
    raise exception 'Identificador do pedido inválido.';
  end if;
  if char_length(v_name) not between 2 and 120 or char_length(v_phone) not between 10 and 13 then
    raise exception 'Informe nome e telefone válidos.';
  end if;
  if p_delivery_method not in ('pickup','delivery') or
    (p_delivery_method='delivery' and char_length(v_address) not between 8 and 300) or
    char_length(v_notes)>500 then
    raise exception 'Confira o endereço e as informações de entrega.';
  end if;
  if v_method not in ('a_combinar','pix','dinheiro','credito','debito') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or
     jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'Informe de 1 a 30 itens.';
  end if;

  select s.* into v_shop from public.shops s
  join public.shop_entitlements e on e.shop_id=s.id
  where s.slug=p_slug and s.model='pdv' and e.plan_code='pro'
    and ((e.status='trialing' and e.trial_until>now())
      or (e.status='active' and (e.active_until is null or e.active_until>now())))
  limit 1;
  if not found then raise exception 'Loja indisponível para receber pedidos.'; end if;

  -- Reenvios pelo mesmo carrinho não criam pedido duplicado.
  select * into v_order from public.shop_online_orders
    where shop_id=v_shop.id and client_token=p_client_token limit 1;
  if found then return jsonb_build_object('id',v_order.id,'total',v_order.total); end if;

  if v_method<>'a_combinar' and not (v_method=any(v_shop.payment_methods)) then
    raise exception 'Forma de pagamento indisponível nesta loja.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' or
       coalesce(v_item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
       coalesce(v_item->>'qty','') !~ '^[0-9]{1,2}$' then
      raise exception 'Dados de produto inválidos.';
    end if;
    v_quantity := (v_item->>'qty')::integer;
    v_id := (v_item->>'id')::uuid;
    if v_quantity not between 1 and 30 or v_id=any(v_ids) then
      raise exception 'Quantidades ou itens repetidos inválidos.';
    end if;
    v_ids := array_append(v_ids,v_id);
    v_total_qty := v_total_qty+v_quantity;
    if v_total_qty>100 then raise exception 'Quantidade total máxima excedida.'; end if;

    select * into v_product from public.shop_products p
      where p.id=v_id and p.shop_id=v_shop.id
        and p.active=true and p.online_enabled=true and p.stock>=v_quantity
      limit 1;
    if not found then raise exception 'Um produto esgotou ou saiu do cardápio. Atualize seu pedido.'; end if;
    v_price := case when v_product.menu_price_enabled and v_product.menu_price is not null
      then v_product.menu_price else v_product.price end;
    v_subtotal := v_subtotal+v_price*v_quantity;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id',v_product.id,'name',v_product.name,'qty',v_quantity,
      'unit_price',v_price,'total',v_price*v_quantity
    ));
  end loop;

  -- Contenção básica de pedidos públicos repetitivos/falsos.
  if (select count(*) from public.shop_online_orders
      where shop_id=v_shop.id and customer_phone=v_phone
        and created_at>now()-interval '10 minutes')>=8 or
     (select count(*) from public.shop_online_orders
      where shop_id=v_shop.id and created_at>now()-interval '1 minute')>=40 then
    raise exception 'Muitos pedidos em pouco tempo. Aguarde e tente novamente.';
  end if;
  v_delivery_fee := case when p_delivery_method='delivery'
    then greatest(0,coalesce(v_shop.delivery_fee,0)) else 0 end;
  insert into public.shop_online_orders(
    shop_id,client_token,customer_name,customer_phone,
    delivery_method,delivery_address,payment_method,notes,
    items,subtotal,delivery_fee,total
  ) values (
    v_shop.id,p_client_token,v_name,v_phone,
    p_delivery_method,case when p_delivery_method='delivery' then v_address else null end,
    v_method,v_notes,v_items,v_subtotal,v_delivery_fee,v_subtotal+v_delivery_fee
  ) on conflict (shop_id,client_token) do nothing
  returning * into v_order;

  if v_order.id is null then
    select * into v_order from public.shop_online_orders
      where shop_id=v_shop.id and client_token=p_client_token limit 1;
  end if;
  return jsonb_build_object('id',v_order.id,'total',v_order.total);
end;
$function$;

notify pgrst,'reload schema';
