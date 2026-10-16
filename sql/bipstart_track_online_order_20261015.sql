-- Consulta pública do andamento de um pedido mediante dois identificadores imprevisíveis.
-- O identificador secreto do carrinho é criado no navegador com crypto.randomUUID().
-- Nunca aceita apenas telefone, nome ou número curto como autenticação.
-- Só devolve status, data, total e nome da loja; não expõe itens, endereço,
-- telefone, dados pessoais nem token do carrinho.
create or replace function public.bipstart_track_online_order(
 p_order_id uuid, p_client_token uuid
) returns jsonb
language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
  'id',o.id,
  'shop_name',s.name,
  'status',o.status,
  'payment_status',o.payment_status,
  'delivery_method',o.delivery_method,
  'total',o.total,
  'created_at',o.created_at
 )
 from public.shop_online_orders o
 join public.shops s on s.id=o.shop_id
 where o.id=p_order_id and o.client_token=p_client_token
 limit 1
$$;
revoke all on function public.bipstart_track_online_order(uuid,uuid) from public;
grant execute on function public.bipstart_track_online_order(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
