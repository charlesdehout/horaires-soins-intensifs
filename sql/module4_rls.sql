-- =====================================================================
-- Module 4 — RLS pour l'affichage du planning
-- À lancer dans Supabase → SQL Editor.
-- Idempotent : peut être relancé sans risque.
-- Pré-requis : la fonction is_admin() existe déjà (créée au Module 2).
-- =====================================================================

-- Active la sécurité au niveau ligne sur les tables du planning.
alter table public.shifts    enable row level security;
alter table public.schedules enable row level security;

-- --- LECTURE : ouverte à tous les utilisateurs connectés ---
-- (tout le monde peut voir le planning d'équipe)
drop policy if exists "shifts lisibles par les connectes" on public.shifts;
create policy "shifts lisibles par les connectes"
  on public.shifts for select
  to authenticated
  using (true);

drop policy if exists "schedules lisibles par les connectes" on public.schedules;
create policy "schedules lisibles par les connectes"
  on public.schedules for select
  to authenticated
  using (true);

-- --- ÉCRITURE : réservée à l'admin (pour les Modules 5/6) ---
drop policy if exists "shifts modifiables par admin" on public.shifts;
create policy "shifts modifiables par admin"
  on public.shifts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "schedules modifiables par admin" on public.schedules;
create policy "schedules modifiables par admin"
  on public.schedules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
