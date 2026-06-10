-- =====================================================================
-- Module 19 — Pré-placement manuel (shifts ÉPINGLÉS)
-- ---------------------------------------------------------------------
-- L'admin peut « épingler » un shift posé à la main. Les shifts épinglés
-- sont CONSERVÉS lors d'une (re)génération du planning et l'algorithme
-- construit AUTOUR (cf. planning.js : opts.prePlaces). Les shifts NON
-- épinglés (auto) sont remplacés à chaque génération.
-- Idempotent : à lancer dans le SQL Editor Supabase (après module17).
-- =====================================================================

alter table public.shifts
  add column if not exists epingle boolean not null default false;

-- Index partiel : retrouve rapidement les pré-placements à respecter.
create index if not exists idx_shifts_epingle
  on public.shifts (date) where epingle;
