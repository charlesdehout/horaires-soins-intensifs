-- =====================================================================
-- Module 34 — Historique des remplacements pour CONGÉ MALADIE (CM)
-- À lancer dans le SQL Editor de Supabase. Idempotent.
-- Pré-requis : la fonction is_admin() existe déjà (Module 2).
-- =====================================================================
--
-- Chaque ligne = UN congé maladie traité par l'assistant (onglet « Congé
-- maladie »). Elle mémorise un INSTANTANÉ « avant/après » permettant d'ANNULER
-- le CM et de revenir exactement à la situation d'avant :
--   details = {
--     supprimes : [ { date, shift_type, poste, doctor_id, schedule_id, epingle } ... ],
--                 -- shifts retirés (du malade + off/récup/doublures repris) à RÉINSÉRER
--     inseres   : [ id, id, ... ]   -- ids des shifts ajoutés (remplaçants, repos, récups) à SUPPRIMER
--     resume    : [ { date, poste, remplacant } ... ]  -- pour l'affichage de l'historique
--   }
--   pref_id  = id de la préférence « conge_maladie » posée sur le malade (à SUPPRIMER à l'annulation)
-- ---------------------------------------------------------------------
create table if not exists public.cm_remplacements (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  malade_id   uuid not null references public.doctors(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  pref_id     uuid,                  -- préférence conge_maladie posée (nullable si échec)
  details     jsonb not null default '{}'::jsonb,
  constraint cm_remplacements_dates check (end_date >= start_date)
);

create index if not exists idx_cm_remplacements_date
  on public.cm_remplacements (start_date, end_date);

-- RLS : lecture + écriture réservées à l'ADMIN (outil d'administration).
alter table public.cm_remplacements enable row level security;

drop policy if exists "cm lisibles par admin" on public.cm_remplacements;
create policy "cm lisibles par admin"
  on public.cm_remplacements for select
  to authenticated
  using (public.is_admin());

drop policy if exists "cm modifiables par admin" on public.cm_remplacements;
create policy "cm modifiables par admin"
  on public.cm_remplacements for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
