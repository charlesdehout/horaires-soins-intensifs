-- =====================================================================
-- Quota de congés par médecin (sur la durée du contrat)
-- À lancer dans Supabase → SQL Editor.
-- L'écriture de doctors est déjà réservée à l'admin (RLS Module 2).
-- max_conges_days = NULL  ->  pas de limite (illimité).
-- =====================================================================

alter table public.doctors
  add column if not exists max_conges_days integer;

-- Recharge le cache de schéma de l'API.
notify pgrst, 'reload schema';
