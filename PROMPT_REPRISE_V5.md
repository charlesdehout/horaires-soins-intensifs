# Prompt de reprise — Application Planning Soins Intensifs (v5)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Reprise après le lot « révision Calabro : grade A/S,
> équité week-ends, congés en année académique, souhaits ».

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
- `regles.js` (config, dont `EQUITE`), `planning.js` (algorithme pur, testable
  sous Node), `index.html`, `app.js`, `style.css`, `sql/`, `supabase/functions/`.

Ne réécris pas ce qui existe, étends-le.

## ⚠️ À VÉRIFIER EN PREMIER
`git pull` puis **`node test_planning.js`** en local : **tous les tests doivent
être au vert** (contraintes dures, équité INTRA-grade, off-clinic, souhaits).
Si un test échoue, on corrige ça d'abord.

## Architecture
- Frontend : HTML/CSS/JavaScript **vanilla** (pas de framework).
  `index.html`, `app.js`, `style.css`, `regles.js`, `planning.js`.
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
**`module16_supprimer_grade_specialiste.sql`** (nouveau, idempotent).

## Modèle de données (à jour)
- `doctors` : id, name, email, role 'admin'|'doctor', **grade
  'resident'|'assistant_specialiste'** (le grade « specialiste » a été
  SUPPRIMÉ ; contrainte CHECK posée par module16), fte, weekly_hours_target,
  quotas congés, jours_travailles int[], statut 'dependant'|'independant',
  conges_100pct bool, admin_level, contract_periods jsonb.
- `preferences` : id, doctor_id, start_date, end_date, pref_type, note, status, decided_at.
  pref_type ∈ {conge_*, indispo, **souhait**, off_clinic, recuperation, formation, autre, **dispo**}.
- `schedules` : year, month, status 'draft'|'published', published_at.
- `shifts` : date, shift_type, doctor_id, schedule_id, poste.
  shift_type ∈ {jour, twe, garde_nuit, garde_24h} + absences/repos
  {repos_garde, recup, off, conge_annuel, conge_scientifique, conge_extralegal}.

## Concepts clés
- **Deux grades seulement** : Résident et Assistant Spécialiste (A/S). Règle dure
  « jamais 2 A/S ensemble en garde » + « ≥1 résident chaque nuit ».
- **Deux repos distincts** : `repos_garde` (auto post-garde, affiché, NON
  comptabilisé) vs `recup` (manuel, comptabilisé).
- **Gardes ÉGALES pour tous**, équilibrées au **MOIS** (le FTE ne réduit plus les
  gardes ; seul le quota d'heures s'y adapte).
- **Week-ends** équilibrés sur le **TRIMESTRE** et comptés en **week-ends
  DISTINCTS** (sam+dim = 1).
- **Équité = INTRA-grade** : résidents entre eux, A/S entre eux (l'écart
  inter-grade est STRUCTUREL et attendu : 6 résidents portent le créneau
  « ≥1 résident/nuit »).
- **Souhait = « je veux travailler ce jour »** : quasi-bloquant pour les
  indépendants, souple pour les dépendants.
- **Année ACADÉMIQUE** (1 oct → 30 sep) pour les quotas de congés.

## Déjà réalisé
- **M1–M12** : auth, CRUD médecins, préférences/congés, calendrier, génération
  mensuelle + trimestrielle, équité fine, split `repos_garde`, off-clinic auto,
  workflow de validation, concentration des gardes de nuit.
- **Exports Excel** : planning mois + trimestre (1 onglet/semaine), récap individuel.
- **Auth complète** : invitation admin (Edge Function + bouton), mot de passe
  oublié, page « définir le mot de passe ». SMTP Brevo OK. Voir `GUIDE_AUTH.md`.
- **Lot révision Calabro (cette session)** :
  1. **Grade « Spécialiste » supprimé** → bascule en A/S (SQL module16, UI, règles).
  2. **Équilibrage week-ends V3** : trimestriel + week-ends distincts (A/S quasi
     parfaits, gardes ≤ 2/grade). Tests d'équité reformulés en **intra-grade**.
  3. **Quotas de congés en ANNÉE ACADÉMIQUE** (1 oct → 30 sep) : comptage,
     proration, contrôle bloquant. Proration = quota PLEIN si le contrat couvre
     toute l'année OU pas du tout (proratisé seulement en couverture partielle).
     Compteur ancré sur le **mois affiché** (navigue → demande de congés à
     l'avance ; reset visuel au 1er octobre).
  4. **Congé accepté → réduit la cible horaire du mois** (compteurs admin).
  5. **Souhaits effectifs** : quasi-bloquant pour indépendants, souple sinon.
- **Tests** : `node test_planning.js` tout au vert (contraintes dures, équité
  intra-grade, off-clinic, souhaits).

## Reste à faire (issu de mes annotations sur `Regles_planning_a_reviser.docx`)
- **Pt 5 — `recup` bien visible au planning** : voir clairement qui est
  dispo/indispo (UI calendrier + exports). *Surtout app.js.*
- **🐞 Pt 6 — Couplage des gardes** : les repos compensatoires couplés
  (jeudi+samedi → lundi ; vendredi+dimanche → mardi) ne se déclenchent pas car la
  génération ne **couple pas assez** les gardes d'un même week-end. À améliorer
  dans `planning.js` (la matérialisation existe : `materialiserReposCouples`,
  mais peu de cas « même médecin jeudi+samedi » sont produits).

## Reste à faire (feuille de route, après les points ci-dessus)
7. Récup férié auto-crédit (§8.2) + désidératas (quota 20/trimestre + priorités admin).
8. Congrès ISICEM/ISICARE + fermetures d'unités (couverture adaptée).
9. Rotation trimestrielle des unités (historique tracé).
10. Alertes absences simultanées (§14) + pré-placement manuel.
11. Durcissement : triggers SQL quotas serveur ; empêcher l'auto-approbation.

## Points ouverts
- **Écart inter-grade gardes/week-ends** : STRUCTUREL et attendu (documenté dans
  FEUILLE_DE_ROUTE). L'équité se mesure intra-grade. Week-ends résidents un peu
  dispersés (≤ 4/trimestre) : améliorable seulement en augmentant l'effectif
  résident ou en assouplissant « ≥1 résident/nuit » (décision clinique).
- **Délivrabilité email** : pour sortir des spams, faire ajouter les
  enregistrements **DKIM + SPF de Brevo** au domaine `hubruxelles.be` (IT HUB).

## Note technique (environnement Cowork)
Le **montage du dépôt dans le shell est souvent périmé/tronqué** pour les fichiers
ÉDITÉS (les fichiers NEUFS, eux, se propagent). **La version écrite par les outils
de fichiers fait foi.** Pour tester l'algorithme sous Node malgré ça : écrire une
copie fraîche sous un nouveau nom (ou patcher en bash une copie), puis la lancer.
**En local, `node test_planning.js` après `git pull` est la validation de référence.**

## Style d'interaction attendu
- Pose des questions de clarification avant de coder si une règle est ambiguë.
- Donne le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Donne les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.

**Commence par lire `FEUILLE_DE_ROUTE.md`, `planning.js`, `regles.js` et mes
annotations, fais tourner `node test_planning.js`, puis attaque le point que je te
désigne (probablement le 🐞 couplage des gardes, ou la visibilité de `recup`).**
