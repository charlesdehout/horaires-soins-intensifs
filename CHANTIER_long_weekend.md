# Chantier — Long week-end & refonte de la sélection week-end (gardes)

> Document de spécification et de plan. À valider AVANT toute modification de `planning.js`.
> Objectif : remplacer le **couplage jeudi→samedi** par une logique de **long week-end**,
> sans casser les équilibres existants. C'est une **réécriture de la sélection week-end**,
> pas un patch.

---

## 1. Règles cibles (validées)

1. **Décorrélation jeudi/samedi.** On ne force plus le médecin de la garde de nuit du
   jeudi à reprendre la garde 24 h du samedi (et vendredi→dimanche).
2. **Long week-end.** Faire une garde le **jeudi** libère le **week-end de la même
   semaine** : on évite de mettre cette personne en garde 24 h ou au tour le samedi/dimanche
   de cette semaine. Préférence **forte**, avec **repli** si la couverture l'exige
   (le long week-end est « accordé quand c'est possible », jamais au prix d'un trou).
3. **Équilibre jeudi/samedi (souple).** Le jeudi étant un avantage (long week-end),
   on **vise à égaliser**, par personne et sur le trimestre, le nombre de gardes de
   **jeudi** et le nombre de gardes de **samedi** (préférence d'équité, pas d'interdiction
   dure). On ne doit pas pouvoir accumuler les longs week-ends sans assurer sa part de samedis.
4. **Récup flexible.** Chaque garde 24 h de week-end ouvre droit à une **journée de
   récup la semaine suivante**, **placée souplement** (sur un jour où la couverture le
   permet), et **matérialisée + étiquetée** : « récup (samedi) » ou « récup (V/D) ».

---

## 2. Comportements actuels à PRÉSERVER (non négociables)

Le couplage actuel n'est pas qu'un confort : il porte plusieurs garanties. La refonte
devra les reconstruire explicitement. Tests verts à conserver :

- **Couverture week-end** : 2 gardes 24 h (≥ 1 résident, jamais 2 A/S) + tour, toujours pourvus.
- **Filet de couverture** : si le vivier « équitable » est épuisé, on autorise un
  dépassement de plafond souple plutôt que de laisser une garde vide. *(Aujourd'hui assuré
  par `garderFavoris(coupleId)` — à remplacer par un filet générique.)*
- **Équité week-ends** : A/S ≤ 2 week-ends/mois (N2), résidents dispersion bornée.
- **Mi-temps** : gardes/week-ends proratisés au FTE (Lorenzo 0,5).
- **Plancher 40 h/sem** proratisé, doublures si besoin.
- **Écart d'heures ≤ 12 h** (trimestre, pleine dispo) — *sera impacté par la récup ;
  seuil à réévaluer explicitement.*
- **Fériés** (M26), **plafonds de station mi-temps**, **continuité de rotation**.

---

## 3. Ce qui CHANGE et pourquoi c'est délicat

| Pièce actuelle | Rôle caché | Remplacement nécessaire |
|---|---|---|
| Couplage jeudi→samedi (`coupleId`, `garderFavoris`) | Filet de couverture (dépassement plafond), minimisation des week-ends | Filet de couverture **générique** + nouvelle préférence « long week-end » |
| Repos couplé lundi/mardi (`materialiserReposCouples`) | Récup des combos | **Récup flexible** matérialisée la semaine suivante |
| `plScoreGarde` / `nbGardes` (équité par nombre) | Équité gardes | + **compteurs séparés jeudi / samedi** pour l'équilibre J/S |

Le risque principal : retirer le couplage déséquilibre la **couverture** et les **heures**
(constaté : 8 tests cassés en patch). D'où une refonte par couches, testée à chaque étape.

---

## 4. Architecture proposée

### 4.1 Sélection week-end en COUCHES (remplace le couplage)
Pour chaque garde/tour de week-end, choisir dans cet ordre, en s'arrêtant à la 1ʳᵉ couche non vide :
1. **Vivier idéal** : disponibles, sous plafond, **hors médecins de garde du jeudi de la semaine** (long week-end), triés par équité (week-ends, puis jeudi/samedi, puis heures).
2. **Repli 1** : on ré-autorise les médecins de garde du jeudi (long week-end sacrifié cette semaine).
3. **Repli 2 (filet)** : on autorise un dépassement de plafond souple.
4. Sinon seulement : **conflit** signalé.

→ Le « long week-end » devient une **couche de préférence**, pas un filtre dur : zéro trou.

### 4.2 Équilibre jeudi/samedi
- Nouveaux compteurs `nbJeudi[id]`, `nbSamedi[id]` (gardes de nuit du jeudi / gardes 24 h du samedi), cumulés sur le trimestre.
- Biais de sélection **souple** : à équité de gardes égale, préférer pour le **jeudi** ceux dont `nbJeudi ≤ nbSamedi` (et inversement pour le samedi). Tiebreak, jamais bloquant.

### 4.3 Récup flexible (matérialisée + étiquetée)
- À chaque garde 24 h de week-end, mémoriser une **dette de récup** (date d'origine + type sam / V-D).
- **Passe post-génération** : pour chaque dette, poser un shift `recup` sur un jour **ouvré de la semaine suivante** où la personne n'est pas indispensable (jour où elle serait sinon « non planifiée », ou station transférable sans casser la couverture/continuité). Étiquette : « récup (samedi) » / « récup (V/D) ».
- Si aucun jour ne convient (couverture tendue toute la semaine) : récup non posée + note (pas de conflit dur).

---

## 5. Tests — à remplacer / ajouter

**À RETIRER ou REMPLACER** (encodent l'ancienne philosophie de couplage) :
- « combos MAXIMISÉS : la majorité des 24 h de week-end couplées jeudi/sam, ven/dim »
- « consolidation : la majorité des 24 h du dimanche tenues par une garde du vendredi »

**À AJOUTER** :
- Long week-end : un médecin de garde le jeudi n'est **pas** en garde/tour le week-end de la même semaine **quand un autre candidat existe** (sinon repli sans conflit).
- Filet : aucune garde de week-end laissée vide même vivier réduit (0 conflit de couverture sur équipe pleine).
- Équilibre jeudi/samedi : sur un trimestre pleine dispo, `|nbJeudi − nbSamedi| ≤ 2` par personne.
- Récup flexible : chaque garde 24 h de week-end génère ≤ 1 récup la semaine suivante, étiquetée, sans créer de trou de couverture.

**À CONSERVER VERTS** : tous les autres (couverture, équité week-ends, mi-temps, plancher,
fériés, continuité rotation). Le seuil « écart heures ≤ 12 h » sera **réévalué** (la récup
le déplace légitimement) — valeur cible à fixer avec toi.

---

## 6. Plan d'implémentation (par étapes, testé à chaque fois)

1. **Filet de couverture générique** (remplacer `garderFavoris(coupleId)` par un repli sur
   dépassement plafond) — vérifier 107/107 **sans** décorréler encore. *(Pré-requis : permet
   ensuite de retirer le couplage sans trous.)*
2. **Décorrélation** (retirer le biais `coupleId`) + remplacer les 2 tests de couplage. Vérifier.
3. **Long week-end** (couche de préférence § 4.1) + test dédié. Vérifier.
4. **Compteurs + équilibre jeudi/samedi** (§ 4.2) + test. Vérifier.
5. **Récup flexible matérialisée + étiquetée** (§ 4.3) + test + affichage vue semaine. Vérifier.
6. Réévaluer le seuil « écart heures » et figer la valeur. Mesure finale (mensuel/trimestre).

À chaque étape : `node test_planning.js` doit rester vert (hors tests volontairement remplacés),
et on mesure l'impact (écart heures, MOY H/SEM, conflits, longs week-ends accordés).

---

## 6 bis. Journal d'avancement

- **Étape 1 — FAITE ✅ (committée, 107/107).** Filet de couverture générique ajouté
  dans `garderFavoris` (`planning.js`) : si le vivier filtré est vide → on autorise la
  source complète (dépassement plafond souple). Purement additif, aucun test impacté.
- **Étape 2 — BLOQUÉE ⛔ (annulée, retour 107/107).** La décorrélation (retrait du biais
  `coupleId` + filet du tour) casse **6 tests** : les 2 attendus (combos, consolidation)
  **+ 4 tests d'ÉQUITÉ non liés** : « équité gardes résidents ≤ 2 », « mi-temps proratisé »,
  « nouvel engagé », « plancher 40 h ». 
  **Conclusion :** le couplage n'est pas qu'un filet de couverture — il est **tissé dans la
  machinerie d'équité des gardes**. Le retirer casse l'équité intra-grade, la proration
  mi-temps, la gestion nouvel-engagé et le plancher horaire. La décorrélation **n'est pas
  un patch** : elle exige de **re-dériver le modèle d'équité des gardes** sans le couplage
  (comprendre pourquoi chacun de ces 4 comportements dépend du couplage, puis le reconstruire).
  C'est un sous-chantier d'investigation à part entière.

**Recommandation :** garder l'Étape 1 (gain de robustesse réel et stable). Reprendre la
décorrélation seulement avec un temps dédié à l'analyse de l'équité des gardes (Étape 2 = mini-projet).

## 6 ter. Investigation Étape 2 (bac à sable, preuves)

Détail des casses sous décorrélation (trimestre pleine dispo), mesuré en sandbox :
- **Équité gardes résidents** : écart 3 (16,16,15,18,16,16) au lieu de ≤ 2.
- **Mi-temps** (Lorenzo) : 8 week-ends > moyenne 7 (devrait être réduit par le FTE).
- **Nouvel engagé** : 9 jours de doublure au lieu de 10.
- **Plancher 40 h** : un A/S à 25,5 h une semaine avec des jours libres non comblés.

**Cause racine confirmée** : les gardes de **week-end** sont réparties par équité
**week-end** (`nbWeekend`), pas par **nombre de gardes** — le couplage servait de
garde-fou qui alignait par hasard l'équité des gardes. 

**Tentative de correctif** (départage par nombre de gardes dans la sélection week-end) :
→ corrige résidents + mi-temps, mais **déplace le déséquilibre sur les A/S** (écart 3) et
casse les fériés. **Whack-a-mole** : chaque retouche de départage déplace le problème.

**Verdict** : la décorrélation **ne se règle pas par tiebreaks**. Il faut un mécanisme
d'équité des gardes **principielle** :

### Solution proposée pour l'Étape 2 (à implémenter en session dédiée)
Une **passe post-génération de rééquilibrage des gardes** (analogue à `plEquilibrerTours`,
mais pour les gardes 24 h de week-end) :
- Égalise le **nombre de gardes** par personne **intra-grade** (résident/résident, A/S/A/S),
  en respectant : ≥ 1 résident/nuit, jamais 2 A/S, proration mi-temps (poidsWeekend),
  nouvel-engagé exclu, plafonds.
- Déplace une garde 24 h d'un sur-chargé vers un sous-chargé **libre ce week-end**, en
  transférant aussi le repos associé (lendemain) — d'où la complexité (vs les tours qui
  n'ont pas de repos).
- Garde-fou « ne pas créer de trou » comme la passe tours.

C'est un vrai morceau d'algo (gestion des repos couplés au transfert). À faire proprement
avec ses tests, après quoi la décorrélation + long week-end + équilibre jeudi/samedi
deviennent posables sur cette base saine.

## 6 quater. PERCÉE — couplage TEMPOREL (insight Dr Dehout)

**Idée clé** : ne pas *supprimer* le couplage mais le *décaler dans le temps*.
« Chaque samedi = un jeudi à un autre moment » → les MÊMES personnes font jeudis et
samedis (équité préservée), mais **pas la même semaine** (→ long week-end).

**Implémentation testée (sandbox)** :
- Compteurs cumulés `nbJeudi[id]` (garde de nuit/24h un jeudi) et `nbSamedi[id]` (garde 24h un samedi).
- Retrait du biais couplage MÊME-SEMAINE.
- Long week-end : la personne de garde le jeudi est dépriorisée pour SON week-end (départage APRÈS l'équité week-end ; repli auto via le filet de l'Étape 1).
- Couplage TEMPOREL : pour le samedi, préférer ceux qui « doivent » un samedi (`nbJeudi − nbSamedi` élevé), **entre plein-temps**.

**Résultat** : ✅ **l'équité des gardes est RÉTABLIE** (résidents ET A/S repassent ≤ 2),
là où la décorrélation totale la cassait. L'insight est validé — c'est LA bonne voie.

**Échecs restants (à résoudre avant portage)** :
1. **Mi-temps** (Lorenzo) : 8 week-ends > moyenne — la décorrélation crée plus de week-ends
   distincts et `poidsWeekend` ne proratise plus assez. *(Renforcer la proration FTE des week-ends.)*
2. **Pré-placement semaine** : station épinglée non conservée — régression à investiguer
   (probablement `etat._jeudiWE`/ordre de sélection).
3. **Nouvel engagé** : 9 jours de doublure au lieu de 10 (off-by-one).
4. **Férié** : jour de récup non matérialisé (peut être indépendant).
5. **À REMPLACER** (attendus) : « combos MAXIMISÉS », « consolidation dimanche/vendredi ».

**Reste à faire ensuite** : récup flexible visible + étiquetée, équilibre jeudi/samedi
formalisé en test, réévaluation du seuil heures, affichage vue semaine.

**Statut** : approche validée, ~4 sous-problèmes ciblés restants + portage. Le vrai moteur
est resté à **107/107** (tout en sandbox). À reprendre en session focalisée.

### 6 quinquies. Constat clé sur la fragilité en cascade (à NE PAS sous-estimer)
En sandbox, en voulant finir, chaque correction en révèle une autre plus profonde :
- Le bloc « long week-end + temporel » décale les heures → un médecin devient surchargé →
  **`plReequilibrerHeures` déplace sa station ÉPINGLÉE** (pré-placement non respecté). 
  → Fragilité latente : **le rééquilibrage horaire ne protège pas les pré-placements/épingles**.
  Fix nécessaire : marquer les shifts épinglés et les exclure des transferts du rééquilibrage.
- Idem pour « travailler un férié » : le jour de récup `conge_ferie` n'est plus matérialisé
  quand la distribution change.

**Conclusion d'ingénierie** : ce n'est pas une liste de bugs, c'est une **ré-architecture**.
Ordre de reprise recommandé (chacun isolé + testé, en sandbox d'abord) :
1. Rendre `plReequilibrerHeures` **épingle-aware** (ne jamais déplacer un shift pré-placé). *(Bug latent, utile en soi.)*
2. Renforcer la **proration FTE des week-ends** (mi-temps).
3. Corriger la matérialisation `conge_ferie` sous nouvelle distribution.
4. Off-by-one nouvel-engagé.
5. Couplage temporel (déjà validé) + remplacer les 2 tests de couplage.
6. Récup flexible visible + équilibre jeudi/samedi (test) + affichage + seuil heures.

À chaque étape : `node test_planning.js` vert (hors 2 tests remplacés). **Ne jamais porter
dans le vrai moteur tant que la sandbox n'est pas 100 % verte.**

### 6 sexies. Avancement 2026-06-18 — Étape 1 (épingle-aware) FAITE ✅
**Réalisé** : `plReequilibrerHeures` rendu **épingle-aware**. Les shifts pré-placés
(Module 19) sont désormais marqués `epingle` et **jamais déplacés** par les deux passes
de rééquilibrage horaire.
- `plAffecter(...)` accepte un param `epingle` → pose `shift.epingle = true`.
- Pose des pré-placements de SEMAINE (jour/garde) marquée épinglée.
- Les 2 boucles de transfert de `plReequilibrerHeures` ignorent `s.epingle` (`continue`).
- Le week-end ne pré-place pas de `jour` → seule la voie semaine était exposée.

**Tests** : suite portée de 107 → **108/108**. Nouveau test de régression ajouté
(« une station épinglée n'est JAMAIS déplacée par le rééquilibrage d'heures » :
on épingle un A/S sur usi3 tous les jours ouvrés du mois → surcharge volontaire ;
les 22 stations restent les siennes). Vérifié significatif : **107/108 SANS le fix**
(le test échoue, 3 stations volées), **108/108 AVEC**. Aucune régression sur les 107.

C'est un **correctif de bug indépendant** (utile hors long week-end) : le rééquilibrage
horaire respecte enfin les pré-placements de l'admin.

### 6 septies. Étape 2 (proration FTE week-ends) — INVESTIGUÉE, PAS un patch isolé
Mesure sur le moteur actuel (108/108), résident/A/S mis à temps partiel, présent tous
les jours, sur un trimestre :

| FTE | WE obtenus / moyenne plein-temps | verdict |
|---|---|---|
| 0,5 | 0,48–0,76× | ✅ prorate (fait MOINS) |
| 0,6 | 0,58–0,83× | ✅ prorate |
| 0,8 | **1,03–1,07×** | ⚠ inversion (fait PLUS) |

**Conclusions :**
1. La proration week-end **marche déjà** pour fte ≤ 0,6 (cas réel « Lorenzo » fte 0,5 :
   test vert, fait moins de week-ends). Le `poidsWeekend = dispoWE × fte` + le coût
   marginal `n/poidsWeekend` sont opérants.
2. L'écart résiduel à la cible (0,65 au lieu de 0,5) est **structurel** : ≥ 1 résident
   obligatoire par week-end pour seulement 6 résidents → plancher incompressible. Aucun
   des week-ends du mi-temps mesuré n'était dû au couplage J-2 (vérifié) → la fuite n'est
   PAS le couplage ici.
3. **Anomalie réelle mais mineure à fte≈0,8** : un mi-temps léger fait LÉGÈREMENT plus de
   week-ends que la moyenne plein-temps (≈ +0,4/trimestre). Cause : à fte élevé l'écart de
   score de proration devient assez petit pour que les départages secondaires (heures,
   couplage) le renversent. La corriger = toucher l'**ordonnancement d'équité week-end**,
   exactement la machinerie que le journal signale fragile (risque whack-a-mole A/S /
   dispersion résidents / fériés). Sur du vrai planning patient, **non justifié en isolé**.

**Verdict** : l'étape 2 « renforcer la proration FTE » n'a pas de **test d'échec isolé** sur
le moteur actuel (la proration marche), et le déséquilibre mi-temps visé n'existe **que sous
le couplage temporel** (étape 5). → **Replier l'étape 2 dans le sous-chantier étape 5**
(décorrélation + couplage temporel), où le déséquilibre apparaît et peut être corrigé +
testé pour de vrai. Ne PAS modifier la machinerie d'équité week-end en isolé.

**Roadmap révisée** : 1 ✅ (épingle-aware). 2/3/4 = **non isolables**, à traiter DANS
l'étape 5. La prochaine vraie action est l'étape 5 (couplage temporel, déjà validé en
sandbox §6 quater) menée comme un mini-projet dédié, sandbox-only jusqu'à 108/108.

> ⚠️ **Note d'environnement (session Cowork)** : le shell sandbox a servi une vue
> **tronquée** des fichiers fraîchement édités (désync du mount). Les fichiers réels sur
> disque sont corrects (édités via les outils fichier), MAIS `git` lancé depuis ce shell
> voyait la version tronquée → **commit fait depuis la machine, pas depuis la session**.
> Vérification des tests faite sur copie reconstruite fiable (base `git show HEAD:` +
> réinsertion). Penser à `node test_planning.js` en local avant de committer.

### 6 octies. Étape 5 (couplage temporel + long week-end) — IMPLÉMENTÉE, 108/108 ✅
**Insight décisif (Dr Dehout)** : la 1ʳᵉ implémentation décorrélait TOUT (jeudi→samedi
ET vendredi→dimanche) → le nombre de week-ends travaillés gonflait (résidents 34→43).
Constat juste : **le jeudi n'est PAS un week-end**, donc décorréler jeudi→samedi ne doit
RIEN changer au compte de week-ends. La hausse venait donc UNIQUEMENT de la décorrélation
vendredi→dimanche (le vendredi soir, lui, entame légitimement le week-end → ligne 958).
→ **Décorrélation CIBLÉE** : on ne casse QUE jeudi→samedi (le long week-end) et on
**conserve la consolidation vendredi→dimanche** (garde du vendredi soir reprend le dimanche
= 1 seul week-end entamé). Résultat : plus aucune inflation.

**Réalisé (porté dans `planning.js` + `test_planning.js`)** :
- **Compteurs** cumulés `nbJeudi` / `nbSamedi` (gardes jeudi nuit/24h, samedi 24h).
- **Décorrélation ciblée** : `coupleId` n'est plus alimenté que le DIMANCHE (favoris =
  gardes de nuit du vendredi, J-2) → consolidation ven→dim gardée, couple jeudi→samedi cassé.
- **Long week-end** : `etat._jeudiWE` = médecins de garde le jeudi de la semaine ;
  dépriorisés (départage APRÈS l'équité week-end) pour gardes/tour de CE week-end.
- **Couplage TEMPOREL** (samedi, entre plein-temps) : préférer qui « doit » un samedi
  (`nbJeudi − nbSamedi` élevé) → les mêmes font jeudis ET samedis, mais à des semaines
  différentes.
- **2ᵉ bug latent du rééquilibrage corrigé** (comme l'épingle) : `plReequilibrerHeures`
  ne déplace plus les **doublures** (`s.epingle || s.doublure`) → règle l'off-by-one
  nouvel-engagé.
- **Récup férié visible** : `plEmettreCongesFerie` RELABEL un `repos_garde` en `conge_ferie`
  si la récup tombe sur un jour de simple repos (avant : récup invisible, test férié cassé).
- **2 tests remplacés** : « combos MAXIMISÉS » → « long week-end : majorité des jeudis
  évitent leur week-end (≥50 %) » ; « consolidation dim/ven » → « équilibre jeudi/samedi
  |nbJeudi−nbSamedi| ≤ 2 par plein-temps ».

**Mesures (trimestre pleine dispo, 14 médecins) — 108/108** :
- Long week-end **accordé à 77 %** des jeudis de garde.
- Équilibre jeudi/samedi : **max |Δ| = 2** (plein-temps).
- Week-ends résidents : `5,5,6,7,5,5` total **33** (≈ baseline 34) → **PAS d'inflation**.
- Mi-temps fte 0,5 : ratio **0,50–0,54** (cible 0,5) → proration **rétablie** (plus fragile).
- Équité **gardes** intra-grade préservée (résidents ET A/S).

**Reste à faire (étape 6)** : récup flexible (semaine suivante d'une 24 h de week-end) visible
+ étiquetée, réévaluation du seuil « écart heures », affichage vue semaine. (La proration
mi-temps est désormais saine ; renfort seulement si un cas limite réel réapparaît.)

## 7. Risques

- Reconstruire le filet de couverture sans le couplage : si mal fait → trous de couverture.
- L'équilibre jeudi/samedi peut entrer en tension avec l'équité globale des gardes → garder souple.
- La récup flexible déplace les heures → le seuil « ≤ 12 h » devra être ajusté (décision produit).
- Effort : ~5-6 étapes, chacune avec tests. Ce n'est pas un patch.
