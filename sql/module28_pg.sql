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
