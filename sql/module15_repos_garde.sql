-- =====================================================================
-- Module 15 — Repos de garde distinct du repos manuel
-- ---------------------------------------------------------------------
-- Sépare deux notions auparavant confondues sous 'recup' :
--   - 'repos_garde' : repos OBLIGATOIRE post-garde, matérialisé
--     automatiquement par l'algorithme. Affiché dans le planning,
--     NON comptabilisé dans les totaux du récap.
--   - 'recup'       : repos / récupération posé manuellement par
--     l'admin, COMPTABILISÉ (colonne « Repos » du récap).
-- À lancer dans Supabase → SQL Editor. Idempotent.
-- =====================================================================

-- Étend la liste des shift_type autorisés (ajout de 'repos_garde').
alter table public.shifts drop constraint if exists shifts_shift_type_check;
alter table public.shifts add constraint shifts_shift_type_check
  check (shift_type in (
    -- Shifts de travail
    'jour','twe','garde_nuit','garde_24h',
    -- Absences / repos (0 h, sans station)
    'recup','repos_garde','off','conge_annuel','conge_scientifique','conge_extralegal'
  ));

-- Recharge le cache de schéma de l'API.
notify pgrst, 'reload schema';
