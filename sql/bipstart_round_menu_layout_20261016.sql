-- BipStart: layout alternativo, tipo de estabelecimento e frases. Preserva dados e plano existente.
alter table public.shops add column if not exists menu_layout_style text not null default 'classic';
alter table public.shops add column if not exists establishment_type text not null default 'outros';
alter table public.shops add column if not exists show_logo_subtitle boolean not null default false;
alter table public.shops add column if not exists logo_subtitle text not null default '';
alter table public.shops add column if not exists menu_theme_color text;
alter table public.shops drop constraint if exists bipstart_menu_layout_style_valid;
alter table public.shops add constraint bipstart_menu_layout_style_valid check(menu_layout_style in ('classic','round'));
alter table public.shops drop constraint if exists bipstart_establishment_type_valid;
alter table public.shops add constraint bipstart_establishment_type_valid check(establishment_type in ('outros','bar_petiscaria','adega_conveniencia','hamburgueria','pizzaria','lanchonete','marmitaria','restaurante','doceria','acaiteria','espetaria','mercado'));
alter table public.shops drop constraint if exists bipstart_logo_subtitle_valid;
alter table public.shops add constraint bipstart_logo_subtitle_valid check(length(logo_subtitle)<=100);
alter table public.shops drop constraint if exists bipstart_menu_theme_color_valid;
alter table public.shops add constraint bipstart_menu_theme_color_valid check(menu_theme_color is null or menu_theme_color ~ '^#[0-9A-Fa-f]{6}$');
-- Mesmas regras de acesso Premium e dados públicos mínimos da RPC existente.
create or replace function public.bipstart_public_menu(p_slug text)
returns jsonb language sql stable security definer set search_path to ''
as $function$
 select jsonb_build_object(
   'name',s.name,
   'slug',s.slug,
   'whatsapp',s.whatsapp,
   'brand_color',case when e.plan_code='pro' then coalesce(s.menu_theme_color,s.brand_color) else s.brand_color end,
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
