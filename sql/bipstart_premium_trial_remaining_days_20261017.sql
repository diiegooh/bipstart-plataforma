-- Premium em teste: utiliza os dias restantes do teste Básico.
-- Nunca altera trial_until nem libera um ciclo pago de 30 dias.
alter table public.shops
 add column if not exists upgrade_request_type text not null default 'paid';
do $$
begin
 if not exists(select 1 from pg_constraint
  where conrelid='public.shops'::regclass and conname='shops_upgrade_request_type_check') then
  alter table public.shops add constraint shops_upgrade_request_type_check
   check(upgrade_request_type in ('trial','paid'));
 end if;
end $$;

create or replace function public.bipstart_request_premium_trial(p_shop_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if auth.uid() is null then
  raise exception 'Entre na conta para solicitar o teste' using errcode='42501';
 end if;
 update public.shops s
 set requested_plan='pro', upgrade_request_type='trial'
 where s.id=p_shop_id and s.owner_id=auth.uid()
   and exists(
    select 1 from public.shop_entitlements e
    where e.shop_id=s.id and e.status='trialing'
     and e.plan_code='basic' and e.trial_until>now()
   );
 get diagnostics v_count = row_count;
 if v_count<>1 then
  raise exception 'O teste Premium só pode ser solicitado durante um teste Básico válido.' using errcode='22023';
 end if;
 return true;
end $$;
revoke all on function public.bipstart_request_premium_trial(uuid)
 from public,anon,authenticated;
grant execute on function public.bipstart_request_premium_trial(uuid) to authenticated;

-- Solicitações pagas continuam distintas das solicitações gratuitas.
create or replace function public.bipstart_request_plan_change(p_shop_id uuid,p_plan text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if auth.uid() is null then
  raise exception 'Entre na conta para solicitar o plano' using errcode='42501';
 end if;
 if p_plan not in ('basic','pro') then
  raise exception 'Plano inválido' using errcode='22023';
 end if;
 update public.shops s
 set requested_plan=p_plan,upgrade_request_type='paid'
 where s.id=p_shop_id and s.owner_id=auth.uid();
 get diagnostics v_count = row_count;
 if v_count<>1 then
  raise exception 'Loja não encontrada ou sem permissão' using errcode='42501';
 end if;
 -- NÃO altera plan_code nem status: somente o administrador ativa o plano.
 return true;
end $$;

-- Consulta específica de tipo de pedido para o Admin; a listagem atual segue compatível.
create or replace function public.bipstart_admin_list_upgrade_request_modes()
returns table(shop_id uuid,upgrade_request_type text)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not exists(
   select 1 from public.bipstart_admins a where a.user_id=auth.uid()
 ) then
   raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;
 return query
 select s.id,s.upgrade_request_type
 from public.shops s
 where s.requested_plan='pro'
 order by s.created_at desc
 limit 500;
end $$;
revoke all on function public.bipstart_admin_list_upgrade_request_modes()
 from public,anon,authenticated;
grant execute on function public.bipstart_admin_list_upgrade_request_modes() to authenticated;

-- Registra concessões de teste separadamente de ativações pagas.
alter table public.bipstart_access_audit
 drop constraint if exists bipstart_access_audit_action_check;
alter table public.bipstart_access_audit
 add constraint bipstart_access_audit_action_check
 check(action in ('activate','suspend','trial_upgrade'));

create or replace function public.bipstart_admin_upgrade_trial(p_shop_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if auth.uid() is null or not exists(
  select 1 from public.bipstart_admins a where a.user_id=auth.uid()
 ) then
  raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;
 -- Exige pedido de TESTE Premium explícito. Trava a loja para evitar concorrência.
 perform 1 from public.shops s
 where s.id=p_shop_id and s.requested_plan='pro' and s.upgrade_request_type='trial'
 for update;
 if not found then
  raise exception 'Não há pedido de teste Premium pendente para esta loja.' using errcode='22023';
 end if;
 update public.shop_entitlements e
 set plan_code='pro', updated_at=now()
 where e.shop_id=p_shop_id
   and e.plan_code='basic' and e.status='trialing'
   and e.trial_until is not null and e.trial_until>now();
 get diagnostics v_count = row_count;
 if v_count<>1 then
  raise exception 'Teste Básico já expirado ou Premium já liberado.' using errcode='22023';
 end if;
 -- trial_until, active_until e status NÃO são modificados.
 insert into public.bipstart_access_audit(shop_id,admin_id,action,plan_code)
 values(p_shop_id,auth.uid(),'trial_upgrade','pro');
 return true;
end $$;
revoke all on function public.bipstart_admin_upgrade_trial(uuid)
 from public,anon,authenticated;
grant execute on function public.bipstart_admin_upgrade_trial(uuid) to authenticated;

notify pgrst, 'reload schema';
