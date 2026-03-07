(() => {
  async function waitForSupabase() {
    if (window.mmgSupabase?.auth) return window.mmgSupabase;

    await new Promise((resolve) => {
      document.addEventListener("sb:ready", resolve, { once: true });
      setTimeout(resolve, 4000);
    });

    return window.mmgSupabase || null;
  }

  window.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("resetForm");
    const msg = document.getElementById("resetMsg");
    const sb = await waitForSupabase();

    if (!form || !msg || !sb?.auth) {
      if (msg) msg.textContent = "Supabase non configure.";
      return;
    }

    const { data } = await sb.auth.getSession();
    if (!data?.session) {
      msg.textContent = "Lien invalide/expire. Refais une demande de recuperation.";
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      msg.textContent = "Mise a jour...";

      const pwd = form.elements.pwd.value;
      const { error } = await sb.auth.updateUser({ password: pwd });

      if (error) {
        msg.textContent = "Erreur : " + error.message;
        return;
      }

      msg.textContent = "Mot de passe mis a jour. Tu peux te reconnecter.";
      await sb.auth.signOut();
      setTimeout(() => {
        location.href = "./";
      }, 800);
    });
  });
})();
