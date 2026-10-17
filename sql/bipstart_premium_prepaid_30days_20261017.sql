-- Acréscimo manual de 30 dias Premium por pagamento confirmado.
-- Registra cada operação, sem perder dias pagos antecipadamente.
alter table public.shop_entitlements
 add column if not exists premium_paid_periods bigint not null default 0;
alter table public.shop_entitlements
 drop constraint if exists shop_entitlements_paid_periods_positive;
alter table public.shop_entitlements
 add constraint shop_entitlements_paid_periods_positive check (premium_paid_periods >= 0);

create or replace function public.bipstart_admin_extend_premium(p_shop_id uuid)
returns table(active_until timestamptz, premium_paid_periods bigint)
language plpgsql security definer set search_path=''
as $$
declare
 v_base timestamptz;
 v_until timestamptz;
 v_periods bigint;
begin
 if auth.uid() is null or not exists(
  select 1 from public.bipstart_admins a where a.user_id=auth.uid()
 ) then
  raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;
 -- SELECT FOR UPDATE serializa cliques e pagamentos concorrentes.
 select greatest(now(),case
   when e.status='trialing' and e.trial_until>now() then e.trial_until
   when e.status='active' and e.active_until is not null then e.active_until
   else now()
 end)
 into v_base
 from public.shop_entitlements e where e.shop_id=p_shop_id for update;
 if not found then raise exception 'Loja não encontrada' using errcode='P0002'; end if;
 update public.shop_entitlements e
 set plan_code='pro',status='active',active_until=v_base+interval '30 days',
     premium_paid_periods=e.premium_paid_periods+1,updated_at=now()
 where e.shop_id=p_shop_id
 returning e.active_until,e.premium_paid_periods into v_until,v_periods;
 update public.shops s
 set requested_plan='pro',upgrade_request_type='paid'
 where s.id=p_shop_id;
 insert into public.bipstart_access_audit(shop_id,admin_id,action,plan_code)
 values(p_shop_id,auth.uid(),'extend_30','pro');
 return query select v_until,v_periods;
end $$;
revoke all on function public.bipstart_admin_extend_premium(uuid) from public,anon,authenticated;
grant execute on function public.bipstart_admin_extend_premium(uuid) to authenticated;
alter table public.bipstart_access_audit
 drop constraint if exists bipstart_access_audit_action_check;
alter table public.bipstart_access_audit
 add constraint bipstart_access_audit_action_check
 check(action in ('activate','suspend','trial_upgrade','extend_30'));

-- Retorna a contagem e o vencimento atual sem expor dados de outras lojas.
create or replace function public.bipstart_admin_premium_renewal_summary()
returns table(shop_id uuid, premium_paid_periods bigint,active_until timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not exists(
  select 1 from public.bipstart_admins a where a.user_id=auth.uid()
 ) then raise exception 'Acesso administrativo não autorizado' using errcode='42501'; end if;
 return query
 select e.shop_id,e.premium_paid_periods,e.active_until
 from public.shop_entitlements e
 order by e.updated_at desc
 limit 500;
end $$;
revoke all on function public.bipstart_admin_premium_renewal_summary() from public,anon,authenticated;
grant execute on function public.bipstart_admin_premium_renewal_summary() to authenticated;
notify pgrst,'reload schema';
