-- =====================================================================
-- Module 32 — Gardes PG stockées comme PRÉFÉRENCES (auto-déclarées)
-- ---------------------------------------------------------------------
-- Les gardes PG ne sont plus des `shifts` (réservés à l'admin, liés à un
-- planning) mais des PRÉFÉRENCES que le PG a le droit d'écrire lui-même,
-- AVANT la génération du planning. La génération PG les lit comme entrée
-- (blocage du jour + lendemain) et matérialise ensuite les shifts.
-- Idempotent : ré-exécutable sans risque.
-- =====================================================================

-- 1) Autoriser le type 'garde_pg' dans preferences.pref_type.
--    On RETIRE la contrainte CHECK (comme module28 pour shifts) : les types
--    sont validés côté application. Évite d'avoir à relister tous les types.
alter table public.preferences drop constraint if exists preferences_pref_type_check;

-- 2) Trigger de durcissement : EXEMPTER 'garde_pg' de l'anti-auto-approbation.
--    Une garde PG est une auto-déclaration (pas une demande à valider) → le PG
--    peut l'insérer directement en 'approuve'. Le reste du trigger (quota congés)
--    est inchangé (garde_pg n'est pas une catégorie de congé → non concerné).
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
  -- (A) ANTI-AUTO-APPROBATION — non-admins, SAUF garde_pg (auto-déclaration).
  if not v_admin and NEW.pref_type <> 'garde_pg' then
    if TG_OP = 'INSERT' then
      if coalesce(NEW.status, 'en_attente') is distinct from 'en_attente' then
        raise exception
          'Vous ne pouvez pas créer une demande déjà validée (statut imposé : « en_attente »). Seul un administrateur peut approuver ou refuser.';
      end if;
    elsif TG_OP = 'UPDATE' then
      if NEW.status is distinct from OLD.status then
        raise exception
          'Seul un administrateur peut changer le statut d''une demande (approuver / refuser).';
      end if;
    end if;
  end if;

  -- (B) QUOTA DE CONGÉS À LA SOUMISSION — non-admins seulement.
  v_cat := case NEW.pref_type
             when 'conge'              then 'conge_annuel'
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

    for y in
      select distinct public.f_annee_academique(g::date)
      from generate_series(NEW.start_date, NEW.end_date, interval '1 day') g
    loop
      v_demande := public.f_jours_ouvres_acad(NEW.start_date, NEW.end_date, y);
      continue when v_demande = 0;

      v_frac  := public.f_fraction_contrat(y, v_doc.contract_start, v_doc.contract_end);
      v_quota := round(v_base * v_frac);

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
