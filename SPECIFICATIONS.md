# Spécifications — Planning Soins Intensifs

> Document de référence pour tous les modules. À valider/corriger avant le Module 2.
> Les points marqués **⚠️ À CONFIRMER** attendent ta validation.

> **MISE À JOUR (2026-06) — Spécification Dr Calabro v1.0.** Le cahier des charges
> détaillé fait référence : `REGLES_PLANNING_USI.docx` (conservé hors du repo,
> sur la machine de Charles). Règles déjà appliquées à l'algorithme
> (`planning.js`) issues de cette spec :
> - **Jamais 2 A/S ensemble en garde** (semaine et week-end) — contrainte dure.
> - **Max 3 gardes par semaine** (lundi→dimanche) et par personne — contrainte dure.
> - **Binôme du tour week-end** : qui fait le TWE-seul du samedi refait celui du
>   dimanche, sans garde (demande Charles ; la spec la classe en préférence N3).
> - **Trimestres académiques** (oct-déc=T1, jan-mars=T2, avr-juin=T3, juil-sept=T4) :
>   étiquetage académique côté UI (le regroupement des mois était déjà correct).
> - **Comptage week-end** : un férié en semaine suit les règles de couverture du
>   week-end mais ne compte pas comme « week-end travaillé » (max 2/mois).
> - **Max 2 week-ends/mois** (priorité N2) : privilégié à la génération, signalé
>   en cas de dépassement. Le binôme samedi+dimanche compte pour un seul week-end.
> - **Modèle de personnel §2** : statut dépendant/indépendant, flag congés 100 %,
>   niveau admin (principal/secondaire), **contrats multi-périodes** (`contract_periods`).
>   Résident indépendant = planifiable uniquement sur ses jours déclarés (`pref_type 'dispo'`).
> - **Off-clinic automatique §9** : résidents dépendants, droit mensuel (0–4 abs→2,
>   5–9→1, 10+→0), placé en jours ouvrables, jamais le jour d'une garde / en post-garde /
>   la veille d'une garde. **Bilan horaire** : off-clinic crédité 10,5 h ; congés = jours
>   entiers non crédités mais retirés du poids de présence (cible proportionnelle).
> - **Max 60 h/semaine** (et non /mois) : plafond N2 au-dessus de la cible 52 h — à venir.
> - **Workflow de validation §8.3/§12** : les demandes des travailleurs sont créées
>   en `en_attente` ; l'admin les approuve/refuse (panneau « Demandes à valider ») ;
>   la **génération est bloquée** tant qu'il reste des demandes en attente sur la
>   période, et seules les demandes **approuvées** influencent le planning. Nouveaux
>   types : formation USI, congé « autre » (hors quota), demande week-end/férié.
> - **Exports Excel §13** (ExcelJS, boutons admin) : Export 1 « Planning » (un onglet
>   par semaine du mois, gabarit Erasme coloré, cellules auto distinguées des vides
>   éditables) ; Export 2 « Récap individuel » (gardes/tours/congés/repos + totaux).

---

## 1. Grades de médecins

Trois grades, indépendants de la quotité de travail :

| Grade | Code | Rôle |
|---|---|---|
| Résident | `resident` | Pilier de la garde de nuit |
| Assistant spécialiste | `assistant_specialiste` (AS) | Senior en formation, fait plutôt des 24h |
| Spécialiste / staff | `specialiste` | Senior autonome |

Le **chef de service** est un compte admin (peut être aussi un spécialiste qui figure dans le planning, à décider).

---

## 2. Contrat et quotité (fte)

- `fte` = quotité de travail, **valeur libre par médecin** : 1.0 (plein temps), 0.8 (8/10), 0.5 (5/10), etc.
- `contract_start` / `contract_end` : durée précise du contrat. `end = NULL` → indéterminé.
- **Cible horaire hebdo dérivée automatiquement** : `52h × fte`
  (ex. 8/10 ≈ 42h, 5/10 = 26h), avec surcharge manuelle possible par médecin.
- Hors période de contrat → médecin non planifiable et non compté dans l'équité.

---

## 3. Types de shifts et heures

| Shift | Affiché | Heures réelles | Durée | Qui |
|---|---|---|---|---|
| Journée (lun–ven) | 08:00–18:30 | 08:00–18:30 | 10,5 h | tous |
| Tour week-end / férié (TWE) | 08:00–14:00 | 08:00–14:00 | 6 h | 3 médecins |
| Garde de nuit (résident) | 18:30–09:30 | 17:00–08:00 | 15 h | résident démarre 17:00 |
| Garde 24 h | 08:00–08:00 | 08:00–08:00 | 24 h | AS de préférence, résident si besoin |

**Le calcul des heures se fait sur les heures réelles, pas l'affichage.**

- La garde 24h (08:00 J → 08:00 J+1) couvre à la fois la journée et la nuit. Préférée pour les AS, mais un résident peut aussi en faire si nécessaire.
- **Organisation du week-end** :
  - **3 médecins** font le TWE (08:00–14:00) le matin.
  - **2 de ces 3** enchaînent sur la garde 24h (leur shift 08:00→08:00 inclut donc le TWE + la nuit).
  - Le 3ᵉ fait uniquement le tour (08:00–14:00, 6h).
  - La garde de nuit = ces 2 médecins de garde, dont **au moins 1 résident**.

---

## 4. Couverture minimale (contraintes DURES)

- **Jour : ≥ 7 médecins**
- **Nuit : ≥ 2 médecins**
- **Nuit : au moins 1 résident obligatoire** — une nuit composée uniquement d'AS est interdite.
  - Autorisé : {résident + résident}, {résident + AS}, {résident + AS + AS}…
  - Interdit : {AS + AS} seuls.
  - ✅ Confirmé.

---

## 5. Autres contraintes DURES

- **Repos 12 h** obligatoire après toute garde de nuit (et après une garde 24h).
- **Récupération après gardes de week-end** (repos obligatoire, vrai repos) :
  - Bloc de gardes se terminant le **dimanche** (ex. vendredi→dimanche) → **lundi ET mardi** libres.
  - Bloc de gardes se terminant le **samedi** (ex. jeudi→samedi) → **lundi** libre.
- **Congés** validés = blocage absolu (médecin non planifiable).
- Médecin non planifiable hors de sa période de contrat.

---

## 6. Contraintes SOUPLES (à optimiser)

- **Équité trimestrielle** des gardes de nuit et des week-ends (voir §8).
- **Cible horaire** : viser ~50–55 h/sem (× fte), minimiser l'écart.
- **Préférences** des médecins (souhaits) : respectées si possible.
- **Répartition des types de garde** : AS → 24h, résidents → début à 17h (préférence, pas obligation).

---

## 7. Absences et récupérations

Trois natures distinctes, toutes rendent le médecin **non assignable en USI**, mais différentes :

| Type | Code | Sens | Posé par |
|---|---|---|---|
| Congé | `conge` | Vacances / absence officielle | médecin (validé admin) |
| Indisponibilité | `indispo` | Ne peut pas ce jour-là | médecin |
| Souhait | `souhait` | Préférence (souple) | médecin |
| Off / clinic | `off_clinic` | Pas en USI, **mais peut travailler** (consultation, bureau) | accordé selon dispo |
| Récupération | `recuperation` | **Vrai repos**, ne doit PAS être au bureau | déclenché par excès d'heures |

Règles particulières :

- **Off/clinic — résidents** : jusqu'à ~2 par mois, **accordés seulement si la couverture le permet** et si le résident n'a pas déjà beaucoup de congés. Pas un droit fixe.
- **Off lié au dépassement horaire** : si un médecin dépasse **50 h sur la semaine** et que la couverture le permet, on peut lui accorder un off — réparti **équitablement** entre les médecins concernés.
- **Récupération (repos obligatoire)** : déclenchée par les blocs de gardes de week-end (voir §5). Repos réel : interdiction de travailler au bureau, contrairement au off/clinic.

---

## 8. Équité trimestrielle

« Équitable » = **proportionnel à la disponibilité**, pas un nombre identique pour tous.

Part juste d'un médecin sur le trimestre :

```
part = (fte × jours de présence dans le trimestre) / Σ (fte × jours de présence) de tous
```

L'algorithme (Module 7) compare gardes de nuit et week-ends **réellement attribués** à cette part cible, et lisse les écarts par échanges.

Conséquences :
- un 8/10 fait ~80 % des gardes d'un plein temps ;
- un médecin présent une moitié de trimestre fait ~la moitié de sa quotité ;
- les off/récup réduisent la présence et donc la part attendue.

---

## 9. Impact sur le modèle de données

Ajouts à `doctors` :

```sql
grade text not null default 'specialiste'   -- resident | assistant_specialiste | specialiste
fte numeric not null default 1.0
contract_start date
contract_end date
-- weekly_hours_target conservé, dérivé de fte par défaut
-- custom_rules jsonb : exceptions individuelles
```

Extension de `preferences.pref_type` :
`conge | indispo | souhait | off_clinic | recuperation`

Les règles **par grade** (composition de nuit, 24h vs 17h, plafonds de gardes) seront dans un fichier de config JS (`regles.js`), pas en base — plus simple à ajuster.

---

## 10. Points tranchés

1. ✅ « ≥ 1 résident par nuit » — confirmé.
2. ✅ Garde 24h = 08:00→08:00, couvre jour + nuit. AS de préférence, résident si besoin.
3. ✅ Récupération = repos obligatoire selon blocs de gardes de week-end + off au-delà de 50h/sem si possible et équitable.
4. ✅ Chef de service = organisateur (admin), **pas dans le planning**.
5. ✅ **Pas de plafond** de gardes de nuit par mois.

## 11. Tout est tranché ✅

- Tour de week-end (TWE) = **08:00–14:00 (6h)**, assuré par des médecins pas de garde.
- Garde de week-end = **24h**, couvre la journée (pas de TWE en plus).
