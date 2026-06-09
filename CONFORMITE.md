# Analyse de conformité — Implémentation vs Spécification Dr Calabro v1.0

> Confrontation des Modules 1–7 actuels au cahier des charges
> `Specification_Planning_USI.docx`. Légende : ✅ conforme · ⚠️ partiel ·
> ❌ manquant. Mis à jour le 2026-06-08.

Synthèse : le MVP actuel couvre environ **un tiers** de la spec. Le socle
(auth, profils, préférences, calendrier, génération + équité, ajustements,
publication) est en place, mais plusieurs **fondations diffèrent** de la spec
(trimestres académiques, résidents indépendants, congrès, fermetures
d'unités, workflow de validation, moteur off-clinic, désidératas) et
plusieurs **contraintes dures (Niveau 1)** ne sont pas encore appliquées.

---

## 1. Calendrier et temps

| Règle spec | Statut | Écart / action |
|---|---|---|
| 1.1 Année académique : 1er lundi d'octobre → dernier dimanche de septembre, 4 trimestres (T1 oct–déc, T2 jan–mars, T3 avr–juin, T4 juil–sept), planning par trimestre | ❌ | `genererTrimestre` utilise les **trimestres civils**. À corriger → bornes académiques. |
| 1.2 Jours fériés belges, agissent comme weekend, modifiables par admin | ⚠️ | Fériés calculés (`joursFeriesBE`) et traités comme weekend ✅, mais **non éditables** par l'admin. |
| 1.3 Congrès ISICEM / ISICARE (3–4 j, dates annuelles manuelles) | ❌ | Concept absent. Nouveau modèle + UI. |
| 1.4 Fermetures temporaires d'unités (été/Noël), saisie admin, couverture adaptée | ❌ | Concept absent. |

## 2. Personnel

| Règle spec | Statut | Écart / action |
|---|---|---|
| 2.1 Catégories Résident / A/S | ⚠️ | On a `resident` / `assistant_specialiste` / `specialiste`. La spec ne connaît que Résident & A/S — clarifier le rôle de `specialiste`. |
| 2.1 FTE % | ✅ | Présent. |
| 2.1 Contrats **multi-périodes non consécutives** (pauses) | ❌ | Modèle actuel = un seul `contract_start`/`contract_end`. |
| 2.1 Flag « congés à 100 % malgré FTE réduit » | ❌ | Absent. |
| 2.1 Congés **proportionnels aux mois effectivement travaillés** | ⚠️ | On prorate grossièrement par dates de contrat, pas par mois cumulés. |
| 2.1 Contraintes individuelles (ex. toujours libre le lundi) | ✅ | Couvert par `jours_travailles`. |
| 2.1 Visibilité restreinte du profil pour le travailleur | ⚠️ | RLS limite l'écriture ; à vérifier côté lecture des champs contractuels. |
| 2.2 **Résidents indépendants** (logique inversée : déclarent leurs semaines dispo, contrainte absolue, pas d'off-clinic) | ❌ | Statut + workflow de déclaration absents. |

## 3. Postes à couvrir

| Règle spec | Statut | Écart / action |
|---|---|---|
| 3.1 Semaine : 7 stations (USI 1–5, Bordet, Labo), min 1 médecin chacune | ✅ | Conforme (`POSTES_JOUR`, couverture 7). |
| 3.2 Weekend/férié : **Labo fermé**, 6 unités, 3 médecins, jusqu'à 3 postes vides | ⚠️ | Le weekend n'assigne **aucune** station actuellement (juste gardes + tour). À enrichir pour l'export. |
| 3.2 Congrès en semaine : 6 unités, 4 médecins, jusqu'à 2 vides | ❌ | Absent. |
| Priorité férié/congrès tombant un weekend → règles weekend | ⚠️ | Férié = weekend ✅ ; congrès non géré. |

## 4. Types de gardes

| Règle spec | Statut | Écart / action |
|---|---|---|
| 4.1 Journée 8h00–18h30 | ✅ | 10,5 h. |
| 4.2 Garde nuit semaine 17h–9h, Résident, **jamais 2 A/S** | ⚠️ | Horaire ✅, résident préféré ✅ ; **interdit 2 A/S non appliqué**. |
| 4.3 Garde 24h semaine ~25h (8h→9h+1), A/S préféré, Résident à éviter, lendemain repos | ⚠️ | On modélise 24h (8h→8h) et non ~25h ; repos lendemain ✅. |
| 4.4 Garde weekend ~25h, 2/3, **jamais 2 A/S parmi les 2** | ⚠️ | 2 gardes ≥1 résident ✅ ; **interdit 2 A/S non appliqué** ; durée 24h vs ~25h. |
| 4.5 Tour weekend 8h–12h, 1/3, **une seule unité**, même personne sam+dim | ⚠️ | Binôme sam=dim **appliqué** ✅ ; horaire actuel 8h–14h (≠ 8h–12h) ; pas d'unité assignée. *NB : la spec classe « même personne » en Niveau 3 (préférence) ; tu l'as demandé en règle dure — conservé en dur.* |
| 4.6 Structure nuit : idéal A/S 24h + Résident 17h ; acceptable 2 Résidents ou A/S+Résident 24h ; **interdit 2 A/S** | ⚠️ | Approche proche ; interdit 2 A/S à appliquer. |

## 5. Repos

| Règle spec | Statut | Écart / action |
|---|---|---|
| Jour post-garde = repos obligatoire non planifiable | ✅ | `bloque[lendemain]`. |
| Off-clinic / congé ne comptent pas comme travail pour le besoin de repos | ⚠️ | À vérifier finement. |
| Off-clinic ne peut **précéder** une garde | ❌ | Non géré (off-clinic pas encore moteur). |

## 6. Hiérarchie des règles

**Niveau 1 — absolues**

| Règle | Statut |
|---|---|
| Jamais 2 A/S ensemble en garde | ❌ → **appliqué dans ce lot** |
| Nuit semaine = 2 médecins | ✅ |
| Weekend = 3 médecins (2×24h + 1 tour), jamais 2 A/S parmi les 24h | ⚠️ → renforcé dans ce lot |
| Repos post-garde non planifiable | ✅ |
| Off-clinic interdit jour de garde + post-garde | ❌ |
| **Max 3 gardes/semaine** | ❌ → **appliqué dans ce lot** |
| Pas de demi-gardes | ✅ (n/a) |
| Aucune planif hors contrat | ✅ |
| Indépendants : seulement jours déclarés | ❌ |
| Congés validés = bloqués | ✅ (préférences bloquantes) |
| Lancement bloqué si demandes en attente | ❌ |
| Congés non utilisés expirent fin année acad. | ❌ |

**Niveau 2 — priorités élevées**

| Règle | Statut |
|---|---|
| Max 2 weekends/mois/personne (compensable) | ✅ **appliqué** — priorité à la génération + signalement dans `validerPlanning` (un week-end = sam/dim, le binôme sam+dim compte pour 1) |
| Gardes ±1 entre tous | ✅ **M12a/b** : équité **sans biais de grade** (2e créneau non réservé aux A/S, 2 Résidents possibles) + sélection par déficit qui minimise l'écart + **alerte `validerEquite`** si écart > 1 (proportionnel au fte), évaluée **sur le trimestre**. |
| Volume horaire similaire | ✅ **M12a** : tri par charge horaire relative (plancher) + alerte « sous le plancher d'équilibre » dans `validerPlanning`. |
| Repos compensatoire vendredi+dimanche → mardi ; jeudi+samedi → lundi | ✅ **M12b** : `materialiserReposCouples` pose un `repos_garde` supplémentaire (jeudi soir + samedi 24h → lundi ; vendredi soir + dimanche 24h → mardi), dédupliqué. |
| **Max 60 h/semaine** (compensable la semaine suivante) | ✅ **M12a** : suivi des heures par semaine ISO + plafond **souple** (on évite >60 h, fallback en dernier recours) + avertissement indicatif dans `validerPlanning`. |
| Pré-placements admin respectés | ❌ |
| Désidératas admin principal = priorité absolue | ❌ |

**Niveau 3 — préférences**

| Règle | Statut |
|---|---|
| Continuité dans les unités (hors Labo, souple le weekend) | ✅ (semaine) |
| Concentration des gardes de nuit sur une période du mois | ✅ **M12c** : départage des gardes de nuit de semaine à déficit STRICTEMENT égal en faveur du médecin ayant gardé le plus récemment (regroupe les nuits sans coût d'équité ; tunable `EQUITE.concentration_*`). |
| Si 3 gardes/semaine → préférer 17h–9h | ❌ |
| Couples vendredi soir + dimanche 24h / jeudi soir + samedi 24h | ❌ |
| Résident gardes semaine en 17h–9h (pas 24h) sauf équité | ⚠️ |
| A/S 24h de préférence | ✅ |
| Tour même personne sam+dim | ✅ (appliqué) |
| Rotation trimestrielle des unités (historique) | ❌ |
| Off-clinic : retirer d'abord à ceux qui ont déjà des congés | ❌ |
| Désidératas (priorités admin/travailleurs) | ❌ |

**Niveau 4 — préférences légères** : récup fériés réschedulables ❌ · rotation trimestrielle ❌ · 80 % moins de jours ⚠️ (`jours_travailles`) · suppression totale off-clinic en dernier recours ❌.

## 7. Comptage weekends / fériés

| Règle | Statut |
|---|---|
| Weekend travaillé = garde 24h **ou** tour le sam/dim | ✅ |
| Férié **en semaine** : règles weekend mais **ne compte pas** comme weekend travaillé | ❌ → **corrigé dans ce lot** |
| Férié un sam/dim : compte comme weekend | ✅ |
| Congrès un weekend : compte comme weekend si planifié | ❌ |

## 8–10. Congés, off-clinic, désidératas

| Domaine | Statut | Note |
|---|---|---|
| Types de congés annuel 24 / scient. 12 / extra 5 | ✅ | Quotas présents. |
| Formation (illimité), Autre (maladie/mariage, hors quota), Demande weekend, Récup férié | ❌ | Types absents. |
| Proportionnalité aux mois travaillés | ⚠️ | Prorata par dates, pas par mois cumulés. |
| Récup férié : crédit auto + demande validée | ❌ | Absent. |
| Validation admin de toutes les demandes avant planif (blocage si « en attente ») | ✅ **appliqué** : statut `en_attente`/`approuve`/`refuse`, panneau admin Approuver/Refuser, **génération bloquée** tant qu'il reste des demandes en attente sur la période ; seules les approuvées influencent le planning. |
| Types de demande : formation USI, congé « autre » (hors quota), demande week-end/férié | ✅ **appliqué** (sélecteur + bloquants formation/autre). Récup férié auto : à venir. |
| **Off-clinic** (résidents dépendants) : 0–2/mois selon absences (0–4j→2, 5–9j→1, 10+→0), placement auto, interdits jour garde/post-garde/pré-garde | ✅ **appliqué** (`genererOffClinic`) : droit mensuel, placement auto en jours ouvrables, interdits garde/veille/lendemain, résidents dépendants only, crédité 10,5 h. *Hiérarchie de suppression en cas de difficulté : à venir (N3/N4).* |
| Bilan horaire : off-clinic = heures de travail, congés = jours entiers | ✅ **appliqué** : off-clinic crédité 10,5 h ; congés retirés du « poids de présence » (cible proportionnelle aux jours présents). |
| **Désidératas** : max 20/trimestre, priorités (admin principal > secondaires > travailleurs) | ❌ | On a `souhait` sans priorité ni quota. |
| 11. Date limite des demandes (1 sem. avant le dernier mois du trimestre) | ❌ | Absent. |

## 12. Flux de planification (9 étapes)

⚠️/❌ — Le flux config calendrier → déclarations → demandes → **validation** →
pré-placement → génération → révision → **approbation/publication** → export
n'est que partiellement présent (génération + publication ✅ ; validation des
demandes, pré-placement, déclarations indépendants ❌).

## 13. Exports Excel

⚠️ **appliqué (v1)** via ExcelJS, validé sous Node :
- **Export 1 — Planning complet** ✅ : 1 onglet par semaine **du mois affiché**
  (passage au trimestre = petit ajustement), gabarit coloré (stations USI 1–5 /
  Bordet / Labo, gardes, tour, repos, off-clinic, congés annuels/scientifiques,
  indispo/formation/autre), ligne « Autres (saisie libre) », cellules
  auto-remplies **distinguées** (fond gris clair) des cellules vides éditables.
- **Export 2 — Récapitulatif individuel** ✅ : lignes = médecins, colonnes =
  jours, codes gardes/tours/congés/repos uniquement (pas la couverture des
  unités) + totaux gardes/week-ends/heures.
- Restant : découpage par **trimestre** plutôt que mois ; postes vides montrés
  explicitement les week-ends (Labo fermé) ; lignes vides supplémentaires par unité.

## 14. Seuil d'alerte absences simultanées

❌ — 1–3 normal, 4–5 attention (contournable), 6+ critique ; et vérifier
qu'au moins 1 Résident reste dispo pour la nuit.

## 15. Continuité + rotation trimestrielle

Continuité semaine ✅ ; **rotation trimestrielle des unités** (historique
tracé, proposition modifiable) ❌.

## 16. Rôles

⚠️ — On a `admin` / `doctor`. La spec distingue **admin principal**,
**admins secondaires**, **travailleur** (avec implications sur la priorité
des désidératas et la gestion des rôles).

---

## Feuille de route proposée (par modules)

L'application complète de la spec représente plusieurs modules. Ordre suggéré,
du plus structurant au plus cosmétique :

1. **M8 — Fondations temporelles & couverture** *(ce lot + suite)* :
   trimestres académiques, fériés éditables, contraintes dures N1 manquantes
   (2 A/S interdits, max 3 gardes/sem., comptage férié-semaine), couverture
   weekend/férié/congrès/fermeture paramétrable.
2. **M9 — Modèle de personnel complet** : contrats multi-périodes, statut
   dépendant/indépendant + déclarations de dispo, flag congés 100 %, rôles
   admin principal/secondaire.
3. **M10 — Workflow des demandes** : congés (tous types) + récup férié auto,
   désidératas (quota + priorités), date limite, validation admin, blocage du
   lancement tant que « en attente ».
4. **M11 — Moteur off-clinic** : calcul mensuel, placement auto, interdits,
   hiérarchie de suppression.
5. **M12 — Équité fine N2** : max 2 weekends/mois, ±1 garde, **max 60 h/semaine**,
   repos compensatoires couplés, concentration des gardes de nuit.
   **M12a — FAIT (2026-06) :**
   - ✅ **Plancher horaire** : tri par charge relative + alerte « sous le plancher
     d'équilibre » (< 85 % de la charge moyenne) dans `validerPlanning`.
   - ✅ **Équité des gardes entre grades** : le 2e créneau de garde (nuit semaine
     et week-end) n'est plus réservé aux A/S → choisi par déficit toutes catégories.
     **2 Résidents peuvent être ensemble** ; règles dures conservées : ≥1 Résident
     et jamais 2 A/S.
   - ✅ **Plafond 60 h/semaine** souple (compensable) + suivi `heuresSemaine` +
     avertissement indicatif.
   **M12b — FAIT (2026-06) :**
   - ✅ **Repos compensatoire couplé** (`materialiserReposCouples`) : repos_garde
     supplémentaire jeudi+samedi → lundi, vendredi+dimanche → mardi.
   - ✅ **±1 garde** en souple + alerte : `validerEquite` signale les écarts de
     gardes > 1 (proportionnels au fte).
   - ✅ **Équilibrage évalué sur le TRIMESTRE** : `validerEquite(shifts, medecins)`
     (plancher horaire + équité des gardes) est appelée par l'app sur l'ENSEMBLE
     du trimestre généré, pas au mois. Le plancher a été retiré de `validerPlanning`
     (mensuel) ; seul le plafond 60 h/semaine y reste (valable à toute échelle).
   **M12c — FAIT (2026-06) :** concentration des gardes de nuit de semaine (N3).
   - ✅ Départage à déficit STRICTEMENT égal : entre candidats ayant le même
     déficit de gardes, on choisit celui dont la dernière garde est la plus
     récente (`plTrierGardeNuit` + `plRecenceGarde`, état `derniereGarde`).
     L'équité passe toujours avant ; seul le CHOIX à égalité change → les nuits
     se regroupent (taux de nuits rapprochées ≤4 j ~doublé en test) sans
     dégrader la distribution au-delà de la tolérance ±1 de `validerEquite`.
     Paramètres dans `regles.js` → `EQUITE.{concentration_nuits, concentration_coeff, fenetre_nuits}`.
     Ne s'applique PAS aux gardes de week-end (pilotées par l'équité week-end + binôme TWE).
6. **M13 — Rotation trimestrielle des unités** + historique.
7. **M14 — Exports Excel** (Export 1 + Export 2) selon §13.
8. **M15 — Alertes absences simultanées** + pré-placement manuel.

> Les pré-placements manuels, la publication et les ajustements (Module 6)
> existent déjà et s'intègrent dans ce flux.
