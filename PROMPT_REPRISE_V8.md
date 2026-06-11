# Prompt de reprise — Application Planning Soins Intensifs (v8)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Reprise après le gros lot « refonte des types de
> congés / règles » : durcissement serveur (M21), sauvegarde/restauration de
> l'horaire (M22), gardes semaine 17h–9h vs 24h, Labo sans continuité, repos des
> « non planifiés », désidératas + popup sur le calendrier, congrès (équipe
> minimale + équité prioritaire + participation non bloquante), indispo/souhait
> redéfinis (soft, gardes only), maladie/formation réservés à l'admin, statut
> « salarié », et moteur d'échange de shifts (M23, UI à finir).

---

Tu m'aides à construire une application web de planning pour une unité de soins
intensifs. Je suis médecin intensiviste, non-développeur. Tu codes, je déploie
via **GitHub Desktop** (commit + push) sur **GitHub Pages**. On procède par
modules ; chaque module doit fonctionner et être testable avant le suivant.

## Avant de commencer
Lis : `FEUILLE_DE_ROUTE.md` (état d'avancement, le plus utile), `REGLES_APPLICATION.md`
(toutes les règles actuelles), `CONFORMITE.md`, `regles.js`, `planning.js`,
`app.js`, `index.html`, `style.css`, `sql/`. **Ne réécris pas ce qui existe, étends-le.**

## ⚠️ À VÉRIFIER EN PREMIER
`git pull` (si besoin) puis **`node test_planning.js`** en local : **~59 tests au
vert** attendus. ⚠️ **Plusieurs lots récents n'ont PAS pu être exécutés** (le shell
de l'environnement Cowork était indisponible) : la priorité absolue est de
**confirmer le 59/59 en local** et de me signaler tout échec à corriger d'abord.

## Architecture
- Frontend HTML/CSS/JS **vanilla** : `index.html`, `app.js`, `style.css`,
  `regles.js`, `planning.js`. UI par **onglets**. Palette sarcelle.
- Backend **Supabase** (Auth + PostgreSQL, tier gratuit). Calendrier **FullCalendar
  v6** (vues Mois + Liste). Export **ExcelJS**. Auth email (invitation admin via Edge
  Function `inviter-medecin`, SMTP **Brevo**, verify JWT désactivé).
- Algorithme de planning : JavaScript pur (`planning.js`), testable sous Node.
- Commentaires en français.

## Connexion Supabase (déjà dans app.js)
- Project URL : `https://rmkpuzmqwghzdtsuqgpq.supabase.co` · anon key dans `app.js`.

## SQL à exécuter (Supabase, dans l'ordre — tous idempotents)
`module2_quota_conges`, `module4_rls`, `module5_planning`, `module6_planning_admin`,
`module6_absences`, `module9_personnel`, `module10_workflow`, `module15_repos_garde`,
`module16_supprimer_grade_specialiste`, `module17_periodes_speciales`,
`module18_recup_ferie`, `module19_preplacement`, `module20_rotation_unites`,
**`module21_durcissement`** (triggers quotas + anti-auto-approbation),
**`module22_sauvegarde_horaire`** (table `schedule_backups`),
**`module23_echanges`** (table `shift_swaps`).

## Concepts clés (état ACTUEL)
- **Rôles** : admin « chef » (n'apparaît jamais à l'horaire) ; médecin **Salarié**
  (ex-« dépendant ») ou **Indépendant** (déclare ses jours `dispo`, contrainte dure).
  Grades **Résident** / **A/S**. `admin_level` = départage désidératas.
- **Contraintes dures** : jamais 2 A/S en garde, ≥1 résident/nuit, max 3 gardes/sem,
  max 2 WE/mois, repos de garde, hors-contrat non planifiable, binôme TWE sam=dim,
  férié-semaine = règles WE (non compté), continuité d'unité (sauf Labo).
- **Gardes semaine** : 24 h **non imposée** ; par défaut 2 gardes **17h–9h** ; une
  24 h n'apparaît que si nécessaire pour pourvoir une station (A/S préféré ; éviter
  3 gardes). Drapeau `GARDES.garde24h_obligatoire` = comportement historique.
- **Labo de choc** : **pas de continuité** hebdo ni d'ancrage trimestriel
  (`PL_STATIONS_SANS_CONTINUITE`), exclu de la rotation.
- **Congés à quota** (annuel/EL/scientifique) en **année académique** (1 oct→30 sep),
  jours ouvrés, proration au contrat. **Durcissement serveur M21** (refus quota à la
  soumission + anti-auto-approbation ; l'admin peut forcer).
- **Maladie/Autre + Formation USI** : **admin uniquement** (onglet Demandes →
  « Forcer un congé / une absence »), retirés de la liste des travailleurs.
- **Indispo (garde) / Souhait (garde)** : SOFT, **non bloquants**, **gardes
  uniquement**, en **départage à équité égale** (`plBiaisGarde`). À souhait égal,
  priorité admin. `indispo` **retiré de `PREF_BLOQUANTES`**.
- **Congrès** : participation **non bloquante** (pas d'absence créée) ; **équipe
  minimale** (2 gardes forcées en 24 h + tolérance stations vides) ; **équité des
  jours de congrès prioritaire** (`etat.joursCongres`) ; **aucune demande** possible
  pendant un congrès.
- **Off-clinic** : droit mensuel + **hiérarchie N3** (plafond absences simultanées,
  min résidents, arbitrage « plus de congés cèdent en premier », report dans le mois).
- **Repos « non planifiés »** : médecins actifs non postés et non en congé affichés
  « au repos » (grille + exports + synthèse calendrier admin) ; **pas** les
  week-ends/fériés, **ni** les hors-contrat, **ni** l'admin.
- **Désidératas sur calendrier** : sélection de dates → **popup** (Du/Au + type),
  bloqué sur dates publiées / congrès.
- **Sauvegarde/restauration (M22)** : snapshot à la publication ; supprimer le
  trimestre (1 clic) ; restaurer le dernier publié **en brouillon**.
- **Échange de shifts (M23)** : moteur `validerEchange` (garde↔garde / journée↔journée,
  refuse si casse A/S-résident, échange le repos de garde) **fait + testé** ;
  table `shift_swaps` faite ; **UI du workflow propose→accepte À FINIR**.

## Reste à faire (priorité)
1. **🎯 Échange de shifts — UI workflow** (prochain) : onglet/section « Échanges » côté
   médecin → proposer (mes shifts publiés ↔ shift d'un collègue), liste reçues/émises,
   accepter → appelle `validerEchange` puis applique (`update shifts.doctor_id` pour
   chaque `change`). Refuser / annuler. Publié uniquement.
2. **Fériés (lot 2)** : demande unique « **travailler un férié** » → si acceptée, l'algo
   **place** le médecin sur ce férié + ouvre un « **congé férié** » à poser sous 6 sem.
   (workflow validé, respecté par l'algo). **Supprimer `recup_ferie`** de la liste.
   **Fériés éditables par l'admin** (table + UI, agissant comme week-end).
3. Raffinements N3/N4 résiduels (cf. `CONFORMITE.md`).

## Note technique (environnement Cowork) — IMPORTANT
Le **shell sandbox a été indisponible toute la dernière session** (timeouts / boot en
boucle) : impossible de lancer `node test_planning.js`, `node --check`, ou de générer
des `.docx`. Plusieurs lots sont donc **livrés sans validation automatique** (relus à
la main). **Faire tourner `node test_planning.js` en local après `git pull` est la
validation de référence (≈59 attendus).** Si le shell remonte, lancer la suite complète
en priorité. (Astuce si le mount est périmé après édition : `git show HEAD:fichier.js`
puis `node --check`.)

## Style d'interaction attendu
- Pose des questions de clarification avant de coder si une règle est ambiguë.
- Donne le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Donne les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.

**Commence par lire `FEUILLE_DE_ROUTE.md` et `REGLES_APPLICATION.md`, fais tourner
`node test_planning.js` (≈59 attendus), puis attaque l'🎯 UI d'échange de shifts — en
me posant les questions de cadrage avant de coder.**
