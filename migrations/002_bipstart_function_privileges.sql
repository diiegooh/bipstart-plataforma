-- BipStart hardening: no changes to Salgatti's existing tables.
-- Trigger functions must not be callable directly via PostgREST.
revoke execute on function public.create_shop_trial() from public, anon, authenticated;
revoke execute on function public.bipstart_check_appointment() from public, anon, authenticated;

-- A public menu is intentionally accessible by anonymous visitors.
-- Its SECURITY DEFINER function exposes only public catalog fields and filters active stores.

-- Prevent privilege escalation via changed owner IDs.
-- Signed-in users can edit only their own shop; existing policy requires auth.uid() = owner_id.
