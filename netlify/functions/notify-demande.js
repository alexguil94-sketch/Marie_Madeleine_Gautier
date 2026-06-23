// netlify/functions/notify-demande.js
// Envoie un email de notification à chaque nouvelle demande d'œuvre.
//
// Variables d'environnement à configurer dans Netlify (Site → Environment variables) :
//   RESEND_API_KEY    → clé API Resend (gratuit : resend.com, 3 000 emails/mois)
//   NOTIFY_FROM_EMAIL → adresse expéditrice vérifiée sur Resend
//                       (ex : notifications@mariemadeleinegautier.fr)
//                       Si absent, utilise onboarding@resend.dev (mode test Resend)
//
// Sans RESEND_API_KEY, la fonction répond 200 sans envoyer d'email.
// La demande est de toute façon stockée dans Supabase.

const TO_EMAIL   = "alexis.guillotin10@gmail.com";
const FROM_EMAIL = process.env.NOTIFY_FROM_EMAIL || "onboarding@resend.dev";

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid json" });
  }

  const { titre, nom, email, message, oeuvre_id } = body;

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.warn("[notify-demande] RESEND_API_KEY non configuré — demande stockée, email non envoyé.");
    return json(200, { ok: true, notified: false, reason: "no_api_key" });
  }

  const htmlBody = `
    <div style="font-family:sans-serif; max-width:560px; color:#222">
      <h2 style="margin:0 0 20px; font-size:20px">Nouvelle demande d'œuvre</h2>
      <table style="border-collapse:collapse; width:100%">
        <tr>
          <td style="padding:8px 16px 8px 0; font-weight:700; white-space:nowrap; vertical-align:top">Œuvre :</td>
          <td style="padding:8px 0">${esc(titre)} <span style="opacity:.5; font-size:13px">(id: ${esc(oeuvre_id)})</span></td>
        </tr>
        <tr>
          <td style="padding:8px 16px 8px 0; font-weight:700; white-space:nowrap">Nom :</td>
          <td style="padding:8px 0">${esc(nom)}</td>
        </tr>
        <tr>
          <td style="padding:8px 16px 8px 0; font-weight:700; white-space:nowrap">Email :</td>
          <td style="padding:8px 0"><a href="mailto:${esc(email)}" style="color:#b58b40">${esc(email)}</a></td>
        </tr>
        ${message ? `
        <tr>
          <td style="padding:8px 16px 8px 0; font-weight:700; white-space:nowrap; vertical-align:top">Message :</td>
          <td style="padding:8px 0; white-space:pre-wrap">${esc(message)}</td>
        </tr>` : ""}
      </table>
      <hr style="margin:24px 0; border:none; border-top:1px solid #eee">
      <p style="font-size:12px; opacity:.45; margin:0">
        Répondre directement à <a href="mailto:${esc(email)}">${esc(email)}</a>
        — Marie-Madeleine Gautier, notification automatique
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        reply_to: email || undefined,
        subject: `Demande d'œuvre : ${titre || "(sans titre)"}`,
        html: htmlBody,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("[notify-demande] Resend error:", data);
      // On renvoie 200 car la demande est déjà dans Supabase
      return json(200, { ok: true, notified: false, reason: "send_failed" });
    }

    return json(200, { ok: true, notified: true });
  } catch (err) {
    console.error("[notify-demande] Exception:", err);
    return json(200, { ok: true, notified: false, reason: "exception" });
  }
};
