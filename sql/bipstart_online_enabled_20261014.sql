-- BipStart: escolha de venda online por produto, sem afetar estoque ou PDV.
-- Para preservar todos os produtos já publicados, o padrão é true.
-- Novos cadastros pela interface exigem escolher Sim ou Não.
alter table public.shop_products
  add column if not exists online_enabled boolean not null default true;

-- Na vitrine pública são entregues SOMENTE produtos disponíveis para venda
-- online, mantendo o preço alternativo configurado anteriormente.
create or replace function public.bipstart_public_menu(p_slug text)
returns jsonb
language sql stable security definer set search_path=''
as $$
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
 where s.slug=p_slug and s.model='pdv'
   and ((e.status='trialing' and e.trial_until>now())
     or (e.status='active' and (e.active_until is null or e.active_until>now())))
 limit 1
$$;
revoke all on function public.bipstart_public_menu(text) from public;
grant execute on function public.bipstart_public_menu(text) to anon,authenticated;


notify pgrst, 'reload schema';
