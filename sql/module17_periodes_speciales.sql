-- =====================================================================
-- Module 17 — Congrès (ISICEM / ISICARE…) & fermetures d'unités — spec §1.3, §1.4, §3.2
-- À lancer dans le SQL Editor de Supabase. Idempotent.
-- Pré-requis : la fonction is_admin() existe déjà (créée au Module 2).
-- =====================================================================

-- 1) Table des périodes spéciales saisies par l'ADMIN :
--    - type 'congres'    : congrès (3-4 jours). En semaine, la couverture de
--      jour est ASSOUPLIE (jusqu'à 2 stations vides tolérées). 'unite' = NULL.
--    - type 'fermeture'  : fermeture temporaire d'une unité (été / Noël).
--      'unite' = code de la station (usi1…usi5, bordet, labo_choc) : ce poste
--      n'est NI pourvu NI exigé pendant la période. Plusieurs fermetures
--      peuvent se chevaucher (une ligne par unité).
create table if not exists public.special_periods (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('congres', 'fermeture')),
  label       text not null,            -- ex. 'ISICEM 2027', 'Fermeture USI 4 — Noël'
  unite       text,                     -- code station (requis si fermeture)
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  constraint special_periods_dates check (end_date >= start_date),
  constraint special_periods_unite check (type <> 'fermeture' or unite is not null)
);

-- 2) Index pour les requêtes par chevauchement de période.
create index if not exists idx_special_periods_dates
  on public.special_periods (start_date, end_date);

-- 3) RLS : LECTURE pour tous les connectés (les périodes sont affichées au
--    calendrier de tous), ÉCRITURE réservée à l'admin (saisie uniquement par
--    l'administrateur — demande explicite).
alter table public.special_periods enable row level security;

drop policy if exists "periodes lisibles par les connectes" on public.special_periods;
create policy "periodes lisibles par les connectes"
  on public.special_periods for select
  to authenticated
  using (true);

drop policy if exists "periodes modifiables par admin" on public.special_periods;
create policy "periodes modifiables par admin"
  on public.special_periods for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
