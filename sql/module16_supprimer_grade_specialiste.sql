-- =====================================================================
-- Module 16 — Suppression du grade « Spécialiste » (révision Dr Calabro)
-- À lancer dans le SQL Editor de Supabase.
-- Idempotent : ré-exécutable sans erreur.
--
-- La spec ne connaît que deux grades : Résident et Assistant Spécialiste.
-- Les médecins « specialiste » existants sont basculés en A/S et seront
-- donc soumis à la règle dure « jamais 2 A/S ensemble en garde ».
-- =====================================================================

-- 1) Migration des données : tout 'specialiste' devient 'assistant_specialiste'.
update public.doctors
  set grade = 'assistant_specialiste'
  where grade = 'specialiste';

-- 2) Valeur par défaut alignée sur l'UI (plus de défaut 'specialiste').
alter table public.doctors
  alter column grade set default 'assistant_specialiste';

-- 3) Contrainte CHECK : la colonne grade n'accepte plus que les deux grades
--    de la spec. On retire l'éventuelle ancienne contrainte puis on la pose.
--    (À ce stade plus aucune ligne 'specialiste' n'existe → validation OK.)
alter table public.doctors drop constraint if exists doctors_grade_check;
alter table public.doctors
  add constraint doctors_grade_check
  check (grade in ('resident', 'assistant_specialiste'));
