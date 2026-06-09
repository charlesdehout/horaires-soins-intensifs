# Prompt de reprise — Application Planning Soins Intensifs (v3)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Le projet reprend après l'intégration du split
> « repos de garde » et du module d'équité fine M12 (a + b), avec équilibrage
> pensé sur le TRIMESTRE.

---

Tu m'aides à construire une application web de planning pour une unité de soins
intensifs. Je suis médecin intensiviste, non-développeur. Tu codes, je déploie
via **GitHub Desktop** (commit + push) sur **GitHub Pages**. On procède module
par module ; chaque module doit fonctionner et être testable avant le suivant.

## Avant de commencer
Lis les fichiers existants, en particulier :
- `CONFORMITE.md` — **analyse de conformité complète vs la spec Dr Calabro +
  feuille de route** (document le plus important pour savoir quoi faire).
- `SPECIFICATIONS.md` — règles métier.
- `regles.js` (config, dont `EQUITE`), `planning.js` (algorithme pur, testable
  sous Node), `index.html`, `app.js`, `style.css`, et le dossier `sql/`.

Ne réécris pas ce qui existe, étends-le.

## Architecture
- Frontend : HTML/CSS/JavaScript **vanilla** (pas de framework).
  Fichiers : `index.html`, `app.js`, `style.css`, `regles.js`, `planning.js`.
- Backend : **Supabase** (Auth + PostgreSQL), tier gratuit.
- Calendrier : **FullCalendar v6** (CDN). Export : **ExcelJS** (CDN).
- Algorithme de planning : JavaScript pur côté client (`planning.js`).
- Commentaires en français dans le code.

## Connexion Supabase (déjà dans app.js)
- Project URL : `https://rmkpuzmqwghzdtsuqgpq.supabase.co`
- anon key : déjà configurée dans `app.js`.

## SQL à exécuter (dans l'ordre, SQL Editor Supabase)
`module2_quota_conges.sql`, `module4_rls.sql`, `module5_planning.sql`,
`module6_planning_admin.sql`, `module6_absences.sql`,
`module9_personnel.sql`, `module10_workflow.sql`,
**`module15_repos_garde.sql`** (ajoute le shift_type `repos_garde`).
> ⚠️ Vérifie avec moi que `module15_repos_garde.sql` a bien été lancé
> (sinon l'insertion des repos de garde échouera sur la contrainte CHECK).

## Modèle de données (à jour)
- `doctors` : id, name, email, role 'admin'|'doctor', grade 'resident'|'assistant_specialiste'|'specialiste',
  fte, weekly_hours_target, quotas congés, jours_travailles int[],
  statut 'dependant'|'independant', conges_100pct bool, admin_level, contract_periods jsonb.
- `preferences` : id, doctor_id, start_date, end_date, pref_type, note, status, decided_at.
- `schedules` : year, month, status 'draft'|'published', published_at.
- `shifts` : date, shift_type, doctor_id, schedule_id, poste.
  shift_type ∈ {jour, twe, garde_nuit, garde_24h} + absences/repos
  {**repos_garde**, recup, off, conge_annuel, conge_scientifique, conge_extralegal}.

## Concepts clés à connaître
- **Deux types de repos distincts** :
  - `repos_garde` = repos **obligatoire post-garde**, matérialisé
    **automatiquement** (`materialiserRepos` + `materialiserReposCouples`),
    **affiché** au planning mais **NON comptabilisé** dans les totaux du récap.
  - `recup` = repos / récupération **posé manuellement** par l'admin,
    **comptabilisé** (colonne « Repos »).
- **L'équilibrage se pense sur le TRIMESTRE** : `genererTrimestre` partage l'état
  (gardes, week-ends, heures) sur les 3 mois ; l'équité fine (`validerEquite`)
  s'évalue sur l'ensemble du trimestre, pas au mois.

## Déjà réalisé (Modules 1 à 12)
- **M1–M7** : auth, CRUD médecins, préférences, calendrier, génération mensuelle
  puis **trimestrielle** avec équité proportionnelle à la disponibilité.
- **Règles dures (N1)** : jamais 2 A/S en garde ; **≥1 résident** par garde ;
  max 3 gardes/semaine ; binôme TWE sam=dim ; max 2 week-ends/mois ; férié en
  semaine ne compte pas comme week-end ; hors contrat non planifiable ;
  indépendants seulement sur jours déclarés ; génération bloquée si demandes en attente.
- **M9** (personnel), **M10** (workflow validation), **M11** (off-clinic auto),
  **M14** (exports Excel ExcelJS — voir bug ci-dessous).
- **Split repos_garde** (2026-06) : repos de garde distinct du repos manuel,
  non comptabilisé (SHIFT_CONFIG, exports, `compterParMedecin`).
- **M12a — équité fine N2** :
  - Gardes **sans biais de grade** : le 2e créneau (nuit semaine + week-end)
    n'est plus réservé aux A/S → choisi par déficit toutes catégories.
    **2 Résidents peuvent être ensemble** ; règles dures conservées (≥1 résident,
    jamais 2 A/S).
  - **Plafond 60 h/semaine** souple (compensable) : suivi `heuresSemaine`,
    filtrage des gardes, alerte indicative dans `validerPlanning`.
  - **Plancher horaire** : tri par charge relative + alerte « sous le plancher ».
- **M12b** :
  - **Repos compensatoire couplé** (`materialiserReposCouples`) : repos_garde
    supplémentaire jeudi soir + samedi 24h → **lundi** ; vendredi soir +
    dimanche 24h → **mardi**.
  - **±1 garde** souple + alerte (`validerEquite`, proportionnel au fte).
  - **Équité évaluée sur le trimestre** : `validerEquite(shifts, medecins)`
    appelée par l'app après `genererTrimestre` (plancher + ±1 garde). Le plancher
    a été retiré de `validerPlanning` (mensuel).
- Paramètres ajustables dans `regles.js` → **`EQUITE`** = { plafond_hebdo: 60, plancher_ratio: 0.85 }.

## Reste à faire (par priorité)
1. **🐞 BUG EXPORT EXCEL « tout écrasé »** (priorité Charles) — à diagnostiquer
   en premier. Le code (`construireFeuilleSemaine`, `exporterExcelRecap` dans
   `app.js`) définit pourtant largeurs de colonnes (`getColumn().width`),
   hauteurs de lignes et `wrapText`. **Me demander de décrire précisément le
   symptôme** (colonnes trop étroites ? texte qui déborde/chevauche ? tout dans
   une seule colonne ? noms longs coupés ?) et idéalement un export d'exemple,
   avant de corriger.
2. **Exports** : découpage par **trimestre** plutôt que mois ; postes vides
   explicites le week-end (Labo fermé) ; lignes vides par unité.
3. **M12c** : concentration des gardes de nuit sur une période du mois (N3).
4. **Récup férié auto-crédit** (§8.2) + **désidératas** (quota 20/trimestre + priorités admin).
5. **Congrès ISICEM/ISICARE** et **fermetures d'unités** (couverture adaptée).
6. **Rotation trimestrielle des unités** (historique tracé).
7. **Alertes absences simultanées** (§14) + pré-placement manuel.
8. **Durcissement** : triggers SQL quotas/serveur ; empêcher l'auto-approbation.

## Note technique importante (environnement Cowork)
Dans cet environnement, le **montage du dépôt dans le shell est souvent
périmé/tronqué** : `node test_planning.js` peut échouer sur une version obsolète.
**La version écrite par les outils de fichiers fait foi.** Pour vérifier
l'algorithme : relire le fichier, ou recopier la logique modifiée dans un script
`/tmp` isolé et la tester là. **En local chez moi, `node test_planning.js` doit
passer après `git pull`** — c'est la validation de référence.

## Style d'interaction attendu
- Pose-moi des questions de clarification avant de coder si une règle est ambiguë.
- Donne-moi le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Donne-moi les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.

**Commence par lire `CONFORMITE.md`, `planning.js`, `regles.js` et `app.js`,
confirme-moi que tu as le contexte, puis attaque-toi au bug d'export Excel
(en me demandant d'abord de décrire le symptôme exact).**
