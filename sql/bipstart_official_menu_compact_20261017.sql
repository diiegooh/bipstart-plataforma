-- BipStart 2026-10-17: o cardápio compacto passa a ser o único modelo.
-- Dados, pedidos, motoboys, estoque e configurações anteriores permanecem intactos.
alter table public.shops alter column menu_layout_style set default 'round';
update public.shops set menu_layout_style='round'
 where menu_layout_style is distinct from 'round';
alter table public.shops drop constraint if exists bipstart_menu_layout_style_valid;
alter table public.shops add constraint bipstart_menu_layout_style_valid
 check (menu_layout_style='round');
