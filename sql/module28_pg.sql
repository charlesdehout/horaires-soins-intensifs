-- =====================================================================
-- Module 28 — Rôle PG (postgraduate) : PG ULB + Fellows
-- ---------------------------------------------------------------------
-- Nouveau grade 'pg' (en plus de resident / assistant_specialiste) avec
-- deux sous-types : 'ulb' (standard, congé limité) et 'fellow' (suit le
-- régime PG AVEC opting out, congé moins limité).
-- opting_out : plafond hebdo 60 h (sinon 48 h). Les Fellows sont toujours
-- en opting out.
-- Idempotent : ré-exécutable sans risque.
-- =====================================================================

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS pg_type    text;     -- 'ulb' | 'fellow' | NULL (non-PG)
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS opting_out boolean DEFAULT false;

-- Autoriser le grade 'pg' (si une contrainte CHECK limite les valeurs).
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_grade_check;
ALTER TABLE doctors ADD  CONSTRAINT doctors_grade_check
  CHECK (grade IN ('resident', 'assistant_specialiste', 'pg'));

-- Garde-fou de cohérence du sous-type (optionnel).
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_pg_type_check;
ALTER TABLE doctors ADD  CONSTRAINT doctors_pg_type_check
  CHECK (pg_type IS NULL OR pg_type IN ('ulb', 'fellow'));

-- Nouveaux types de shift PG : pg_jour (8,5 h), pg_twe (6 h), garde_pg (24 h).
-- La table shifts a une contrainte CHECK sur shift_type (étendue au fil des
-- modules). Pour éviter de devoir relister TOUTES les valeurs existantes (et
-- risquer d'en oublier une), on retire la contrainte : les types sont validés
-- côté application (planning.js / app.js). Ré-exécutable sans risque.
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_type_check;
