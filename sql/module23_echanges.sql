-- =====================================================================
-- Module 23 — Échange de shifts entre médecins (workflow propose → accepte)
-- ---------------------------------------------------------------------
-- Un médecin propose d'échanger UN de ses shifts (publié) contre le shift d'un
-- collègue ; le collègue accepte ou refuse. À l'acceptation, l'application
-- valide l'échange (garde↔garde / journée↔journée, règles A/S-résident, repos de
-- garde) via planning.js `validerEchange`, puis applique les changements.
-- Cette table ne stocke que les PROPOSITIONS (les shifts restent dans `shifts`).
-- Idempotent. À lancer dans le SQL Editor Supabase.
-- =====================================================================

create table if not exists public.shift_swaps (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  from_doctor_id text not null,   -- proposant
  from_shift_id  text not null,   -- shift offert (au proposant)
  to_doctor_id   text not null,   -- cible
  to_shift_id    text not null,   -- shift demandé (à la cible)
  note           text,
  status         text not null default 'en_attente'
                   check (status in ('en_attente', 'accepte', 'refuse', 'annule')),
  decided_at     timestamptz
);

create index if not exists idx_shift_swaps_to   on public.shift_swaps (to_doctor_id, status);
create index if not exists idx_shift_swaps_from on public.shift_swaps (from_doctor_id, status);

-- RLS : lecture/écriture par tout utilisateur connecté (le contrôle fin
-- proposant/cible est fait côté application). L'admin a déjà accès global.
-- NB : pour durcir (limiter à proposant/cible/admin), il faudra un helper
-- `current_doctor_id()` mappant auth.uid() → doctors.id (à ajouter si besoin).
alter table public.shift_swaps enable row level security;
drop policy if exists "swaps lisibles connectes" on public.shift_swaps;
create policy "swaps lisibles connectes"
  on public.shift_swaps for select to authenticated using (true);
drop policy if exists "swaps ecriture connectes" on public.shift_swaps;
create policy "swaps ecriture connectes"
  on public.shift_swaps for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
