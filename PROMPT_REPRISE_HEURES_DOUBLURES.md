# Prompt de reprise — équilibre mensuel v2 / doublures / miroir Sheet

> À coller au début d'une nouvelle session. Contexte destiné à un assistant qui reprend le projet à froid. Sois explicite, prudent, et n'engage aucun gros chantier sans me demander.

## Qui je suis / comment je travaille
- Je suis **médecin** aux soins intensifs, **pas développeur**. Explique simplement, pas de jargon inutile.
- Langue : **français**. Réponses **concises**.
- Je commite via **GitHub Desktop** (PAS de PowerShell, PAS de ligne de commande git chez moi).
- **Je n'utilise PAS node en local.** Pour tester/mesurer : la page **`mesure.html`** du site déployé (simulation navigateur, équipe factice), ou l'assistant exécute le moteur déployé via le navigateur (Chrome MCP + javascript_tool sur https://charlesdehout.github.io/horaires-soins-intensifs/).

## Le projet
- App de **planning de gardes USI**. Front statique + **Supabase**, hébergée sur **GitHub Pages** (repo `horaires-soins-intensifs`, dossier connecté).
- Moteur **« couplé, week-ends d'abord »** : `planning.js` (base) + `planning-couple.js` (couplé). Réglages dans **`regles.js`** (`EQUITE`, `GARDES`, `OFFCLINIC`…). Règles métier : `REGLES_PLANNING_USI.docx`.
- `test-couple.js` existe (suite node, cible 14/14) mais je ne le lance pas. **La validation passe par `mesure.html`.** (Nettoyage 2026-07-03 : `test_planning.js` et `mesure-doublures.js`, harnais node redondants, ont été supprimés.)
- ⚠️ GitHub Pages : si un déploiement échoue avec « Deployment failed, try again later », c'est GitHub, pas le code → relancer via « Re-run all jobs ». L'avertissement Node.js 20/24 dans le workflow « pages build and deployment » est sans importance (workflow géré par GitHub).

## État du moteur (2026-07-03) — TOUT COMMITTÉ ET VALIDÉ
Philosophie : « tout le monde travaille le moins possible », doublure = exception, respect ABSOLU du ratio ETP (un 0,5 fait au moins la moitié d'un plein temps).

1. **Équilibre mensuel v2 — `plEchangerJoursEntreMois`** (planning-couple.js, appelée après `plEquilibrerHeuresMois`) : ÉCHANGE apparié de journées de station entre mois (A donne un jour du mois M à B, B rend un jour d'un autre mois) → les mois se resserrent SANS toucher aux heures trimestre de chacun. Mesuré (équipe factice, T3-2026) : écart mensuel ~54/58/45 h → ~30 h en intégré, trimestre ~13,5 h intact. Mêmes garde-fous que le transfert simple (receveur libre, continuité stricte puis relâchée, plafond mi-temps, jamais gardes/WE/épinglés/doublures).
   - Piste d'amélioration connue (non faite) : appeler les échanges aussi APRÈS `plDoubluresCiblees` + « allègement des surchargés » — en prototype ça donnait ~15 h/mois. À proposer si je veux resserrer encore.
2. **`EQUITE.derive_trimestre_h: 12`** (regles.js) : plafond de dérive trimestre du lissage par transfert. Avec la v2, inutile de monter au-dessus de 12.
3. **`EQUITE.doublure_deficit_journees: 0`** : PASS 2 (doublures de « rattrapage » des pleins temps) DÉSACTIVÉE — elle comparait les heures brutes à la médiane, donc un retour de congé recevait des doublures futiles. La PASS 1 (plancher ETP des mi-temps, par mois) reste active, ainsi que le doublage des nouveaux engagés. Remettre 1 (ou 2-3) pour réactiver.
4. Toujours en place (session du 2026-06-30) : plancher 40 h/sem supprimé comme moteur de doublures ; `promotion_24h_deficit_h: 0` et `promotion_24h_souscharge: false` (pas de 24 h de remplissage) ; alerte continuité > 3 têtes/unité/semaine.

## Miroir Google Sheets (M27) — fait
`construireSemainesSheet` (app.js) reproduit le gabarit EXACT de l'export Excel mois/trimestre : ligne titre, mêmes lignes dans le même ordre, « Fermé » (Labo WE/fériés + fermetures admin), congrès dans l'en-tête, congés shifts + préférences, « Non planifiés (repos) » en dernier. Ajouts conservés (absents de l'Excel, pour ne rien perdre) : lignes PG (« Tour PG (WE) », « Garde PG (24h) ») et « Congé férié (récup) ». Rien à changer côté Apps Script.

## Outils de diagnostic
- **`mesure.html`** (déployée) : simulation navigateur avec équipe factice (6 rés. + 8 A/S + 1 rés. 0,5) — doublures et motifs (PASS 1/2), écarts mois/trimestre, % du mi-temps, 24 h de semaine, contrôles de couverture. Choix année/trimestre.
- Les doublures sont marquées `s.doublure = true` ; motif déductible du fte (fte < 1 → PASS 1).

## UI / ergonomie — quick wins CODÉS (session 2026-07-03, à valider après push)
Les 6 quick wins approuvés lors de l'audit du 2026-07-03 sont implémentés :
1. ✅ Badge « demandes en attente » sur l'onglet Congés et demandes (`tab-badge-demandes`, mis à jour par `chargerDemandes`, chargé dès la connexion admin).
2. ✅ Onglet « Congrès, fermetures & export » scindé en sous-onglets (Congrès & fermetures · Fériés · Miroir Google Sheets) — `prBasculer` dans app.js.
3. ✅ Onglet Doublures : analyse lancée automatiquement à l'ouverture (`basculerOnglet` → `dbAnalyser`).
4. ✅ Boutons de génération : « ⏳ En cours… » + les 3 boutons désactivés pendant une génération (`brancherBoutonGeneration`).
5. ✅ Légende du calendrier repliable (`<details id="legend-details">`, état mémorisé).
6. ✅ Mémorisation localStorage : dernière vue (`usi_vue`), onglet actif (`usi_onglet`), légende (`usi_legende`).

## À FAIRE — plus gros chantiers UI (à re-valider avant de lancer)
Formulaire Médecins en sections repliables ; compteurs/conflits repliables dans l'onglet Planning ; passage mobile.

## Historique utile (sessions précédentes)
- Congrès (équipe minimale, ≤2 stations vides, 0 doublure) + compteur congrès séparé.
- Congé maladie : assistant manuel (onglet dédié) — migration `sql/module34_cm_remplacements.sql` à lancer dans Supabase si pas fait.
- Onglet **Doublures** (repositionnement manuel, classement par charge, impact heures live).
- Onboarding sans e-mail — Edge Function `inviter-medecin/index.ts` à REDÉPLOYER dans Supabase si pas fait (copier-coller, pas de CLI).
- E-mail Hotmail KO (DKIM `hubruxelles.be` non authentifié dans Brevo) — je n'achèterai pas de domaine.

## Règles de conduite pour l'assistant
- **N'engage pas de gros chantier sans me demander.** Propose un plan simple, puis attends mon feu vert.
- Après une modif moteur, **valide via le navigateur** (moteur déployé + harnais JS, ou `mesure.html` après mon push) et préviens-moi si le comportement mesuré change.
- Le sandbox Linux de l'assistant peut être indisponible : le navigateur (Chrome MCP) est le plan B fiable pour exécuter/mesurer le moteur.
