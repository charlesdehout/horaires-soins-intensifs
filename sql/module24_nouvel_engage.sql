-- =====================================================================
-- Module 24 — Statut « NOUVEL ENGAGÉ » (révision 2026-06-12)
-- ---------------------------------------------------------------------
-- Pendant les 14 premiers jours de contrat : présence quotidienne en
-- DOUBLURE d'une unité (choisie librement par l'algo), JAMAIS de garde,
-- de week-end ni de tour. Le statut est posé dans la fiche médecin et
-- doit être RETIRÉ par l'admin avant la génération du trimestre suivant
-- (la génération est bloquée sinon).
-- Idempotent. À lancer dans le SQL Editor Supabase.
-- =====================================================================

alter table public.doctors
  add column if not exists nouvel_engage boolean not null default false;

notify pgrst, 'reload schema';
