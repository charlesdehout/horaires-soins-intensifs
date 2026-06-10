-- =====================================================================
-- Module 18 — Récup férié (jour de congé compensatoire)
-- ---------------------------------------------------------------------
-- Un médecin qui TRAVAILLE un jour férié (garde / tour / journée) a droit
-- à 1 jour de congé compensatoire « récup férié », à poser DANS LES 6 SEMAINES
-- qui suivent le férié, et validé par le gérant des horaires (admin).
--   • Pas d'auto-crédit : c'est une DEMANDE du médecin (pref_type 'recup_ferie'),
--     soumise au workflow de validation (status en_attente → approuve).
--   • Une fois APPROUVÉE, elle est BLOQUANTE à la génération (cf. regles.js
--     PREF_BLOQUANTES) : le médecin n'est pas planifiable ce jour-là.
-- Idempotent : on reconstruit la contrainte CHECK de pref_type en y ajoutant
-- 'recup_ferie' (reprend la liste complète de module10 + module17 n'y touche pas).
-- À lancer dans le SQL Editor Supabase APRÈS module10_workflow.sql.
-- =====================================================================

alter table public.preferences drop constraint if exists preferences_pref_type_check;
alter table public.preferences
  add constraint preferences_pref_type_check
  check (pref_type in (
    'conge', 'conge_annuel', 'conge_extralegal', 'conge_scientifique',
    'indispo', 'souhait', 'off_clinic', 'recuperation', 'dispo',
    'formation', 'autre', 'demande_weekend',
    'recup_ferie'
  )) not valid;

-- Aucune nouvelle table ni colonne : 'recup_ferie' réutilise entièrement le
-- modèle existant des préférences (workflow de validation, RLS, affichage).
