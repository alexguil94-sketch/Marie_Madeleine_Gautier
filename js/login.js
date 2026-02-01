(() => {
  const sb = window.mmgSupabase;

  const form = document.getElementById("loginForm");
  const msg = document.getElementById("msg");
  const who = document.getElementById("who");
  const btnForgot = document.getElementById("btnForgot");
  const btnSignOut = document.getElementById("btnSignOut");

  const setMsg = (t) => (msg.textContent = t || "");

  const getRedirect = () => {
    const p = new URLSearchParams(location.search);
    const r = p.get("redirect") || "";
    // sécurité anti open-redirect : on accepte seulement les URLs same-origin
    try {
      const u = new URL(r, location.origin);
      if (u.origin !== location.origin) return "";
      return u.pathname + u.search + u.hash;
    } catch {
      return "";
    }
  };

  const isAdminTarget = (path) => path.includes("/admin");

  async function getRole(userId) {
    const { data, error } = await sb
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (error) return null;
    return data?.role || null;
  }

  async function goAfterLogin(user) {
    const redirect = getRedirect();

    // Si on vise l'admin, on check le rôle
    if (redirect && isAdminTarget(redirect)) {
      const role = await getRole(user.id);
      if (role !== "admin") {
        setMsg("Accès refusé : ce compte n’est pas admin.");
        await sb.auth.signOut();
        return;
      }
      location.href = redirect;
      return;
    }

    // Si pas de redirect, si admin -> /admin/ sinon -> home
    const role = await getRole(user.id);
    if (role === "admin") {
      location.href = "admin/";
    } else {
      location.href = redirect || "index.html";
    }
  }

  async function refreshUI() {
    if (!sb?.auth) {
      setMsg("Supabase non configuré.");
      return;
    }

    const { data } = await sb.auth.getSession();
    const user = data?.session?.user || null;

    if (!user) {
      who.textContent = "";
      btnSignOut.style.display = "none";
      return;
    }

    btnSignOut.style.display = "";
    who.textContent = `Connecté : ${user.email || ""}`;
  }

  // Login submit
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("Connexion…");

    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg("Erreur : " + (error.message || "connexion impossible"));
      return;
    }

    setMsg("");
    await refreshUI();
    await goAfterLogin(data.user);
  });

  // Forgot password
  btnForgot?.addEventListener("click", async () => {
    const email = (form?.elements?.email?.value || "").trim();
    if (!email) {
      setMsg("Entre ton email puis clique “Mot de passe oublié”.");
      return;
    }

    setMsg("Envoi de l’email de récupération…");
    const redirectTo = new URL("/admin/reset.html", location.origin).toString();


    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      setMsg("Erreur : " + (error.message || "impossible d’envoyer l’email"));
      return;
    }
    setMsg("Email envoyé ✅ Ouvre le lien dans ta boîte mail (rapidement).");
  });

  // Sign out
  btnSignOut?.addEventListener("click", async () => {
    await sb.auth.signOut();
    setMsg("Déconnecté.");
    await refreshUI();
  });

  // Auto: si déjà connecté, on redirige
  window.addEventListener("DOMContentLoaded", async () => {
    await refreshUI();

    const { data } = await sb.auth.getSession();
    const user = data?.session?.user || null;
    if (user) {
      await goAfterLogin(data.user || data.session?.user);

    }
  });
})();
