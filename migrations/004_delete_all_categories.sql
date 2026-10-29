-- Exclui as categorias de uma única loja sem excluir produtos ou histórico.
-- Chamada pelo dono autenticado; RLS continua sendo aplicada (SECURITY INVOKER).
create or replace function public.bipstart_delete_all_categories(p_shop_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_products_updated integer := 0;
  v_categories_deleted integer := 0;
  v_remaining_categories integer := 0;
  v_remaining_assigned integer := 0;
begin
  if p_shop_id is null or not public.can_write_shop(p_shop_id) then
    raise exception 'Loja sem permissão para excluir categorias.' using errcode='42501';
  end if;

  -- Categorias de produtos aparecem no PDV mesmo sem registro na tabela de categorias.
  -- Mantê-los cadastrados e transferi-los para Geral evita recriar categorias antigas.
  update public.shop_products
     set category = 'Geral'
   where shop_id = p_shop_id
     and category is distinct from 'Geral';
  get diagnostics v_products_updated = row_count;

  -- Remove apenas categorias persistidas da loja atual; não apaga imagens do Storage.
  delete from public.shop_menu_categories
   where shop_id = p_shop_id;
  get diagnostics v_categories_deleted = row_count;

  -- Uma política RLS pode bloquear atualizações silenciosamente; detectar e reverter.
  select count(*) into v_remaining_assigned
    from public.shop_products
   where shop_id = p_shop_id and category is distinct from 'Geral';
  select count(*) into v_remaining_categories
    from public.shop_menu_categories
   where shop_id = p_shop_id;
  if v_remaining_assigned > 0 or v_remaining_categories > 0 then
    raise exception 'Não foi possível excluir todas as categorias. Verifique as permissões.'
      using errcode='42501';
  end if;

  return jsonb_build_object(
    'categories_deleted', v_categories_deleted,
    'products_recategorized', v_products_updated
  );
end;
$$;

revoke all on function public.bipstart_delete_all_categories(uuid) from public, anon;
grant execute on function public.bipstart_delete_all_categories(uuid) to authenticated;
