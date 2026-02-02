// js/profile-ui.js (v2)
// Affiche avatar+pseudo dans le header + modale édition (pseudo/avatar)
// Robuste: ne crash pas si la page n'a pas la modale
// Requiert: supabase.js + supabase-config.js + supabase-client.js

(() => {
  "use strict";
  if (window.__MMG_PROFILE_UI_INIT__) return;
  window.__MMG_PROFILE_UI_INIT__ = true;

  const qs = (s, r = document) => r.querySelector(s);

  const toast = (msg) => {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:10px 12px;border-radius:12px;" +
      "background:rgba(0,0,0,.75);border:1px solid rgba(255,255,255,.12);color:#fff;z-index:99999;font:14px system-ui";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  };

  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;
  const getBucket = () => (window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media");

  async function getUser() {
    const sb = getSB();
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  async function ensureProfileRow(user) {
    const sb = getSB();
    if (!sb || !user) return null;

    await sb.from("profiles").upsert(
      { id: user.id, display_name: user.user_metadata?.name || null, avatar_url: null },
      { onConflict: "id" }
    );

    const { data } = await sb
      .from("profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", user.id)
      .maybeSingle();

    return data || null;
  }

  function setInert(isOn) {
    const modal = qs("#pfModal");
    if (!modal) return;
    const children = Array.from(document.body.children).filter((x) => x !== modal);
    children.forEach((el) => {
      try { el.inert = isOn; } catch {}
    });
  }

  function mountModalIfMissing() {
    if (qs("#pfModal")) return;

    const modal = document.createElement("section");
    modal.id = "pfModal";
    modal.className = "pf-modal";
    modal.hidden = true;

    modal.innerHTML = `
      <div class="pf-card" role="dialog" aria-modal="true" aria-labelledby="pfTitle">
        <div class="pf-head">
          <div>
            <div class="pf-kicker">Mon profil</div>
            <h2 id="pfTitle" class="pf-title">Choisis ton pseudo et ton avatar</h2>
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
          <div class="pf-row" style="align-items:center">
            <div class="pf-avatar">
              <img id="pfAvatarPreview" alt="" style="display:none" />
            </div>

            <div style="flex:1;min-width:0">
              <div class="pf-muted">Compte</div>
              <div id="pfEmail" class="pf-email"></div>
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
              <button id="pfRemoveAvatar" class="pf-btn" type="button">Retirer l’avatar</button>
              <button id="pfSave" class="pf-btn pf-primary" type="button">Enregistrer</button>
            </div>
          </div>

          <div id="pfMsg" class="pf-muted" style="margin-top:10px;min-height:18px"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const fab = document.createElement("button");
    fab.id = "pfOpen";
    fab.className = "pf-fab";
    fab.type = "button";
    fab.hidden = true;
    fab.textContent = "Profil";
    document.body.appendChild(fab);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.MMGProfile.close();
    });
  }

  async function uploadAvatar(userId, file) {
    const sb = getSB();
    const bucket = getBucket();

    const ext = (file.name.split(".").pop() || "jpg")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";

    const path = `avatars/${userId}.${ext}`;

    const { error } = await sb.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (error) throw error;

    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  async function renderHeader() {
    const slot = qs("#mmgProfileSlot");
    if (!slot) return;

    const user = await getUser();
    slot.innerHTML = "";

    if (!user) {
      const a = document.createElement("a");
      a.className = "pill";
      a.href = "login.html?redirect=" + encodeURIComponent(location.pathname + location.search);
      a.textContent = "Se connecter";
      slot.appendChild(a);
      return;
    }

    const profile = await ensureProfileRow(user);
    const name = profile?.display_name || "Mon profil";
    const avatar = profile?.avatar_url || "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mmg-profbtn";
    btn.innerHTML = `
      <span class="mmg-profavatar">${avatar ? `<img src="${avatar}" alt="">` : ""}</span>
      <span class="mmg-profname">${name}</span>
    `;
    btn.addEventListener("click", () => window.MMGProfile.open());
    slot.appendChild(btn);
  }

  async function fillModal() {
    const sb = getSB();
    const user = await getUser();

    const signedOutBox = qs("#pfSignedOut");
    const signedInBox = qs("#pfSignedIn");
    const loginLink = qs("#pfLoginLink");

    if (!sb) return;

    if (!user) {
      if (signedOutBox) signedOutBox.hidden = false;
      if (signedInBox) signedInBox.hidden = true;
      if (loginLink) loginLink.href = "login.html?redirect=" + encodeURIComponent(location.pathname + location.search);
      return;
    }

    if (signedOutBox) signedOutBox.hidden = true;
    if (signedInBox) signedInBox.hidden = false;

    const profile = await ensureProfileRow(user);

    qs("#pfEmail") && (qs("#pfEmail").textContent = user.email || "");
    qs("#pfName") && (qs("#pfName").value = profile?.display_name || "");

    const img = qs("#pfAvatarPreview");
    const removeBtn = qs("#pfRemoveAvatar");
    const input = qs("#pfAvatar");

    const avatarUrl = profile?.avatar_url || "";

    if (img) {
      if (avatarUrl) {
        img.src = avatarUrl;
        img.style.display = "block";
      } else {
        img.removeAttribute("src");
        img.style.display = "none";
      }
    }

    if (removeBtn) removeBtn.style.display = avatarUrl ? "inline-flex" : "none";

    if (input && img && removeBtn) {
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        img.src = URL.createObjectURL(f);
        img.style.display = "block";
        removeBtn.style.display = "inline-flex";
      };
    }
  }

  async function saveProfile() {
    const sb = getSB();
    const user = await getUser();
    if (!sb || !user) return;

    const msg = qs("#pfMsg");
    const displayName = (qs("#pfName")?.value || "").trim();
    const file = qs("#pfAvatar")?.files?.[0] || null;

    if (msg) msg.textContent = "Enregistrement…";
    if (!displayName) { if (msg) msg.textContent = "Pseudo obligatoire."; return; }

    try {
      let avatarUrl = null;

      const { data: existing } = await sb
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      avatarUrl = existing?.avatar_url || null;
      if (file) avatarUrl = await uploadAvatar(user.id, file);

      const { error } = await sb.from("profiles").update({
        display_name: displayName,
        avatar_url: avatarUrl,
      }).eq("id", user.id);

      if (error) throw error;

      if (msg) msg.textContent = "Profil mis à jour ✅";
      toast("Profil mis à jour ✅");
      await renderHeader();
      await fillModal();
    } catch (e) {
      console.error(e);
      if (msg) msg.textContent = e?.message || "Erreur sauvegarde";
    }
  }

  async function removeAvatar() {
    const sb = getSB();
    const user = await getUser();
    if (!sb || !user) return;

    const msg = qs("#pfMsg");
    if (msg) msg.textContent = "Suppression…";

    try {
      const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) throw error;

      const img = qs("#pfAvatarPreview");
      const removeBtn = qs("#pfRemoveAvatar");
      const input = qs("#pfAvatar");

      if (img) { img.removeAttribute("src"); img.style.display = "none"; }
      if (removeBtn) removeBtn.style.display = "none";
      if (input) input.value = "";

      if (msg) msg.textContent = "Avatar retiré ✅";
      await renderHeader();
    } catch (e) {
      console.error(e);
      if (msg) msg.textContent = e?.message || "Erreur";
    }
  }

  async function signOut() {
    const sb = getSB();
    await sb?.auth?.signOut?.();
    toast("Déconnecté");
    window.MMGProfile.close();
    await renderHeader();
  }

  window.MMGProfile = {
    async init() {
      mountModalIfMissing();

      qs("#pfClose")?.addEventListener("click", () => this.close());
      qs("#pfSave")?.addEventListener("click", saveProfile);
      qs("#pfRemoveAvatar")?.addEventListener("click", removeAvatar);
      qs("#pfLogout")?.addEventListener("click", signOut);
      qs("#pfOpen")?.addEventListener("click", () => this.open());

      document.addEventListener("partials:loaded", () => renderHeader());
      getSB()?.auth?.onAuthStateChange?.(() => renderHeader());

      await renderHeader();
    },

    async open() {
      const modal = qs("#pfModal");
      if (!modal) return;
      modal.hidden = false;
      document.body.style.overflow = "hidden";
      setInert(true);
      await fillModal();
      setTimeout(() => qs("#pfName")?.focus(), 0);
    },

    close() {
      const modal = qs("#pfModal");
      if (!modal) return;
      modal.hidden = true;
      document.body.style.overflow = "";
      setInert(false);
    },
  };

  window.addEventListener("DOMContentLoaded", () => window.MMGProfile.init());
})();
