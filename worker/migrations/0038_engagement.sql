-- ─────────────────────────────────────────────────────────────────────────────
-- Customer Engagement: the server-side spine.
--
-- ── Why any of this is server-side at all ──
--
-- The CRM in this app is a browser-owned cache. `crm_contacts` is one JSON blob
-- that `serverData.ts` pushes to D1 on a 900ms debounce, and the browser is the
-- only writer. That works because every writer so far has been a signed-in
-- person with the app open.
--
-- Every channel below has no browser and no session: a form on somebody else's
-- website, a chat widget, an inbound voice call. If those wrote into the blob,
-- the next push from an owner with the app open would overwrite them, and a
-- lead captured at 2am would vanish at 9am with nothing in any log. That is the
-- worst shape of bug this codebase can produce — silent, delayed, and invisible
-- to the person losing money.
--
-- So public intake owns its own rows here, and the browser *merges* them into
-- the CRM rather than the other way round. Nothing overwrites anything.
--
-- ── Tenancy ──
--
-- Every table carries `account_id` and every read is scoped by it. Not one of
-- these is reachable by a public caller without a key that resolves to exactly
-- one account — see `crm_widgets.public_key` and `crm_forms.slug`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── People who arrived through a public channel ─────────────────────────────
--
-- Deliberately not called "contacts": these are captures, and the CRM's own
-- contact list stays the customer-facing idea. `crm_id` is filled in once the
-- browser has merged one into the blob, which is what stops a second merge
-- making a duplicate.
CREATE TABLE IF NOT EXISTS crm_engage_people (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,

  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  company       TEXT NOT NULL DEFAULT '',

  -- Where they came from, kept for attribution: 'form' | 'chat' | 'voice' |
  -- 'ticket' | 'booking'.
  source        TEXT NOT NULL DEFAULT '',
  source_ref    TEXT NOT NULL DEFAULT '',
  -- The page they were on, the referrer and any UTM values, as JSON. One column
  -- because nothing queries inside it — it is read back whole on a timeline.
  context       TEXT NOT NULL DEFAULT '{}',

  -- Set by the browser once this has been merged into `crm_contacts`. Until
  -- then it is empty, and the merge is what the client looks for.
  crm_id        TEXT NOT NULL DEFAULT '',
  merged_at     TEXT,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_engage_people_acct ON crm_engage_people (account_id, created_at DESC);
-- Deduplication is by address within a workspace, which is what the CRM itself
-- uses. Partial, because an anonymous chat has no email yet and several of
-- those must be able to coexist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_engage_people_email
  ON crm_engage_people (account_id, email) WHERE email != '';

-- ── Conversations ───────────────────────────────────────────────────────────
--
-- One row per thread, whatever channel it came in on. `channel` is what makes
-- WhatsApp or email a later addition rather than a second table.
CREATE TABLE IF NOT EXISTS crm_conversations (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  person_id     TEXT NOT NULL DEFAULT '',

  channel       TEXT NOT NULL DEFAULT 'chat',   -- chat | voice | form | email
  -- open | pending | closed. `pending` is waiting on the customer, which is a
  -- different queue from waiting on us.
  status        TEXT NOT NULL DEFAULT 'open',
  -- ai | human. Which one is answering *right now*; a human taking over sets
  -- this and the AI stops, which is section 54's "human override" in one column.
  handled_by    TEXT NOT NULL DEFAULT 'ai',
  assigned_to   TEXT NOT NULL DEFAULT '',       -- a user's email

  subject       TEXT NOT NULL DEFAULT '',
  -- Written when the AI hands over or makes a ticket, so a human does not have
  -- to read the whole thread to pick it up.
  ai_summary    TEXT NOT NULL DEFAULT '',
  -- What the visitor appears to want, for routing: support | sales | billing |
  -- technical | booking. Empty until something decides.
  intent        TEXT NOT NULL DEFAULT '',
  page_url      TEXT NOT NULL DEFAULT '',
  widget_id     TEXT NOT NULL DEFAULT '',

  -- Proves a returning visitor is the same anonymous person, without a login.
  -- Random, and useless on its own: it only ever matches one conversation row.
  visitor_key   TEXT NOT NULL DEFAULT '',

  last_at       TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_acct ON crm_conversations (account_id, status, last_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_person ON crm_conversations (person_id);
CREATE INDEX IF NOT EXISTS idx_conv_visitor ON crm_conversations (visitor_key);

CREATE TABLE IF NOT EXISTS crm_conversation_messages (
  id            TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  account_id    TEXT NOT NULL,

  -- visitor | ai | agent | system. `system` is "a human joined", "a ticket was
  -- made" — the things a transcript needs so it reads as an account of what
  -- happened rather than only of what was said.
  role          TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  -- Which knowledge the AI answered from, as JSON ids. So an answer can be
  -- traced to the article it came out of, which is the only defence against
  -- "the bot said we offer that".
  sources       TEXT NOT NULL DEFAULT '[]',
  -- Internal notes are agent-only and must never leave the building.
  internal      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_convmsg ON crm_conversation_messages (conversation_id, created_at ASC);

-- ── Tickets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_tickets (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  -- Short, human, per workspace: PC-1042. What somebody quotes on the phone.
  reference     TEXT NOT NULL,
  person_id     TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL DEFAULT '',

  subject       TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT '',
  priority      TEXT NOT NULL DEFAULT 'normal',  -- low | normal | high | urgent
  -- open | in_progress | waiting | resolved | closed
  status        TEXT NOT NULL DEFAULT 'open',
  assigned_to   TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'manual',  -- widget | ai | chat | form | manual
  ai_summary    TEXT NOT NULL DEFAULT '',
  resolution    TEXT NOT NULL DEFAULT '',

  -- Lets a customer open their own ticket from an emailed link with no account,
  -- the same bargain the booking engine already makes with its guest key.
  guest_key     TEXT NOT NULL DEFAULT '',

  resolved_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_acct ON crm_tickets (account_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ref ON crm_tickets (account_id, reference);

CREATE TABLE IF NOT EXISTS crm_ticket_messages (
  id            TEXT PRIMARY KEY,
  ticket_id     TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  role          TEXT NOT NULL,                  -- customer | agent | system
  author        TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  internal      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticketmsg ON crm_ticket_messages (ticket_id, created_at ASC);

-- A counter per workspace, so ticket references are short and sequential
-- without scanning the tickets table for MAX() under concurrency.
CREATE TABLE IF NOT EXISTS crm_ticket_counters (
  account_id    TEXT PRIMARY KEY,
  next_number   INTEGER NOT NULL DEFAULT 1
);

-- ── Forms ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_forms (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  -- The public address. Unique across the install, because a submission
  -- arrives with nothing but this to say whose form it is.
  slug          TEXT NOT NULL,

  headline      TEXT NOT NULL DEFAULT '',
  blurb         TEXT NOT NULL DEFAULT '',
  submit_label  TEXT NOT NULL DEFAULT 'Send',
  success_message TEXT NOT NULL DEFAULT '',
  redirect_url  TEXT NOT NULL DEFAULT '',

  -- The fields, as JSON. A column per field would be a schema change per form,
  -- and nothing queries inside a field definition.
  fields        TEXT NOT NULL DEFAULT '[]',

  -- What happens after a submission.
  create_person INTEGER NOT NULL DEFAULT 1,
  notify_emails TEXT NOT NULL DEFAULT '',
  workflow_id   TEXT NOT NULL DEFAULT '',
  ai_triage     INTEGER NOT NULL DEFAULT 0,
  consent_text  TEXT NOT NULL DEFAULT '',

  status        TEXT NOT NULL DEFAULT 'draft',  -- draft | live
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forms_acct ON crm_forms (account_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_slug ON crm_forms (slug);

CREATE TABLE IF NOT EXISTS crm_form_submissions (
  id            TEXT PRIMARY KEY,
  form_id       TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  person_id     TEXT NOT NULL DEFAULT '',

  -- Exactly what was submitted, kept whole and for ever. The contact derived
  -- from it can be edited later; this is the record of what was actually sent,
  -- which is the thing worth having in an argument.
  answers       TEXT NOT NULL DEFAULT '{}',
  context       TEXT NOT NULL DEFAULT '{}',

  ai_summary    TEXT NOT NULL DEFAULT '',
  ai_intent     TEXT NOT NULL DEFAULT '',
  ai_quality    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'new',    -- new | seen | actioned | spam
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions ON crm_form_submissions (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_form ON crm_form_submissions (form_id, created_at DESC);

-- ── AI agents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_ai_agents (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  avatar_url    TEXT NOT NULL DEFAULT '',
  purpose       TEXT NOT NULL DEFAULT 'support',  -- support | sales | both
  personality   TEXT NOT NULL DEFAULT 'professional',
  greeting      TEXT NOT NULL DEFAULT '',
  instructions  TEXT NOT NULL DEFAULT '',
  -- What the business is, in the agent's own words. The single biggest lever on
  -- whether its answers sound like the business or like a chatbot.
  business_info TEXT NOT NULL DEFAULT '',
  -- Questions it should try to get answered before offering to book.
  qualifying    TEXT NOT NULL DEFAULT '[]',

  -- Which of the controlled tools this agent may call, as JSON names. Absent
  -- means not permitted: an agent cannot book a meeting because somebody
  -- described it as helpful in its instructions.
  tools         TEXT NOT NULL DEFAULT '[]',

  hours_from    TEXT NOT NULL DEFAULT '09:00',
  hours_to      TEXT NOT NULL DEFAULT '17:00',
  hours_days    TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  -- What it says when it does not know. Stored rather than hardcoded, because
  -- the wording is the brand at exactly the moment the brand is under strain.
  fallback      TEXT NOT NULL DEFAULT '',
  escalation    TEXT NOT NULL DEFAULT 'human',   -- human | ticket | meeting | none

  status        TEXT NOT NULL DEFAULT 'draft',   -- draft | live
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_acct ON crm_ai_agents (account_id, created_at DESC);

-- ── Knowledge ───────────────────────────────────────────────────────────────
--
-- No vector store: this install has no embedding infrastructure and inventing
-- one behind a customer-facing AI is how a bot ends up confidently citing the
-- wrong document. Retrieval is lexical and the matched article is shown with
-- the answer, so a wrong retrieval is visible rather than laundered.
CREATE TABLE IF NOT EXISTS crm_kb_articles (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  -- article | faq | policy | product | page. Only shapes how it is shown.
  kind          TEXT NOT NULL DEFAULT 'article',
  tags          TEXT NOT NULL DEFAULT '',
  source_url    TEXT NOT NULL DEFAULT '',
  -- Only published articles are ever visible to a customer-facing agent. A
  -- draft is somebody thinking out loud, and the AI must not quote it.
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft | published
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_acct ON crm_kb_articles (account_id, status);

-- ── Widgets ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_widgets (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT 'Website chat',
  agent_id      TEXT NOT NULL DEFAULT '',

  -- What goes in the embed snippet. Public by design and useless on its own: it
  -- names a tenant and unlocks nothing but this widget's own configuration and
  -- its own conversations. No API key ever reaches a browser.
  public_key    TEXT NOT NULL,

  -- Hosts allowed to embed it, comma separated. Empty means anywhere, which is
  -- right for somebody testing and wrong once they are live — the screen says so.
  allowed_hosts TEXT NOT NULL DEFAULT '',

  title         TEXT NOT NULL DEFAULT '',
  subtitle      TEXT NOT NULL DEFAULT '',
  welcome       TEXT NOT NULL DEFAULT '',
  launcher      TEXT NOT NULL DEFAULT 'Chat with us',
  accent        TEXT NOT NULL DEFAULT '#5b46e5',
  position      TEXT NOT NULL DEFAULT 'right',
  offline_text  TEXT NOT NULL DEFAULT '',
  consent_text  TEXT NOT NULL DEFAULT '',

  -- Which entry points the widget offers, as JSON: chat, ticket, meeting, form.
  features      TEXT NOT NULL DEFAULT '["chat"]',
  form_id       TEXT NOT NULL DEFAULT '',
  booking_slug  TEXT NOT NULL DEFAULT '',
  show_branding INTEGER NOT NULL DEFAULT 1,

  status        TEXT NOT NULL DEFAULT 'draft',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_widget_key ON crm_widgets (public_key);
CREATE INDEX IF NOT EXISTS idx_widget_acct ON crm_widgets (account_id);

-- ── Calendar connections, for Google Meet ───────────────────────────────────
--
-- Refresh tokens are encrypted with the install secret, like every other
-- customer credential here, and are never returned to a browser.
CREATE TABLE IF NOT EXISTS crm_calendar_connections (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'google',
  -- Whose calendar. One workspace can connect several people.
  owner_email   TEXT NOT NULL,
  calendar_id   TEXT NOT NULL DEFAULT 'primary',
  refresh_token TEXT NOT NULL DEFAULT '',
  access_token  TEXT NOT NULL DEFAULT '',
  expires_at    TEXT,
  scope         TEXT NOT NULL DEFAULT '',
  last_error    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'connected',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cal_owner ON crm_calendar_connections (account_id, owner_email);

-- Where a booking's video meeting actually lives, kept beside the booking
-- rather than inside it so a second provider is a row and not a migration.
CREATE TABLE IF NOT EXISTS crm_meeting_links (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  booking_id    TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'google',
  event_id      TEXT NOT NULL DEFAULT '',
  meeting_url   TEXT NOT NULL DEFAULT '',
  host_email    TEXT NOT NULL DEFAULT '',
  starts_at     TEXT NOT NULL DEFAULT '',
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  status        TEXT NOT NULL DEFAULT 'created',
  last_error    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meetlink_booking ON crm_meeting_links (booking_id);
CREATE INDEX IF NOT EXISTS idx_meetlink_acct ON crm_meeting_links (account_id, starts_at DESC);

-- ── Voice ───────────────────────────────────────────────────────────────────
--
-- The model and the configuration exist; the provider does not. There is no
-- telephony in this install, so a voice agent reports that it has no provider
-- rather than appearing to answer calls. See `lib/voice.ts`.
CREATE TABLE IF NOT EXISTS crm_voice_agents (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  agent_id      TEXT NOT NULL DEFAULT '',        -- the AI agent it speaks as
  provider      TEXT NOT NULL DEFAULT '',        -- empty = none connected
  phone_number  TEXT NOT NULL DEFAULT '',
  greeting      TEXT NOT NULL DEFAULT '',
  objectives    TEXT NOT NULL DEFAULT '[]',
  transfer_to   TEXT NOT NULL DEFAULT '',
  record_calls  INTEGER NOT NULL DEFAULT 0,
  consent_text  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'draft',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_voice_sessions (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  voice_agent_id TEXT NOT NULL DEFAULT '',
  person_id     TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL DEFAULT '',
  provider_ref  TEXT NOT NULL DEFAULT '',
  direction     TEXT NOT NULL DEFAULT 'inbound',
  from_number   TEXT NOT NULL DEFAULT '',
  duration_s    INTEGER NOT NULL DEFAULT 0,
  transcript    TEXT NOT NULL DEFAULT '',
  ai_summary    TEXT NOT NULL DEFAULT '',
  outcome       TEXT NOT NULL DEFAULT '',
  recording_url TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_acct ON crm_voice_sessions (account_id, created_at DESC);

-- ── The timeline, and the event bus ─────────────────────────────────────────
--
-- One append-only row per thing that happened. It is what the contact timeline
-- reads, what the dashboard counts, and what the automation engine is handed —
-- so there is one account of what occurred rather than three that disagree.
CREATE TABLE IF NOT EXISTS crm_engage_events (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  person_id     TEXT NOT NULL DEFAULT '',
  -- conversation.created, ticket.created, form.submitted, meeting.booked …
  kind          TEXT NOT NULL,
  ref_id        TEXT NOT NULL DEFAULT '',
  summary       TEXT NOT NULL DEFAULT '',
  detail        TEXT NOT NULL DEFAULT '{}',
  -- Whether the automation engine has been handed this yet. Separate from the
  -- row existing, so a workflow failing cannot lose the event.
  dispatched_at TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_acct ON crm_engage_events (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_person ON crm_engage_events (person_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_undispatched ON crm_engage_events (dispatched_at) WHERE dispatched_at IS NULL;

-- ── Per-workspace settings for the whole module ─────────────────────────────
CREATE TABLE IF NOT EXISTS crm_engage_settings (
  account_id    TEXT PRIMARY KEY,
  business_name TEXT NOT NULL DEFAULT '',
  support_email TEXT NOT NULL DEFAULT '',
  logo_url      TEXT NOT NULL DEFAULT '',
  accent        TEXT NOT NULL DEFAULT '#5b46e5',
  notify_new_conversation INTEGER NOT NULL DEFAULT 1,
  notify_new_ticket       INTEGER NOT NULL DEFAULT 1,
  notify_new_submission   INTEGER NOT NULL DEFAULT 1,
  notify_emails TEXT NOT NULL DEFAULT '',
  -- Days. 0 keeps everything, which is the default because deleting somebody's
  -- support history by accident is not recoverable.
  retain_days   INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL
);
