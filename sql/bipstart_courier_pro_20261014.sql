-- Migração BipStart: motoboys e distribuição de entregas do plano Pro.
-- Inspirada no fluxo Salgatti, mas com isolamento por loja e Auth Supabase.
-- Não depende das tabelas legadas da Salgatti.
-- Somente o titular de loja no Pro pode gerenciar motoboys/entregas.
-- Cada entregador usa conta Supabase própria e aceita convite UUID de uso único.
-- Não copia senhas ou cookies da Salgatti original.

alter table public.shop_couriers
  add column if not exists account_id uuid references auth.users(id) on delete set null,
  add column if not exists invite_code uuid default gen_random_uuid(),
  add column if not exists created_at timestamptz not null default now();
create unique index if not exists bipstart_courier_invitation_unique
 on public.shop_couriers(invite_code) where invite_code is not null;
create unique index if not exists bipstart_courier_account_shop_unique
 on public.shop_couriers(shop_id,account_id) where account_id is not null;
create or replace function public.bipstart_guard_courier_account()
returns trigger language plpgsql security definer set search_path=''
as $
begin
 if TG_OP='INSERT' then
  if new.account_id is not null then
   raise exception 'Motoboy deve aceitar seu próprio convite' using errcode='42501';
  end if;
 elsif new.account_id is distinct from old.account_id and new.account_id is not null then
  if new.account_id is distinct from auth.uid() then
   raise exception 'Conta de motoboy só pode ser vinculada pelo próprio titular' using errcode='42501';
  end if;
 end if;
 return new;
end $;
drop trigger if exists bipstart_guard_courier_account on public.shop_couriers;
create trigger bipstart_guard_courier_account
 before insert or update on public.shop_couriers for each row
 execute function public.bipstart_guard_courier_account();
revoke all on function public.bipstart_guard_courier_account() from public,anon,authenticated;

alter table public.shop_deliveries
  add column if not exists offered_courier_id uuid,
  add column if not exists customer_name text not null default '',
  add column if not exists customer_phone text not null default '',
  add column if not exists items_text text not null default '',
  add column if not exists total numeric(12,2) not null default 0,
  add column if not exists updated_at timestamptz not null default now();
alter table public.shop_deliveries
  add constraint bipstart_delivery_offer_scope
  foreign key (shop_id,offered_courier_id) references public.shop_couriers(shop_id,id);
alter table public.shop_deliveries
  add constraint bipstart_delivery_extra_valid
  check (char_length(customer_name)<=120 and char_length(customer_phone)<=20
   and char_length(items_text)<=3000 and char_length(address)<=500
   and total>=0 and total<=999999);
create index if not exists bipstart_delivery_shop_queue
 on public.shop_deliveries(shop_id,status,created_at);
create index if not exists bipstart_delivery_courier_queue
 on public.shop_deliveries(courier_id,status);

-- O painel do titular mostra a área somente durante o Pro válido,
-- inclusive se ele tentar consultar a API diretamente.
alter policy couriers_owner_read on public.shop_couriers
 using(public.is_shop_owner(shop_id) and public.has_delivery_access(shop_id));
alter policy deliveries_owner_read on public.shop_deliveries
 using(public.is_shop_owner(shop_id) and public.has_delivery_access(shop_id));

-- Token de uso único para vincular o login de um entregador à loja.
-- Nunca associar motoboy a uma loja só pelo e-mail informado pelo comerciante.
create or replace function public.bipstart_courier_claim_invite(p_invite uuid)
returns text language plpgsql volatile security definer set search_path=''
as $$
declare v_id uuid; v_shop uuid; v_name text;
begin
 if auth.uid() is null then
  raise exception 'Entre com uma conta para aceitar o convite' using errcode='42501';
 end if;
 if not exists(
  select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
 ) then
  raise exception 'Confirme seu e-mail antes de aceitar o convite' using errcode='42501';
 end if;
 select c.id,c.shop_id,c.name into v_id,v_shop,v_name
 from public.shop_couriers c
 where c.invite_code=p_invite and c.active and c.account_id is null
 for update;
 if v_id is null then
  raise exception 'Convite inválido, usado ou desativado' using errcode='22023';
 end if;
 if not public.has_delivery_access(v_shop) then
  raise exception 'A loja não possui plano Pro vigente' using errcode='42501';
 end if;
 if exists(select 1 from public.shop_couriers c
   where c.shop_id=v_shop and c.account_id=auth.uid()) then
  raise exception 'Este usuário já está vinculado à loja' using errcode='23505';
 end if;
 update public.shop_couriers
 set account_id=auth.uid(),invite_code=null
 where id=v_id;
 return v_name;
end $$;

create or replace function public.bipstart_courier_my_shops()
returns table(shop_id uuid,courier_id uuid,shop_name text,courier_name text)
language sql stable security definer set search_path=''
as $$
 select c.shop_id,c.id,s.name,c.name
 from public.shop_couriers c
 join public.shops s on s.id=c.shop_id
 where c.account_id=auth.uid() and c.active
   and public.has_delivery_access(c.shop_id)
 order by s.name;
$$;

-- Ofertas pendentes ficam visíveis a motoboys da mesma loja.
-- Um motoboy ocupado não recebe nova oferta enquanto finaliza a entrega.
create or replace function public.bipstart_courier_queue()
returns table(delivery_id uuid,shop_id uuid,shop_name text,courier_id uuid,
 customer_name text,customer_phone text,address text,items_text text,
 total numeric,status text,created_at timestamptz,is_offer boolean)
language sql stable security definer set search_path=''
as $$
 with eligible as (
   select c.id,c.shop_id from public.shop_couriers c
   where c.account_id=auth.uid() and c.active
     and public.has_delivery_access(c.shop_id)
 ),
 active_jobs as (
   select d.id,d.shop_id,s.name,e.id as courier_id,d.customer_name,
     d.customer_phone,d.address,d.items_text,d.total,d.status,d.created_at,
     false as is_offer
   from public.shop_deliveries d
   join eligible e on e.shop_id=d.shop_id and e.id=d.courier_id
   join public.shops s on s.id=d.shop_id
   where d.status in ('atribuida','a_caminho')
 ),
 offers as (
   select d.id,d.shop_id,s.name,e.id as courier_id,d.customer_name,
     d.customer_phone,d.address,d.items_text,d.total,d.status,d.created_at,
     true as is_offer
   from public.shop_deliveries d
   join eligible e on e.shop_id=d.shop_id
   join public.shops s on s.id=d.shop_id
   where d.status='pendente' and d.courier_id is null
     and (d.offered_courier_id is null or d.offered_courier_id=e.id)
     and not exists (
       select 1 from public.shop_deliveries busy
       where busy.courier_id=e.id and busy.status in ('atribuida','a_caminho')
     )
 )
 select * from active_jobs
 union all
 select * from offers
 order by is_offer asc,created_at asc
 limit 100;
$$;

-- "Primeiro que aceitar leva": disputa serializada por FOR UPDATE.
create or replace function public.bipstart_courier_accept(p_delivery_id uuid)
returns boolean language plpgsql volatile security definer set search_path=''
as $$
declare v public.shop_deliveries%rowtype; v_courier uuid;
begin
 if auth.uid() is null then raise exception 'Sessão inválida' using errcode='42501';end if;
 select * into v from public.shop_deliveries where id=p_delivery_id for update;
 if not found or v.status<>'pendente' or v.courier_id is not null then
   raise exception 'Esta entrega não está mais disponível' using errcode='23514';
 end if;
 if not public.has_delivery_access(v.shop_id) then
   raise exception 'Plano Pro não está vigente' using errcode='42501';
 end if;
 select c.id into v_courier from public.shop_couriers c
 where c.shop_id=v.shop_id and c.account_id=auth.uid() and c.active
   and (v.offered_courier_id is null or v.offered_courier_id=c.id)
 limit 1;
 if v_courier is null then
   raise exception 'Motoboy não autorizado para esta entrega' using errcode='42501';
 end if;
 -- Serializa dois aceites simultâneos do mesmo motoboy.
 perform 1 from public.shop_couriers where id=v_courier for update;
 if exists(select 1 from public.shop_deliveries d where d.courier_id=v_courier
   and d.status in ('atribuida','a_caminho')) then
   raise exception 'Conclua a entrega atual antes de aceitar outra' using errcode='23514';
 end if;
 update public.shop_deliveries
 set courier_id=v_courier,offered_courier_id=null,status='atribuida',updated_at=now()
 where id=p_delivery_id;
 return true;
end $$;

create or replace function public.bipstart_courier_set_status(p_delivery_id uuid,p_status text)
returns boolean language plpgsql volatile security definer set search_path=''
as $$
declare v public.shop_deliveries%rowtype;
begin
 if auth.uid() is null then raise exception 'Sessão inválida' using errcode='42501';end if;
 select * into v from public.shop_deliveries where id=p_delivery_id for update;
 if not found or not public.has_delivery_access(v.shop_id) or not exists(
   select 1 from public.shop_couriers c
   where c.id=v.courier_id and c.shop_id=v.shop_id
     and c.account_id=auth.uid() and c.active
 ) then
  raise exception 'Entregador não autorizado' using errcode='42501';
 end if;
 if not (
   (v.status='atribuida' and p_status='a_caminho') or
   (v.status='a_caminho' and p_status='entregue')
 ) then
   raise exception 'Mudança de status não permitida' using errcode='23514';
 end if;
 update public.shop_deliveries
 set status=p_status,updated_at=now()
 where id=p_delivery_id;
 return true;
end $$;

revoke all on function public.bipstart_courier_claim_invite(uuid) from public,anon;
revoke all on function public.bipstart_courier_my_shops() from public,anon;
revoke all on function public.bipstart_courier_queue() from public,anon;
revoke all on function public.bipstart_courier_accept(uuid) from public,anon;
revoke all on function public.bipstart_courier_set_status(uuid,text) from public,anon;
grant execute on function public.bipstart_courier_claim_invite(uuid) to authenticated;
grant execute on function public.bipstart_courier_my_shops() to authenticated;
grant execute on function public.bipstart_courier_queue() to authenticated;
grant execute on function public.bipstart_courier_accept(uuid) to authenticated;
grant execute on function public.bipstart_courier_set_status(uuid,text) to authenticated;
