const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const turnstileSecret = defineSecret("TURNSTILE_SECRET");

let db;
function ensureApp() {
  if (!db) {
    initializeApp();
    db = getFirestore();
  }
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "").slice(-10);
}

function emailToDocId(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  return "c_" + Math.abs(hash).toString(36) + "_" + email.replace(/[^a-z0-9]/g, "_");
}

exports.submitVolunteer = onRequest(
  { cors: ["https://kyle4fay.org", "http://localhost:3000"], secrets: [turnstileSecret] },
  async (req, res) => {
    ensureApp();

    if (req.method !== "POST") {
      res.status(405).send("method not allowed");
      return;
    }

    const { name, email, phone, roles, turnstileToken } = req.body;

    if (!name || !email || !roles || !roles.length || !turnstileToken) {
      res.status(400).send("missing required fields");
      return;
    }

    // Canonical Turnstile siteverify
    // On Cloud Functions gen2 the client IP is the first X-Forwarded-For hop.
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
    let result;
    try {
      const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET,
          response: turnstileToken,
          remoteip: clientIp,
        }),
      });
      if (!r.ok) throw new Error(`siteverify ${r.status}`);
      result = await r.json();
    } catch (err) {
      console.error("Turnstile siteverify error:", err);
      res.status(403).send("forbidden");
      return;
    }
    if (!result.success) {
      console.warn("Turnstile rejected:", result["error-codes"]);
      res.status(403).send("forbidden");
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const docId = emailToDocId(normalizedEmail);
    const contactRef = db.collection("contacts").doc(docId);

    // Audit trail. Attached per-submission rather than to the contact, so a
    // repeat signup appends a new record instead of overwriting the old one.
    // `verification` is Cloudflare's own attestation of the challenge that
    // gated this write — challenge_ts is Cloudflare's clock, not ours.
    const activityEntry = {
      source: "volunteer_form",
      timestamp: new Date().toISOString(),
      volunteerRole: roles.join(", "),
      ip: clientIp || "",
      user_agent: String(req.headers["user-agent"] || "").slice(0, 512),
      referer: String(req.headers["referer"] || "").slice(0, 512),
      verification: {
        provider: "turnstile",
        challenge_ts: result.challenge_ts || "",
        hostname: result.hostname || "",
        action: result.action || "",
      },
    };

    const data = {
      name: name || "",
      email: normalizedEmail,
      sources: FieldValue.arrayUnion("volunteer_form"),
      status: "new",
      updated_at: FieldValue.serverTimestamp(),
      activity: FieldValue.arrayUnion(activityEntry),
      tags: FieldValue.arrayUnion("volunteer"),
      volunteer_roles: FieldValue.arrayUnion(...roles),
    };

    if (phone) {
      data.phone = normalizePhone(phone);
    }

    try {
      // created_at must survive re-submission, so it is written only when the
      // document does not already exist. A plain merge would reset it every
      // time and destroy the first-contact date.
      await db.runTransaction(async (tx) => {
        const existing = await tx.get(contactRef);
        tx.set(
          contactRef,
          existing.exists ? data : { ...data, created_at: FieldValue.serverTimestamp() },
          { merge: true }
        );
      });
      res.json({ ok: true, id: docId });
    } catch (err) {
      console.error("Firestore write error:", err);
      res.status(500).send("internal error");
    }
  }
);

exports.listContacts = onRequest(
  { cors: ["https://kyle4fay.org", "http://localhost:3000"] },
  async (req, res) => {
    ensureApp();

    if (req.method !== "POST") {
      res.status(405).send("method not allowed");
      return;
    }

    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      res.status(401).json({ error: "no_token" });
      return;
    }

    let email;
    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      if (!decoded.email || !decoded.email_verified) {
        res.status(403).json({ error: "unverified_email" });
        return;
      }
      email = decoded.email.toLowerCase();
    } catch (err) {
      console.warn("ID token verification failed:", err.message);
      res.status(401).json({ error: "invalid_token" });
      return;
    }

    const adminsDoc = await db.collection("config").doc("admins").get();
    const allowed = (adminsDoc.exists ? adminsDoc.data().emails : []) || [];
    if (!allowed.map((e) => String(e).toLowerCase()).includes(email)) {
      console.warn("Access denied for:", email);
      res.status(403).json({ error: "not_allowed", email });
      return;
    }

    try {
      const snap = await db.collection("contacts").orderBy("created_at", "desc").get();
      const contacts = snap.docs.map((doc) => {
        const d = doc.data();

        // Surface the newest submission's client signals. arrayUnion appends,
        // but that ordering is not contractual, so sort on timestamp instead.
        // Records predating audit capture simply have no signals to report.
        const latest = (d.activity || [])
          .slice()
          .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")))
          .pop() || {};

        return {
          name: d.name || "",
          email: d.email || "",
          phone: d.phone || "",
          roles: d.volunteer_roles || [],
          tags: d.tags || [],
          status: d.status || "",
          created_at: d.created_at ? d.created_at.toDate().toISOString() : null,
          // IP is deliberately withheld: this list is shared with media staff
          // who need contact details, not identifiers for political activity.
          user_agent: latest.user_agent || "",
          referer: latest.referer || "",
        };
      });
      res.json({ ok: true, count: contacts.length, contacts });
    } catch (err) {
      console.error("Firestore read error:", err);
      res.status(500).send("internal error");
    }
  }
);
