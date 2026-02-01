/* admin/js/admin-auth.js
   - Guard admin: nécessite session + role=admin dans public.profiles
   - Gère logout et affichage user
*/

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const setText = (sel, text) => {
    const el = $(sel);
    if (el) el.textContent = text ?? "";
  };

  async function requireAdmin() {
    if (!window.SB?.auth) throw new Error("Supabase client not ready");

    const redirect = encodeURIComponent("/admin/");
    const { data: s } = await SB.auth.getSession();

    if (!s?.session?.user) {
      window.location.href = `/login.html?redirect=${redirect}`;
      return null;
    }

    // Check role
    const uid = s.session.user.id;
    const { data: prof, error } = await SB.db
      .from("profiles")
      .select("role, display_name")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.error("[ADMIN] profiles read error", error);
      alert("Erreur: impossible de vérifier votre rôle (profiles/RLS).");
      window.location.href = `/login.html?redirect=${redirect}`;
      return null;
    }

    if (!prof || prof.role !== "admin") {
      alert("Accès refusé: ce compte n'est pas admin.");
      window.location.href = `/login.html?redirect=${redirect}`;
      return null;
    }

    // Fill UI
    setText('[data-admin-user-email]', s.session.user.email);
    setText('[data-admin-user-name]', prof.display_name || "");

    return s.session.user;
  }

  async function wireLogout() {
    const btn = document.querySelector("[data-admin-logout]");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      await SB.auth.signOut();
      window.location.href = "/login.html";
    });
  }

  window.AdminAuth = { requireAdmin, wireLogout };
})();
