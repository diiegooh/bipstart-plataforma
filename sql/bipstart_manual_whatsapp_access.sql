-- BipStart: contratação manual por WhatsApp, teste de 7 dias e ativação por administrador.
-- Aplicar SOMENTE após revisão e homologação, nunca em banco não relacionado.
-- Não altera dados existentes de lojas; adiciona apenas o caminho de cadastro para novos registros.
alter table public.shops
 add column if not exists signup_choice text not null default 'trial';

do $$
begin
 if not exists (select 1 from pg_constraint where conname='bipstart_shops_signup_choice_check' and conrelid='public.shops'::regclass) then
  alter table public.shops add constraint bipstart_shops_signup_choice_check
   check (signup_choice in ('trial','whatsapp'));
 end if;
end $$;

-- Preserva os estados antigos e acrescenta os dois modos manuais.
alter table public.shop_entitlements
 drop constraint if exists shop_entitlements_status_check;
alter table public.shop_entitlements
 add constraint shop_entitlements_status_check
 check (status in ('trialing','active','past_due','cancelled','pending','suspended'));

create or replace function public.create_shop_trial()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.signup_choice='trial' then
  insert into public.shop_entitlements(shop_id,plan_code,status,trial_until,active_until)
  values(new.id,new.requested_plan,'trialing',now()+interval '7 days',null);
 else
  insert into public.shop_entitlements(shop_id,plan_code,status,trial_until,active_until)
  values(new.id,new.requested_plan,'pending',now(),null);
 end if;
 return new;
end $$;

-- Um cliente em teste do Pro usa os recursos Pro somente até trial_until.
create or replace function public.has_delivery_access(p_shop uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.shop_entitlements e
  where e.shop_id=p_shop and e.plan_code='pro'
    and ((e.status='trialing' and e.trial_until>now())
      or (e.status='active' and (e.active_until is null or e.active_until>now())))
 )
$$;

-- A lista de administradores NÃO tem policy pública, nem permissões para inserção pelo navegador.
create table if not exists public.bipstart_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.bipstart_admins enable row level security;
revoke all on public.bipstart_admins from anon,authenticated;
-- Conceder o administrador explicitamente pelo SQL Editor do Supabase,
-- após conferir o auth.users.id da sua conta:
-- insert into public.bipstart_admins(user_id) values ('UUID-DA-CONTA-ADMIN') on conflict do nothing;

create table if not exists public.bipstart_access_audit (
 id bigint generated always as identity primary key,
 shop_id uuid not null references public.shops(id) on delete cascade,
 admin_id uuid not null references auth.users(id),
 action text not null check(action in ('activate','suspend')),
 plan_code text not null check(plan_code in ('basic','personalizado','pro')),
 created_at timestamptz not null default now()
);
alter table public.bipstart_access_audit enable row level security;
revoke all on public.bipstart_access_audit from anon,authenticated;

create or replace function public.bipstart_admin_list_shops()
returns table(
 shop_id uuid, shop_name text, model text, requested_plan text,
 signup_choice text, access_status text, plan_code text, trial_until timestamptz,
 active_until timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.bipstart_admins a where a.user_id=auth.uid()) then
  raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;
 return query
 select s.id,s.name,s.model,s.requested_plan,s.signup_choice,
   e.status,e.plan_code,e.trial_until,e.active_until,s.created_at
 from public.shops s join public.shop_entitlements e on e.shop_id=s.id
 order by s.created_at desc limit 500;
end $$;

create or replace function public.bipstart_admin_set_access(p_shop_id uuid,p_plan text,p_action text)
returns boolean language plpgsql volatile security definer set search_path=''
as $$
declare found_rows integer;
begin
 if auth.uid() is null or not exists(select 1 from public.bipstart_admins a where a.user_id=auth.uid()) then
  raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;
 if p_plan not in ('basic','personalizado','pro') or p_action not in ('activate','suspend') then
  raise exception 'Plano ou ação inválida' using errcode='22023';
 end if;
 update public.shop_entitlements e
  set status=case when p_action='activate' then 'active' else 'suspended' end,
      plan_code=p_plan,
      active_until=case when p_action='activate' and p_plan='pro' then now()+interval '30 days'
                        when p_action='activate' then null else now() end,
      updated_at=now()
  where e.shop_id=p_shop_id;
 get diagnostics found_rows = row_count;
 if found_rows<>1 then raise exception 'Loja não encontrada' using errcode='P0002'; end if;
 insert into public.bipstart_access_audit(shop_id,admin_id,action,plan_code)
 values(p_shop_id,auth.uid(),p_action,p_plan);
 return true;
end $$;

revoke all on function public.bipstart_admin_list_shops() from public,anon;
revoke all on function public.bipstart_admin_set_access(uuid,text,text) from public,anon;
grant execute on function public.bipstart_admin_list_shops() to authenticated;
grant execute on function public.bipstart_admin_set_access(uuid,text,text) to authenticated;
