-- BipStart: categorias, apresentação, descrição, pagamento e entrega no cardápio.
-- Migração aditiva. NÃO executar antes de autorizar/testar no Supabase compartilhado.
alter table public.shops
  add column if not exists opening_hours text not null default '',
  add column if not exists location_text text not null default '',
  add column if not exists payment_methods text[] not null default array['pix','dinheiro']::text[],
  add column if not exists delivery_fee numeric(10,2) not null default 0,
  add column if not exists logo_path text;
alter table public.shop_products
  add column if not exists description text not null default '';

alter table public.shops
  add constraint bipstart_menu_opening_hours_len check (char_length(opening_hours)<=160),
  add constraint bipstart_menu_location_len check (char_length(location_text)<=240),
  add constraint bipstart_menu_payment_methods_valid check (payment_methods <@ array['pix','credito','debito','dinheiro']::text[]),
  add constraint bipstart_menu_delivery_fee_valid check (delivery_fee>=0 and delivery_fee<=9999.99);
alter table public.shop_products
  add constraint bipstart_menu_product_description_len check (char_length(description)<=1000);

create table if not exists public.shop_menu_categories (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 name text not null check (length(btrim(name)) between 1 and 65),
 sort_order integer not null default 0 check (sort_order between 0 and 10000),
 created_at timestamptz not null default now()
);
create unique index if not exists bipstart_menu_category_unique
 on public.shop_menu_categories(shop_id,lower(name));
create index if not exists bipstart_menu_categories_order
 on public.shop_menu_categories(shop_id,sort_order,name);
alter table public.shop_menu_categories enable row level security;
grant select,insert,update,delete on public.shop_menu_categories to authenticated;
revoke all on public.shop_menu_categories from anon;
create policy menu_categories_owner_read on public.shop_menu_categories
 for select to authenticated using(public.is_shop_owner(shop_id) and public.is_shop_enabled(shop_id));
create policy menu_categories_owner_insert on public.shop_menu_categories
 for insert to authenticated with check(public.can_write_shop(shop_id) and exists(
   select 1 from public.shops s where s.id=shop_id and s.model='cardapio'
 ));
create policy menu_categories_owner_update on public.shop_menu_categories
 for update to authenticated using(public.can_write_shop(shop_id)) with check(public.can_write_shop(shop_id));
create policy menu_categories_owner_delete on public.shop_menu_categories
 for delete to authenticated using(public.can_write_shop(shop_id));

-- Preservar categorias de produtos pré-existentes. Não muda produtos.
insert into public.shop_menu_categories(shop_id,name,sort_order)
select s.id, p.category, row_number() over(partition by s.id order by p.category)::int * 10
from public.shops s
join (select distinct shop_id,category from public.shop_products) p on p.shop_id=s.id
where s.model='cardapio' and length(btrim(p.category)) between 1 and 65
on conflict do nothing;

-- A RLS de shops permite outras edições legítimas, mas o logo é premium.
-- Trigger impede inserir/trocar logo nos planos Básico, sem afetar outros campos.
create or replace function public.bipstart_guard_shop_logo()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.logo_path is distinct from old.logo_path then
   if new.logo_path is not null then
     if new.model <> 'cardapio' or not public.bipstart_can_customize(new.id) then
       raise exception 'Logo personalizado disponível apenas nos planos Personalizado e Pro vigentes'
         using errcode='42501';
     end if;
     if new.logo_path not like (new.id::text||'/%')
         or new.logo_path !~* '\.(png|jpg|jpeg|webp)$' then
       raise exception 'Caminho de logo inválido' using errcode='22023';
     end if;
   end if;
 end if;
 return new;
end $$;
drop trigger if exists bipstart_guard_shop_logo on public.shops;
create trigger bipstart_guard_shop_logo before update on public.shops
 for each row execute function public.bipstart_guard_shop_logo();
revoke all on function public.bipstart_guard_shop_logo() from public,anon,authenticated;

-- Cardápio é público SOMENTE para lojas com acesso válido.
-- Nenhum e-mail de proprietário, dado de pagamento ou campo interno é exposto.
create or replace function public.bipstart_public_menu(p_slug text)
returns jsonb
language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
   'name', s.name,
   'slug', s.slug,
   'whatsapp', s.whatsapp,
   'brand_color', s.brand_color,
   'opening_hours', s.opening_hours,
   'location', s.location_text,
   'payment_methods', to_jsonb(s.payment_methods),
   'delivery_fee', s.delivery_fee,
   'logo_path', case when e.plan_code in ('personalizado','pro')
     then s.logo_path else null end,
   'categories', coalesce((
     select jsonb_agg(jsonb_build_object('name',c.name) order by c.sort_order,c.name)
     from public.shop_menu_categories c where c.shop_id=s.id
   ),'[]'::jsonb),
   'items', coalesce((
     select jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.name,'category',p.category,'description',p.description,
        'price',p.price,'image_path',p.image_path
     ) order by p.category,p.name)
     from public.shop_products p where p.shop_id=s.id and p.active=true
   ),'[]'::jsonb)
 )
 from public.shops s
 join public.shop_entitlements e on e.shop_id=s.id
 where s.slug=p_slug and s.model='cardapio'
   and ((e.status='trialing' and e.trial_until>now())
    or (e.status='active' and (e.active_until is null or e.active_until>now())))
 limit 1;
$$;
revoke all on function public.bipstart_public_menu(text) from public,authenticated;
grant execute on function public.bipstart_public_menu(text) to anon,authenticated;
