-- BipStart | Fotos próprias por categoria (Premium) | aplicada em 16/10/2026.
-- Adiciona apenas o campo de imagem e preserva todos os dados e regras atuais.
alter table public.shop_menu_categories add column if not exists image_path text;
alter table public.shop_menu_categories drop constraint if exists bipstart_category_image_path_valid;
alter table public.shop_menu_categories add constraint bipstart_category_image_path_valid
 check (image_path is null or (
   image_path like (shop_id::text || '/%')
   and image_path ~* '[.](png|jpg|jpeg|webp)$'
   and length(image_path)<=255
 ));
-- A API pública inclui somente a foto da categoria; não expõe dados internos da loja.
create or replace function public.bipstart_public_menu(p_slug text)
returns jsonb language sql stable security definer set search_path to ''
as $function$
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
     select jsonb_agg(jsonb_build_object(
       'name',c.name,'image_path',c.image_path
     ) order by c.sort_order,c.name)
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
revoke all on function public.bipstart_public_menu(text) from public;
grant execute on function public.bipstart_public_menu(text) to anon,authenticated;
