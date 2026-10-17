-- Lista de lojas para o painel administrativo, incluindo telefone comercial.
-- Exclusiva para administradores cadastrados; não altera a consulta legada.
create or replace function public.bipstart_admin_list_shops_with_contacts()
returns table(
 shop_id uuid, shop_name text, owner_email text, shop_whatsapp text,
 model text, requested_plan text, signup_choice text, access_status text,
 plan_code text, trial_until timestamptz, active_until timestamptz, created_at timestamptz
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
 select s.id, s.name, u.email::text, s.whatsapp, s.model, s.requested_plan,
        s.signup_choice, e.status, e.plan_code, e.trial_until, e.active_until, s.created_at
 from public.shops s
 join public.shop_entitlements e on e.shop_id=s.id
 join auth.users u on u.id=s.owner_id
 order by s.created_at desc
 limit 500;
end $$;

revoke all on function public.bipstart_admin_list_shops_with_contacts() from public, anon, authenticated;
grant execute on function public.bipstart_admin_list_shops_with_contacts() to authenticated;
