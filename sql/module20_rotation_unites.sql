-- =====================================================================
-- Module 20 — Rotation trimestrielle des unités
-- ---------------------------------------------------------------------
-- Chaque médecin a une UNITÉ DE RÉFÉRENCE (station « maison ») pour le
-- trimestre. Elle sert de base à la continuité hebdomadaire à la génération
-- (planning.js : plChoisirStation / continuité). D'un trimestre à l'autre,
-- l'admin fait TOURNER les médecins (proposition automatique évitant l'unité
-- du trimestre précédent, modifiable, puis enregistrée ici).
-- Idempotent : à lancer dans le SQL Editor Supabase.
-- =====================================================================

alter table public.doctors
  add column if not exists unite_reference text;

-- (Optionnel) cohérence : la valeur doit être un code de station connu OU null.
-- On NE pose PAS de contrainte CHECK figée ici pour rester souple si la liste
-- des unités évolue ; la validation se fait côté application.
