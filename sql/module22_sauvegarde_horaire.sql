-- =====================================================================
-- Module 22 — Sauvegarde / restauration de l'horaire
-- ---------------------------------------------------------------------
-- Permet à l'admin de supprimer tout un trimestre en un clic SANS perdre
-- le dernier planning PUBLIÉ : à chaque publication d'un mois, un snapshot
-- des shifts de ce mois est conservé ici. La restauration réinjecte ce
-- snapshot (en BROUILLON, modifiable). Une sauvegarde « avant_suppression »
-- est aussi prise juste avant une suppression de trimestre (filet de sécurité).
--
-- Idempotent. À lancer dans le SQL Editor Supabase.
-- Pré-requis : la fonction public.is_admin() existe (Module 2).
-- =====================================================================

create table if not exists public.schedule_backups (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type       text not null check (type in ('publication', 'avant_suppression')),
  annee      integer not null,
  mois       integer not null,
  payload    jsonb not null          -- tableau JSON des shifts du mois
);

create index if not exists idx_schedule_backups_mois
  on public.schedule_backups (annee, mois, created_at desc);

-- RLS : lecture/écriture réservées à l'admin (gestion de l'horaire).
alter table public.schedule_backups enable row level security;
drop policy if exists "backups gérés par admin" on public.schedule_backups;
create policy "backups gérés par admin"
  on public.schedule_backups for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Recharge le cache de schéma de l'API.
notify pgrst, 'reload schema';
