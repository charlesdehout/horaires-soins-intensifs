// =====================================================================
// Edge Function — inviter-medecin
// ---------------------------------------------------------------------
// Envoie une invitation par email à un médecin pour qu'il définisse son
// mot de passe et accède à son espace. L'invitation utilise la clé
// service_role (admin) qui NE DOIT JAMAIS être exposée côté navigateur :
// c'est pourquoi cette opération vit ici, dans une fonction serveur.
//
// Sécurité : on vérifie d'abord que l'APPELANT est bien un administrateur
// (rôle 'admin' dans la table doctors), à partir de son jeton de session.
//
// Variables d'environnement (injectées automatiquement par Supabase) :
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Déploiement : voir GUIDE_AUTH.md (création de la fonction dans le
// dashboard Supabase, aucune ligne de commande nécessaire).
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* Mot de passe temporaire lisible (sans caractères ambigus 0/O/1/l/I). */
function genererMotDePasse(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += chars[arr[i] % chars.length];
  return s;
}

Deno.serve(async (req) => {
  // Pré-vol CORS (le navigateur l'envoie avant le POST cross-origin).
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reponse({ error: "Méthode non autorisée." }, 405);

  try {
    const { email, redirectTo, mode } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") {
      return reponse({ error: "Email manquant ou invalide." }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Identifier l'appelant à partir de son jeton de session (Authorization).
    const authHeader = req.headers.get("Authorization") || "";
    const clientAppelant = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: errUser } = await clientAppelant.auth.getUser();
    if (errUser || !user) return reponse({ error: "Non authentifié." }, 401);

    // 2) Vérifier le rôle admin via la clé service_role (fiable, hors RLS).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profil, error: errProfil } = await admin
      .from("doctors")
      .select("role")
      .eq("email", (user.email || "").toLowerCase())
      .maybeSingle();
    if (errProfil) return reponse({ error: "Lecture du profil impossible : " + errProfil.message }, 500);
    if (!profil || profil.role !== "admin") {
      return reponse({ error: "Action réservée à l'administrateur." }, 403);
    }

    const email2 = email.trim().toLowerCase();

    // 3bis) MODE « creer » (sans email) : on crée le compte avec un mot de passe
    //       TEMPORAIRE, renvoyé à l'admin pour qu'il le transmette lui-même. Le
    //       médecin DEVRA le changer à la 1re connexion (flag must_change_password).
    //       Utile quand l'envoi d'email échoue (ex. délivrabilité Hotmail/DKIM).
    if (mode === "creer") {
      const motDePasseTemp = genererMotDePasse();
      const { data, error } = await admin.auth.admin.createUser({
        email: email2,
        password: motDePasseTemp,
        email_confirm: true, // compte actif immédiatement, aucun email envoyé
        user_metadata: { must_change_password: true },
      });
      if (error) {
        console.error("createUser error:", error);
        return reponse({ error: error.message || "Création du compte impossible.", code: (error as { code?: string }).code, status: (error as { status?: number }).status }, 400);
      }
      return reponse({ ok: true, email: data?.user?.email || email2, motDePasseTemp });
    }

    // 3) Envoyer l'invitation (email avec lien pour définir le mot de passe).
    const options = redirectTo ? { redirectTo } : undefined;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      options,
    );
    if (error) {
      // Détail enrichi : message + code + statut (utile quand l'erreur est vide,
      // typiquement un échec d'envoi d'email = SMTP non/mal configuré).
      console.error("inviteUserByEmail error:", error);
      const detail = error.message || error.code || error.name ||
        (() => { try { return JSON.stringify(error); } catch { return String(error); } })();
      const indiceSmtp = (error.status === 500 || !error.message)
        ? " — vérifie le SMTP (Authentication → Emails → SMTP) : un envoi d'email échoué donne souvent une erreur vide."
        : "";
      return reponse({ error: detail + indiceSmtp, code: error.code, status: error.status }, 400);
    }

    return reponse({ ok: true, email: data?.user?.email || email });
  } catch (e) {
    return reponse({ error: String((e as Error)?.message || e) }, 500);
  }
});
