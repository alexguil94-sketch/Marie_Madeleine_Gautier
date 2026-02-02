(() => {
  const sb = window.mmgSupabase;

  const form = document.getElementById("loginForm");
  const msg = document.getElementById("msg");
  const who = document.getElementById("who");
  const btnForgot = document.getElementById("btnForgot");
  const btnSignOut = document.getElementById("btnSignOut");

  const accountBox = document.getElementById("accountBox");
  const identitiesList = document.getElementById("identitiesList");
  const pwdForm = document.getElementById("pwdForm");
  const pwdMsg = document.getElementById("pwdMsg");
  const btnGoAdmin = document.getElementById("btnGoAdmin");

  const setMsg = (t) => { if (msg) msg.textContent = t || ""; };
  const setPwdMsg = (t) => { if (pwdMsg) pwdMsg.textContent = t || ""; };

  if (!sb?.auth) {
    setMsg("Supabase non configuré.");
    form?.querySelectorAll("input, button").forEach((el) => (el.disabled = true));
    document.querySelectorAll("[data-oauth], [data-link]").forEach((el) => {
      try { el.disabled = true; } catch {}
    });
    return;
  }

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

  const buildSelfRedirectUrl = () => {
    // URL sur laquelle on veut revenir après OAuth / linkIdentity
    const u = new URL(location.pathname, location.origin);
    const r = getRedirect();
    if (r) u.searchParams.set("redirect", r);
    return u.toString();
  };

  const isAdminTarget = (path) => path.includes("/admin");

  const isRecoveryFlow = () => {
    // Supabase met souvent type=recovery dans le hash
    const h = String(location.hash || "").replace(/^#/, "");
    const p = new URLSearchParams(h);
    return p.get("type") === "recovery";
  };

  async function getProfile(userId) {
    const { data, error } = await sb
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  async function ensureProfile(user) {
    if (!user?.id) return null;

    const existing = await getProfile(user.id);
    if (existing?.role) return existing;

    // Si la ligne n’existe pas encore, on la crée (policy: insert own)
    const { data, error } = await sb
      .from("profiles")
      .insert({ id: user.id })
      .select("role")
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  async function goAfterLogin(user) {
    const redirect = getRedirect();

    // Si on est dans un flow "recovery", on reste ici pour changer le mot de passe.
    if (isRecoveryFlow()) return;

    // Si on vise l'admin, on check le rôle
    if (redirect && isAdminTarget(redirect)) {
      const profile = (await ensureProfile(user)) || (await getProfile(user.id));
      if (profile?.role !== "admin") {
        setMsg("Accès refusé : ce compte n’est pas admin.");
        await sb.auth.signOut();
        return;
      }
      location.href = redirect;
      return;
    }

    // Si on a explicitement demandé un redirect, on le respecte.
    if (redirect) {
      location.href = redirect;
      return;
    }

    // Sinon… on NE redirige pas automatiquement : cette page sert aussi de “compte”
    // (changer mot de passe + lier des connexions).
  }

  async function renderIdentities() {
    if (!identitiesList) return;

    const { data, error } = await sb.auth.getUserIdentities();
    if (error) {
      identitiesList.textContent = "Impossible de récupérer les identités.";
      return;
    }

    const ids = data?.identities || [];
    if (!ids.length) {
      identitiesList.textContent = "—";
      return;
    }

    const rows = ids
      .map((it) => {
        const provider = it.provider || "—";
        const created = it.created_at ? new Date(it.created_at).toLocaleDateString() : "";
        return `<div style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:6px 0; border-top:1px solid rgba(255,255,255,.08)">
          <div>
            <strong style="text-transform:capitalize">${provider}</strong>
            <span class="muted" style="margin-left:8px; font-size:12px">${created ? "lié le " + created : ""}</span>
          </div>
          <button class="btn" type="button" data-unlink="${provider}">Délier</button>
        </div>`;
      })
      .join("");

    identitiesList.innerHTML = rows;

    identitiesList.querySelectorAll("[data-unlink]").forEach((b) => {
      b.addEventListener("click", async () => {
        const provider = b.getAttribute("data-unlink");
        const { data } = await sb.auth.getUserIdentities();
        const identity = (data?.identities || []).find((x) => x.provider === provider);

        if (!identity) return;

        setPwdMsg("Déliaison…");
        const res = await sb.auth.unlinkIdentity(identity);
        if (res.error) {
          setPwdMsg("Erreur : " + (res.error.message || "impossible de délier"));
          return;
        }

        setPwdMsg("Identité déliée ✅");
        await renderIdentities();
      });
    });
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
      if (accountBox) accountBox.style.display = "none";
      if (btnGoAdmin) btnGoAdmin.style.display = "none";
      return;
    }

    // Create profile row if needed
    const profile = await ensureProfile(user);

    btnSignOut.style.display = "";
    who.textContent = `Connecté : ${user.email || user.user_metadata?.email || ""}`;

    if (accountBox) accountBox.style.display = "";
    await renderIdentities();

    // show "go admin" only if role=admin
    if (btnGoAdmin) {
      btnGoAdmin.style.display = profile?.role === "admin" ? "" : "none";
      btnGoAdmin.onclick = () => (location.href = "admin/");
    }

    // Si on arrive via un lien recovery, on met l’accent sur le changement de mot de passe
    if (isRecoveryFlow()) {
      setMsg("Lien de récupération détecté — choisis un nouveau mot de passe ci-dessous.");
    }
  }

  // ------------------------
  // Email/password login
  // ------------------------
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

  // Forgot password -> redirect to login page (recovery flow)
  btnForgot?.addEventListener("click", async () => {
    const email = (form?.elements?.email?.value || "").trim();
    if (!email) {
      setMsg("Entre ton email puis clique “Mot de passe oublié”.");
      return;
    }

    setMsg("Envoi de l’email de récupération…");

    const redirectTo = new URL("/login.html", location.origin).toString();
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
    setPwdMsg("");
    await refreshUI();
  });

  // ------------------------
  // OAuth sign-in buttons
  // ------------------------
  document.querySelectorAll("[data-oauth]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.getAttribute("data-oauth");
      setMsg("Redirection " + provider + "…");
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: buildSelfRedirectUrl() },
      });
      if (error) setMsg("Erreur : " + (error.message || "OAuth impossible"));
    });
  });

  // ------------------------
  // Link identity buttons (user must be signed in)
  // Requires "Enable Manual Linking" in Supabase Auth settings
  // ------------------------
  document.querySelectorAll("[data-link]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.getAttribute("data-link");
      setPwdMsg("Redirection pour lier " + provider + "…");
      const { error } = await sb.auth.linkIdentity({
        provider,
        options: { redirectTo: buildSelfRedirectUrl() },
      });
      if (error) setPwdMsg("Erreur : " + (error.message || "link impossible"));
    });
  });

  // ------------------------
  // Change password (logged-in user OR recovery flow)
  // ------------------------
  pwdForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setPwdMsg("");

    const fd = new FormData(pwdForm);
    const p1 = String(fd.get("newPassword") || "");
    const p2 = String(fd.get("newPassword2") || "");

    if (p1.length < 8) {
      setPwdMsg("Mot de passe trop court (min 8).");
      return;
    }
    if (p1 !== p2) {
      setPwdMsg("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setPwdMsg("Mise à jour…");
    const { error } = await sb.auth.updateUser({ password: p1 });

    if (error) {
      setPwdMsg("Erreur : " + (error.message || "impossible de mettre à jour"));
      return;
    }

    setPwdMsg("Mot de passe mis à jour ✅");
    // En recovery, mieux de forcer une reconnexion propre
    if (isRecoveryFlow()) {
      await sb.auth.signOut();
      setMsg("Mot de passe changé. Reconnecte-toi.");
      // nettoie le hash (token) de l’URL
      history.replaceState({}, document.title, location.pathname + location.search);
      await refreshUI();
    }
  });

  // Auto init
  window.addEventListener("DOMContentLoaded", async () => {
    await refreshUI();

    // Si un redirect est demandé explicitement, on applique la logique (ex: /admin/)
    const { data } = await sb.auth.getSession();
    const user = data?.session?.user || null;

    if (user) {
      const redirect = getRedirect();
      if (redirect) await goAfterLogin(user);
    }
  });
})();
