# AI Video Studio overhaul — final report (2026-11-10)

Three problems were reported: Shorts cut the middle out of landscape
recordings, AI thumbnails ignored the reference and added odd shapes, and
edits showed in the export but not in the live preview. All three were fixed
in the existing app, in three phases. The developer notes are in
`docs/claude/video-studio.md` and the phase ledger in
`docs/claude/video-studio-overhaul.md`.

## 1. Why Shorts were centre-cropped

"New short composition" added a Short with its crop at the middle of the
frame and face-following switched off. The face track existed for every
recording but was used only if the customer switched it on in the Tracking
tab or picked a layout. Uploaded screen recordings had no pointer or screen
analysis at all, so a 9:16 Short of one could only be centre-cropped or
letterboxed.

## 2. How intelligent reframing works

- **Analysis from the picture.** The engine's face pass (`track.py`) now also
  reads, from the same frames, the mouse pointer, where things move, scene
  changes, the part of the frame that holds content, and the kind of
  recording. The kinds are screen, screen with a camera, slides, one person
  talking, two people, and camera footage, each with a reason. No
  operating-system pointer position is assumed for an uploaded file.
- **A framing per Short.** Each Short has a strategy: automatic, follow the
  pointer, follow the speaker, screen plus camera, follow the action, a still
  window, or the whole picture. Automatic picks from the kind of recording.
  Slides are shown whole. A screen with a webcam gets a camera band, about a
  third of the height and adjustable. Two people follow whoever is talking,
  cutting when the talk changes hands.
- **One plan for preview and render.** The plan is a window that glides along
  a path, holds still inside a dead zone, and cuts at scene changes, speaker
  changes and edit cuts. The engine renders it with its existing
  screen-layout path, and the preview draws the same plan.
- **Manual control.** In the Video panel the customer can pick the strategy,
  the window size and the camera band's size and side. They can also point
  the window by clicking the preview, which sets the window for a still
  framing or adds a timed pin otherwise.
- **Older projects are unchanged.** A recording without the new analysis
  renders as before and says so, with "Analyse again". A Short following a
  face from the Tracking tab keeps that until a framing is picked by name.

## 3. How the Shorts wizard works

"New short composition" opens a five-step wizard. "Quick Short" keeps the
one-press option, now framed automatically.

1. **The recording:** length, shape, speech, kind, people and scene changes.
2. **How to find Shorts:** let AI decide (the default), a topic or moment in
   words, or a time range.
3. **Preferences:** only those that change the result. They are platform,
   shape, framing, caption look, language of the words, logo, thumbnail or
   saved theme, call to action, and length.
4. **Proposals:** each card has its title, topic, times, why it was chosen,
   its checks, a transcript preview, the framing, a thumbnail idea and every
   word to publish. A card can be approved, rejected, re-timed (snapped to
   whole sentences and checked again) or re-worded. "Find another" and "Ask
   again" fetch more.
5. **Making them:** the Shorts are saved, their words written, and their
   renders and thumbnails queued and followed on screen.

## 4. How the number of Shorts is decided

The AI is asked for every passage that genuinely stands alone, and for the
ones it considered and turned down, with reasons. There is no target number,
and "none" is a valid answer shown with its reason.

Every proposal then passes the same checks on the server:

- It is made of whole sentences.
- It opens cleanly, not with "And so…" or "Like I said…".
- It ends on a finished sentence.
- It does not lean on "earlier" or "the last video".
- It is the right length.
- It does not repeat footage or a topic already taken.

Passages that fail are turned down and listed with the reason. Without AI,
the rules offer only passages that pass every check, at most one per two
minutes of speech, labelled as not judged by AI.

## 5. How topic-based extraction works

The customer's words are sent to the AI fenced as a request, never as
instructions. If the AI finds nothing, the transcript is searched for the
words. If they are not there, the answer is plainly "does not come up in
this recording". A time range is moved to whole sentences and the move is
reported. Long pauses are taken out of that Short only; the long video keeps
them.

## 6. How metadata is generated

Each proposal carries:

- three title options
- a description from the passage's own words
- hashtags, as many as the platform suits
- tags and keywords
- a call to action
- a pinned comment
- a YouTube category, from YouTube's own list only
- thumbnail words, taken only from the title or the passage

Titles with a number the passage never says, or with stock bait such as
"you won't believe", are dropped. Links neither said nor the business's own
are removed. Everything can be edited before saving, and the server checks
it again.

## 7. How thumbnail reference analysis was improved

Before, the reference was mapped onto one of nine fixed layouts. Defaults
then added a screenshot card, a round face bubble, a glow ring round the
face on every Short, and the picked word in a tilted box.

Now, without a reference, the looks are the person beside big words and a
big headline, with none of those shapes. With a reference, the AI describes
its composition, type (sans, serif or display), case, outline and image
treatment (vivid, natural, muted, dark or black and white). It also lists
the reference's decorations, and an arrow, ring, sticker or border is drawn
only if that list has it. Colours are snapped to the reference's own pixels.
Its words are never copied, and the uploaded reference is deleted once read.

## 8. How reusable thumbnail themes fit the Design Studio

- **What a theme is.** A theme holds the design itself, not a picture: layout,
  colours, type, case, outline, image treatment, where the person and the
  words sit, how the picked word is dressed, the logo's corner and size, and
  how many words the headline carries.
- **Where it lives.** Themes are stored per workspace in the Design Studio's
  own store, through the new themes API.
- **In the Graphics Designer & Editor.** A "Thumbnail themes" library shows
  each theme drawn live on the customer's own videos. Themes can be renamed,
  described, edited field by field with a 16:9 and 9:16 preview, tried on
  another video, duplicated and deleted.
- **Using a theme.** Any thumbnail can be saved as a theme with "Save as a
  theme". "New thumbnail" can use a theme for one video or all Shorts at
  once, and the Shorts wizard can make every new Short's thumbnail in a
  theme. Each video keeps its own words, face and moment.

## 9. Why the preview did not match the export

- The preview worked out the visual decisions separately from the render.
- Its colour filter sat on the video layer only. A Short drawn as a layout,
  such as split or picture-in-picture, is painted on a canvas above that
  layer, so it showed no look at all.
- Vignette, grain, sharpness, the green-screen key and skin smoothing had no
  preview.
- Sliders changed nothing until released and saved.

## 10. How the shared preview and export work

- **One decision function.** Every visual decision is made in one shared
  function, read by both the render and the preview. A test asserts they
  agree.
- **Look on every layer.** The look and colour filter now covers the video,
  the keyed canvas and the layout canvas.
- **The missing effects are drawn.** Sharpness uses the engine's unsharp
  strength. Vignette uses the engine's own curve. Grain uses the engine's
  amount.
- **Green screen is keyed live.** It runs on the graphics chip with the same
  colour, similarity and softness the engine uses.
- **Skin smoothing is shown roughly** over the tracked face, labelled "≈".
- **Sliders show while dragged** and save once on release.
- **Undo, redo and reset** move the saved edit, so the preview follows them.
- **Performance.** The preview still renders from the 720p proxy in one
  animation-frame loop, with per-frame work written straight to the page
  rather than through React.

## 11. Files and components changed

New files:

- Worker: `worker/src/lib/video/reframe.ts`, `visual.ts`, `shortsWizard.ts`;
  `worker/src/lib/design/thumbThemes.ts`; `worker/src/routes/designThemes.ts`;
  `worker/migrations/0088_design_themes.sql`.
- Browser: `src/components/VideoStudio/ShortsWizard.tsx`, `greenKey.ts`;
  `src/components/SocialCreator/design/ThemeLibrary.tsx`;
  `src/services/designThemes.ts`.
- Tests: `test/videoAnalysis.test.mts`.

Changed files:

- Engine: `media/engine/track.py`, `server.mjs`, `thumbLayout.mjs` and
  `thumbLayout.d.mts`.
- Worker: `edit.ts`, `motion.ts`, `pipeline.ts`, `pointer.ts`, `shorts.ts`,
  `thumbStyle.ts`, `routes/video.ts`, `index.ts`.
- Browser: `Player.tsx`, `VideoEditor.tsx`, `InspectorPanels.tsx`,
  `EffectsPanels.tsx`, `EffectRow.tsx`, `ThumbShowcase.tsx`,
  `SocialCreator.tsx`, `services/videoStudio.ts`, and the CSS.
- Tests: the existing video, end-to-end and security suites.

## 12. Tests and results

| Suite | Result |
|---|---|
| `npm run test:video` (pure rules: planner, wizard, themes, shapes, shared spec) | 381 / 381 |
| `npm run test:videoanalysis` (synthetic clips through `track.py`) | 9 / 9 |
| `npm run test:security` (video and theme actions across workspaces) | 205 / 205 |
| `npm run typecheck`, Worker `tsc`, production build | clean |
| `npm run test:videoe2e` (real engine, mocks, browser at 1280 and 390) | see below |

`test:videoanalysis` checks that the pointer is tracked to within 7 px
median, and that a 9:16 Short keeps the pointer in frame in over 90% of
steps where a centre crop managed under 60%.

**End-to-end status:** the final result of the run on the shipped commit is
recorded in the ledger. Earlier runs showed four failures in code none of
this work touched. One thumbnail check was stale and has been updated. The
noise command and the Audio panel checks expect "strong" where the product
has chosen "Maximum" since early November. A Publishing-panel reload check
also failed. A comparison run on the commit before this work decides
whether those were already failing.

## 13. Requirements

No new provider, model or key is needed:

- **Analysis** runs in the existing media engine's Python and OpenCV pass. It
  needs the engine's next deploy to include the new `track.py`. Until then,
  recordings say "not analysed" and render as before.
- **AI** uses the existing AI pool. There is one metered call per wizard
  proposal, inside the AI budget.
- **Database:** migration 0088 is applied by the staging and live deploy
  workflows.

## 14. Remaining limits

- **Speaker detection** reads lip movement during speech, not voices. Two
  people talking at once, or someone turned away, are not told apart.
- **The pointer** is found from the picture. A pointer the recorder hid, or
  one very small on a 4K screen, is not found, and the framing falls back to
  following the action.
- **There is no text or OCR detection.** Edge density stands in for "where
  the content is".
- **Skin smoothing** in the preview is approximate. The green-screen key
  needs WebGL; without it the badge says the key is in the render.
- **Captions** are in the language spoken. The wizard's language setting
  applies to titles and descriptions.
- **The welcome wizard's "make N Shorts"** still makes the number the
  customer typed.
- **At 390 px wide**, an open side panel covers the editor's breadcrumb until
  the panel is closed.
