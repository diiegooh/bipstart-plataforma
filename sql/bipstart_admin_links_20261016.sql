-- Diretório seguro de lojas para links administrativos da BipStart.
-- Os links são derivados do slug existente; não cria lojas nem modifica seus dados.
create or replace function public.bipstart_admin_list_shop_links()
returns table(
 shop_id uuid,
 shop_name text,
 shop_slug text,
 plan_code text,
 access_status text
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
 select s.id,s.name,s.slug,e.plan_code,e.status
 from public.shops s
 join public.shop_entitlements e on e.shop_id=s.id
 order by s.created_at desc limit 500;
end $$;

revoke all on function public.bipstart_admin_list_shop_links() from public,anon,authenticated;
grant execute on function public.bipstart_admin_list_shop_links() to authenticated;

notify pgrst,'reload schema';
