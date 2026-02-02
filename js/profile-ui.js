/* js/profile-ui.js
   Header widget + profile modal (pseudo + avatar)
   Needs: window.mmgSupabase (supabase-client.js) + profiles table
*/

(() => {
  "use strict";

  // Anti double init
  if (window.__MMG_PROFILE_UI_INITED__) return;
  window.__MMG_PROFILE_UI_INITED__ = true;

  const sb = window.mmgSupabase;
  if (!sb) {
    console.warn("[PROFILE] window.mmgSupabase introuvable (supabase-client.js).");
    return;
  }

  const bucket = window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media";

  const $ = (sel, root = document) => root.querySelector(sel);

  const getPublicUrl = (path) => {
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  };

  const svgFallback =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect width='56' height='56' rx='18' fill='%23222'/%3E%3C/svg%3E";

  // -----------------------
  // Inject modal once
  // -----------------------
  function ensureModal() {
    if ($("#pfModal")) return;

    const html = `
<section id="pfModal" class="pf-modal" hidden>
  <div class="pf-card" role="dialog" aria-modal="true" aria-labelledby="pfTitle">
    <div class="pf-head">
      <div>
        <div class="pf-kicker">Mon profil</div>
        <h2 id="pfTitle" class="pf-title">Pseudo & avatar</h2>
      </div>
      <button id="pfClose" class="pf-x" type="button" aria-label="Fermer">×</button>
    </div>

    <div id="pfSignedOut" class="pf-muted" hidden>
      Tu dois être connecté pour choisir ton pseudo et ton avatar.
      <div style="margin-top:10px">
        <a id="pfLoginLink" class="pf-btn pf-primary" href="./login.html">Se connecter</a>
      </div>
    </div>

    <div id="pfSignedIn" hidden>
      <div class="pf-row" style="align-items:center;margin-top:12px">
        <div class="pf-avatarbig"><img id="pfAvatarPreview" alt="" /></div>
        <div style="flex:1;min-width:0">
          <div class="pf-muted">Compte</div>
          <div id="pfEmail" style="font-weight:600;word-break:break-word"></div>
        </div>
        <button id="pfLogout" class="pf-btn" type="button">Se déconnecter</button>
      </div>

      <div class="pf-field">
        <label class="pf-label" for="pfName">Pseudo</label>
        <input id="pfName" class="pf-input" placeholder="Ton pseudo" maxlength="32" />
      </div>

      <div class="pf-field">
        <label class="pf-label" for="pfAvatar">Avatar</label>
        <input id="pfAvatar" class="pf-input" type="file" accept="image/*" />
        <div class="pf-row" style="margin-top:10px">
          <button id="pfRemoveAvatar" class="pf-btn" type="button">Retirer</button>
          <button id="pfSave" class="pf-btn pf-primary" type="button">Enregistrer</button>
        </div>
      </div>

      <div id="pfMsg" class="pf-muted" style="margin-top:10px;min-height:18px"></div>
    </div>
  </div>
</section>
`;
    document.body.insertAdjacentHTML("beforeend", html);

    // close handlers
    const modal = $("#pfModal");
    $("#pfClose")?.addEventListener("click", () => (modal.hidden = true));
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    });
  }

  // -----------------------
  // Profile access
  // -----------------------
  async function getUser() {
    const { data } = await sb.auth.getUser();
    return data?.user || null;
  }

  async function loadProfile(uid) {
    const { data, error } = await sb
      .from("profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.warn("[PROFILE] load profile error:", error);
      return null;
    }

    // if missing row, try create (requires insert policy)
    if (!data) {
      const { error: insErr } = await sb.from("profiles").insert({ id: uid, role: "user" });
      if (insErr) console.warn("[PROFILE] create profile error:", insErr);

      const again = await sb
        .from("profiles")
        .select("id,display_name,avatar_url,role")
        .eq("id", uid)
        .maybeSingle();
      return again.data || null;
    }

    return data;
  }

  // -----------------------
  // Header widget
  // -----------------------
  const slot = document.getElementById("mmgProfileSlot");
  let headerBtn = null;

  function setHeaderLoggedOut() {
    if (!slot) return;
    slot.innerHTML = "";

    headerBtn = document.createElement("button");
    headerBtn.type = "button";
    headerBtn.className = "mmg-profbtn";
    headerBtn.innerHTML = `
      <span class="mmg-profsmall">Se connecter</span>
    `;
    headerBtn.addEventListener("click", () => {
      const back = encodeURIComponent(location.pathname || "/");
      location.href = `./login.html?redirect=${back}`;
    });

    slot.appendChild(headerBtn);
  }

  function setHeaderLoggedIn(user, profile) {
    if (!slot) return;
    slot.innerHTML = "";

    const name =
      (profile?.display_name && profile.display_name.trim()) ||
      (user?.email ? user.email.split("@")[0] : "Compte");

    const avatar = profile?.avatar_url || svgFallback;

    headerBtn = document.createElement("button");
    headerBtn.type = "button";
    headerBtn.className = "mmg-profbtn";
    headerBtn.innerHTML = `
      <span class="mmg-profavatar"><img alt="" src="${avatar}"></span>
      <span class="mmg-profname">${escapeHtml(name)}</span>
    `;
    headerBtn.addEventListener("click", () => openModal(true));
    slot.appendChild(headerBtn);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  // -----------------------
  // Modal logic
  // -----------------------
  function openModal(allowAutoOpen = false) {
    ensureModal();
    const modal = $("#pfModal");
    if (!modal) return;
    modal.hidden = false;
    if (allowAutoOpen) refreshModalUI({ autoOpenIfMissing: false });
  }

  function closeModal() {
    const modal = $("#pfModal");
    if (modal) modal.hidden = true;
  }

  async function refreshModalUI({ autoOpenIfMissing = false } = {}) {
    ensureModal();

    const modal = $("#pfModal");
    const signedOut = $("#pfSignedOut");
    const signedIn = $("#pfSignedIn");

    const loginLink = $("#pfLoginLink");
    const elEmail = $("#pfEmail");
    const inName = $("#pfName");
    const inAvatar = $("#pfAvatar");
    const imgPrev = $("#pfAvatarPreview");
    const btnSave = $("#pfSave");
    const btnRemove = $("#pfRemoveAvatar");
    const btnLogout = $("#pfLogout");
    const msg = $("#pfMsg");

    const setMsg = (t = "") => { if (msg) msg.textContent = t; };

    const user = await getUser();
    if (!user) {
      signedOut.hidden = false;
      signedIn.hidden = true;

      const back = encodeURIComponent(location.pathname || "/");
      if (loginLink) loginLink.href = `./login.html?redirect=${back}`;

      return;
    }

    const profile = await loadProfile(user.id);

    signedOut.hidden = true;
    signedIn.hidden = false;

    if (elEmail) elEmail.textContent = user.email || "";
    if (inName) {
      const proposed = (user.email || "").split("@")[0].slice(0, 32);
      inName.value = (profile?.display_name || proposed || "").slice(0, 32);
    }
    if (imgPrev) imgPrev.src = profile?.avatar_url || svgFallback;

    // auto open if missing pseudo
    if (autoOpenIfMissing && modal && (!profile?.display_name || !profile.display_name.trim())) {
      modal.hidden = false;
      setMsg("Choisis un pseudo pour terminer ton profil 🙂");
    }

    // preview local
    inAvatar?.addEventListener("change", () => {
      const f = inAvatar.files?.[0];
      if (!f || !imgPrev) return;
      imgPrev.src = URL.createObjectURL(f);
    }, { once: true });

    btnLogout?.addEventListener("click", async () => {
      try { await sb.auth.signOut(); } catch {}
      closeModal();
      await refreshAll();
    }, { once: true });

    btnRemove?.addEventListener("click", async () => {
      setMsg("");
      const u = await getUser();
      if (!u) return;

      const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", u.id);
      if (error) return setMsg(error.message || "Erreur avatar");

      if (imgPrev) imgPrev.src = svgFallback;
      setMsg("Avatar retiré ✅");
      await refreshAll();
    }, { once: true });

    btnSave?.addEventListener("click", async () => {
      setMsg("");

      const u = await getUser();
      if (!u) return setMsg("Connecte-toi d’abord.");

      const display_name = String(inName?.value || "").trim().slice(0, 32);
      if (!display_name) return setMsg("Choisis un pseudo.");

      try {
        const current = await loadProfile(u.id);
        let avatar_url = current?.avatar_url || null;

        const file = inAvatar?.files?.[0];
        if (file) {
          const ext = (file.name.split(".").pop() || "jpg")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "") || "jpg";
          const path = `avatars/${u.id}/avatar.${ext}`;

          const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
            upsert: true,
            contentType: file.type || "image/jpeg",
          });
          if (upErr) throw upErr;

          avatar_url = getPublicUrl(path);
        }

        const { error } = await sb.from("profiles")
          .update({ display_name, avatar_url })
          .eq("id", u.id);

        if (error) throw error;

        setMsg("Profil mis à jour ✅");
        closeModal();
        await refreshAll();
      } catch (e) {
        console.error(e);
        setMsg(e?.message || "Erreur profil");
      }
    }, { once: true });
  }

  // -----------------------
  // Main refresh
  // -----------------------
  async function refreshHeader() {
    if (!slot) return;

    const user = await getUser();
    if (!user) return setHeaderLoggedOut();

    const profile = await loadProfile(user.id);
    setHeaderLoggedIn(user, profile);
  }

  async function refreshAll() {
    await refreshHeader();
    await refreshModalUI();
  }

  // Auth change (OAuth redirect / logout)
  sb.auth.onAuthStateChange(async () => {
    await refreshAll();
  });

  window.addEventListener("DOMContentLoaded", async () => {
    await refreshHeader();
    await refreshModalUI({ autoOpenIfMissing: true });
  });

})();
