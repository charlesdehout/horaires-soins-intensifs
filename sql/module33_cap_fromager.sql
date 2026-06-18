-- Module 33 — Statut « CAP fromager » (case à cocher sur la fiche médecin)
-- Résident à part entière (peut faire des gardes seul, compté comme résident),
-- mais avec un statut particulier :
--   • ne travaille jamais le LUNDI (cours de fromagerie) ;
--   • jamais de GARDE le dimanche (tours autorisés) ;
--   • PRIORITAIRE sur les gardes du samedi (compense le dimanche → même nb de gardes) ;
--   • PAS d'off-clinic ;
--   • sa récup de samedi est posée le LUNDI (son jour off).
-- Le moteur de planning lit ce drapeau (planning.js + planning-couple.js).

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS cap_fromager boolean NOT NULL DEFAULT false;
