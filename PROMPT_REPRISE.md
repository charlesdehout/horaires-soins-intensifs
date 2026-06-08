# Prompt de reprise — Application Planning Soins Intensifs

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Le projet reprend exactement où il en était
> (fin Module 5 : algorithme de planning v1). Prochain : Module 6.

---

Tu m'aides à construire une application web de planning pour une unité de soins
intensifs. Je suis médecin intensiviste, non-développeur. Tu codes, je déploie
via GitHub Desktop sur GitHub Pages. On procède **module par module**, chaque
module doit fonctionner et être testable avant de passer au suivant.

## Avant de commencer
Le dossier connecté est le dépôt GitHub du projet. **Commence par lire les
fichiers existants** : `SPECIFICATIONS.md` (règles métier complètes — fais-y
toujours référence), `regles.js` (config métier), `planning.js` (algorithme),
`index.html`, `app.js`, `style.css`, et les fichiers du dossier `sql/`. Ne
réécris pas ce qui existe, étends-le.

## Architecture
- Frontend : HTML/CSS/JavaScript **vanilla** (pas de React/Vue).
  Fichiers : `index.html`, `app.js`, `style.css`, `regles.js` (config métier),
  `planning.js` (algorithme de génération, pur, testable sous Node).
- App en page unique : une vue login + des zones masquées/affichées selon le rôle.
- Backend : **Supabase** (Auth + PostgreSQL), tier gratuit.
- Calendrier : **FullCalendar.js v6** (bundle global CDN), vues Mois + Liste.
- Algorithme de planning : JavaScript côté client.
- Déploiement : **GitHub Desktop uniquement** (commit + push), GitHub Pages.
- **Commentaires en français** dans le code.

## Connexion Supabase (déjà configurée, dans app.js)
- Project URL : `https://rmkpuzmqwghzdtsuqgpq.supabase.co`
- Project id : `rmkpuzmqwghzdtsuqgpq`
- anon public key : `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJta3B1em1xd2doemR0c3VxZ3BxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjAyNzQsImV4cCI6MjA5NjMzNjI3NH0.13dKTlGEhE65SqFfVgJK4W1jBjavrmGXdku8VQadYYE`

## Modèle de données (Supabase, à jour)
- `doctors` (id, name, email, role 'admin'|'doctor', grade 'resident'|'assistant_specialiste'|'specialiste',
  fte numeric, contract_type, weekly_hours_target, contract_start, contract_end, custom_rules jsonb,
  quota_conge_annuel int, quota_conge_extralegal int, quota_conge_scientifique int — NULL = défaut regles.js,
  **jours_travailles int[] — jours de semaine travaillables, 1=lundi … 7=dimanche, défaut {1..7}**)
- `preferences` (id, doctor_id, start_date, end_date, pref_type, note text)
  pref_type ∈ {`conge` (ancien, compat.), `conge_annuel`, `conge_extralegal`, `conge_scientifique`,
  `indispo`, `souhait`, `off_clinic`, `recuperation`}
- `schedules` (id, month, year, status 'draft'|'published', created_at, **published_at** ; unique (year, month))
- `shifts` (id, date, shift_type, doctor_id, schedule_id, **poste**) — shift_type ∈
  {`jour`,`twe`,`garde_nuit`,`garde_24h`} (travail) **+ absences posables : `recup`,`off`,`conge_annuel`,
  `conge_scientifique`,`conge_extralegal` (0 h, sans station, posées par l'admin — ne décomptent PAS les quotas)** ;
  **poste** ∈ {`usi1`,`usi2`,`usi3`,`usi4`,`usi5`,`bordet`,`labo_choc`} ou NULL (station de jour ; NULL pour TWE,
  garde de nuit, garde 24h de week-end et toutes les absences).

RLS en place :
- `doctors` : lecture ouverte aux connectés ; écriture réservée admin via `is_admin()`.
- `preferences` : chaque médecin gère/lit les siennes (matching par email `auth.jwt()->>'email'`
  ↔ `doctors.email`, en `lower()`), l'admin lit/écrit tout.
- `shifts` / `schedules` : lecture ouverte aux connectés, écriture réservée admin.
SQL dans `sql/` : `module2_quota_conges.sql`, `module4_rls.sql`, `module5_planning.sql`,
`module6_planning_admin.sql` (published_at + unique year/month), `module6_absences.sql` (types d'absence).

## Règles métier essentielles (détail complet dans SPECIFICATIONS.md)
- Équipe ~15 médecins, cible horaire = 52 × fte (~50–55 h/sem).
- Shifts : Journée lun–ven 08:00–18:30 (10,5h) ; TWE week-end/férié 08:00–14:00 (6h) ;
  Garde de nuit affichée 18:30–09:30 = réelle 17:00–08:00 (15h) ; Garde 24h 08:00→08:00 (24h).
  Les durées réelles sont dans `SHIFT_CONFIG` (app.js) et `PL_HEURES` (planning.js).
- **Postes de jour (semaine) = 7 stations nommées** : USI 1–5, USI Bordet, labo de choc
  (config `POSTES_JOUR` dans regles.js). Toutes accessibles à tous les grades. Couverture jour = 7.
- **Continuité clinique** : un médecin garde la même station toute la semaine.
- **Nuit semaine** : ≥2 médecins, ≥1 résident. L'AS fait préférentiellement une garde 24h
  (qui occupe une des 7 stations le jour), mais peut aussi démarrer à 17h ; le résident démarre à 17h.
- **Repos 12h** après toute garde. Récup week-end : garde finissant dimanche → lundi+mardi libres ;
  finissant samedi → lundi libre.
- **Week-end / férié** : 3 médecins au TWE matin, dont 2 enchaînent en garde 24h (≥1 résident), pas de stations.
- `jours_travailles` (profil médecin) = contrainte dure (ex. un 8/10 jamais le lundi).
- **Équité trimestrielle** = proportionnelle à la disponibilité (Module 7) :
  part = (fte × jours de présence) / Σ(fte × jours de présence).
- Off/clinic (peut travailler au bureau) ≠ Récupération (vrai repos). Tous deux non planifiables en USI.
- Pas de plafond de gardes/mois. Chef de service = admin, pas dans le planning.

## Quotas de congés (déjà implémenté)
- 3 catégories : congé annuel (défaut 24), extra-légaux (5), scientifique (12), en jours ouvrés
  (lun–ven hors fériés belges, calculés dans regles.js). Période = année civile, proratisé au contrat.
- Compteur + blocage à l'encodage côté navigateur. ⚠️ Garde-fou serveur (trigger SQL) à prévoir au Module 8.

## Déjà réalisé (Modules 1 à 5)
- **Module 1 — Auth** : login email/mdp Supabase, détection du rôle, restauration de session, déconnexion.
- **Module 2 — CRUD médecins (admin)** : nom, email, grade, fte, dates de contrat, accès, cible horaire
  auto 52×fte, 3 quotas de congés, **jours travaillables (cases Lun→Dim)**. RLS écriture admin.
- **Module 3 — Préférences médecin** : congés/indispo/souhait + compteur + blocage des quotas. RLS perso.
- **Module 4 — Calendrier (FullCalendar)** : vues Mois + Liste ; admin = équipe complète, médecin = équipe
  + ses shifts mis en évidence ; shifts colorés, **station affichée** (nom · USI x), préférences en fond.
- **Module 5 — Algorithme de planning v1** (`planning.js`, fonction pure `genererPlanning`) :
  greedy mois entier + retour-arrière intra-jour sur les contraintes DURES (7 stations + continuité,
  nuit ≥2 dont ≥1 résident, week-end 3 TWE/2 gardes 24h, repos 12h, récup, congés/indispo, hors-contrat,
  jours_travailles). Bouton admin « Générer le mois affiché » : écrit un `schedule` draft + les `shifts`,
  rafraîchit le calendrier, et remonte les conflits non résolus. Test Node : `node test_planning.js`.
  Limites assumées : pas de backtracking inter-jours, équité encore grossière (Module 7).

## Ordre de développement restant
- **Module 6 — Admin : ajustements manuels + publication** ✅ FAIT
  (clic sur un shift → modale d'édition : médecin/station/type/supprimer ; bouton « + Ajouter un shift » ;
  publication draft → published avec **verrouillage lecture seule** + « repasser en brouillon » ;
  avertissement **non bloquant** sur violation de contrainte (compare conflits avant/après) ;
  panneau compteurs heures/gardes/week-ends par médecin ; liste des conflits via `validerPlanning` ;
  **absences posables** récup/off/congés ; **vue Grille postes × jours** cliquable en plus du calendrier embelli.
  Fonctions pures ajoutées : `validerPlanning`, `compterParMedecin` dans `planning.js`. Test : `node test_planning.js`.)
- Module 7 — Algorithme v2 (optimisation de l'équité trimestrielle) ← PROCHAIN
  + idées : génération auto des récup/off ; édition directe en grille déjà possible.
- Module 8 (rappel) — quotas serveur (trigger SQL), export PDF, emails ; **garde-fou : les congés posés comme
  shifts ne décomptent pas les quotas — à arbitrer (les router vers `preferences` ou ajouter un contrôle).**
- Module 8 — Polish : export PDF, **emails (« mot de passe oublié » côté client via
  `resetPasswordForEmail`, + invitations à la création de compte via Edge Function service_role)**,
  trigger SQL serveur pour les quotas de congés

## Style d'interaction attendu
- Pose-moi des questions de clarification avant de coder si une règle est ambiguë.
- Donne-moi le SQL à lancer dans le SQL Editor quand un module touche la base (et sauve-le dans `sql/`).
- Donne-moi les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.
- Note technique : dans cet environnement, le contrôle de syntaxe via `node` dans le shell peut afficher
  des versions tronquées des fichiers (retard de synchronisation du montage) ; la version écrite par les
  outils de fichiers est la bonne. Pour vérifier, relire le fichier via l'outil de lecture.

**Commence par lire les fichiers existants (dont `planning.js`, `regles.js` et `sql/`), confirme-moi
que tu as bien le contexte, puis attaque le Module 6.**

### Question ouverte pour démarrer le Module 6
Pour les ajustements manuels, préfères-tu (a) du **glisser-déposer** des shifts dans FullCalendar
(plus fluide mais plus de code), ou (b) un **clic sur un shift → petit formulaire** (changer le médecin
ou la station, supprimer) plus simple à fiabiliser d'abord ?
