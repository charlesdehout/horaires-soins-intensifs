-- =====================================================================
-- Module 6 — Admin : ajustements manuels + publication du planning
-- À lancer dans Supabase → SQL Editor. Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Un seul planning par mois (year, month).
--    Évite les doublons de brouillons lors des régénérations.
--    (L'app efface déjà l'ancien avant de recréer ; cette contrainte
--    est un garde-fou côté base.)
-- ---------------------------------------------------------------------
alter table public.schedules
  drop constraint if exists schedules_year_month_unique;
alter table public.schedules
  add constraint schedules_year_month_unique unique (year, month);

-- ---------------------------------------------------------------------
-- 2) Horodatage de publication (NULL tant que le planning est brouillon).
--    Sert à tracer quand un planning est passé en « published ».
-- ---------------------------------------------------------------------
alter table public.schedules
  add column if not exists published_at timestamptz;

-- ---------------------------------------------------------------------
-- 3) Statut connu uniquement ('draft' ou 'published').
-- ---------------------------------------------------------------------
alter table public.schedules drop constraint if exists schedules_status_check;
alter table public.schedules add constraint schedules_status_check
  check (status in ('draft','published'));

-- Recharge le cache de schéma de l'API.
notify pgrst, 'reload schema';
