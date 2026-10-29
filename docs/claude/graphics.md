<!-- Read this before working on the Graphics Designer & Editor (social media graphics, templates, the Media Center's pictures). -->

## Graphics Designer & Editor — template library

`/social-creator` opens on the **template gallery** (`SocialCreator/design/TemplateGallery.tsx`);
a design opens in the **template editor** at `/social-creator/design/:id`
(`design/DesignStudio.tsx`, lazy). The old free-form canvas (`PostEditor.tsx`,
`/social-creator/editor/:id`) stays for "Blank canvas" and for posts made before
templates. Rebuilt 2026-10-29 because every generated post was a headline on a
gradient with a button: `drawSocial` (Autopilot), `designFromSocialPost` (content
plan), `flowRun.designFor` and the old "AI Generate" (the AI placing text and shapes
by coordinates) all drew that, and the PNG exporter could not crop a photo, wrap
text or draw a mask.

- **Templates are data** (`worker/src/lib/design/`, pure, shared with the Worker):
  `spec.ts` (types, formats, font pairs, palette tokens, categories/styles/goals/
  industries), `templates.ts` (22 original designs, each a different composition —
  `family`), `photos.ts` (the curated photo library), `content.ts` (filling a
  template: `ruleCopy`, `newDoc`, `guardFacts`, placeholders), `forPost.ts` (a
  template design for a post an agent or plan wrote). Layers are placed in fractions
  of the canvas with `at` overrides per shape (square / portrait / story /
  landscape) — a format change re-lays the design, never stretches it.
- **One renderer** (`design/render.ts`, Canvas 2D): gallery card, editor preview and
  exported PNG are the same drawing at different widths, so a card cannot promise
  what the download does not deliver. Text is measured, wrapped and shrunk to its
  box (`fitText`); photos are cropped at Unsplash's CDN around a focal point
  (`photoUrl`, `fp-z` for zoom) or by the renderer for uploads; circles stay round in
  every aspect. Fonts are Google Fonts (SIL OFL), loaded only when the designer opens
  (`ensureFonts`, 4-second cap, then the fallback).
- **A design is a post**: `DesignPost.design` (a `DesignDoc`: template id, format,
  content, images, colours, font pair, hidden parts, caption, hashtags) on the same
  `crm_social_posts` record every other screen reads; `postFields` fills the old
  fields so older screens show the right shape and colour. The normaliser keeps
  `design`, `caption`, `hashtags`, `scheduledAt`, `mediaId`.
- **Nothing invented.** The AI (`design/aiCopy.ts`, through `/api/ai.php`) writes only
  framing words within each template's `limits`; offers, prices, dates, reviews,
  ratings and contact details come only from what the customer typed (`FACT_SLOTS`).
  Every AI line passes `guardFacts` (a number, `$`/`%`, or a claim word like
  "best", "licensed", "#1" not in the business's own details → replaced by the rule
  line, and the editor says how many). A template's must-have slot left empty is
  drawn as an obvious placeholder ("Your offer") and listed; export asks first.
  `ownPhotos` templates (before/after, listings, product collage, magazine cover,
  creator intro) never take a library photo — a stranger's photo would look like
  the customer's work; gallery cards show a sample labelled "SAMPLE PHOTO".
- **Business details** (`design/business.ts`): AI Autopilot portfolios
  (`fetchBoard`) and the onboarding profile — name, industry, description,
  services, website, phone, logo, brand colour, the wizard's offer. Industry picks
  the photo topics (`topicsForIndustry`) and sorts the gallery; it never hides a
  template.
- **Variations** (editor's right column): up to four templates of other families
  for the same purpose, drawn with the same words; own-photo templates and ones
  needing a fact the design lacks are left out.
- **AI Autopilot**: `designFromPost` (lib/projectAgents.ts) now also writes
  `design` via `designForPost`; the wizard's layout id maps to a template
  (`LAYOUT_TEMPLATE`, none of them own-photo). `test:design` still holds the old
  layouts; `test:socialtemplates` holds the mapping.
- **Media Center pictures** (`routes/media.ts`, `/api/media.php`, migration 0081
  `crm_media_assets`): signed upload link → bytes to R2 under `v/<ws>/media/<id>/`
  (counts toward video storage, `refusal`) → `commit` reads it back and checks PNG
  (`checkPng`) or JPEG; "Saved" only after that. `url` resolves `media:<id>` refs;
  `list`/`rename`/`delete` scoped `WHERE account_id = ?` (in `test:security`).
  No R2 → the route says so and uploads are kept inside the design as a small data
  URL. Shown in Video Studio → Media Library (`VideoStudio/MediaGraphics.tsx`).
- **Free photo search**: `photo_search` asks Openverse for **CC0 and Public Domain
  Mark only** (no attribution duties a graphic can't carry); `GET /api/media.php?photo=<id>`
  re-checks the licence by id and serves the picture same-origin so it can be drawn
  into an export. `OPENVERSE_BASE` overrides the API. Openverse timed out from the
  build sandbox on 2026-10-29 — the editor shows its refusal; not proven live.
- **Licences**: templates are original (`ORIGINAL`); library photos are Unsplash
  License (commercial use, no credit needed; not resold as-is or built into a
  competing photo service) — each was looked at before listing, and photos with a
  visible brand, a claim in the picture, or a stranger's face as a person are left
  out. Openverse picks carry creator + licence in the design and the Media row.
- **Publishing**: nothing posts automatically. The editor downloads the PNG(s)
  (a carousel downloads/saves one per slide), shares it on phones (Web Share with a
  file), copies caption + hashtags, opens the platform's composer
  (`publishHandoff.COMPOSER_URL`), and sets Ready / Scheduled (a date on the list) /
  Published.
- Tests: `npm run test:socialtemplates` (library well-formed and distinct; the facts
  guard; the AI path with a faked answer that invents a ranking, a saving, an offer
  and a price), `npm run test:security` (media tenancy). Rendering is checked by
  eye: the contact-sheet harness used on 2026-10-29 bundled `render.ts` with
  esbuild and screenshotted every template in every format.
