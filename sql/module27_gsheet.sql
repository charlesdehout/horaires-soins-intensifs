-- =====================================================================
-- Module 27 — Miroir Google Sheets : réglages admin (URL + jeton)
-- ---------------------------------------------------------------------
-- Petite table clé/valeur pour stocker les paramètres applicatifs admin.
-- Utilisée ici pour le miroir Google Sheets :
--   - 'gsheet_url'   : URL du déploiement « Application web » Apps Script (.../exec)
--   - 'gsheet_token' : mot de passe partagé (doit correspondre au TOKEN du script)
-- LECTURE réservée aux admins (le jeton ne doit pas fuiter côté médecin) ;
-- ÉCRITURE réservée aux admins (helper public.is_admin(), cf. module4).
-- Idempotent. À lancer dans Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_admin_read on public.app_settings;
create policy app_settings_admin_read on public.app_settings
  for select to authenticated using (public.is_admin());

drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
