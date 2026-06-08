-- =====================================================================
-- Module 9 — Modèle de personnel complet (spec Calabro §2)
-- À lancer dans le SQL Editor de Supabase.
-- Idempotent : ré-exécutable sans erreur.
-- =====================================================================

-- 1) Statut du médecin : 'dependant' (par défaut) ou 'independant'.
--    Applicable surtout aux Résidents (logique inversée : planifiable
--    uniquement sur les jours déclarés disponibles).
alter table public.doctors
  add column if not exists statut text not null default 'dependant'
    check (statut in ('dependant', 'independant'));

-- 2) Flag « congés à 100 % malgré FTE réduit » (certains 80 % gardent
--    100 % des droits aux congés).
alter table public.doctors
  add column if not exists conges_100pct boolean not null default false;

-- 3) Niveau administratif : 'aucun' (travailleur), 'secondaire', 'principal'.
--    La colonne `role` ('admin'|'doctor') reste utilisée pour l'accès ;
--    `admin_level` la précise (désidératas à priorité différente).
alter table public.doctors
  add column if not exists admin_level text not null default 'aucun'
    check (admin_level in ('aucun', 'secondaire', 'principal'));

-- 4) Périodes contractuelles multiples (non consécutives).
--    Tableau JSON : [{ "start": "2025-11-15", "end": "2026-04-20" }, ...].
--    Si renseigné (non vide), il PRÉVAUT sur contract_start / contract_end
--    pour la planification. Sinon on retombe sur contract_start/end.
alter table public.doctors
  add column if not exists contract_periods jsonb;

-- 5) Cohérence : aligne admin_level et role pour les lignes existantes.
update public.doctors set admin_level = 'principal'
  where role = 'admin' and admin_level = 'aucun';

-- 6) Préférence « disponibilité déclarée » (Résidents indépendants).
--    On réutilise la table preferences avec un nouveau pref_type 'dispo'
--    (fenêtres OÙ le médecin est planifiable). Aucune migration de schéma
--    n'est nécessaire si pref_type est un simple text ; sinon, étendre la
--    contrainte CHECK ci-dessous.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'preferences' and column_name = 'pref_type'
      and constraint_name like '%pref_type%'
  ) then
    -- Remplace la contrainte CHECK existante pour inclure 'dispo'.
    begin
      alter table public.preferences drop constraint if exists preferences_pref_type_check;
    exception when others then null;
    end;
  end if;
end $$;

alter table public.preferences
  add constraint preferences_pref_type_check
  check (pref_type in (
    'conge', 'conge_annuel', 'conge_extralegal', 'conge_scientifique',
    'indispo', 'souhait', 'off_clinic', 'recuperation', 'dispo'
  )) not valid;
