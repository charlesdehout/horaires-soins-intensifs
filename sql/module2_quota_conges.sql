-- =====================================================================
-- Quotas de congés par médecin — 3 catégories (jours OUVRÉS / an)
-- À lancer dans Supabase → SQL Editor.
-- L'écriture de doctors est déjà réservée à l'admin (RLS Module 2).
--
-- NULL sur une colonne = on applique la valeur par défaut définie dans
-- regles.js (24 / 5 / 12). Ces valeurs sont ensuite proratisées selon la
-- durée du contrat dans l'année civile, côté application.
-- =====================================================================

alter table public.doctors
  add column if not exists quota_conge_annuel       integer,
  add column if not exists quota_conge_extralegal   integer,
  add column if not exists quota_conge_scientifique integer;

-- L'ancienne colonne max_conges_days (quota unique) n'est plus utilisée.
-- On peut la supprimer si elle existe :
alter table public.doctors drop column if exists max_conges_days;

-- Autoriser les nouveaux types de congé dans preferences.pref_type.
alter table public.preferences drop constraint if exists preferences_pref_type_check;
alter table public.preferences add constraint preferences_pref_type_check
  check (pref_type in (
    'conge',                -- ancien type, conservé pour compatibilité
    'conge_annuel', 'conge_extralegal', 'conge_scientifique',
    'indispo', 'souhait', 'off_clinic', 'recuperation'
  ));

-- Recharge le cache de schéma de l'API.
notify pgrst, 'reload schema';
