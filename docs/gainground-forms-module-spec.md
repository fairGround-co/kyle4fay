# gainGround Forms Module — Spec and Handoff

Status: design approved by Kyle 2026-10-01 (widget-first, staging queue, repeat-submitter auto-link).
Owner: gainGround repo. This copy lives in kyle4fay only as the integration contract; the
canonical version should be committed to gainGround `docs/design_forms_module.md` with a GG decision.

## 1. Purpose

A tenant-configurable public form (volunteer offer, yard sign request, custom fields) that any
website can embed with one script tag, with all processing and storage in gainGround. Host sites
are a data-collection surface only. kyle4fay is the first tenant site.

Model: assemblyGround `functions/src/forms/schema.ts` (FormSchema, FieldDefinition, visible_when,
required_at, checkFormSchema) and `intake/submitApplication.ts` (schema-version pinning, throttle).

## 2. Data model

### 2.1 Form definition (tenant-private)

`campaigns/{cid}/forms/{formId}`

```
{
  campaign_id, name, status: 'draft'|'open'|'closed',
  public_form_id,                 // unguessable; mirrors to public_forms/{public_form_id}
  schema_version: int,            // bump on any schema/routing change
  schema: FormSchema,             // 2.3
  routing: RoutingRule[],         // 2.4
  allowed_origins: ['https://kyle4fay.org', ...],
  theme: { tokens: {accent, accent_text, ...} },   // allowlisted tokens only
  consent: { sms_text, sms_version, privacy_url },
  limits: { per_day_max, per_email_per_day: 5 },
  created_at, updated_at, updated_by
}
```

Edit rights: manager, comms_manager. Rules: write by those roles only; never public.

### 2.2 Public projection

`public_forms/{public_form_id}` written by a trigger on the form doc. Public read allowed by
rules ONLY if the doc `hasOnly([schema, schema_version, is_open, theme, consent, labels])`.
No campaign_id in the projection. Deleting or rotating public_form_id revokes every embed.

### 2.3 FormSchema

Same as assemblyGround: `{ version, fields: FieldDefinition[] }`.
FieldDefinition: `key, label, type, required_at ('submission'|null), help?, options?,
max_length?, visible_when?: {field, op, value}`.
Types: text, longtext, select, multiselect, boolean, email, phone, address.
(No file, money, date in v1.)

`visible_when` needs a `contains` operator for multiselect in addition to `equals`.

Known keys (fixed vocabulary; drive matching and contact creation):
`name, email, phone, address, sms_consent, volunteer_roles, sign_request, sign_address`.
Any other key is a tenant custom field: stored in `answers`, never matched, shown in review UI.

Default kyle4fay schema: name (req), email (req), phone, volunteer_roles (multiselect:
knock_doors, phone_calls, yard_sign, house_party, spread_word, other), sign_address
(address, visible_when volunteer_roles contains yard_sign, required when visible), sms_consent
(boolean, never pre-checked).

### 2.4 Routing rules

Routing lives on the form and is stamped onto each submission as `routing_snapshot` so a later
rule edit never rewrites history. A submission may match several rules and produce several
contact events (e.g. sign request + volunteer offer).

```
RoutingRule {
  id,
  when: { field, op: 'equals'|'contains'|'truthy', value? },
  emit: {
    event_kind: 'web_signup',             // new kind; must be added to EVENT_KINDS
    channel: 'other',
    flags: { volunteer_interest?, sign_request?, donate_interest? },
    contact_role: 'volunteer'|'sign_host'|'supporter'|...,
    sign: { create: true, address_field: 'sign_address' }?,   // creates signs doc
    tags?: [string]
  }
}
```

kyle4fay defaults:
- volunteer_roles contains any value except yard_sign: web_signup, volunteer_interest, role volunteer
- volunteer_roles contains yard_sign: web_signup, sign_request, role sign_host, sign.create
- sms_consent truthy: opt_in with channel text, consent snapshot attached (opt_in is the right kind here: it is a consent event, not a signup)

Decided (Kyle, 2026-10-01): form-sourced events use a new EVENT_KIND `web_signup`, added to the contact_events vocabulary in rules and `app/src/lib/events.js`. GG decision entry required.

### 2.5 Submission (staging, append-only, admin-only)

`campaigns/{cid}/form_submissions/{id}` (UUIDv7)

```
{
  campaign_id, form_id, public_form_id, schema_version,
  submitted_at, answers: {...},              // validated against schema
  normalized: { email, phone_e164, address_components? },
  consent: { sms: bool, text, version },     // snapshot at write time
  client: { ip_hash, user_agent, referer, origin },
  attestation: { provider: 'firebase_app_check', app_id, issued_at, recaptcha_score? },
  routing_snapshot: RoutingRule[],
  match: {                                   // section 3
    state: 'resolved'|'contested'|'ambiguous'|'unmatched'|'auto_linked',
    candidates: [{subject_kind, subject_id, score, evidence:[...]}],
    computed_at
  },
  review: { status: 'pending'|'committed'|'dismissed', by, at, decision? },
  produced: { contact_event_ids: [], contact_id?, sign_id? }
}
```

Rules: `allow write: if false` (function writes). Read: contactTier roles + super_admin.
IP stored hashed only (sha256 + per-project salt); raw IP never persisted.

## 3. Matching and review (GG-139)

On create, a function runs the matcher:
- email via `contact_points._normalize_email`, phone via `_normalize_phone` (E.164)
- name via `ingest/name_match.match_owner_name` against voters in the tenant's jurisdiction
- address via parcel/component index, then household adjacency (#1366 requirement)

Candidates get a state per GG-139. Nothing auto-resolves EXCEPT:

**Approved exception (needs GG entry):** if the normalized email equals the email of an existing
`contacts` row whose `origin == 'web_form'` (a human already adjudicated that identity from a
prior submission), the submission is `auto_linked` to that contact and committed without review.
Auto-linked rows still appear in the queue under a filter for audit.

Review UI (new route, the #1366 queue): list by state; actions link-to-voter, create-contact,
dismiss. Roles: contactTier (manager, field_manager, fundraiser, treasurer).

Commit (transaction): for each matched routing rule write a `contact_events` row
(subject from resolution, kind/channel/flags from rule, `source: 'web_form'`,
`source_ref: form_submissions/{id}`), upsert `contacts` (origin `web_form`, origin_ref,
origin_resolution), create `signs` doc when the rule says so. Record ids in `produced`.

Requires: new CONTACT_ORIGINS token `web_form` in `app/src/lib/contacts.js` + rules + parity
test; rules allowlist additions on contacts.

## 4. Widget contract (host site)

```html
<div id="gg-form"></div>
<script async src="https://HOST/embed/v1.js"
        data-form="PUBLIC_FORM_ID" data-target="#gg-form"></script>
```

- Renders into Shadow DOM. No host CSS leaks in; no widget CSS leaks out.
- Theming via CSS custom properties on the host element: `--gg-accent, --gg-accent-text,
  --gg-font, --gg-radius, --gg-field-border, --gg-text, --gg-muted, --gg-bg`. Nothing else.
- Fetches `public_forms/{id}` (Firestore REST or a small GET function), renders schema,
  honors visible_when, never pre-checks consent.
- Honeypot field + 3s minimum fill time client-side (advisory only).
- App Check (reCAPTCHA Enterprise) initialized inside the widget against gainGround's app.
  Tenant host domains must be added to the Enterprise key: an onboarding step, platform-owned.
- Submit: callable `submitForm({public_form_id, schema_version, answers})`.
- Emits DOM events on the host element: `gg:submitted`, `gg:error`, for host analytics.
- iframe mode (`/embed/v1/frame/PUBLIC_FORM_ID`) is a later fallback using the same submit.

## 5. Submit function (`submit_form`, Python, gen2)

1. CORS: reflect Origin only if it is in the form's `allowed_origins`; else 403.
2. App Check token required; verified; single-use (store jti hash with TTL).
3. Throttle (assemblyGround `throttle.ts` pattern, hashed counters, TTL): 20/IP/hour before
   validation; 5/tenant+email/day inside the transaction.
4. Resolve public_form_id to form; require status open; require schema_version match else
   `form_changed`.
5. Validate answers against schema: unknown keys rejected, hidden fields must be absent,
   type/length/pattern checks, required_at submission.
6. Normalize known keys; snapshot consent text; stamp routing_snapshot; write submission.
7. Return `{ok, submission_id}`. Never return match state to the public caller.
8. `max_instances` cap. Logs contain no PII.

Pure validation in `functions/forms_schema.py` with unit tests; deploy entry in
`docs/deploy_functions.py`.

## 6. Threats and controls

| Threat | Control |
|---|---|
| Tenant data crossover | public_form_id resolves server-side; campaign_id never client-supplied |
| Embed on unauthorized site | Origin allowlist enforced at submit |
| Bot floods | App Check single-use, throttles, per-form caps, max_instances |
| Schema drift mid-session | schema_version pinning |
| Tenant-authored XSS | labels/help rendered as text only; privacy link from allowlisted field |
| Forged identity | staging + GG-139 review; auto-link only on prior human adjudication |
| PII leakage | IP hashed, staging read limited to contactTier, no PII in logs/commits |
| Consent disputes | consent text + version snapshot per submission |
| Rule edits rewriting history | routing_snapshot on each submission; contact_events append-only |

## 7. kyle4fay migration

1. Interim yard-sign address change shipped (fairGround-co/kyle4fay#3, merged 2026-10-04).
2. Form card replaced with the widget tag (fairGround-co/kyle4fay#5, merged 2026-10-04,
   after the review queue gainground#1720 went live).
3. Batch import gainground#1724 ran 2026-10-04: 9 kyle4fay-2026 `contacts` docs, 10 activity
   entries, 10 `form_submissions` written as `source: legacy_import`, all pending review.
   Counts reconciled exactly. kyle4fay-2026 was read only.
4. Site backend removed from this repo (functions/, admin.html, firestore.rules,
   firebase.json, js/firebase-config.js). The kyle4fay-2026 Firebase project itself is kept
   until Kyle has reviewed the 10 imported submissions in the queue, then retired by Kyle.

## 8. gainGround work items (suggested issues)

1. Form definition schema + checkFormSchema port, with tests
2. public_forms projection trigger + rules (hasOnly)
3. submit_form function: validation, throttle, App Check single-use, Origin check
4. Matcher on submission create (email/phone/name/address) + GG-139 states
5. Review queue route (#1366) + commit transaction + web_form origin
6. Repeat-submitter auto-link (GG decision)
7. Embed script: Shadow DOM widget, token contract, App Check init
8. Form editor UI for managers/comms_managers (labels, fields, routing, origins)
9. kyle4fay batch import
10. GG decision entries: forms module, routing snapshot, auto-link exception, event kind choice

Session rules apply: worktree per issue, CHANGELOG, tests per product change, adversarial
review for prod-affecting pieces, Kyle sign-off on new write paths (GG-154) and UI shape (GG-59).
