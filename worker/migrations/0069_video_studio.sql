-- ─────────────────────────────────────────────────────────────────────────────
-- AI Video Studio (docs/VIDEO-STUDIO.md).
--
-- Files live in R2 (the VIDEO binding) under v/<workspace>/<project>/…; these
-- tables hold what is known about them and every decision made, never the
-- bytes. Every row carries account_id and every query names it.
--
-- ── Why the edit is a document with versions ──
--
-- A project's edit decisions (cuts with their reasons and states, protected
-- parts, clips, caption style) change together and are read together, by the
-- editor's preview and by the render. One JSON document per project, and a
-- copy of it per saved change in crm_video_versions, is what makes undo, redo
-- and "reopen without losing edits" one mechanism rather than three.
--
-- ── Why jobs are rows ──
--
-- Processing runs for minutes to an hour. A job row with a state, attempts, a
-- lease and an idempotency key is what lets the open screen, the engine's
-- poke and the cron all advance the same work without doing it twice, and
-- what lets a failed step retry without a second render or a second charge.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_video_projects (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  prompt        TEXT NOT NULL DEFAULT '',
  -- The request as understood (edit.ts VideoRequest): long, shorts, lengths, captions, thumbnails, cleanup.
  request       TEXT NOT NULL DEFAULT '{}',
  -- The AI Autopilot project (crm_projects.id) and workflow it belongs to, if any.
  autopilot_project_id TEXT,
  workflow_id   TEXT,
  -- draft | uploading | processing | ready | failed
  status        TEXT NOT NULL DEFAULT 'draft',
  -- The stage shown on screen, and its own words (never a made-up percentage).
  stage         TEXT NOT NULL DEFAULT '',
  stage_note    TEXT NOT NULL DEFAULT '',
  -- {key, name, bytes, type, probe:{…}, proxy, poster, wave, chunks:[…], silences:[…]}
  source        TEXT NOT NULL DEFAULT '{}',
  transcript_key TEXT,
  language      TEXT NOT NULL DEFAULT '',
  doc           TEXT NOT NULL DEFAULT '{}',
  doc_version   INTEGER NOT NULL DEFAULT 0,
  error         TEXT NOT NULL DEFAULT '',
  -- When the finished package was written into the Autopilot project's activity (once).
  reported_at   TEXT,
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_projects_account ON crm_video_projects(account_id, updated_at);

CREATE TABLE IF NOT EXISTS crm_video_versions (
  project_id    TEXT NOT NULL,
  version       INTEGER NOT NULL,
  account_id    TEXT NOT NULL,
  doc           TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  PRIMARY KEY (project_id, version)
);

CREATE TABLE IF NOT EXISTS crm_video_jobs (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  -- prepare | transcribe | analyze | render | thumbnails | metadata
  kind          TEXT NOT NULL,
  -- The output a render/thumbnail job is for ('' for project-wide jobs).
  target        TEXT NOT NULL DEFAULT '',
  -- Same kind + target + inputs → same key: asking twice never makes two.
  idem          TEXT NOT NULL UNIQUE,
  -- queued | running | done | failed | cancelled
  state         TEXT NOT NULL DEFAULT 'queued',
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  -- Where a step-by-step job (transcription) has got to.
  step          INTEGER NOT NULL DEFAULT 0,
  steps         INTEGER NOT NULL DEFAULT 0,
  -- A real percentage when one is known (counted chunks, the encoder's own clock); NULL otherwise.
  progress      REAL,
  stage         TEXT NOT NULL DEFAULT '',
  input         TEXT NOT NULL DEFAULT '{}',
  result        TEXT NOT NULL DEFAULT '{}',
  error         TEXT NOT NULL DEFAULT '',
  -- The engine's job id when dispatched (one engine job per attempt).
  engine_ref    TEXT NOT NULL DEFAULT '',
  lease_until   TEXT,
  next_at       TEXT NOT NULL,
  started_at    TEXT,
  finished_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_jobs_due ON crm_video_jobs(state, next_at);
CREATE INDEX IF NOT EXISTS idx_video_jobs_project ON crm_video_jobs(project_id, created_at);

-- One row per deliverable video: the long one, and each Short.
CREATE TABLE IF NOT EXISTS crm_video_outputs (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  -- long | short
  kind          TEXT NOT NULL,
  -- The clip (edit.ts Clip.id) a Short is; '' for the long video.
  clip_id       TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  -- processing | needs_review | approved | ready_to_publish | failed
  status        TEXT NOT NULL DEFAULT 'processing',
  -- The edit this file was rendered from (edit.ts hashOf) — a different hash means it is out of date.
  edit_hash     TEXT NOT NULL DEFAULT '',
  version       INTEGER NOT NULL DEFAULT 0,
  -- {mp4:{key,bytes}, srt, vtt}
  files         TEXT NOT NULL DEFAULT '{}',
  -- [{key, width, height, layout, bytes, verified, headline}]
  thumbs        TEXT NOT NULL DEFAULT '[]',
  chosen_thumb  INTEGER NOT NULL DEFAULT 0,
  meta          TEXT NOT NULL DEFAULT '{}',
  duration      REAL NOT NULL DEFAULT 0,
  width         INTEGER NOT NULL DEFAULT 0,
  height        INTEGER NOT NULL DEFAULT 0,
  -- A date somebody planned to post it, for the Ready to Publish calendar.
  publish_at    TEXT,
  error         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_outputs_project ON crm_video_outputs(project_id);
CREATE INDEX IF NOT EXISTS idx_video_outputs_account ON crm_video_outputs(account_id, status, updated_at);

-- Resumable uploads: R2 multipart, one part per request, the parts' etags kept here.
CREATE TABLE IF NOT EXISTS crm_video_uploads (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  r2_key        TEXT NOT NULL,
  upload_id     TEXT NOT NULL,
  name          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  type          TEXT NOT NULL,
  part_size     INTEGER NOT NULL,
  -- {"1":"etag",…}
  parts         TEXT NOT NULL DEFAULT '{}',
  -- open | done | aborted
  state         TEXT NOT NULL DEFAULT 'open',
  -- name|size|lastModified — the same file chosen again resumes.
  file_key      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_uploads_project ON crm_video_uploads(project_id, state);

-- What processing used, per job and kind. The primary key is what stops a
-- retried job from being counted twice.
CREATE TABLE IF NOT EXISTS crm_video_usage (
  job_id        TEXT NOT NULL,
  kind          TEXT NOT NULL,
  account_id    TEXT NOT NULL,
  -- m:YYYY-MM
  period        TEXT NOT NULL,
  units         REAL NOT NULL,
  -- audio_min | render_min | ai_call | engine_min
  unit          TEXT NOT NULL,
  -- An estimate at list price, in millionths of a dollar.
  cost_micros   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (job_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_video_usage_account ON crm_video_usage(account_id, period);

-- Brand overrides for video only; everything else is read from the portfolio.
CREATE TABLE IF NOT EXISTS crm_video_brand (
  account_id    TEXT PRIMARY KEY,
  kit           TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL
);
