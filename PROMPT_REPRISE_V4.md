# Prompt de reprise — Application Planning Soins Intensifs (v4)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Reprise après le lot « révision des règles + auth ».

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
- `Regles_planning_a_reviser.docx` — **règles telles que codées + mes annotations** (révision).
- `regles.js` (config, dont `EQUITE`), `planning.js` (algorithme pur, testable
  sous Node), `index.html`, `app.js`, `style.css`, `sql/`, `supabase/functions/`.

Ne réécris pas ce qui existe, étends-le.

## ⚠️ À VÉRIFIER EN PREMIER
Le dernier changement (**équité : gardes ÉGALES pour tous, sans pondération FTE,
+ équilibrage au MOIS**) est **codé dans `planning.js` et `test_planning.js`
mais PAS encore testé**. Avant tout : `git pull` puis **`node test_planning.js`**
en local. Si des tests échouent, on corrige ça d'abord.

## Architecture
- Frontend : HTML/CSS/JavaScript **vanilla** (pas de framework).
  `index.html`, `app.js`, `style.css`, `regles.js`, `planning.js`.
- Backend : **Supabase** (Auth + PostgreSQL), tier gratuit.
- Calendrier : **FullCalendar v6** (CDN). Export : **ExcelJS** (CDN).
- **Auth par email** : invitation admin via Edge Function `inviter-medecin`,
  emails envoyés via **Brevo (SMTP)**. Verify JWT **désactivé** sur la fonction.
- Algorithme de planning : JavaScript pur côté client (`planning.js`).
- Commentaires en français dans le code.

## Connexion Supabase (déjà dans app.js)
- Project URL : `https://rmkpuzmqwghzdtsuqgpq.supabase.co`
- anon key : déjà configurée dans `app.js`.

## SQL à exécuter (dans l'ordre, SQL Editor Supabase)
`module2_quota_conges.sql`, `module4_rls.sql`, `module5_planning.sql`,
`module6_planning_admin.sql`, `module6_absences.sql`, `module9_personnel.sql`,
`module10_workflow.sql`, `module15_repos_garde.sql`.

## Modèle de données (à jour)
- `doctors` : id, name, email, role 'admin'|'doctor', grade 'resident'|'assistant_specialiste'|'specialiste',
  fte, weekly_hours_target, quotas congés, jours_travailles int[],
  statut 'dependant'|'independant', conges_100pct bool, admin_level, contract_periods jsonb.
- `preferences` : id, doctor_id, start_date, end_date, pref_type, note, status, decided_at.
- `schedules` : year, month, status 'draft'|'published', published_at.
- `shifts` : date, shift_type, doctor_id, schedule_id, poste.
  shift_type ∈ {jour, twe, garde_nuit, garde_24h} + absences/repos
  {repos_garde, recup, off, conge_annuel, conge_scientifique, conge_extralegal}.

## Concepts clés
- **Deux repos distincts** : `repos_garde` (auto post-garde, affiché, NON
  comptabilisé) vs `recup` (manuel, comptabilisé).
- **Gardes ÉGALES pour tous** (le FTE ne réduit plus les gardes ; seul le quota
  d'heures s'y adapte), **équilibrées au MOIS**.

## Déjà réalisé
- **M1–M12** : auth, CRUD médecins, préférences/congés, calendrier, génération
  mensuelle + trimestrielle, équité fine (plafond 60 h, plancher, ±1 garde,
  repos compensatoires couplés), split `repos_garde`.
- **M9** personnel · **M10** workflow validation · **M11** off-clinic auto.
- **M12c** : concentration des gardes de nuit de semaine (départage à déficit égal).
- **Exports Excel** : planning mois + **planning trimestre** (1 onglet/semaine),
  Labo « Fermé » le week-end, 1 ligne vide par unité, récap individuel.
  (Bug « lignes écrasées » corrigé ; prénoms courts avec désambiguïsation.)
- **Compteurs du mois** : colonne « # », total, **tri par colonne**.
- **Auth complète** : invitation admin (Edge Function + bouton « Inviter »),
  « mot de passe oublié », page « définir le mot de passe ». SMTP Brevo OK.
  Voir `GUIDE_AUTH.md`.
- **Équité gardes égales + mensuel** : codé, **à TESTER** (voir ci-dessus).

## Reste à faire (issu de mes annotations sur `Regles_planning_a_reviser.docx`)
1. **Supprimer le grade « Spécialiste »** : ne garder que Résident et A/S ;
   basculer les médecins existants en A/S (touche aussi la base / l'UI / les
   règles de garde « jamais 2 A/S »).
2. **Quotas de congés en année académique (oct→oct)** : comptage et remise à
   zéro du 1er octobre au 30 septembre (au lieu de l'année civile).
3. **Congé accepté → diminue la cible horaire du mois** (compteurs).
4. **Souhait des médecins indépendants = priorité** (quasi-bloquant). NB : un
   indépendant n'a déjà pas droit aux off-clinic (OK).
5. **`recup` bien visible au planning** pour voir qui est dispo/indispo.
6. **🐞 Couplage des gardes** : les repos compensatoires couplés (jeudi+samedi →
   lundi ; vendredi+dimanche → mardi) ne se déclenchent pas car la génération
   ne **couple pas assez** les gardes d'un même week-end. À améliorer.

## Reste à faire (feuille de route, après les points ci-dessus)
7. Récup férié auto-crédit (§8.2) + désidératas (quota 20/trimestre + priorités admin).
8. Congrès ISICEM/ISICARE + fermetures d'unités (couverture adaptée).
9. Rotation trimestrielle des unités (historique tracé).
10. Alertes absences simultanées (§14) + pré-placement manuel.
11. Durcissement : triggers SQL quotas serveur ; empêcher l'auto-approbation.

## Points ouverts
- **Tests de référence** : les assertions « écart ≤ 2 » (gardes/week-ends) ne
  tiennent pas — déséquilibre **structurel** résident/A/S (un résident est
  obligatoire chaque nuit). À recalibrer ou à traiter sur le fond.
- **Délivrabilité email** : pour sortir des spams, faire ajouter les
  enregistrements **DKIM + SPF de Brevo** au domaine `hubruxelles.be` (IT HUB).

## Note technique (environnement Cowork)
Le **montage du dépôt dans le shell est souvent périmé/tronqué** pour les fichiers
ÉDITÉS (les fichiers NEUFS, eux, se propagent). **La version écrite par les outils
de fichiers fait foi.** Pour tester l'algorithme sous Node malgré ça : écrire une
copie fraîche sous un nouveau nom, puis la lancer. **En local, `node test_planning.js`
après `git pull` est la validation de référence.**

## Style d'interaction attendu
- Pose des questions de clarification avant de coder si une règle est ambiguë.
- Donne le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Donne les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.

**Commence par lire `FEUILLE_DE_ROUTE.md`, `planning.js`, `regles.js` et les
annotations de `Regles_planning_a_reviser.docx`, fais tourner `node test_planning.js`
pour valider l'équité (gardes égales + mensuel), puis attaque le point 1
(suppression du grade Spécialiste) — en me donnant le SQL et les tests.**
