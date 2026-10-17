-- A categoria virtual Todos pode ter imagem própria, sem exigir produto com essa categoria.
-- Todas as demais categorias continuam exigindo produto ativo e habilitado para venda online.
-- Não altera produtos, pedidos, estoques, entregas nem permissões.
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
   'brand_color',s.brand_color,
   'menu_theme_color',case when e.plan_code='pro' then s.menu_theme_color else null end,
   'plan_code',e.plan_code,
   'opening_hours',s.opening_hours,
   'location',s.location_text,
   'payment_methods',to_jsonb(s.payment_methods),
   'delivery_fee',s.delivery_fee,
   'logo_path',case when e.plan_code='pro' then s.logo_path else null end,
   'menu_layout_style',coalesce(s.menu_layout_style,'classic'),
   'establishment_type',coalesce(s.establishment_type,'outros'),
   'show_logo_subtitle',coalesce(s.show_logo_subtitle,false),
   'logo_subtitle',case when coalesce(s.show_logo_subtitle,false) then coalesce(s.logo_subtitle,'') else '' end,
   'categories',coalesce((
     select jsonb_agg(jsonb_build_object(
       'name',c.name,'image_path',c.image_path
     ) order by c.sort_order,c.name)
     from public.shop_menu_categories c where c.shop_id=s.id
       and (
         lower(btrim(c.name))='todos'
         or exists (
           select 1 from public.shop_products cp
           where cp.shop_id=s.id and cp.active=true and cp.online_enabled=true
             and lower(btrim(cp.category))=lower(btrim(c.name))
         )
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
