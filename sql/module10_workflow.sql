-- =====================================================================
-- Module 10 — Workflow des demandes (validation admin) — spec §8.3, §12
-- À lancer dans le SQL Editor de Supabase. Idempotent.
-- =====================================================================

-- 1) Statut de validation des demandes (préférences).
--    'approuve' par défaut pour ne pas casser l'existant ; les NOUVELLES
--    demandes des travailleurs sont créées en 'en_attente' côté application.
alter table public.preferences
  add column if not exists status text not null default 'approuve'
    check (status in ('en_attente', 'approuve', 'refuse'));

-- Traçabilité de la décision (facultatif).
alter table public.preferences
  add column if not exists decided_at timestamptz;

-- 2) Nouveaux types de demande (spec §8.1) : formation USI, congé « autre »
--    (maladie/mariage, hors quota), demande de week-end/férié.
--    On reconstruit la contrainte CHECK de pref_type avec la liste complète.
alter table public.preferences drop constraint if exists preferences_pref_type_check;
alter table public.preferences
  add constraint preferences_pref_type_check
  check (pref_type in (
    'conge', 'conge_annuel', 'conge_extralegal', 'conge_scientifique',
    'indispo', 'souhait', 'off_clinic', 'recuperation', 'dispo',
    'formation', 'autre', 'demande_weekend'
  )) not valid;

-- 3) RLS : l'admin peut mettre à jour le statut de toute demande (déjà couvert
--    par la policy d'écriture admin existante). Les travailleurs lisent leurs
--    propres demandes avec leur statut (policy de lecture existante).
--    ⚠️ Durcissement à prévoir : empêcher un travailleur de passer ses propres
--    demandes en 'approuve' (trigger/policy dédiée) — Module de sécurité.

-- 4) Index utile pour lister rapidement les demandes en attente.
create index if not exists idx_preferences_status on public.preferences (status);
