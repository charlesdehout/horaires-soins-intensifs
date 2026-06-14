-- =====================================================================
-- Module 26 — Fériés (refonte « travailler un férié » + fériés éditables)
-- ---------------------------------------------------------------------
-- Remplace l'ancien dispositif « récup férié » (Module 18) par une demande
-- unique « TRAVAILLER UN FÉRIÉ » :
--   • Le médecin dépose UNE demande (pref_type 'travailler_ferie') sur la
--     date du férié, en choisissant DANS LE MÊME formulaire son jour de congé
--     compensatoire (colonne `date_compensation`, à poser sous 6 semaines).
--   • Une fois APPROUVÉE par l'admin :
--       - l'algo PLACE le demandeur EN PRIORITÉ sur ce férié (couverture
--         week-end : garde 24 h / tour) ;
--       - le jour compensatoire devient un « congé férié » BLOQUANT
--         (pref_type 'conge_ferie'), HORS QUOTA de congés annuels.
--   • La génération du trimestre n'est PAS bloquée par une demande en attente.
--
-- Fériés ÉDITABLES par l'admin : table `feries_admin` qui surcharge le calcul
-- automatique des fériés belges — `actif = true` AJOUTE une date (agit comme un
-- week-end), `actif = false` RETIRE un férié belge calculé.
--
-- 'recup_ferie' reste un pref_type VALIDE (compatibilité des lignes existantes)
-- mais n'est plus utilisé par l'application.
-- Idempotent. À lancer dans le SQL Editor Supabase APRÈS module25_reconnu.sql.
-- =====================================================================

-- 1) Nouveaux types de préférence -------------------------------------------
alter table public.preferences drop constraint if exists preferences_pref_type_check;
alter table public.preferences
  add constraint preferences_pref_type_check
  check (pref_type in (
    'conge', 'conge_annuel', 'conge_extralegal', 'conge_scientifique',
    'indispo', 'souhait', 'off_clinic', 'recuperation', 'dispo',
    'formation', 'autre', 'demande_weekend',
    'recup_ferie',                       -- legacy (plus utilisé)
    'travailler_ferie', 'conge_ferie'    -- Module 26
  )) not valid;

-- 1b) Le jour de récup est MATÉRIALISÉ en shift 'conge_ferie' (0 h, absence) :
--     on étend la contrainte shift_type des SHIFTS (sinon la génération échoue
--     avec « shifts_shift_type_check »). Reprend la liste de module15 + conge_ferie.
alter table public.shifts drop constraint if exists shifts_shift_type_check;
alter table public.shifts add constraint shifts_shift_type_check
  check (shift_type in (
    'jour','twe','garde_nuit','garde_24h',
    'recup','repos_garde','off','conge_annuel','conge_scientifique','conge_extralegal',
    'conge_ferie'                          -- Module 26 : jour de récup férié
  ));

-- 2) Jour compensatoire porté par la demande « travailler un férié » --------
alter table public.preferences
  add column if not exists date_compensation date;

-- 3) Table des fériés éditables par l'admin (surcharge le calcul belge) ------
create table if not exists public.feries_admin (
  date    date primary key,
  actif   boolean not null default true,   -- true = AJOUTER ; false = RETIRER
  libelle text,
  created_at timestamptz not null default now()
);

alter table public.feries_admin enable row level security;

-- Lecture : tous les utilisateurs authentifiés (l'algo en a besoin).
drop policy if exists feries_admin_select on public.feries_admin;
create policy feries_admin_select on public.feries_admin
  for select to authenticated using (true);

-- Écriture : réservée à l'admin (helper partagé public.is_admin(), cf. module4).
drop policy if exists feries_admin_write on public.feries_admin;
create policy feries_admin_write on public.feries_admin
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
