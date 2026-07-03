# Prompt de reprise — refonte HEURES / DOUBLURES / GARDES 24 h

> À coller au début d'une nouvelle session. Contexte destiné à un assistant qui reprend le projet à froid. Sois explicite, prudent, et n'engage aucun gros chantier sans me demander.

## Qui je suis / comment je travaille
- Je suis **médecin** aux soins intensifs, **pas développeur**. Explique simplement, pas de jargon inutile.
- Langue : **français**. Réponses **concises**.
- Je commite via **GitHub Desktop** (PAS de PowerShell, PAS de ligne de commande git chez moi).
- Je **teste et régénère sur MA machine** (l'app + `node test-couple.js`).

## Le projet
- App de **planning de gardes USI**. Front statique + **Supabase**. Repo `horaires-soins-intensifs` (dossier connecté).
- Moteur **« couplé, week-ends d'abord »**. Toute modif moteur se fait dans **`planning.js`** (base) et/ou **`planning-couple.js`** (couplé).
- **`test-couple.js`** fusionne les deux fichiers dans un seul scope et lance la suite de tests. **Cible = 14/14.**
- Doc des règles métier : **`REGLES_PLANNING_USI.docx`**. Réglages dans **`regles.js`** (objets `EQUITE`, `GARDES`, `OFFCLINIC`…).

## ⚠️ Contrainte importante sur le bac à sable (sandbox)
- Le sandbox sert une **copie GELÉE et souvent TRONQUÉE** du dépôt → `node --check`/`node test-couple.js` sur le chemin monté peut donner de **fausses erreurs de syntaxe** (fichier coupé en fin).
- **Méthode fiable pour valider dans le sandbox** : reconstruire les fichiers à partir de la version committée puis ré-appliquer les modifs, p.ex.
  ```bash
  cd <repo_monté>; mkdir -p /tmp/v
  for f in planning.js planning-couple.js regles.js test-couple.js; do git show HEAD:$f > /tmp/v/$f; done
  # (ré-appliquer les edits dans /tmp/v, puis :)
  cd /tmp/v && node --check planning.js && node --check planning-couple.js && node test-couple.js
  ```
- On peut aussi écrire un petit harnais qui appelle `genererTrimestreCouple({annee, trimestre, medecins, preferences:[]})` avec une équipe factice (≈6 résidents + 8 A/S plein temps + 1 résident 0.5) pour mesurer heures/24 h/doublures.

## Ce qui a été fait à la DERNIÈRE session (refonte heures/doublures — À COMMITTER + retester)
Objectif : **« tout le monde travaille le moins possible »**, doublures = exception, **respect ABSOLU du ratio ETP** (un 0.5 fait **au moins la moitié** d'un plein temps).

1. **Plancher 40 h/sem supprimé comme moteur de doublures.** `EQUITE.minimum_hebdo_h` (=40) ne sert plus qu'à créditer les congés et de garde-fou aux transferts. Plus de remplissage systématique.
2. **Nouvelle fonction `plDoubluresCiblees`** (remplace `plCompleterMinimumHeures`), appelée en TOUTE FIN de génération, **après** le rééquilibrage par transfert :
   - **PASS 1 — plancher ETP des mi-temps, par MOIS** (toujours actif) : un 0.5 doit atteindre `fte × médiane des pleins temps du mois`. Le **plafond hebdo est relâché** ici (les gardes, non proratisées, l'empêchaient sinon d'atteindre la moitié).
   - **PASS 2 — gros déficit relatif des pleins temps, sur le trimestre** (rare) : cible = médiane − `doublure_deficit_journees × 10,5 h`. Désactivable via `doublure_deficit_journees: 0` (n'affecte PAS la PASS 1).
   - Placement : priorité **continuité** (unité déjà tenue la semaine), jamais sur une unité **fragmentée** (≥ `continuite_max_tetes`).
   - Nouveaux réglages `EQUITE` : `doublure_deficit_journees: 1`, `continuite_max_tetes: 3`.
3. **Alerte continuité** : conflit signalé si une unité a **> 3 médecins différents** dans la semaine.
4. **Gardes 24 h de semaine « de remplissage » désactivées** (cause : elles faisaient travailler 24 h des médecins sous-chargés alors que d'autres étaient libres) :
   - `regles.js` : `GARDES.promotion_24h_deficit_h: 0` (moteur de base) et **`GARDES.promotion_24h_souscharge: false`** (moteur couplé, PHASE 2b désormais derrière ce flag).
   - La couverture **7/7 reste garantie** : la phase de jour remplit d'abord avec les gens libres ; une 24 h n'est créée qu'en **dernier recours** si une station resterait vide.

**Résultats mesurés (simulation, sandbox reconstruit) :** 14/14 tests ✅ · gardes 24 h forcées en semaine **7 → 0** · couverture 7/7 intacte · **écart d'heures TRIMESTRE = 12 h** (équilibre trimestriel, ma priorité) · mi-temps à **52 %** d'un plein temps · **5 doublures / trimestre** seulement.

## État / points ouverts
- **À faire de mon côté** : committer ces modifs (GitHub Desktop) puis **régénérer + `node test-couple.js`** sur ma machine et vérifier visuellement.
- **Disparité MENSUELLE (~55 h d'écart max)** : c'est **voulu/assumé** — le moteur équilibre sur le **trimestre** (12 h), pas le mois ; les gens font un mois chargé puis léger. J'ai choisi de **prioriser le trimestre**. Levier si je change d'avis : dans `plEquilibrerHeuresMois` (planning-couple.js), la variable `plafondTrim` limite la dérive trimestre autorisée pour resserrer le mois — tolérance 18 h → mois ~42 h / trimestre 18 h (à ne toucher que si je le demande).
- Réglages réversibles si besoin : `promotion_24h_souscharge: true` ou `promotion_24h_deficit_h: 9` pour retrouver l'ancien comportement 24 h.

## Historique utile (sessions précédentes)
- Congrès (équipe minimale, ≤2 stations vides, 0 doublure) + compteur congrès séparé.
- Congé maladie : assistant manuel (onglet dédié) — migration `sql/module34_cm_remplacements.sql` à lancer dans Supabase.
- Onglet **Doublures** (repositionnement manuel, classement par charge, impact heures live).
- Onboarding sans e-mail (bouton « Créer », mot de passe temporaire) — **Edge Function `inviter-medecin/index.ts` à REDÉPLOYER** dans Supabase (copier-coller, pas de CLI).
- E-mail Hotmail KO (DKIM `hubruxelles.be` non authentifié dans Brevo) — je n'achèterai pas de domaine.

## Règles de conduite pour l'assistant
- **N'engage pas de gros chantier sans me demander.** Propose un plan simple, puis attends mon feu vert.
- Après une modif moteur, **valide dans le sandbox** (méthode « reconstruire depuis git HEAD » ci-dessus) et **prévois que je relance `node test-couple.js`** chez moi ; préviens-moi si des tests risquent de bouger.

