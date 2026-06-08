-- =====================================================================
-- Module 6 (compl.) — Absences posables dans le planning
-- Ajoute les types d'« absence / repos » que l'admin peut poser
-- directement comme shifts (récup, off, congés). 0 heure, sans station.
-- À lancer dans Supabase → SQL Editor. Idempotent.
-- =====================================================================

-- Étend la liste des shift_type autorisés (travail + absences).
alter table public.shifts drop constraint if exists shifts_shift_type_check;
alter table public.shifts add constraint shifts_shift_type_check
  check (shift_type in (
    -- Shifts de travail
    'jour','twe','garde_nuit','garde_24h',
    -- Absences / repos (0 h, sans station)
    'recup','off','conge_annuel','conge_scientifique','conge_extralegal'
  ));

-- Recharge le cache de schéma de l'API.
notify pgrst, 'reload schema';
