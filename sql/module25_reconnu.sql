-- =====================================================================
-- Module 25 — Médecin « RECONNU » (révision 2026-06-12)
-- ---------------------------------------------------------------------
-- Statut éditable dans la fiche médecin. Sert à l'export Excel
-- « Horaires — reconnus » : les jours SANS médecin reconnu parmi les
-- personnes de garde y sont surlignés en bleu (colonne entière).
-- Idempotent. À lancer dans le SQL Editor Supabase.
-- =====================================================================

alter table public.doctors
  add column if not exists reconnu boolean not null default false;

notify pgrst, 'reload schema';
