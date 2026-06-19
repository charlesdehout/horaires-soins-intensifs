# horaires-soins-intensifs

Application de génération des horaires de l'unité de soins intensifs (gardes, stations,
tours, week-ends, récups), avec back-end Supabase.

## Structure

| Fichier / dossier | Rôle |
|---|---|
| `index.html`, `app.js`, `style.css` | Interface de l'application |
| `regles.js` | Règles métier de base (fériés BE, etc.) |
| `planning.js` | Moteur de génération (base + fonctions communes) |
| `planning-couple.js` | Moteur « couplé, week-ends d'abord » (`genererTrimestreCouple`) |
| `test-couple.js` | Tests Node du moteur couplé — `node test-couple.js` |
| `test_planning.js` | Tests Node du moteur de base |
| `sql/` | Migrations Supabase |
| `supabase/functions/` | Edge functions |
| `google-apps-script/` | Export Google Sheets |

## Documentation

- **`SPECIFICATIONS.md`** — spécification métier (grades, contrats, couverture, règles dures).
- **`PROMPT_REPRISE_MOTEUR_COUPLE.md`** — architecture & algorithme du moteur couplé (doc de reprise).
- **`GUIDE_AUTH.md`** — mise en place de l'authentification Supabase.

## Tests

```bash
node test-couple.js     # moteur couplé (cible 12/12)
node test_planning.js   # moteur de base
```
