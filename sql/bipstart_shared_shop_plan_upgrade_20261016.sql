-- BipStart: alteração de plano sem criar outra loja nem migrar dados.
-- A solicitação do titular NÃO altera shop_entitlements (ativação é manual).
create or replace function public.bipstart_request_plan_change(p_shop_id uuid,p_plan text)
returns boolean
language plpgsql volatile security definer set search_path=''
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
 set requested_plan=p_plan
 where s.id=p_shop_id and s.owner_id=auth.uid();
 get diagnostics v_count = row_count;
 if v_count<>1 then
   raise exception 'Loja não encontrada ou sem permissão' using errcode='42501';
 end if;
 -- NÃO altera plan_code nem status: somente o administrador ativa o plano.
 return true;
end $$;
revoke all on function public.bipstart_request_plan_change(uuid,text) from public,anon,authenticated;
grant execute on function public.bipstart_request_plan_change(uuid,text) to authenticated;

-- A ativação atualiza SOMENTE o direito de uso da mesma loja e seu plano solicitado.
-- O id da loja não muda: produtos, categorias, vendas, pedidos e ajustes continuam.
create or replace function public.bipstart_admin_set_access(
 p_shop_id uuid,p_plan text,p_action text
)
returns boolean language plpgsql volatile security definer set search_path=''
as $$
declare found_rows integer;
begin
 if auth.uid() is null or not exists(
   select 1 from public.bipstart_admins a where a.user_id=auth.uid()
 ) then
   raise exception 'Acesso administrativo não autorizado' using errcode='42501';
 end if;
 if p_plan not in ('basic','pro') or p_action not in ('activate','suspend') then
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
 if found_rows<>1 then raise exception 'Loja não encontrada' using errcode='P0002';end if;
 if p_action='activate' then
   update public.shops s set requested_plan=p_plan where s.id=p_shop_id;
 end if;
 insert into public.bipstart_access_audit(shop_id,admin_id,action,plan_code)
 values(p_shop_id,auth.uid(),p_action,p_plan);
 return true;
end $$;
revoke all on function public.bipstart_admin_set_access(uuid,text,text) from public,anon,authenticated;
grant execute on function public.bipstart_admin_set_access(uuid,text,text) to authenticated;

notify pgrst,'reload schema';
