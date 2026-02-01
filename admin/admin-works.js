/* admin/js/admin-works.js
   CRUD "works" + upload image cover
   Table works attendue: id, title, slug, status, sort_order, image_path, image_alt, updated_at
*/

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const els = () => ({
    list: $("[data-works-list]"),
    form: $("[data-work-form]"),
    title: $("[data-work-title]"),
    status: $("[data-work-status]"),
    sort: $("[data-work-sort]"),
    file: $("[data-work-file]"),
    alt: $("[data-work-alt]"),
    save: $("[data-work-save]"),
    cancel: $("[data-work-cancel]"),
    newBtn: $("[data-work-new]"),
    preview: $("[data-work-preview]"),
    msg: $("[data-works-msg]"),
  });

  let editingId = null;

  const setMsg = (t) => {
    const { msg } = els();
    if (!msg) return;
    msg.textContent = t || "";
  };

  const resetForm = () => {
    const e = els();
    if (!e.form) return;
    editingId = null;
    e.form.reset?.();
    if (e.title) e.title.value = "";
    if (e.status) e.status.value = "draft";
    if (e.sort) e.sort.value = "0";
    if (e.alt) e.alt.value = "";
    if (e.file) e.file.value = "";
    if (e.preview) e.preview.innerHTML = "";
    setMsg("");
  };

  const renderPreview = (url, alt) => {
    const { preview } = els();
    if (!preview) return;
    if (!url) {
      preview.innerHTML = "";
      return;
    }
    preview.innerHTML = `
      <div style="display:flex; gap:12px; align-items:center; margin-top:8px;">
        <img src="${url}" alt="${escapeHtml(alt || "")}" style="width:88px;height:88px;object-fit:cover;border-radius:12px;border:1px solid rgba(255,255,255,.12);" />
        <div style="opacity:.85;font-size:.9rem;">Aperçu</div>
      </div>
    `;
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  async function fetchWorks() {
    const { data, error } = await SB.db
      .from("works")
      .select("id,title,status,sort_order,image_path,image_alt,updated_at")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  function worksRow(w) {
    const imgUrl = w.image_path ? SB.getPublicUrl(w.image_path) : "";
    const badge =
      w.status === "published" ? "✅ Publié" : w.status === "draft" ? "📝 Brouillon" : "📦 Archivé";

    return `
      <div data-work-row="${w.id}" style="display:flex;gap:12px;align-items:center;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:14px;margin:8px 0;">
        <div style="width:56px;height:56px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.12);flex:0 0 auto;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;">
          ${imgUrl ? `<img src="${imgUrl}" alt="${escapeHtml(w.image_alt || w.title)}" style="width:56px;height:56px;object-fit:cover;">` : `<span style="opacity:.5;">—</span>`}
        </div>

        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(w.title)}
          </div>
          <div style="opacity:.75;font-size:.9rem;">${badge} · ordre: ${w.sort_order}</div>
        </div>

        <div style="display:flex;gap:8px;flex:0 0 auto;">
          <button data-action="edit" data-id="${w.id}">Modifier</button>
          <button data-action="toggle" data-id="${w.id}" data-status="${w.status}">
            ${w.status === "published" ? "Dépublier" : "Publier"}
          </button>
          <button data-action="delete" data-id="${w.id}" style="opacity:.9;">Supprimer</button>
        </div>
      </div>
    `;
  }

  async function renderList() {
    const e = els();
    if (!e.list) return;
    setMsg("Chargement…");
    const works = await fetchWorks();
    e.list.innerHTML = works.map(worksRow).join("") || `<div style="opacity:.7;">Aucune œuvre.</div>`;
    setMsg("");
  }

  async function loadToForm(id) {
    const { data, error } = await SB.db
      .from("works")
      .select("id,title,status,sort_order,image_path,image_alt")
      .eq("id", id)
      .single();

    if (error) throw error;

    editingId = data.id;

    const e = els();
    e.title.value = data.title || "";
    e.status.value = data.status || "draft";
    e.sort.value = String(data.sort_order ?? 0);
    e.alt.value = data.image_alt || data.title || "";

    const url = data.image_path ? SB.getPublicUrl(data.image_path) : "";
    renderPreview(url, data.image_alt || data.title);
  }

  function getFileExt(name) {
    const parts = String(name || "").split(".");
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : "jpg";
    return ext.replace(/[^a-z0-9]/g, "") || "jpg";
  }

  async function uploadCover(workId, file) {
    const ext = getFileExt(file.name);
    const path = `works/${workId}/cover.${ext}`;
    const { error } = await SB.storage.from(SB.cfg.bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (error) throw error;
    return path;
  }

  async function createWorkBase({ title, status, sort_order, image_alt }) {
    const slug = SB.slugify(title);
    const { data, error } = await SB.db
      .from("works")
      .insert({
        title,
        slug: slug || null,
        status,
        sort_order,
        image_alt: image_alt || title,
        created_by: (await SB.auth.getUser()).data.user?.id || null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async function updateWorkBase(id, patch) {
    const { error } = await SB.db.from("works").update(patch).eq("id", id);
    if (error) throw error;
  }

  async function onSave(e) {
    e.preventDefault();
    const el = els();

    const title = (el.title?.value || "").trim();
    if (!title) return alert("Titre obligatoire.");

    const status = el.status?.value || "draft";
    const sort_order = parseInt(el.sort?.value || "0", 10) || 0;
    const image_alt = (el.alt?.value || "").trim() || title;
    const file = el.file?.files?.[0] || null;

    try {
      setMsg("Enregistrement…");

      if (!editingId) {
        // Create first
        const work = await createWorkBase({ title, status, sort_order, image_alt });

        // Upload image if provided
        if (file) {
          const path = await uploadCover(work.id, file);
          await updateWorkBase(work.id, { image_path: path, image_alt });
        }

      } else {
        // Update base
        const patch = {
          title,
          status,
          sort_order,
          image_alt,
          slug: SB.slugify(title) || null,
        };
        await updateWorkBase(editingId, patch);

        // Upload new image if provided
        if (file) {
          const path = await uploadCover(editingId, file);
          await updateWorkBase(editingId, { image_path: path, image_alt });
        }
      }

      resetForm();
      await renderList();
      setMsg("✅ Sauvegardé.");
      setTimeout(() => setMsg(""), 1200);
    } catch (err) {
      console.error(err);
      alert("Erreur: " + (err?.message || "unknown"));
      setMsg("");
    }
  }

  async function onTogglePublish(id, currentStatus) {
    const next = currentStatus === "published" ? "draft" : "published";
    await updateWorkBase(id, { status: next });
    await renderList();
  }

  async function onDelete(id) {
    if (!confirm("Supprimer cette œuvre ? (image incluse)")) return;

    // Get image_path
    const { data, error } = await SB.db.from("works").select("image_path").eq("id", id).single();
    if (error) throw error;

    // Remove storage file
    if (data?.image_path) {
      await SB.storage.from(SB.cfg.bucket).remove([data.image_path]);
    }

    // Delete row
    const { error: e2 } = await SB.db.from("works").delete().eq("id", id);
    if (e2) throw e2;

    await renderList();
  }

  function wireUI() {
    const e = els();

    e.newBtn?.addEventListener("click", () => resetForm());
    e.cancel?.addEventListener("click", (ev) => {
      ev.preventDefault();
      resetForm();
    });

    e.form?.addEventListener("submit", onSave);

    // Live preview when selecting file
    e.file?.addEventListener("change", () => {
      const file = e.file.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const alt = (e.alt?.value || "").trim();
      renderPreview(url, alt);
    });

    // List actions (event delegation)
    e.list?.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");

      try {
        if (action === "edit") {
          await loadToForm(id);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (action === "toggle") {
          await onTogglePublish(id, btn.getAttribute("data-status"));
        } else if (action === "delete") {
          await onDelete(id);
        }
      } catch (err) {
        console.error(err);
        alert("Erreur: " + (err?.message || "unknown"));
      }
    });
  }

  async function init() {
    resetForm();
    wireUI();
    await renderList();
  }

  window.AdminWorks = { init };
})();
