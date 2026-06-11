# Prompt de reprise — Application Planning Soins Intensifs (v7)

> Copie-colle tout ce qui suit dans une nouvelle session Cowork, avec le dossier
> du dépôt GitHub connecté. Reprise après le lot « désidératas (priorités +
> quota), récup férié (Module 18), alertes absences simultanées §14,
> pré-placement manuel (Module 19) et rotation trimestrielle des unités
> (Module 20) ». **Prochain objectif : le durcissement (sécurité serveur).**

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
- `regles.js` (config : `EQUITE`, `COUVERTURE`, quotas, fériés, `PREF_BLOQUANTES`),
  `planning.js` (algorithme pur, testable sous Node), `index.html`, `app.js`,
  `style.css`, `sql/`, `supabase/functions/`.

Ne réécris pas ce qui existe, étends-le.

## ⚠️ À VÉRIFIER EN PREMIER
`git pull` puis **`node test_planning.js`** en local : **48/48 tests au vert**
(contraintes dures, équité INTRA-grade, off-clinic, souhaits, congrès &
fermetures, désidératas, récup férié, alertes §14, pré-placements, rotation).
Si un test échoue, on corrige ça d'abord.

## Architecture
- Frontend : HTML/CSS/JavaScript **vanilla** (pas de framework).
  `index.html`, `app.js`, `style.css`, `regles.js`, `planning.js`.
- **UI par ONGLETS** : en-tête d'app + onglets Planning / Demandes (pastille de
  comptage) / Congrès & fermetures / Médecins (admin) ; Mes préférences (médecin).
  `basculerOnglet()` dans app.js ; `calendrier.updateSize()` au retour sur Planning.
  Palette **sarcelle** centralisée dans `:root` de style.css.
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
`module16_supprimer_grade_specialiste.sql`, `module17_periodes_speciales.sql`,
**`module18_recup_ferie.sql`** (type `recup_ferie`),
**`module19_preplacement.sql`** (colonne `shifts.epingle`),
**`module20_rotation_unites.sql`** (colonne `doctors.unite_reference`).
Tous idempotents.

## Modèle de données (à jour)
- `doctors` : id, name, email, role 'admin'|'doctor', grade
  'resident'|'assistant_specialiste', fte, weekly_hours_target, quotas congés,
  jours_travailles int[], statut 'dependant'|'independant', conges_100pct bool,
  **admin_level 'aucun'|'secondaire'|'principal'** (priorité désidératas),
  contract_periods jsonb, **unite_reference text** (station « maison » du
  trimestre, M20).
- `preferences` : id, doctor_id, start_date, end_date, pref_type, note, status, decided_at.
  pref_type ∈ {conge_*, indispo, souhait, off_clinic, recuperation, formation,
  autre, demande_weekend, **recup_ferie**, dispo}.
- `schedules` : year, month, status 'draft'|'published', published_at.
- `shifts` : date, shift_type, doctor_id, schedule_id, poste, **epingle bool** (M19).
  shift_type ∈ {jour, twe, garde_nuit, garde_24h} + absences/repos
  {repos_garde, recup, off, conge_annuel, conge_scientifique, conge_extralegal}.
- `special_periods` (M17) : type 'congres'|'fermeture', label, unite, start_date, end_date.

## Concepts clés
- **Deux grades** : Résident et A/S. Règles dures « jamais 2 A/S en garde » +
  « ≥1 résident chaque nuit ». Équité = **INTRA-grade** (écart inter-grade STRUCTUREL).
- **Deux repos** : `repos_garde` (auto, affiché, NON comptabilisé) vs `recup`
  (manuel, comptabilisé, **bien visible** au calendrier/grille — Pt 5).
- **Gardes ÉGALES**, équilibrées au MOIS ; **week-ends** au TRIMESTRE (week-ends
  DISTINCTS). **Couplage souple** (Pt 6) : à équité égale, la garde de nuit de
  l'avant-veille reprend la 24 h du week-end (jeu→sam, ven→dim) → repos couplé.
- **Souhait/désidérata** : quasi-bloquant indépendants, souple dépendants.
  **Priorité** (Pt 3a) : à souhait égal, **admin principal > secondaire >
  travailleur** (départage, n'écrase pas l'équité). **Quota 20/trimestre civil
  INDICATIF** (non bloquant) affiché côté médecin.
- **Récup férié** (M18) : férié TRAVAILLÉ = 1 jour compensatoire, à poser **dans
  les 6 semaines** (alerte non bloquante hors fenêtre), validé par l'admin
  (demande `recup_ferie`, bloquante une fois approuvée). Pas d'auto-crédit.
- **Congrès / fermetures** (M17) : voir code. Congrès = 2 stations vides tolérées
  en semaine ; fermeture = unité ni pourvue ni exigée.
- **Alertes absences simultanées** (§14) : `alertesAbsences()` — par jour,
  4–5 = attention (🟠), 6+ = critique (🔴), + alerte si aucun résident dispo la
  nuit. Informatif, affiché à part dans la zone conflits.
- **Pré-placement manuel** (M19) : l'admin coche « 📌 Épingler » un shift ; les
  épinglés sont CONSERVÉS et RESPECTÉS à la (re)génération (`prePlaces`), l'algo
  construit autour (stations + gardes + tour + absences). 📌 dans la grille.
- **Rotation trimestrielle** (M20) : `doctors.unite_reference` = station maison du
  trimestre, base de la continuité hebdo. UI admin « Proposer une rotation »
  (unité précédente dérivée des shifts, proposition éditable évitant l'unité
  précédente) → enregistre `unite_reference`.
- **Exports Excel** : noms de famille, titre fusionné/semaine, volets figés,
  en-têtes semaine/WE/congrès, impression paysage. (Inchangés ce lot.)

## Déjà réalisé
- **M1–M12** : auth, CRUD médecins, préférences/congés (année académique),
  calendrier, génération mensuelle + trimestrielle, équité fine intra-grade,
  split `repos_garde`, off-clinic auto, workflow de validation, concentration
  des gardes de nuit, souhaits effectifs, congé accepté → cible réduite.
- **M17** congrès & fermetures. **Refonte graphique** (onglets, sarcelle).
- **Exports Excel** mois + trimestre + récap individuel.
- **Auth complète** (invitation, reset, SMTP Brevo). Voir `GUIDE_AUTH.md`.
- **Pt 5** récup visible · **Pt 6** couplage souple des gardes.
- **Pt 3a** désidératas (priorités admin_level + quota indicatif).
- **M18** récup férié · **§14** alertes absences simultanées.
- **M19** pré-placement épinglé respecté · **M20** rotation trimestrielle.
- **Tests** : `node test_planning.js` → **48/48**.

## Reste à faire (priorité)
1. **🎯 Durcissement / sécurité serveur** (le prochain objectif) :
   - **Triggers SQL** pour les quotas de congés **côté serveur** (aujourd'hui le
     contrôle est seulement côté `app.js`) : refuser/limiter une demande qui
     dépasse le quota annuel (année ACADÉMIQUE 1 oct → 30 sep), par catégorie
     (annuel / extra-légal / scientifique).
   - **Empêcher l'auto-approbation** : un travailleur ne doit PAS pouvoir passer
     ses propres demandes en `status = 'approuve'` (trigger ou policy RLS dédiée ;
     seul un admin valide). Voir la note dans `module10_workflow.sql`.
   - Donner le SQL idempotent dans `sql/` (ex. `module21_durcissement.sql`) et
     les instructions de test (tenter une demande hors quota / une auto-approbation
     → refus serveur).
2. Off-clinic : retirer d'abord à ceux qui ont déjà des congés (hiérarchie N3/N4).
3. Divers raffinements N3/N4 (cf. CONFORMITE.md) : « si 3 gardes/sem → préférer
   17h–9h », résident en 17h–9h sauf équité, etc.

## Points ouverts
- **Écart inter-grade gardes/week-ends** : STRUCTUREL et attendu (équité mesurée
  intra-grade ; documenté dans FEUILLE_DE_ROUTE).
- **Délivrabilité email** : ajouter les enregistrements **DKIM + SPF de Brevo**
  au domaine `hubruxelles.be` (IT HUB).
- **Couplage des gardes** : choisi en mode SOUPLE (préserve l'écart A/S ≤ 2). On
  peut le durcir si tu acceptes un écart de gardes A/S = 3.
- **Priorité désidératas** : implémentée comme départage entre souhaiteurs (ne
  bat pas l'équité). À renforcer si tu veux que le principal batte l'équité.

## Note technique (environnement Cowork) — IMPORTANT
Le **montage du dépôt dans le shell est souvent périmé/tronqué** pour les
fichiers ÉDITÉS (les fichiers NEUFS se propagent). **La version écrite par les
outils de fichiers fait foi.** Deux parades éprouvées :
1. Si je viens de committer : `git show HEAD:fichier.js` dans le shell donne la
   bonne version → `node --check` et tests dessus.
2. Sinon : reconstruire une copie fraîche (HEAD + patchs rejoués par script
   Python) sous /tmp, et tester celle-là. (Pour vérifier `app.js`/`planning.js`
   après édition, rejouer les remplacements sur la copie HEAD puis `node --check`.)
**En local, `node test_planning.js` après `git pull` est la validation de
référence (48/48 attendus).** Pour l'Excel : ExcelJS s'installe sous Node.

## Style d'interaction attendu
- Pose des questions de clarification avant de coder si une règle est ambiguë.
- Donne le SQL à lancer quand un module touche la base (et sauve-le dans `sql/`).
- Donne les instructions de test à la fin de chaque module.
- Réponds en français, de façon concise et directe.

**Commence par lire `FEUILLE_DE_ROUTE.md`, `planning.js`, `regles.js` et mes
annotations, fais tourner `node test_planning.js` (48/48 attendus), puis attaque
le 🎯 Durcissement (triggers SQL quotas + anti-auto-approbation) — en me posant
les questions de cadrage avant d'écrire le SQL.**
