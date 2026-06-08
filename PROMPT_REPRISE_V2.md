# Prompt de reprise — Application Planning Soins Intensifs (v2)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Le projet reprend où il en était après l'intégration
> de la spécification détaillée du Dr Calabro (Modules 1 à 14).

---

Tu m'aides à construire une application web de planning pour une unité de soins
intensifs. Je suis médecin intensiviste, non-développeur. Tu codes, je déploie
via **GitHub Desktop** (commit + push) sur **GitHub Pages**. On procède module
par module ; chaque module doit fonctionner et être testable avant le suivant.

## Avant de commencer
Lis les fichiers existants, en particulier :
- `SPECIFICATIONS.md` — règles métier (avec un en-tête listant les règles déjà appliquées).
- `CONFORMITE.md` — **analyse de conformité complète vs la spec Dr Calabro + feuille de route** (document le plus important pour savoir quoi faire).
- `Specification_Planning_USI.docx` — cahier des charges de référence du Dr Calabro (si présent dans le dossier).
- `regles.js` (config), `planning.js` (algorithme pur, testable sous Node),
  `index.html`, `app.js`, `style.css`, et le dossier `sql/`.

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
`sql/module2_quota_conges.sql`, `module4_rls.sql`, `module5_planning.sql`,
`module6_planning_admin.sql`, `module6_absences.sql`,
**`module9_personnel.sql`** (statut, conges_100pct, admin_level, contract_periods, pref_type `dispo`),
**`module10_workflow.sql`** (colonne `status` des préférences + types formation/autre/demande_weekend).
> ⚠️ Vérifie avec moi que module9 et module10 ont bien été lancés.

## Modèle de données (à jour)
- `doctors` : id, name, email, role 'admin'|'doctor', grade 'resident'|'assistant_specialiste'|'specialiste',
  fte, weekly_hours_target, quotas congés (annuel/extralegal/scientifique), jours_travailles int[],
  **statut 'dependant'|'independant'**, **conges_100pct bool**, **admin_level 'aucun'|'secondaire'|'principal'**,
  **contract_periods jsonb** = [{start,end}] (prévaut sur contract_start/end si non vide).
- `preferences` : id, doctor_id, start_date, end_date, pref_type, note, **status 'en_attente'|'approuve'|'refuse'**, decided_at.
  pref_type ∈ {conge_annuel, conge_extralegal, conge_scientifique, indispo, souhait, off_clinic, recuperation,
  **dispo** (fenêtre déclarée des indépendants), **formation**, **autre**, **demande_weekend**}.
- `schedules` : year, month, status 'draft'|'published', published_at (unique year/month).
- `shifts` : date, shift_type, doctor_id, schedule_id, poste.
  shift_type ∈ {jour, twe, garde_nuit, garde_24h} + absences {recup, off, conge_annuel, conge_scientifique, conge_extralegal}.
  poste ∈ {usi1..usi5, bordet, labo_choc} ou NULL.

## Déjà réalisé (Modules 1 à 14)
- **M1–M6** : auth, CRUD médecins, préférences, calendrier, algo de génération v1,
  ajustements manuels + publication, vue grille, absences posables.
- **M7** : génération **trimestrielle** avec équité proportionnelle à la disponibilité
  (bouton « Générer le trimestre »), tri par déficit relatif (compte/poids).
- **Règles spec Dr Calabro appliquées** (détail dans CONFORMITE.md) :
  - Jamais 2 A/S ensemble en garde ; max 3 gardes/semaine (DUR).
  - Binôme du tour week-end (même médecin TWE samedi = dimanche, sans garde).
  - Max 2 week-ends/mois (N2) ; férié en semaine ne compte pas comme week-end.
  - Trimestres **académiques** (oct-déc=T1…) côté étiquette.
  - **M9 — Modèle de personnel** : statut dépendant/indépendant (indépendant = planifiable
    seulement sur jours déclarés `dispo`), contrats multi-périodes, congés 100 %, niveau admin.
  - **M11 — Off-clinic automatique** (§9) : résidents dépendants, droit mensuel
    (0–4 abs→2, 5–9→1, 10+→0), placé en jours ouvrables, interdits garde/post-garde/veille de garde,
    crédité 10,5 h. **Repos de garde matérialisés** comme shifts `recup` (visibles + comptés).
  - **M10 — Workflow de validation** : demandes en `en_attente`, panneau admin Approuver/Refuser,
    **génération bloquée** s'il reste des demandes en attente ; seules les approuvées comptent.
  - **M14 — Exports Excel (ExcelJS)** : Export 1 « Planning » (un onglet/semaine, gabarit Erasme
    coloré, cellules auto distinguées des vides) ; Export 2 « Récap individuel »
    (gardes / week-ends / **tours** / **off** / **repos** / heures).
- **Compteurs par médecin** (`compterParMedecin`) : heures, gardes, week-ends, tours, off, repos.

## Reste à faire (feuille de route — détail dans CONFORMITE.md)
1. **Équité fine N2** (priorité demandée) :
   - **Plancher horaire** : taux d'heures minimum par médecin pour garantir l'équilibre.
   - **Équité des gardes entre grades** : les A/S doivent avoir ± le **même nombre de gardes**
     que les Résidents (ne plus biaiser résident→nuit / A/S→24h dans le comptage).
     **2 Résidents peuvent être ensemble** en garde (seule reste dure : jamais 2 A/S).
   - Max **60 h/semaine** (plafond, compensable la semaine suivante) ; ±1 garde ; repos compensatoires couplés.
2. **Récup férié auto-crédit** (§8.2) + **désidératas** (quota 20/trimestre + priorités admin principal/secondaire).
3. **Congrès ISICEM/ISICARE** et **fermetures d'unités** (couverture adaptée).
4. **Rotation trimestrielle des unités** (historique tracé).
5. **Alertes absences simultanées** (§14) + pré-placement manuel.
6. **Exports** : découpage par **trimestre** plutôt que mois ; postes vides explicites le week-end (Labo fermé).
7. **Durcissement** : trigger SQL quotas/serveur ; empêcher un travailleur d'auto-approuver ses demandes.

## Note technique importante (environnement Cowork)
Dans cet environnement, le **montage du dépôt dans le shell est souvent périmé/tronqué** :
`node test_planning.js` peut échouer sur une version obsolète des fichiers. **La version
écrite par les outils de fichiers fait foi.** Pour vérifier l'algorithme, soit relire le
fichier, soit recopier la logique dans un script `/tmp` isolé et la tester là. En local
chez moi, `node test_planning.js` doit passer après `git pull`.

## Style d'interaction attendu
- Pose-moi des questions de clarification avant de coder si une règle est ambiguë.
- Donne-moi le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Donne-moi les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.

**Commence par lire `CONFORMITE.md`, `SPECIFICATIONS.md`, `planning.js` et `sql/`,
confirme-moi que tu as le contexte, puis propose le prochain module (équité fine N2 conseillée).**
