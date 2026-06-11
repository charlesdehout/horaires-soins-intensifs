-- =====================================================================
-- Module 21 — Durcissement / sécurité serveur (préférences)
-- ---------------------------------------------------------------------
-- Deux garde-fous CÔTÉ SERVEUR sur la table public.preferences, en plus
-- des contrôles déjà faits dans app.js :
--   (A) ANTI-AUTO-APPROBATION : un travailleur (non-admin) ne peut PAS
--       créer une demande déjà « approuve »/« refuse », ni changer le
--       statut de ses propres demandes. Seul un admin valide (is_admin()).
--   (B) QUOTA DE CONGÉS À LA SOUMISSION : un travailleur ne peut pas
--       soumettre une demande de congé (annuel / extra-légal / scientifique)
--       qui, ajoutée à ses demandes EN_ATTENTE + APPROUVÉES de la même
--       catégorie, dépasse son quota de l'ANNÉE ACADÉMIQUE (1 oct → 30 sep).
--       L'ADMIN PEUT FORCER (régularisation, congé exceptionnel) : le
--       contrôle de quota ne s'applique qu'aux non-admins.
--
-- La logique reproduit EXACTEMENT celle d'app.js :
--   • jours OUVRÉS = lun–ven hors fériés BELGES (Pâques calculée),
--   • année ACADÉMIQUE = oct/nov/déc → année en cours ; jan→sep → précédente,
--   • PRORATION au contrat (fractionAnneeSousContrat) : quota plein si pas
--     de dates de contrat ou aucun chevauchement, sinon proportion couverte.
--
-- Idempotent : ré-exécutable sans erreur (create or replace + drop trigger).
-- À lancer dans le SQL Editor de Supabase APRÈS module10_workflow.sql et
-- module18_recup_ferie.sql. Pré-requis : la fonction public.is_admin() existe
-- déjà (créée au Module 2, utilisée par les RLS des modules 4 et 17).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fonctions utilitaires (calendrier belge) — miroir de regles.js
-- ---------------------------------------------------------------------

-- Dimanche de Pâques (grégorien, algorithme de Meeus/Butcher).
create or replace function public.f_paques(annee integer)
returns date
language plpgsql
immutable
as $$
declare
  a int := annee % 19;
  b int := annee / 100;
  c int := annee % 100;
  d int := b / 4;
  e int := b % 4;
  f int := (b + 8) / 25;
  g int := (b - f + 1) / 3;
  h int := (19 * a + b - d - g + 15) % 30;
  i int := c / 4;
  k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7;
  m int := (a + 11 * h + 22 * l) / 451;
  mois int := (h + l - 7 * m + 114) / 31;          -- 3 = mars, 4 = avril
  jour int := ((h + l - 7 * m + 114) % 31) + 1;
begin
  return make_date(annee, mois, jour);
end;
$$;

-- Vrai si la date est un jour férié légal belge.
create or replace function public.f_est_ferie_be(d date)
returns boolean
language plpgsql
immutable
as $$
declare
  an int := extract(year from d)::int;
  p  date := public.f_paques(an);
begin
  return d in (
    make_date(an, 1, 1),       -- Nouvel An
    p + 1,                     -- Lundi de Pâques
    make_date(an, 5, 1),       -- Fête du travail
    p + 39,                    -- Ascension
    p + 50,                    -- Lundi de Pentecôte
    make_date(an, 7, 21),      -- Fête nationale
    make_date(an, 8, 15),      -- Assomption
    make_date(an, 11, 1),      -- Toussaint
    make_date(an, 11, 11),     -- Armistice
    make_date(an, 12, 25)      -- Noël
  );
end;
$$;

-- Vrai si la date est un jour OUVRÉ (lun–ven, hors férié belge).
create or replace function public.f_est_jour_ouvre(d date)
returns boolean
language sql
immutable
as $$
  select extract(dow from d) not in (0, 6) and not public.f_est_ferie_be(d);
$$;

-- Année ACADÉMIQUE d'une date (identifiée par son année de DÉBUT) :
--   oct/nov/déc → année en cours ; jan→sep → année précédente.
create or replace function public.f_annee_academique(d date)
returns integer
language sql
immutable
as $$
  select case when extract(month from d) >= 10
              then extract(year from d)::int
              else extract(year from d)::int - 1
         end;
$$;

-- Jours OUVRÉS d'une plage [debut, fin] tombant dans l'année académique donnée.
create or replace function public.f_jours_ouvres_acad(debut date, fin date, annee_acad integer)
returns integer
language sql
immutable
as $$
  select coalesce(count(*), 0)::int
  from generate_series(debut, fin, interval '1 day') g
  where public.f_annee_academique(g::date) = annee_acad
    and public.f_est_jour_ouvre(g::date);
$$;

-- Fraction de l'année académique (1 oct → 30 sep) couverte par le contrat (0..1).
-- Politique (révision Calabro) : quota PLEIN (fraction 1) s'il n'y a pas de
-- dates de contrat OU si le contrat ne chevauche pas du tout l'année ;
-- proratisé seulement en couverture PARTIELLE. (Miroir de fractionAnneeSousContrat.)
create or replace function public.f_fraction_contrat(annee_acad integer, c_start date, c_end date)
returns numeric
language plpgsql
immutable
as $$
declare
  debut_annee date := make_date(annee_acad, 10, 1);
  fin_annee   date := make_date(annee_acad + 1, 9, 30);
  d date;
  f date;
begin
  if c_start is null and c_end is null then
    return 1;
  end if;
  d := greatest(coalesce(c_start, debut_annee), debut_annee);
  f := least(coalesce(c_end, fin_annee), fin_annee);
  if f < d then
    return 1;   -- aucun chevauchement → quota plein (et non 0)
  end if;
  return ((f - d) + 1)::numeric / ((fin_annee - debut_annee) + 1)::numeric;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Trigger BEFORE INSERT/UPDATE sur preferences
-- ---------------------------------------------------------------------
create or replace function public.tg_preferences_durcissement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   boolean := public.is_admin();
  v_cat     text;
  v_doc     public.doctors%rowtype;
  v_base    numeric;
  v_quota   numeric;
  v_frac    numeric;
  v_demande int;
  v_deja    int;
  y         int;
begin
  -- (A) ANTI-AUTO-APPROBATION — uniquement pour les non-admins.
  if not v_admin then
    if TG_OP = 'INSERT' then
      -- Une demande créée par un travailleur DOIT être en_attente.
      if coalesce(NEW.status, 'en_attente') is distinct from 'en_attente' then
        raise exception
          'Vous ne pouvez pas créer une demande déjà validée (statut imposé : « en_attente »). Seul un administrateur peut approuver ou refuser.';
      end if;
    elsif TG_OP = 'UPDATE' then
      -- Un travailleur ne peut pas changer le statut de sa demande.
      if NEW.status is distinct from OLD.status then
        raise exception
          'Seul un administrateur peut changer le statut d''une demande (approuver / refuser).';
      end if;
    end if;
  end if;

  -- (B) QUOTA DE CONGÉS À LA SOUMISSION — non-admins seulement (l'admin force).
  v_cat := case NEW.pref_type
             when 'conge'              then 'conge_annuel'   -- type historique
             when 'conge_annuel'       then 'conge_annuel'
             when 'conge_extralegal'   then 'conge_extralegal'
             when 'conge_scientifique' then 'conge_scientifique'
             else null
           end;

  if (not v_admin)
     and v_cat is not null
     and NEW.start_date is not null
     and NEW.end_date is not null then

    select * into v_doc from public.doctors where id = NEW.doctor_id;

    v_base := case v_cat
                when 'conge_annuel'       then coalesce(v_doc.quota_conge_annuel, 24)
                when 'conge_extralegal'   then coalesce(v_doc.quota_conge_extralegal, 5)
                when 'conge_scientifique' then coalesce(v_doc.quota_conge_scientifique, 12)
              end;

    -- Pour CHAQUE année académique touchée par la demande, on contrôle le total.
    for y in
      select distinct public.f_annee_academique(g::date)
      from generate_series(NEW.start_date, NEW.end_date, interval '1 day') g
    loop
      v_demande := public.f_jours_ouvres_acad(NEW.start_date, NEW.end_date, y);
      continue when v_demande = 0;   -- aucun jour ouvré de cette demande dans l'année y

      v_frac  := public.f_fraction_contrat(y, v_doc.contract_start, v_doc.contract_end);
      v_quota := round(v_base * v_frac);

      -- Jours ouvrés DÉJÀ encodés (en_attente + approuve), même catégorie,
      -- même médecin, hors la ligne en cours de mise à jour.
      select coalesce(sum(public.f_jours_ouvres_acad(p.start_date, p.end_date, y)), 0)
        into v_deja
        from public.preferences p
       where p.doctor_id = NEW.doctor_id
         and p.status in ('en_attente', 'approuve')
         and (case p.pref_type when 'conge' then 'conge_annuel' else p.pref_type end) = v_cat
         and (TG_OP <> 'UPDATE' or p.id is distinct from NEW.id);

      if v_deja + v_demande > v_quota then
        raise exception
          'Quota de % dépassé pour l''année académique %–% : % jours ouvrés au total demandés pour un maximum de % (proratisé au contrat). Adressez-vous à l''administrateur.',
          v_cat, y, y + 1, v_deja + v_demande, v_quota;
      end if;
    end loop;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_preferences_durcissement on public.preferences;
create trigger trg_preferences_durcissement
  before insert or update on public.preferences
  for each row execute function public.tg_preferences_durcissement();

-- Recharge le cache de schéma de l'API PostgREST.
notify pgrst, 'reload schema';

-- =====================================================================
-- INSTRUCTIONS DE TEST (à exécuter en tant que travailleur, PAS admin)
-- ---------------------------------------------------------------------
-- 1) Auto-approbation refusée :
--      insert into preferences (doctor_id, start_date, end_date, pref_type, status)
--      values ('<mon-id>', '2026-02-02', '2026-02-02', 'conge_annuel', 'approuve');
--    → ERREUR « statut imposé : en_attente ».
--
-- 2) Changement de statut refusé (sur une demande en_attente existante) :
--      update preferences set status = 'approuve' where id = '<ma-demande>';
--    → ERREUR « Seul un administrateur peut changer le statut ».
--
-- 3) Dépassement de quota refusé : poser des congés annuels totalisant > quota
--    (24 j ouvrés par défaut) sur la même année académique (1 oct → 30 sep)
--    → ERREUR « Quota de conge_annuel dépassé … ».
--
-- 4) L'admin n'est pas bloqué : connecté en admin, les opérations 1–3 passent
--    (validation et régularisation possibles).
-- =====================================================================
