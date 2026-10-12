-- BipStart: tabelas e políticas exclusivas dentro do projeto Supabase já usado pela Salgatti.
-- Não altera tabelas existentes public.orders, order_items, products, stock_movements, settings.
-- Compartilha infraestrutura e autenticação; NÃO é um projeto Supabase isolado.
create extension if not exists pgcrypto;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  whatsapp text,
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  model text not null check (model in ('pdv','agenda','cardapio')),
  requested_plan text not null default 'basic' check (requested_plan in ('basic','personalizado','pro')),
  brand_color text not null default '#7c3aed',
  created_at timestamptz not null default now()
);
create unique index if not exists bipstart_one_shop_per_owner on public.shops(owner_id);

-- Somente o servidor financeiro (service_role) poderá alterar permissões pagas.
create table if not exists public.shop_entitlements (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  plan_code text not null default 'basic' check (plan_code in ('basic','personalizado','pro')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled')),
  trial_until timestamptz not null default (now() + interval '7 days'),
  active_until timestamptz,
  updated_at timestamptz not null default now()
);
create or replace function public.create_shop_trial()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  insert into public.shop_entitlements(shop_id,plan_code,status)
  values(new.id,'basic','trialing');
  return new;
end $$;
drop trigger if exists bipstart_shop_trial on public.shops;
create trigger bipstart_shop_trial after insert on public.shops
for each row execute function public.create_shop_trial();

create or replace function public.is_shop_owner(p_shop uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.shops s where s.id=p_shop and s.owner_id=auth.uid()) $$;

create or replace function public.is_shop_enabled(p_shop uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(
  select 1 from public.shop_entitlements e
  where e.shop_id=p_shop
    and ((e.status='trialing' and e.trial_until>now())
      or (e.status='active' and (e.active_until is null or e.active_until>now())))
) $$;

create or replace function public.can_write_shop(p_shop uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select public.is_shop_owner(p_shop) and public.is_shop_enabled(p_shop) $$;

create or replace function public.has_delivery_access(p_shop uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(
  select 1 from public.shop_entitlements e
  where e.shop_id=p_shop
    and e.plan_code='pro'
    and e.status='active'
    and (e.active_until is null or e.active_until>now())
) $$;

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category text not null default 'Geral',
  sku text,
  price numeric(12,2) not null default 0 check (price>=0),
  cost numeric(12,2) not null default 0 check (cost>=0),
  stock integer not null default 0 check (stock>=0),
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists shop_products_shop_idx on public.shop_products(shop_id);

create table if not exists public.shop_services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0 check (price>=0),
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  active boolean not null default true
);
create index if not exists shop_services_shop_idx on public.shop_services(shop_id);

create table if not exists public.shop_appointments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  service_id uuid references public.shop_services(id) on delete set null,
  customer_name text not null check(char_length(btrim(customer_name)) between 2 and 150),
  customer_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'agendado' check (status in ('agendado','concluido','cancelado')),
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at>starts_at)
);
create index if not exists shop_appointments_idx on public.shop_appointments(shop_id,starts_at);

create table if not exists public.shop_sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  total numeric(12,2) not null check (total>=0),
  payment_method text not null check (payment_method in ('dinheiro','pix','credito','debito')),
  created_at timestamptz not null default now()
);
create index if not exists shop_sales_idx on public.shop_sales(shop_id,created_at desc);

create table if not exists public.shop_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.shop_sales(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid references public.shop_products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity>0),
  unit_price numeric(12,2) not null check (unit_price>=0)
);
create index if not exists shop_sale_items_idx on public.shop_sale_items(shop_id,sale_id);

create table if not exists public.shop_stock_movements (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.shop_products(id) on delete cascade,
  sale_id uuid references public.shop_sales(id) on delete set null,
  quantity integer not null check (quantity <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists shop_stock_movements_idx on public.shop_stock_movements(shop_id,created_at desc);

create table if not exists public.shop_menu_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null check(total>=0),
  status text not null default 'recebido' check(status in ('recebido','preparando','saiu','concluido','cancelado')),
  created_at timestamptz not null default now()
);
create index if not exists shop_menu_orders_idx on public.shop_menu_orders(shop_id,created_at desc);

create table if not exists public.shop_couriers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  active boolean not null default true
);
create index if not exists shop_couriers_idx on public.shop_couriers(shop_id);

create table if not exists public.shop_deliveries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  courier_id uuid references public.shop_couriers(id) on delete set null,
  menu_order_id uuid references public.shop_menu_orders(id) on delete set null,
  address text not null,
  status text not null default 'pendente' check(status in ('pendente','atribuida','a_caminho','entregue','cancelada')),
  created_at timestamptz not null default now()
);
create index if not exists shop_deliveries_idx on public.shop_deliveries(shop_id);

create table if not exists public.shop_customization_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  details text not null check (char_length(btrim(details)) between 10 and 3000),
  status text not null default 'novo' check(status in ('novo','em_analise','concluido')),
  created_at timestamptz not null default now()
);

create table if not exists public.shop_billing_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  plan_code text not null check (plan_code in ('basic','personalizado','pro')),
  amount numeric(12,2) not null check(amount>0),
  status text not null default 'pending' check(status in ('pending','approved','refunded','cancelled')),
  provider text not null default 'mercado_pago',
  provider_ref text unique,
  created_at timestamptz not null default now()
);

-- Impede vincular agendamentos e entregas a registros de outra loja.
create unique index if not exists bipstart_service_scope on public.shop_services(shop_id,id);
create unique index if not exists bipstart_courier_scope on public.shop_couriers(shop_id,id);
create unique index if not exists bipstart_menu_order_scope on public.shop_menu_orders(shop_id,id);
alter table public.shop_appointments add constraint bipstart_appointment_service_scope
 foreign key (shop_id,service_id) references public.shop_services(shop_id,id);
alter table public.shop_deliveries add constraint bipstart_delivery_courier_scope
 foreign key (shop_id,courier_id) references public.shop_couriers(shop_id,id);
alter table public.shop_deliveries add constraint bipstart_delivery_order_scope
 foreign key (shop_id,menu_order_id) references public.shop_menu_orders(shop_id,id);

-- Cardápio público não expõe custo, estoque interno nem dados privados.
create or replace function public.bipstart_public_menu(p_slug text)
returns jsonb language sql stable security definer set search_path=public
as $$
  select jsonb_build_object(
    'name',s.name,
    'slug',s.slug,
    'whatsapp',s.whatsapp,
    'brand_color',s.brand_color,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.name,'category',p.category,'price',p.price,'image_path',p.image_path
      ) order by p.category,p.name)
      from public.shop_products p
      where p.shop_id=s.id and p.active=true
    ),'[]'::jsonb)
  )
  from public.shops s
  join public.shop_entitlements e on e.shop_id=s.id
  where s.slug=p_slug and s.model='cardapio'
  and ((e.status='trialing' and e.trial_until>now())
    or (e.status='active' and (e.active_until is null or e.active_until>now())))
  limit 1
$$;
revoke all on function public.bipstart_public_menu(text) from public;
grant execute on function public.bipstart_public_menu(text) to anon,authenticated;

-- Agendamentos simultâneos não podem ocupar o mesmo horário da mesma empresa.
-- O bloqueio transacional por loja evita duas reservas concorrentes.
create or replace function public.bipstart_check_appointment()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.shop_id::text));
  if new.status <> 'cancelado' and exists (
    select 1 from public.shop_appointments a
    where a.shop_id=new.shop_id and a.id is distinct from new.id
    and a.status <> 'cancelado'
    and a.starts_at<new.ends_at and a.ends_at>new.starts_at
  ) then
    raise exception 'Já existe um agendamento neste horário.';
  end if;
  return new;
end $$;
drop trigger if exists bipstart_appointment_overlap on public.shop_appointments;
create trigger bipstart_appointment_overlap
before insert or update on public.shop_appointments
for each row execute function public.bipstart_check_appointment();

-- Cada conta enxerga somente sua loja. Sem acesso entre clientes.
alter table public.shops enable row level security;
alter table public.shop_entitlements enable row level security;
create policy "shops_owner_select" on public.shops for select to authenticated using (owner_id=auth.uid());
create policy "shops_owner_insert" on public.shops for insert to authenticated with check (owner_id=auth.uid());
create policy "shops_owner_update" on public.shops for update to authenticated using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy "entitlements_owner_read" on public.shop_entitlements for select to authenticated using (public.is_shop_owner(shop_id));

alter table public.shop_products enable row level security;
create policy "products_owner_read" on public.shop_products for select to authenticated using (public.is_shop_owner(shop_id));
create policy "products_owner_insert" on public.shop_products for insert to authenticated with check (public.can_write_shop(shop_id));
create policy "products_owner_update" on public.shop_products for update to authenticated using (public.can_write_shop(shop_id)) with check (public.can_write_shop(shop_id));
create policy "products_owner_delete" on public.shop_products for delete to authenticated using (public.can_write_shop(shop_id));

alter table public.shop_services enable row level security;
create policy "services_owner_read" on public.shop_services for select to authenticated using (public.is_shop_owner(shop_id));
create policy "services_owner_insert" on public.shop_services for insert to authenticated with check (public.can_write_shop(shop_id));
create policy "services_owner_update" on public.shop_services for update to authenticated using (public.can_write_shop(shop_id)) with check (public.can_write_shop(shop_id));
create policy "services_owner_delete" on public.shop_services for delete to authenticated using (public.can_write_shop(shop_id));

alter table public.shop_appointments enable row level security;
create policy "appointments_owner_read" on public.shop_appointments for select to authenticated using (public.is_shop_owner(shop_id));
create policy "appointments_owner_insert" on public.shop_appointments for insert to authenticated with check (public.can_write_shop(shop_id));
create policy "appointments_owner_update" on public.shop_appointments for update to authenticated using (public.can_write_shop(shop_id)) with check (public.can_write_shop(shop_id));
create policy "appointments_owner_delete" on public.shop_appointments for delete to authenticated using (public.can_write_shop(shop_id));

alter table public.shop_sales enable row level security;
create policy "sales_owner_read" on public.shop_sales for select to authenticated using (public.is_shop_owner(shop_id));
alter table public.shop_sale_items enable row level security;
create policy "sale_items_owner_read" on public.shop_sale_items for select to authenticated using (public.is_shop_owner(shop_id));
alter table public.shop_stock_movements enable row level security;
create policy "movements_owner_read" on public.shop_stock_movements for select to authenticated using (public.is_shop_owner(shop_id));

alter table public.shop_menu_orders enable row level security;
create policy "menu_orders_owner_read" on public.shop_menu_orders for select to authenticated using (public.is_shop_owner(shop_id));
create policy "menu_orders_owner_update" on public.shop_menu_orders for update to authenticated using (public.can_write_shop(shop_id)) with check (public.can_write_shop(shop_id));

alter table public.shop_couriers enable row level security;
create policy "couriers_owner_read" on public.shop_couriers for select to authenticated using (public.is_shop_owner(shop_id));
create policy "couriers_pro_insert" on public.shop_couriers for insert to authenticated with check (public.can_write_shop(shop_id) and public.has_delivery_access(shop_id));
create policy "couriers_pro_update" on public.shop_couriers for update to authenticated using (public.can_write_shop(shop_id) and public.has_delivery_access(shop_id)) with check (public.can_write_shop(shop_id) and public.has_delivery_access(shop_id));
create policy "couriers_pro_delete" on public.shop_couriers for delete to authenticated using (public.can_write_shop(shop_id) and public.has_delivery_access(shop_id));
alter table public.shop_deliveries enable row level security;
create policy "deliveries_owner_read" on public.shop_deliveries for select to authenticated using (public.is_shop_owner(shop_id));
create policy "deliveries_pro_insert" on public.shop_deliveries for insert to authenticated with check (public.can_write_shop(shop_id) and public.has_delivery_access(shop_id));
create policy "deliveries_pro_update" on public.shop_deliveries for update to authenticated using (public.can_write_shop(shop_id) and public.has_delivery_access(shop_id)) with check (public.can_write_shop(shop_id) and public.has_delivery_access(shop_id));

alter table public.shop_customization_requests enable row level security;
create policy "custom_owner_read" on public.shop_customization_requests for select to authenticated using (public.is_shop_owner(shop_id));
create policy "custom_owner_insert" on public.shop_customization_requests for insert to authenticated with check (public.can_write_shop(shop_id));
alter table public.shop_billing_orders enable row level security;
create policy "billing_owner_read" on public.shop_billing_orders for select to authenticated using (public.is_shop_owner(shop_id));

-- A venda e a baixa de estoque ocorrem juntas na transação Postgres.
create or replace function public.bipstart_complete_sale(
  p_shop_id uuid, p_items jsonb, p_payment_method text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
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
  -- Ordenação determinística dos bloqueios evita venda concorrente com saldo negativo.
  for v_item in
    select (i.value->>'product_id')::uuid as id, sum((i.value->>'quantity')::integer)::integer as qty
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
      raise exception 'Estoque insuficiente para %.', v_product.name;
    end if;
    v_total:=v_total+(v_product.price*v_item.qty);
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception 'Sem itens válidos.'; end if;
  insert into public.shop_sales(shop_id,total,payment_method)
  values(p_shop_id,v_total,p_payment_method) returning id into v_sale;
  for v_item in
    select (i.value->>'product_id')::uuid as id, sum((i.value->>'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) i
    group by (i.value->>'product_id')::uuid
    order by (i.value->>'product_id')::uuid
  loop
    select * into v_product from public.shop_products where id=v_item.id and shop_id=p_shop_id;
    insert into public.shop_sale_items(sale_id,shop_id,product_id,product_name,quantity,unit_price)
    values(v_sale,p_shop_id,v_item.id,v_product.name,v_item.qty,v_product.price);
    update public.shop_products set stock=stock-v_item.qty where id=v_item.id;
    insert into public.shop_stock_movements(shop_id,product_id,sale_id,quantity,reason)
    values(p_shop_id,v_item.id,v_sale,-v_item.qty,'Venda pelo PDV');
  end loop;
  return jsonb_build_object('sale_id',v_sale,'total',v_total);
end $$;
revoke all on function public.bipstart_complete_sale(uuid,jsonb,text) from public, anon;
grant execute on function public.bipstart_complete_sale(uuid,jsonb,text) to authenticated;

-- É permitida chamada dessas funções apenas por usuário autenticado.
revoke all on function public.is_shop_owner(uuid) from public, anon;
revoke all on function public.is_shop_enabled(uuid) from public, anon;
revoke all on function public.can_write_shop(uuid) from public, anon;
revoke all on function public.has_delivery_access(uuid) from public, anon;
grant execute on function public.is_shop_owner(uuid) to authenticated;
grant execute on function public.is_shop_enabled(uuid) to authenticated;
grant execute on function public.can_write_shop(uuid) to authenticated;
grant execute on function public.has_delivery_access(uuid) to authenticated;

-- Imagens públicas dos catálogos com upload isolado por loja no caminho <shop_id>/<arquivo>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bipstart-images','bipstart-images',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy "bipstart_images_read" on storage.objects for select to anon,authenticated
using (bucket_id='bipstart-images');
create policy "bipstart_images_owner_upload" on storage.objects for insert to authenticated
with check (
  bucket_id='bipstart-images'
  and public.can_write_shop((storage.foldername(name))[1]::uuid)
);
create policy "bipstart_images_owner_delete" on storage.objects for delete to authenticated
using (
  bucket_id='bipstart-images'
  and public.can_write_shop((storage.foldername(name))[1]::uuid)
);
