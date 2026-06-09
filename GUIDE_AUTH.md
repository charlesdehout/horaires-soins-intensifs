# Guide pas-à-pas — Invitations & mots de passe (Brevo + Supabase)

> Ce guide couvre **uniquement les étapes hors GitHub Desktop**. Le code
> (Edge Function, boutons, page « définir le mot de passe ») est déjà écrit ;
> il te suffit de le **pousser** via GitHub Desktop comme d'habitude.
> Choix retenu : **Brevo** comme serveur d'envoi (pas besoin de nom de domaine).
> Ordre conseillé : **A → B → C → D → E → test (F)**.

---

## A — Créer le compte Brevo et préparer l'envoi

1. Va sur **brevo.com** → crée un compte gratuit (plan **Free** : 300 emails/jour).
2. **Valider une adresse expéditrice** (puisque tu n'as pas de domaine) :
   - Menu **Senders, Domains & Dedicated IPs** → onglet **Senders** → **Add a sender**.
   - Mets un nom (« Planning Soins Intensifs ») et **une adresse email à toi**
     (ex. ton Gmail). Brevo t'envoie un email de confirmation → **clique le lien**
     pour valider l'expéditeur.
   - C'est cette adresse qui apparaîtra comme expéditeur des invitations.
3. **Créer une clé SMTP** (≠ clé API) :
   - Menu **SMTP & API** → onglet **SMTP**.
   - Note ton **SMTP login** (une adresse du type `…@smtp-brevo.com`) et
     **génère/copie ta clé SMTP** (sert de mot de passe ; garde-la de côté).
   - Valeurs serveur : **Host** `smtp-relay.brevo.com` · **Port** `587`.

> 💡 Déliverabilité : avec une simple adresse validée (sans domaine authentifié),
> la plupart des emails arrivent, mais **certains peuvent tomber dans les spams**
> (Gmail/Yahoo sont stricts depuis 2024). Pour les premiers tests, **vérifie le
> dossier spam**. Si plus tard tu veux une fiabilité parfaite, on authentifiera
> un domaine — mais ce n'est pas nécessaire pour démarrer.

---

## B — Brancher Brevo comme SMTP dans Supabase

1. **Dashboard Supabase** → ton projet → **Authentication** → **Emails** (onglet **SMTP Settings**).
2. Active **Enable Custom SMTP** et renseigne :
   - **Sender email** : **l'adresse validée** à l'étape A.2 (ex. ton Gmail)
   - **Sender name** : `Planning Soins Intensifs`
   - **Host** : `smtp-relay.brevo.com`
   - **Port** : `587`
   - **Username** : ton **SMTP login** Brevo (`…@smtp-brevo.com`)
   - **Password** : ta **clé SMTP** Brevo
3. **Save**.
4. (Optionnel) **Authentication → Rate Limits** : tu peux relever la limite d'emails (par défaut ~30/heure, largement suffisant).

---

## C — Autoriser l'URL de redirection

Les liens d'invitation / de réinitialisation doivent ramener vers **ton app**.

1. **Authentication** → **URL Configuration**.
2. **Site URL** : l'adresse de ton site GitHub Pages, ex.
   `https://TON-PSEUDO.github.io/horaires-soins-intensifs/`
3. **Redirect URLs** → **Add URL** : ajoute **exactement la même URL** (avec le `/` final).
   > C'est l'adresse que le code envoie automatiquement (`REDIRECT_AUTH`). Si elle n'est pas dans la liste, le lien renverra une erreur « redirect invalide ».

---

## D — (Recommandé) Vérifier/traduire les emails

1. **Authentication** → **Email Templates**.
2. Vérifie que les modèles **Invite user** et **Reset Password** sont actifs.
3. Tu peux les traduire en français. **Ne touche pas** à la variable `{{ .ConfirmationURL }}` : c'est elle qui contient le lien vers ton app.

---

## E — Déployer l'Edge Function (sans ligne de commande)

> Le fichier est déjà dans le dépôt : `supabase/functions/inviter-medecin/index.ts`.

1. **Dashboard Supabase** → **Edge Functions** → **Create a new function** (éditeur dans le navigateur).
2. **Nom de la fonction** : `inviter-medecin` (exactement ce nom, sinon le bouton « Inviter » ne la trouvera pas).
3. **Colle tout le contenu** de `supabase/functions/inviter-medecin/index.ts` dans l'éditeur.
4. **Deploy**.
5. Rien à configurer côté secrets : Supabase fournit automatiquement `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` à la fonction.
6. Laisse l'option **Verify JWT** activée (par défaut) : la fonction est appelée avec ton jeton d'admin.

---

## F — Test de bout en bout

1. **Pousse le code** via GitHub Desktop (commit + push) et attends le déploiement GitHub Pages. Recharge l'app (**Ctrl+F5**).
2. Connecte-toi en **admin**. Ajoute (ou ouvre) un médecin avec **son email**, puis clique **« Inviter »**.
3. Le médecin reçoit un email → clique le lien → atterrit sur l'app, sur la page **« Définir votre mot de passe »** → choisit son mot de passe → entre dans son espace.
4. Teste aussi **« Mot de passe oublié ? »** depuis l'écran de connexion.

---

## Dépannage rapide

| Symptôme | Piste |
|---|---|
| Aucun email reçu | Expéditeur bien **validé** dans Brevo ? SMTP **sauvegardé** dans Supabase ? Regarde le dossier **spam** + les **logs Brevo** (menu Transactional → Logs). |
| « Sender not valid » dans les logs Brevo | L'adresse **Sender email** (Supabase) doit être **exactement** l'adresse validée dans Brevo. |
| « Action réservée à l'administrateur » | Le compte qui clique « Inviter » doit avoir `role = 'admin'` dans la table `doctors`. |
| « redirect invalide » / erreur au clic du lien | L'URL de l'app doit être dans **Redirect URLs** (étape C), au caractère près. |
| Bouton « Inviter » : erreur 401/404 sur la fonction | Fonction non déployée ou **nom ≠ `inviter-medecin`** (étape E). |
| Le lien connecte directement sans demander le mot de passe | Vérifie que le push a bien mis à jour `app.js`/`index.html` (Ctrl+F5). |

---

## Ce qui se passe côté code (pour info)

- **Bouton « Inviter »** → appelle l'Edge Function `inviter-medecin`, qui vérifie
  que tu es admin puis envoie l'invitation (clé service_role, jamais exposée).
- **Lien email** → ramène sur l'app avec `#type=invite` (ou `recovery`) → l'app
  affiche la page **« définir le mot de passe »** → `updateUser({ password })`.
- **« Mot de passe oublié ? »** → `resetPasswordForEmail` → même page de définition.

> Tu changes d'avis et tu obtiens un nom de domaine plus tard ? On pourra passer
> à Resend (ou authentifier un domaine dans Brevo) sans toucher au code : seule
> la config SMTP de l'étape B change.
