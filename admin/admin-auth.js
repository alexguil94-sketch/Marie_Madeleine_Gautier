/* admin/js/admin-auth.js
   - Ensure user is logged in AND is admin (profiles.role === 'admin')
   - Provides logout binding
*/

(() => {
  const Admin = window.Admin;
  if (!Admin?.sb) throw new Error("Admin core non chargé");

  Admin.getUser = async () => {
    const { data, error } = await Admin.sb.auth.getUser();
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  };

  Admin.getMyRole = async (userId) => {
    const { data, error } = await Admin.sb
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    return { role: data?.role || null, error };
  };

  Admin.ensureAdmin = async () => {
    const { user, error: uErr } = await Admin.getUser();
    if (uErr || !user) return { ok: false, reason: "not_logged" };

    const { role, error: rErr } = await Admin.getMyRole(user.id);
    if (rErr) return { ok: false, reason: "role_error", error: rErr };
    if (role !== "admin") return { ok: false, reason: "not_admin" };

    return { ok: true, user, role };
  };

  Admin.redirectToLogin = () => {
    const redirect = encodeURIComponent(location.pathname.replace(/^\//, "/"));
    location.href = `/login.html?redirect=${redirect}`;
  };

  Admin.bindLogout = (selector = "[data-logout]") => {
    const btn = Admin.qs(selector);
    if (!btn) return;
    btn.addEventListener("click", async () => {
      await Admin.sb.auth.signOut();
      Admin.toast("Déconnecté.", "ok");
      Admin.redirectToLogin();
    });
  };

  Admin.showAuthError = (msg) => {
    const box = Admin.qs("#adminAuthError");
    if (box) {
      box.textContent = msg;
      box.style.display = "block";
    } else {
      alert(msg);
    }
  };
})();
