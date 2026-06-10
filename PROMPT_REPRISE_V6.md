# Prompt de reprise — Application Planning Soins Intensifs (v6)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Reprise après le lot « Module 17 : congrès &
> fermetures d'unités » + « refonte graphique (onglets, palette sarcelle,
> exports Excel retravaillés) ».

---

Tu m'aides à construire une application web de planning pour une unité de soins
intensifs. Je suis médecin intensiviste, non-développeur. Tu codes, je déploie
via **GitHub Desktop** (commit + push) sur **GitHub Pages**. On procède module
par module ; chaque module doit fonctionner et être testable avant le suivant.

## Avant de commencer
Lis les fichiers existants, en particulier :
- `FEUILLE_DE_ROUTE.md` — **état d'avancement** (le plus utile pour savoir où on en est).
- `CONFORMITE.md` — analyse de conformité vs spec Dr Calabro.
- `SPECIFICATIONS.md` — règles métier.
- `Regles_planning_a_reviser.docx` — règles telles que codées + mes annotations.
- `regles.js` (config : `EQUITE`, `COUVERTURE` dont `congres_postes_vides`,
  quotas, fériés), `planning.js` (algorithme pur, testable sous Node),
  `index.html`, `app.js`, `style.css`, `sql/`, `supabase/functions/`.

Ne réécris pas ce qui existe, étends-le.

## ⚠️ À VÉRIFIER EN PREMIER
`git pull` puis **`node test_planning.js`** en local : **35/35 tests au vert**
(contraintes dures, équité INTRA-grade, off-clinic, souhaits, congrès &
fermetures). Si un test échoue, on corrige ça d'abord.

## Architecture
- Frontend : HTML/CSS/JavaScript **vanilla** (pas de framework).
  `index.html`, `app.js`, `style.css`, `regles.js`, `planning.js`.
- **UI par ONGLETS** (refonte 2026-06) : en-tête d'app + onglets Planning /
  Demandes (pastille de comptage) / Congrès & fermetures / Médecins (admin) ;
  Mes préférences (médecin). `basculerOnglet()` dans app.js ;
  `calendrier.updateSize()` au retour sur Planning. Palette **sarcelle**
  centralisée dans `:root` de style.css (`--accent`…, alias `--bleu` conservés).
- Backend : **Supabase** (Auth + PostgreSQL), tier gratuit.
- Calendrier : **FullCalendar v6** (CDN). Export : **ExcelJS** (CDN).
- **Auth par email** : invitation admin via Edge Function `inviter-medecin`,
  emails via **Brevo (SMTP)**. Verify JWT **désactivé** sur la fonction.
- Algorithme de planning : JavaScript pur côté client (`planning.js`).
- Commentaires en français dans le code.

## Connexion Supabase (déjà dans app.js)
- Project URL : `https://rmkpuzmqwghzdtsuqgpq.supabase.co`
- anon key : déjà configurée dans `app.js`.

## SQL à exécuter (dans l'ordre, SQL Editor Supabase)
`module2_quota_conges.sql`, `module4_rls.sql`, `module5_planning.sql`,
`module6_planning_admin.sql`, `module6_absences.sql`, `module9_personnel.sql`,
`module10_workflow.sql`, `module15_repos_garde.sql`,
`module16_supprimer_grade_specialiste.sql`,
**`module17_periodes_speciales.sql`** (congrès & fermetures, idempotent).

## Modèle de données (à jour)
- `doctors` : id, name, email, role 'admin'|'doctor', grade
  'resident'|'assistant_specialiste', fte, weekly_hours_target, quotas congés,
  jours_travailles int[], statut 'dependant'|'independant', conges_100pct bool,
  admin_level, contract_periods jsonb.
- `preferences` : id, doctor_id, start_date, end_date, pref_type, note, status, decided_at.
  pref_type ∈ {conge_*, indispo, souhait, off_clinic, recuperation, formation, autre, dispo}.
- `schedules` : year, month, status 'draft'|'published', published_at.
- `shifts` : date, shift_type, doctor_id, schedule_id, poste.
  shift_type ∈ {jour, twe, garde_nuit, garde_24h} + absences/repos
  {repos_garde, recup, off, conge_annuel, conge_scientifique, conge_extralegal}.
- **`special_periods`** (Module 17) : id, type 'congres'|'fermeture', label,
  unite (code station si fermeture), start_date, end_date. Lecture tous,
  écriture admin (RLS).

## Concepts clés
- **Deux grades seulement** : Résident et A/S. Règles dures « jamais 2 A/S en
  garde » + « ≥1 résident chaque nuit ».
- **Deux repos distincts** : `repos_garde` (auto, affiché, NON comptabilisé)
  vs `recup` (manuel, comptabilisé).
- **Gardes ÉGALES pour tous**, équilibrées au **MOIS** ; **week-ends** au
  **TRIMESTRE**, comptés en week-ends DISTINCTS (sam+dim = 1).
- **Équité = INTRA-grade** (écart inter-grade STRUCTUREL : 6 R portent
  « ≥1 résident/nuit »).
- **Souhait = « je veux travailler ce jour »** : quasi-bloquant indépendants,
  souple dépendants. **Année ACADÉMIQUE** (1 oct → 30 sep) pour les congés.
- **Congrès (M17)** : saisi par l'admin (dates + participants cochés → absences
  APPROUVÉES créées auto, congé scientifique ou formation). En semaine :
  7 unités, jusqu'à **2 stations vides tolérées** ; un congrès le week-end suit
  les règles week-end. Affiché en fond orange (calendrier/grille/Excel).
- **Fermeture d'unité (M17)** : admin uniquement ; l'unité choisie (cumulable)
  n'est **ni pourvue ni exigée** sur la période ; affectation manuelle dessus
  = conflit ; « Fermé » dans grille et exports.
- **Exports Excel** : NOMS DE FAMILLE (initiale du prénom si homonymie),
  titre fusionné par semaine, volets figés, en-têtes semaine/WE/congrès,
  hauteur mini 2 noms sur les lignes de station, impression paysage.

## Déjà réalisé
- **M1–M12** : auth, CRUD médecins, préférences/congés (année académique),
  calendrier, génération mensuelle + trimestrielle, équité fine intra-grade,
  split `repos_garde`, off-clinic auto, workflow de validation, concentration
  des gardes de nuit, souhaits effectifs, congé accepté → cible réduite.
- **Exports Excel** mois + trimestre (1 onglet/semaine) + récap individuel,
  retravaillés (cf. ci-dessus).
- **Auth complète** (invitation, reset, SMTP Brevo). Voir `GUIDE_AUTH.md`.
- **M17 — Congrès & fermetures** (cf. concepts clés) + 4 tests dédiés.
- **Refonte graphique** : onglets, en-tête, palette sarcelle, badges, zèbre.
- **Tests** : `node test_planning.js` → 35/35.

## Reste à faire (priorités)
1. **Pt 5 — `recup` bien visible au planning** : voir clairement qui est
   dispo/indispo (UI calendrier + exports). *Surtout app.js.*
2. **🐞 Pt 6 — Couplage des gardes** : les repos compensatoires couplés
   (jeudi+samedi → lundi ; vendredi+dimanche → mardi) se déclenchent rarement
   car la génération ne couple pas assez les gardes d'un même week-end.
   À améliorer dans `planning.js` (`materialiserReposCouples` existe déjà).
3. **Récup férié auto-crédit** (§8.2) + **désidératas** (quota 20/trimestre +
   priorités admin principal > secondaires > travailleurs). *Touche la base.*
4. **Rotation trimestrielle des unités** (historique tracé).
5. **Alertes absences simultanées** (§14) + **pré-placement manuel** respecté.
6. **Durcissement** : triggers SQL quotas serveur ; empêcher l'auto-approbation.

## Points ouverts
- **Écart inter-grade gardes/week-ends** : STRUCTUREL et attendu (documenté
  dans FEUILLE_DE_ROUTE). L'équité se mesure intra-grade.
- **Délivrabilité email** : faire ajouter les enregistrements **DKIM + SPF de
  Brevo** au domaine `hubruxelles.be` (IT HUB).

## Note technique (environnement Cowork) — IMPORTANT
Le **montage du dépôt dans le shell est souvent périmé/tronqué** pour les
fichiers ÉDITÉS (les fichiers NEUFS se propagent). **La version écrite par les
outils de fichiers fait foi.** Deux parades éprouvées :
1. Si je viens de committer : `git show HEAD:fichier.js` dans le shell donne la
   bonne version → `node --check` et tests dessus.
2. Sinon : reconstruire une copie fraîche (HEAD + patchs rejoués par script
   Python) sous /tmp, et tester celle-là.
**En local, `node test_planning.js` après `git pull` est la validation de
référence.** Pour l'Excel : ExcelJS s'installe sous Node (`npm i exceljs`) pour
des smoke tests écriture + relecture du classeur.

## Style d'interaction attendu
- Pose des questions de clarification avant de coder si une règle est ambiguë.
- Donne le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Donne les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.

**Commence par lire `FEUILLE_DE_ROUTE.md`, `planning.js`, `regles.js` et mes
annotations, fais tourner `node test_planning.js` (35/35 attendus), puis attaque
le point que je te désigne (probablement le Pt 5 « recup visible » ou le
🐞 Pt 6 « couplage des gardes »).**
