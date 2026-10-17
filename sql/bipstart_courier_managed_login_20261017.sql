-- Diferencia motoboys cadastrados pelo lojista (telefone + senha)
-- dos motoboys legados que receberam convite por e-mail.
alter table public.shop_couriers
 add column if not exists login_managed boolean not null default false;
comment on column public.shop_couriers.login_managed is
 'Conta criada pelo lojista; senha pertence exclusivamente ao Supabase Auth';
notify pgrst,'reload schema';
