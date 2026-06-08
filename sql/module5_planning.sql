-- =====================================================================
-- Module 5 — Schéma pour la génération du planning
-- À lancer dans Supabase → SQL Editor. Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Poste de jour sur un shift : station clinique occupée.
--    NULL pour les shifts sans station (garde de nuit, TWE, garde 24h
--    de week-end). Renseigné pour les shifts 'jour' et pour la garde
--    24h de SEMAINE qui occupe une des 7 stations.
-- ---------------------------------------------------------------------
alter table public.shifts add column if not exists poste text;

alter table public.shifts drop constraint if exists shifts_poste_check;
alter table public.shifts add constraint shifts_poste_check
  check (poste is null or poste in (
    'usi1','usi2','usi3','usi4','usi5','bordet','labo_choc'
  ));

-- Garantit que shift_type reste dans la liste connue (sécurité).
alter table public.shifts drop constraint if exists shifts_shift_type_check;
alter table public.shifts add constraint shifts_shift_type_check
  check (shift_type in ('jour','twe','garde_nuit','garde_24h'));

-- ---------------------------------------------------------------------
-- 2) Jours de semaine travaillables par médecin.
--    Tableau d'entiers 1=lundi … 7=dimanche. Défaut = tous les jours.
--    Ex. un 8/10 jamais le lundi → {2,3,4,5,6,7}.
--    Utilisé comme contrainte DURE par l'algorithme.
-- ---------------------------------------------------------------------
alter table public.doctors
  add column if not exists jours_travailles integer[] not null default '{1,2,3,4,5,6,7}';

-- Recharge le cache de schéma de l'API.
notify pgrst, 'reload schema';
