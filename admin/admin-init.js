/* admin/js/admin-init.js
   Boot admin: auth guard + logout + works manager
*/

(async () => {
  const Admin = window.Admin;
  if (!Admin?.sb) throw new Error("Admin core non chargé");

  // 1) guard admin
  const res = await Admin.ensureAdmin();
  if (!res.ok) {
    if (res.reason === "not_logged") {
      Admin.redirectToLogin();
      return;
    }
    if (res.reason === "not_admin") {
      Admin.showAuthError("Accès refusé : ce compte n’est pas admin.");
      return;
    }
    Admin.showAuthError("Erreur d’auth: " + Admin.errText(res.error));
    return;
  }

  // 2) bind logout
  Admin.bindLogout("[data-logout]");

  // 3) init works panel (si présent sur la page)
  if (typeof Admin.initWorksAdmin === "function") {
    await Admin.initWorksAdmin();
  }

  Admin.toast("Admin prêt ✅", "ok");
})();
