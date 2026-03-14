(function () {
  const form = document.getElementById("contactForm");
  if (!form) return;

  const note = document.getElementById("contactNote");
  const helpText = document.getElementById("contactHelpText");
  const submitButton = form.querySelector('button[type="submit"]');

  const MESSAGES = {
    fr: {
      sending: "Envoi du message…",
      sent: "Message envoyé. Merci, votre message a bien été transmis.",
      error: "Impossible d’envoyer le message pour le moment. Réessayez plus tard.",
      note: "Utilisez ce formulaire pour envoyer un message directement depuis le site.",
    },
    en: {
      sending: "Sending your message…",
      sent: "Message sent. Thank you, your message has been delivered.",
      error: "Unable to send the message right now. Please try again later.",
      note: "Use this form to send a message directly from the website.",
    },
    "zh-Hant": {
      sending: "正在送出訊息…",
      sent: "訊息已送出，謝謝。您的訊息已成功提交。",
      error: "目前無法送出訊息，請稍後再試。",
      note: "請使用這個表單直接從網站送出訊息。",
    },
  };

  function getLocale() {
    const raw = String(document.documentElement.lang || "fr").trim().toLowerCase();
    if (raw.startsWith("en")) return "en";
    if (raw.startsWith("zh")) return "zh-Hant";
    return "fr";
  }

  function text(key) {
    const locale = getLocale();
    return MESSAGES[locale][key] || MESSAGES.fr[key] || "";
  }

  function encode(data) {
    return new URLSearchParams(data).toString();
  }

  function setNote(message) {
    if (note) note.textContent = message;
  }

  let noteState = "";

  function syncTexts() {
    if (helpText) {
      helpText.textContent = text("note");
    }
    if (noteState) {
      setNote(text(noteState));
    }
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("sent") === "1") {
    noteState = "sent";
    if (window.history.replaceState) {
      params.delete("sent");
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }

  syncTexts();
  window.addEventListener("i18n:changed", syncTexts);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    formData.set("form-name", form.getAttribute("name") || "contact");

    if (submitButton) submitButton.disabled = true;
    noteState = "sending";
    setNote(text(noteState));

    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode(formData),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      form.reset();
      noteState = "sent";
      setNote(text(noteState));
    } catch (error) {
      console.error("Contact form submission failed", error);
      noteState = "error";
      setNote(text(noteState));
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
})();
