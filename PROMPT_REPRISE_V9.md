# Prompt de reprise — Application Planning Soins Intensifs (v9)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Reprise après le très gros lot « équilibre &
> règles réelles » : refonte du repos de garde (couplage jeudi+samedi /
> vendredi+dimanche), équité horaire avec crédit des congés, combos de week-end
> maximisés (~79 %), vendredi soir = week-end entamé, statut « nouvel engagé »,
> plancher 40 h/sem + compensation par 24 h de semaine, rééquilibrage final des
> heures (écart ≤ 12 h), échanges de shifts complets (UI + aperçu des
> conséquences), indépendants prioritaires sur leurs jours déclarés, médecins
> « reconnus » + export dédié, compteurs Mois/Trimestre, demandes validées
> révocables et compteurs de congés admin.

---

Tu m'aides à construire une application web de planning pour une unité de soins
intensifs. Je suis médecin intensiviste, non-développeur. Tu codes, je déploie
via **GitHub Desktop** (commit + push) sur **GitHub Pages**. On procède par
modules ; chaque module doit fonctionner et être testable avant le suivant.

## Avant de commencer
Lis : `REGLES_APPLICATION.md` (LA référence des règles, à jour), `regles.js`,
`planning.js`, `app.js`, `index.html`, `sql/`. `FEUILLE_DE_ROUTE.md` et
`CONFORMITE.md` sont PÉRIMÉS (antérieurs à la v9) — à rafraîchir à l'occasion.
**Ne réécris pas ce qui existe, étends-le.**

## ⚠️ À VÉRIFIER EN PREMIER
`git pull` puis **`node test_planning.js`** : **79/79 tests au vert** attendus.
Le message de génération affiche la version de l'algo (`PL_VERSION`,
actuellement `v2026.06.13-1`) et le nombre de doublures — si la version
n'apparaît pas dans l'app déployée, c'est un problème de cache GitHub Pages
(attendre le déploiement, Ctrl+F5). Les compteurs lisent la BASE : toute
modification d'algo exige une **régénération du trimestre** pour être visible.

## Architecture
- Frontend HTML/CSS/JS **vanilla** : `index.html`, `app.js`, `style.css`,
  `regles.js`, `planning.js`. UI par **onglets**. Palette sarcelle.
- Backend **Supabase** (Auth + PostgreSQL, tier gratuit). Calendrier
  **FullCalendar v6** (Mois + Liste). Export **ExcelJS**. Auth email (invitation
  admin via Edge Function `inviter-medecin`, SMTP Brevo).
- Algorithme : JavaScript pur (`planning.js`), fonction pure testable sous Node.
- Commentaires en français.

## Connexion Supabase (déjà dans app.js)
- Project URL : `https://rmkpuzmqwghzdtsuqgpq.supabase.co` · anon key dans `app.js`.

## SQL à exécuter (Supabase, dans l'ordre — tous idempotents)
`module2_quota_conges` → `module23_echanges` (cf. v8), plus :
**`module24_nouvel_engage`** (colonne `doctors.nouvel_engage`),
**`module25_reconnu`** (colonne `doctors.reconnu`).

## Règles clés AJOUTÉES/RÉVISÉES depuis la v8 (détail : REGLES_APPLICATION.md)
- **Repos de garde** : lendemain de toute garde UNIQUEMENT ; le jour de la
  semaine suivante n'est dû que pour des gardes COUPLÉES (jeudi+samedi → lundi ;
  vendredi+dimanche → mardi). Le moteur d'échange recalcule ces repos
  (transfert / création / suppression).
- **Équité horaire** : crédit d'équité des congés (`heuresEquite`, jamais dans
  les stats) → un retour de congé n'est plus surchargé. Validation trimestrielle
  alignée.
- **Combos maximisés** (~79 %) : couplage sans borne d'heures par défaut
  (`EQUITE.couplage_tolerance_h`), favoris exemptés du plafond 60 h souple,
  biais week-end sur les gardes de jeudi/vendredi, rééquilibrage final des
  gardes (`plReequilibrerGardes`, lun→ven, jamais au détriment des combos).
- **Vendredi soir = week-end entamé** (clé samedi) : compte dans l'équité ET le
  plafond DUR 2 WE/mois ; coût MARGINAL nul le dimanche pour qui a fait le
  vendredi → vendredi+dimanche = 1 seul week-end. Compteurs/validateur alignés
  (week-ends DISTINCTS).
- **Nouvel engagé** (case fiche médecin) : 14 premiers jours de contrat en
  doublure quotidienne d'une unité (libre), jamais de garde/WE/TWE ; génération
  du trimestre BLOQUÉE si le statut est périmé (à retirer par l'admin).
- **Plancher 40 h/sem** (`EQUITE.minimum_hebdo_h`) : cible = 40 × fte × (jours
  dispo / jours ouvrés travaillables DU MÉDECIN) — les repos de garde ne sont
  pas travaillables. Complété par DOUBLURES d'unités (jamais Labo, max 2 par
  unité, jamais sur une unité tenue par une 24 h — sauf nouvel engagé).
- **Compensation 24 h** (`GARDES.promotion_24h_deficit_h`) : un médecin sous son
  minimum cumulé prend sa garde de SEMAINE en 24 h (station + nuit) — l'excédent
  d'heures des autres récupère le jour libéré.
- **Rééquilibrage final des heures** (`plReequilibrerHeures`,
  `EQUITE.ecart_heures_max` = 12 h) : transfert de journées de station des plus
  chargés vers les moins chargés (receveur libre, continuité préservée, congrès
  exclus). Écart trimestriel mesuré ≈ 10 h à pleine dispo.
- **Échanges (M23) COMPLETS** : onglet médecin (proposer/accepter/refuser/
  annuler, badge), aperçu en direct des conséquences (refus motivés : 2 A/S,
  même jour, veille de garde, lendemain travaillé) + confirmation détaillée.
- **Indépendant** : demande « ✅ Disponible » (type `dispo`, en tête de sa
  liste) = contrainte dure + PRIORITÉ à l'horaire sur ces jours.
- **Reconnu** (case fiche) + export « Excel — Horaires reconnus » : colonnes
  BLEUES pour les jours sans médecin reconnu de garde. Onglets Excel hebdo
  nommés par le premier jour de semaine (JJ-MM-AAAA), plus de lignes vides
  entre les postes.
- **Compteurs** : bascule Mois/Trimestre ; colonnes Moy. h/sem (effective,
  congés déduits), Repos g., Non plan. (jours non travaillables exclus) ;
  colonne « Repos » supprimée.
- **Congés** : pastilles nominatives au calendrier pour les congés APPROUVÉS ;
  onglet Demandes admin en 3 sections (à valider / validées révocables /
  compteurs de congés par médecin, année académique, quotas proratisés).
- **Unités** : jamais 2 personnes au Labo de choc ; max 2 par unité
  (titulaire + 1 doublure) ; contrôlé par le validateur.

## Reste à faire (priorité)
1. **🎯 Fériés (lot 2)** : demande unique « travailler un férié » → l'algo
   PLACE le médecin sur ce férié + ouvre un « congé férié » à poser sous 6 sem.
   Supprimer `recup_ferie`. **Fériés éditables par l'admin** (table + UI,
   agissant comme week-end).
2. **Miroir Google Sheets** (validé sur le principe) : push lecture seule via
   Apps Script Web App à chaque publication / échange accepté / modif admin /
   restauration + bouton « Resynchroniser ». Questions ouvertes : mise en page
   (= export Excel ?) et URL unique configurée par l'admin.
3. Décisions en suspens : plafond d'offs par trimestre (« on verra plus
   tard ») ; auto-approbation des « dispo » des indépendants ; historique
   complet des demandes passées.
4. Rafraîchir `FEUILLE_DE_ROUTE.md` et `CONFORMITE.md` (périmés).

## Style d'interaction attendu
- Pose des questions de clarification avant de coder si une règle est ambiguë.
- Donne le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Ajoute des tests dans `test_planning.js` pour chaque règle d'algo, et donne
  les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.

**Commence par lire `REGLES_APPLICATION.md`, fais tourner `node
test_planning.js` (79 attendus), puis attaque le 🎯 lot Fériés — en me posant
les questions de cadrage avant de coder.**
