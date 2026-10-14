-- BipStart: painel administrativo de solicitações de personalização.
-- Reutiliza os status existentes: novo, em_analise, concluido.
-- Não modifica solicitações existentes nem altera permissões dos clientes.

create table if not exists public.bipstart_customization_audit (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.shop_customization_requests(id) on delete cascade,
 admin_id uuid not null references auth.users(id),
 old_status text not null check (old_status in ('novo','em_analise','concluido')),
 new_status text not null check (new_status in ('novo','em_analise','concluido')),
 created_at timestamptz not null default now()
);
alter table public.bipstart_customization_audit enable row level security;
revoke all on public.bipstart_customization_audit from public,anon,authenticated;

create or replace function public.bipstart_admin_list_customization_requests()
returns table(
 request_id uuid,
 shop_id uuid,
 shop_name text,
 owner_email text,
 shop_whatsapp text,
 plan_code text,
 details text,
 request_status text,
 created_at timestamptz
)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not exists(
  select 1 from public.bipstart_admins a where a.user_id=auth.uid()
 ) then
  raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;
 return query
 select r.id, s.id, s.name, u.email::text, s.whatsapp, e.plan_code,
        r.details, r.status, r.created_at
 from public.shop_customization_requests r
 join public.shops s on s.id=r.shop_id
 join auth.users u on u.id=s.owner_id
 join public.shop_entitlements e on e.shop_id=s.id
 order by r.created_at desc, r.id desc limit 500;
end $$;

create or replace function public.bipstart_admin_update_customization_status(
 p_request_id uuid,
 p_status text
)
returns boolean
language plpgsql volatile security definer set search_path=''
as $$
declare
 v_old_status text;
begin
 if auth.uid() is null or not exists(
  select 1 from public.bipstart_admins a where a.user_id=auth.uid()
 ) then
  raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;

 if p_request_id is null or p_status is null
   or p_status not in ('novo','em_analise','concluido') then
  raise exception 'Solicitação ou status inválido' using errcode='22023';
 end if;

 select r.status into v_old_status
 from public.shop_customization_requests r
 where r.id=p_request_id
 for update;
 if not found then
  raise exception 'Solicitação não encontrada' using errcode='P0002';
 end if;
 if v_old_status=p_status then
  return true;
 end if;
 update public.shop_customization_requests
 set status=p_status
 where id=p_request_id;
 insert into public.bipstart_customization_audit(request_id,admin_id,old_status,new_status)
 values(p_request_id,auth.uid(),v_old_status,p_status);
 return true;
end $$;

revoke all on function public.bipstart_admin_list_customization_requests() from public,anon;
revoke all on function public.bipstart_admin_update_customization_status(uuid,text) from public,anon;
grant execute on function public.bipstart_admin_list_customization_requests() to authenticated;
grant execute on function public.bipstart_admin_update_customization_status(uuid,text) to authenticated;
