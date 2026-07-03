# horaires-soins-intensifs

Application de génération des horaires de l'unité de soins intensifs (gardes, stations,
tours, week-ends, récups), avec back-end Supabase.

<!-- Dernière mise à jour : 2026-07-03 -->

## Structure

| Fichier / dossier | Rôle |
|---|---|
| `index.html`, `app.js`, `style.css` | Interface de l'application |
| `regles.js` | Règles métier de base (fériés BE, etc.) |
| `planning.js` | Moteur de génération (base + fonctions communes) |
| `planning-couple.js` | Moteur « couplé, week-ends d'abord » (`genererTrimestreCouple`) |
| `mesure.html` | Page de diagnostic (équipe factice) — validation dans le navigateur |
| `test-couple.js` | Tests Node du moteur couplé (référence ; non lancés en local) |
| `sql/` | Migrations Supabase |
| `supabase/functions/` | Edge functions |
| `google-apps-script/` | Export Google Sheets |

## Documentation

- **`SPECIFICATIONS.md`** — spécification métier (grades, contrats, couverture, règles dures).
- **`PROMPT_REPRISE_MOTEUR_COUPLE.md`** — architecture & algorithme du moteur couplé (doc de reprise).
- **`PROMPT_REPRISE_HEURES_DOUBLURES.md`** — prompt de reprise de session (état courant du moteur).
- **`GUIDE_AUTH.md`** — mise en place de l'authentification Supabase.

## Validation

La validation se fait dans le **navigateur** via `mesure.html` (site déployé) :
simulation avec équipe factice, doublures et motifs, écarts d'heures mois/trimestre.
La suite Node `test-couple.js` (cible 14/14) existe comme référence mais n'est pas
lancée en local.
