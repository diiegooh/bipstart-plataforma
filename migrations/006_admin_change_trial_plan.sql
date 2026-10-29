-- Alteração administrativa do plano DURANTE o teste grátis.
-- Mantém a data de encerramento do teste, o status, a assinatura paga e os dias acumulados.
create or replace function public.bipstart_admin_change_trial_plan(
  p_shop_id uuid,
  p_plan text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.shop_entitlements%rowtype;
  v_shop_exists boolean;
  v_trial_until timestamptz;
  v_from_plan text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.bipstart_admins a where a.user_id = auth.uid()
  ) then
    raise exception 'Acesso administrativo não autorizado' using errcode='42501';
  end if;

  if p_shop_id is null or p_plan is null or p_plan not in ('basic','pro') then
    raise exception 'Loja ou plano inválido' using errcode='22023';
  end if;

  select e.* into v_current
    from public.shop_entitlements e
   where e.shop_id = p_shop_id
   for update;

  if not found then
    raise exception 'Loja não encontrada' using errcode='P0002';
  end if;

  if v_current.status <> 'trialing'
    or v_current.trial_until is null
    or v_current.trial_until <= now() then
    raise exception 'O teste gratuito já terminou ou não está ativo. Nenhum prazo foi alterado.'
      using errcode='22023';
  end if;

  -- Evita alterar assinaturas pagas que porventura possuam dados inconsistentes.
  if v_current.active_until is not null and v_current.active_until > now() then
    raise exception 'Esta loja possui período pago ativo. Use o fluxo de planos pagos.'
      using errcode='22023';
  end if;

  v_trial_until := v_current.trial_until;
  v_from_plan := v_current.plan_code;

  -- A atualização é atômica e muda SOMENTE o plano do direito de acesso.
  update public.shop_entitlements e
     set plan_code = p_plan,
         updated_at = now()
   where e.shop_id = p_shop_id;

  -- Sincroniza o plano solicitado para evitar upgrade pendente incorreto.
  update public.shops s
     set requested_plan = p_plan,
         upgrade_request_type = case when p_plan = 'pro' then 'trial' else 'paid' end
   where s.id = p_shop_id;

  if not found then
    raise exception 'Cadastro da loja não encontrado' using errcode='P0002';
  end if;

  if v_from_plan is distinct from p_plan then
    insert into public.bipstart_access_audit(shop_id, admin_id, action, plan_code)
    values(p_shop_id, auth.uid(), 'trial_plan_change', p_plan);
  end if;

  -- Proteção adicional: não autorizar alteração acidental de vencimento ou status.
  if exists (
    select 1 from public.shop_entitlements e
     where e.shop_id = p_shop_id
       and (e.trial_until is distinct from v_trial_until
            or e.status <> 'trialing'
            or e.active_until is distinct from v_current.active_until
            or e.premium_paid_periods is distinct from v_current.premium_paid_periods)
  ) then
    raise exception 'A data do teste ou o período pago foram alterados inesperadamente.'
      using errcode='22023';
  end if;

  return jsonb_build_object(
    'shop_id', p_shop_id,
    'previous_plan', v_from_plan,
    'plan_code', p_plan,
    'status', 'trialing',
    'trial_until', v_trial_until,
    'changed', v_from_plan is distinct from p_plan
  );
end;
$$;

revoke all on function public.bipstart_admin_change_trial_plan(uuid,text)
from public, anon;
grant execute on function public.bipstart_admin_change_trial_plan(uuid,text) to authenticated;
