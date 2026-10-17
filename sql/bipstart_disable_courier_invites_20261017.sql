-- Novos motoboys são cadastrados diretamente pelo proprietário com usuário (telefone) e senha.
revoke execute on function public.bipstart_courier_claim_invite(uuid) from public, anon, authenticated; notify pgrst,'reload schema';
