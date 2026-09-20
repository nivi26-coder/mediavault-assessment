# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight — including where you
chose not to do something.

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:** *[Pending — record after the code is finalized and pushed, since
it should walk through the actual deployed/final state, not an
in-progress one.]*

---

## How to run it

`npm install && npm run dev` — that's genuinely it. It starts both the mock
API (`:8787`) and the Vite dev server (`:5173`) together, with `CHAOS=1 LATENCY=1` (the defaults) so the app runs under the same conditions it'll be
evaluated with — random `503`s, rate limiting, and artificial latency all
on. `npm run typecheck` and `npm run build` both pass clean.

If a dev session runs long, Vite's dependency pre-bundle cache can go stale
after enough hot-reloads and start throwing `504 Outdated Optimize Dep`
errors — not an app bug, just restart `npm run dev` (optionally clearing
`node_modules/.vite` first) if that shows up.

## Time spent

**Total: ~19 hours**, split by task (commit history — via `git log`, with
one correction: `276d2a9`'s commit message says "Task 2," but its actual
diff is `bulkStatus.ts`/`useBulkStatus.ts`/`lib/concurrency.ts`, i.e. Task
3 — helped establish the real task order and catch that mislabeling, with
the hours below reflecting actual time spent per task):

| Task | Hours |
| --- | --- |
| Task 0 — defect inventory | 4h |
| Task 1 — search/filter correctness | 3h |
| Task 2 — virtualization/scale | 3h |
| Task 3 — bulk actions | 2h |
| Task 4 — resilience | 2.5h |
| Task 5 — keyboard/a11y | 2h |
| Task 6 — interface design (two rounds) | 2.5h |

Several tasks turned up genuine bugs caught by actually testing the app
live, not just features built and assumed correct — that's where a
meaningful share of the time went. Details are called out inline in the
relevant sections below rather than in a separate log.

---

## Baseline defects found

| #  | Defect                                                                                                                                                                                                                                                                                                                                                                       | Where                               | Category                 | Fixed / left / out of scope                                                                               |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1  | Bulk update sends >50 ids in one call; API rejects with`400 too_many_ids` above that cap                                                                                                                                                                                                                                                                                   | `App.tsx` (`applyBulkStatus`)   | Correctness              | Fixed (Task 3)                                                                                            |
| 2  | `handleSaved` is a no-op stub — editing status in the detail panel never updates the grid, so rows go stale after a save                                                                                                                                                                                                                                                  | `App.tsx` (`handleSaved`)       | Correctness              | Fixed (Task 3)                                                                                            |
| 3  | Every keystroke in the search box fires a request immediately — no debounce                                                                                                                                                                                                                                                                                                 | `App.tsx` / `useAssets.ts`      | Performance              | Fixed (Task 1)                                                                                            |
| 4  | No request cancellation and no response-ordering guard — a slow response to an earlier query can overwrite a newer one (the "type 'tra' then finish quickly" race, since short-prefix queries are deliberately slower server-side)                                                                                                                                          | `useAssets.ts`, `api/client.ts` | Correctness              | Fixed (Task 1)                                                                                            |
| 5  | `nextCursor` is fetched but never used — the hook always shows just the first page, so most of the 12,400 assets are unreachable, and there's no pagination/infinite-scroll at all                                                                                                                                                                                        | `useAssets.ts`                    | Correctness / Scale      | Fixed (Task 1/2)                                                                                          |
| 6  | Filter/search/sort state lives only in local`useState` — lost on reload, unshareable via URL, and stale cursors from prior queries are never invalidated                                                                                                                                                                                                                  | `App.tsx`                         | Correctness              | Fixed (Task 1)                                                                                            |
| 7  | Every row is rendered into the DOM regardless of result size — no virtualization, so DOM/memory grow unbounded as more assets load                                                                                                                                                                                                                                          | `AssetGrid.tsx`                   | Performance / Scale      | Fixed (Task 2)                                                                                            |
| 8  | The grid is one component, so toggling a single card's selection re-renders every rendered card                                                                                                                                                                                                                                                                              | `AssetGrid.tsx`                   | Performance              | Fixed (Task 2)                                                                                            |
| 9  | Grid has no keyboard model — cards/checkboxes are only reachable via native tab order, no roving tabindex, no arrow-key navigation, no ARIA grid semantics (`role`, `aria-selected`)                                                                                                                                                                                    | `AssetGrid.tsx`                   | Accessibility            | Fixed (Task 5)                                                                                            |
| 10 | Errors are flattened into a single string (`"${status}: ${detail}"`); callers can't branch on `error.code`, so retryable failures (503/429) can't be distinguished from terminal ones (400/409/422), and there's no retry/backoff at all                                                                                                                                 | `api/client.ts`                   | Correctness / Resilience | Fixed (Task 1)                                                                                            |
| 11 | Detail-panel save has no optimistic update, no retry, and treats`409 version_conflict` the same as any other error — a generic string instead of a deliberate refetch/merge decision                                                                                                                                                                                      | `AssetDetail.tsx` (`setStatus`) | Correctness              | Fixed (Task 3) — 409 now shows a dedicated "refresh to see the latest" banner instead of a generic error |
| 12 | Detail panel has no focus management — focus doesn't move into the panel on open, Escape doesn't close it, and focus isn't returned to the triggering card on close                                                                                                                                                                                                         | `AssetDetail.tsx`                 | Accessibility            | Fixed (Task 5)                                                                                            |
| 13 | No error boundary anywhere in the app — an unexpected render error takes down the whole page with no recovery                                                                                                                                                                                                                                                               | `App.tsx` / app root              | Resilience               | Fixed (Task 4)                                                                                            |
| 14 | No offline detection — writes/reads are attempted the same way regardless of connectivity, with no banner or recovery behavior                                                                                                                                                                                                                                              | app-wide                            | Resilience               | Fixed (Task 4)                                                                                            |
| 15 | Status is conveyed primarily by color;`draft` has no dedicated pill color/shape distinct from the others, so status is hard to read without relying on color alone                                                                                                                                                                                                         | `styles.css`                      | Accessibility            | Fixed (Task 6)                                                                                            |
| 16 | No`prefers-reduced-motion` handling anywhere — any motion added later (e.g. a loading shimmer) would run unconditionally for users who've asked their OS to reduce motion (correction: this row originally claimed missing `:focus-visible` styling, which was wrong — the baseline already had a global rule for it; verified by diffing against the original commit) | `styles.css`                      | Accessibility            | Fixed (Task 2)                                                                                            |
| 17 | Bulk-action result only reports aggregate counts ("N updated, N failed") with no indication of which assets failed or why                                                                                                                                                                                                                                                    | `App.tsx` (`applyBulkStatus`)   | UX / Correctness         | Fixed (Task 3)                                                                                            |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**
Hand-rolled (`src/api/client.ts`, `useInfiniteAssets.ts`) — no TanStack
Query/SWR. Rejected them deliberately: Tasks 1/3/4 specifically exist to
assess hand-reasoning about cancellation, de-duplication, retry/backoff and
optimistic rollback, and a library would do all of that invisibly, hiding
exactly the mechanics being graded. Built a sequence-numbered request
tracker, a small in-flight GET de-dup map, and a per-filter-combination
session cache instead. Traded some robustness (no automatic cache
invalidation across tabs, no background refetch-on-focus) for code that's
fully explainable line by line.

**Stale response handling**
Two layers, not one: the previous request is actively aborted
(`AbortController`) *and* every response carries a sequence number checked
against the latest one issued before being applied. Rejected relying on
cancellation alone — an abort doesn't guarantee a response that already
left the network gets discarded before it resolves, so the sequence check
is the actual correctness guarantee; the abort is there to save bandwidth
and rate-limit budget, not to be the sole defense.

**Virtualization approach**
`@tanstack/react-virtual` — explicitly on README's allowed list for
virtualization. Rejected hand-rolling the windowing math itself: it's a
narrowly-scoped, well-tested primitive (just "which rows are visible,"
nothing about data-fetching or selection), so using it doesn't hide any of
the logic actually being assessed, and it freed real time for the harder
parts (roving-tabindex keyboard nav layered on top of it, and two real
bugs it surfaced around column-count changes remounting cards under
different row parents — detailed under Accessibility below). Did not use a
prebuilt data grid (AG Grid/MUI DataGrid/etc.) — explicitly disallowed by
the rules, and the whole point of Tasks 2/3/5 is building that grid
behavior by hand.

**Optimistic updates and rollback**
Bulk status changes apply to every selected asset immediately, before any
network response, then roll back only the specific assets a `207` response
reports as failed — successes stay changed, nothing else is touched.
Rejected waiting for server confirmation before updating the UI: on a
selection of hundreds of assets under real latency, that would mean staring
at an unresponsive-feeling UI for seconds with no feedback at all.

**Retry and backoff policy**
Exponential backoff with jitter, capped at 4 attempts, honoring
`Retry-After` when present, and — specifically for network errors while
actually offline — waiting for the browser's real `online` event instead of
blind timed retries. Retryability is computed structurally from the HTTP
status code (`429`/`503`/5xx/network-failure → retryable;
`400`/`409`/`422` → never), not from matching on error message text.
Rejected a fixed-interval retry: under real chaos (503s, rate limiting),
retrying on a strict timer either hammers a already-struggling server or
retries too slowly after a real fix.

**State placement and URL sync**
Filters (`q`, `status`, `sort`) live in the URL via a small custom
`useUrlState` hook — no router, no global state library (Zustand/Redux/
Jotai). Rejected both: this is a single-screen app with one filter bar, so
a router would add route-matching machinery for a page that has no routes,
and a global store would add a whole state-management layer for state that
only ever has one reader (the filter bar) and one writer (the same filter
bar). Selection, focus position, and panel state are local `useState`/refs
for the same reason — nothing here is shared across distant parts of the
tree that would justify lifting it into a store.

**On libraries generally:** the only runtime dependency added beyond
React itself is `@tanstack/react-virtual` (virtualization, explicitly
allowed). No data-fetching library, no state-management library, no router,
no headless focus-management library (roving tabindex, focus-trap-free
detail-panel focus management, and Escape handling are all hand-built in
`AssetGrid.tsx`/`AssetDetail.tsx`/`App.tsx`) — each of those "wrote it
myself" choices is explained above rather than just left unexplained.

---

## Performance

Measured on Windows 11, Chrome 152.0.7977.83, headless (via `puppeteer-core`
driving the actual installed Chrome, not a simulated/estimated number),
against the app running under default `CHAOS=1 LATENCY=1`. "Before" was
measured by checking out the original scaffold commit into a separate git
worktree and running it live, not reasoned about after the fact.

| Metric                                          | Before                                                                             | After                                                                     | How measured                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendered DOM nodes at 5,000 rows loaded         | N/A — baseline can never load past 24 (`nextCursor` was fetched but never used) | 551 total DOM nodes / 72 rendered cards, at 5,064 assets logically loaded | Scrolled the live app until the "N of 12,400 shown" counter passed 5,000, then`document.querySelectorAll('*').length` / `.card` count                                                                                                                                                                                                                                                                                               |
| Cards re-rendered when toggling one selection   | 24 (entire list; no memoization existed)                                           | 1                                                                         | Temporarily instrumented`AssetCard`'s render body with a counter, reset it after initial load settled, clicked one checkbox, read the delta. (First attempt used a `MutationObserver` on the real DOM instead — that gave a misleading "1" even *before* the fix, since React can skip real DOM writes for unchanged output regardless of memoization. The render-counter approach is the correct one; removed after measuring.) |
| Longest task during sustained scroll            | Not applicable — baseline has nothing to scroll (stuck at 24 rows)                | 0 long tasks (none >50ms) across ~3s of continuous scrolling              | `PerformanceObserver` with `entryTypes: ['longtask']` while scrolling the grid programmatically                                                                                                                                                                                                                                                                                                                                     |
| Requests fired while typing a 6-character query | 6 (one per keystroke, confirmed live)                                              | 1                                                                         | Typed the same 6 characters into`.search` at a natural typing cadence (60ms/keystroke) on both versions, counted `GET /api/assets` requests via Puppeteer's request listener                                                                                                                                                                                                                                                        |
| Production bundle, gzipped                      | 49.82 kB                                                                           | 58.72 kB                                                                  | `npm run build` output, both versions                                                                                                                                                                                                                                                                                                                                                                                                 |

**What was the actual bottleneck, and how did you find it?** Two real bugs
were caught specifically *because* these were measured instead of assumed:

1. The selection-toggle re-render "fix" initially looked correct by reading
   the code, but the render-counter measurement showed all 42 visible cards
   re-rendering, not 1. Root cause: `toggleSelect` in `App.tsx` was a plain
   function, recreated every render, breaking `React.memo` on every card at
   once since they all received the same changed function reference. Fixed
   by wrapping it in `useCallback`.
2. The bundle-size increase (49.82kB → 58.72kB) is `@tanstack/react-virtual`
   — a real, measured cost, not hidden, traded for keeping DOM nodes flat
   at scale (which the "before" row's "N/A" makes concrete: the baseline
   literally cannot render 5,000 rows at all, let alone efficiently).

---

## Accessibility

**Keyboard model.** The asset grid uses a roving tabindex, not one tab stop
per card — exactly one card is `tabIndex=0` at a time (the rest are `-1`),
so Tab enters and leaves the grid in a single step regardless of how many
thousand assets are loaded. Arrow keys move that position (Up/Down by a
full row, Left/Right by one card), scrolling the virtualized list to the
target and imperatively focusing the real DOM node once it exists. Enter
opens the detail panel for the focused card; Space toggles its selection;
Shift+Arrow moves focus and extends the selection at the same time — an
incremental range grow in whichever direction you're moving, not a single
fixed-anchor jump like shift-click; a deliberate simplification, since a
closer match to shift-click's anchor semantics was possible but meaningfully
more state to track for a difference most users wouldn't notice. Opening
the panel moves focus into it immediately; Escape closes it and returns
focus to the exact card that opened it, looked up fresh by asset id at
close time rather than a captured DOM reference — because a virtualized
row's assets are recomputed per column count, an asset can end up under a
completely different row *element* than the one it opened from (opening
the panel narrows the grid, changing the column count), and React only
reuses a DOM node via `key` among siblings under the *same* parent, so a
captured `document.activeElement` reference went stale almost immediately.
A second, related bug surfaced after that fix: the panel closing widens
the grid back out, changing the column count *again* via its own
`ResizeObserver`, which can steal focus back to `<body>` moments *after*
a first successful re-focus attempt — fixed by polling for up to ~650ms
and only declaring success once focus has held for two consecutive
checks, not just one. The grid has `role="grid"` /
`aria-multiselectable`, rows have `role="row"`, and each card is a
`role="gridcell"` with `aria-selected` reflecting real selection state —
not just a checkbox buried inside it. Checkboxes have accessible names
(`aria-label`) but are removed from the tab order (`tabIndex={-1}`) since
Space on the card already toggles them — a second native tab stop per card
would be a second "12,400 tab stops" problem, just smaller.

**How tested.** Verified with real keyboard interaction in a live browser —
Tab into the grid, arrow through it, Space/Enter/Shift+Arrow, open and
close the detail panel with Escape, confirmed focus landed exactly where
expected at each step (including the two remount bugs above, both caught
this way, not by reading the code). **I did not run an actual screen
reader** (NVDA/JAWS/VoiceOver) against this — ARIA roles/states and live
regions are implemented per spec and checked via the accessibility tree in
Chrome DevTools, but not verified by ear. Saying so directly rather than
claiming a pass I didn't observe.

**Known gaps.**

- No screen reader was actually run (see above).
- Shift+Arrow range selection grows incrementally in the direction you're
  moving; reversing direction extends from the most recent position rather
  than snapping back to a single fixed anchor. A deliberate trade-off (see
  the keyboard model above), not an oversight.
- When a filtered/emptied grid has no `.grid` element to fall back to (the
  "Nothing matches" empty state), closing an open detail panel whose opener
  no longer exists leaves focus wherever it last legitimately was (e.g. the
  search box) rather than moving it to the empty-state message itself. Not
  a lost/detached-node case, just not actively redirected either.
- No dedicated "skip to grid" link or landmark navigation beyond what the
  native `<aside>`/`<header>` elements already provide.

---

## Interface decisions

I optimized for a reviewer being able to trust the interface at a glance —
scanning hundreds of cards, knowing instantly what's selected, what's
happening, and what to do next, without relying on color vision or careful
reading. That meant every state (selection, active card, status) needed a
second, non-color signal, every asynchronous state (loading/empty/error/
offline/partial-failure) needed to be deliberately designed rather than left
as an implicit blank, and every number/contrast claim needed to actually be
checked rather than eyeballed. Restraint was a deliberate choice too — no
icons or motion beyond what serves a specific legibility purpose (the status
glyphs, the loading shimmer), no illustration, no dark mode, matching what
the brief asked for.

- **Visual system.** A small token set in `styles.css`'s `:root` — two text
  colors (`--ink`, `--ink-soft`), two border tiers (`--line` for plain
  dividers, `--line-interactive` for anything that has to read as an actual
  control boundary and therefore needs 3:1 contrast), a 4px spacing scale,
  a 5-step type scale, and one accent color used consistently for focus,
  links, and the primary selection state. Status colors are their own
  small palette, described below.
- **Status treatment.** The four statuses read as a progression by
  increasing visual weight, not four arbitrary hues: `draft` is a hollow,
  dashed-border pill (nothing has happened yet); `in review` is a filled
  amber pill (in motion); `approved` is a filled green pill (done);
  `archived` is a muted gray pill (put away). Each also carries its own
  glyph (`○ ◐ ✓ ▾`) rendered `aria-hidden` alongside the color, so the
  distinction never depends on telling the colors apart — verified by
  checking each status pill's actual rendered look, not just assuming the
  glyph fallback would work. Selection and "currently open" are likewise
  never color-only: selection's primary signal is the checkbox's own
  checked/unchecked shape, and the currently-open card gets a real outline
  ring (a shape/thickness change), not just a border-color swap.
- **States.** Loading uses skeleton cards shaped like real cards, not a
  spinner. Empty and error each have their own distinct, clearly-labeled
  message with a next step ("clear the search box or widen the status
  filter"). Offline is a persistent banner, not a toast that could be
  missed. Partial bulk failure shows counts grouped by reason in one
  bounded line, plus a badge directly on each affected card — replaced an
  earlier expandable per-id list design that kept growing the layout
  unpredictably with large failure counts; a badge on the asset itself
  costs zero extra layout space regardless of how many things failed.
  The bulk action bar gets its own tinted background so it reads as a
  distinct, temporary mode rather than blending into the page.
- **Contrast.** Every color pair was run through an actual WCAG relative-luminance
  contrast calculator (a small Node script, not a visual estimate) against
  its real usage — text on its real background, not swatches in isolation.
  All text pairs clear 4.5:1 (most well above); UI-component borders that
  need 3:1 (checkbox/input borders) use the darker `--line-interactive`
  token specifically because the softer `--line` divider color measured
  only ~1.3:1 and would have failed that check. One color (the amber
  "retryable" badge) was caught failing at 3.64:1 during this check and
  darkened until it cleared 5.93:1.
- **Copy.** Every user-facing error goes through `errorCopy.ts`'s
  `toUserMessage`, mapping API codes to plain sentences — nothing like
  `429: Too many requests in the last 10 seconds.` ever reaches the screen.
  Empty/loading/offline/conflict states were all written as complete,
  specific sentences telling the user what happened and, where relevant,
  what to do about it, rather than single words like "Empty" or "Error."

Screenshots: [grid](docs/screenshots/grid.png), [detail panel with active-card ring](docs/screenshots/detail-panel.png), [narrow viewport](docs/screenshots/narrow-viewport.png).

---

## Trade-offs and cuts

- **Neither optional stretch item was built** (SSE live-update reconciliation,
  non-blocking `/api/stats`). The 7 required tasks, done properly and
  tested against real chaos rather than just written and assumed correct,
  filled the available time on their own — several tasks turned up genuine
  bugs caught by testing live, not just features built and assumed
  correct (called out inline throughout this document). With another day:
  the non-blocking stats header first
  (cheap, the retry/client layer already supports it), SSE reconciliation
  second and only if time allowed — reconciling live updates without
  clobbering local optimistic edits or scroll position is a meaningfully
  bigger feature than it sounds.
- **No screen reader was run** (NVDA/JAWS/VoiceOver) — ARIA roles, states,
  and live regions are implemented to spec and checked via the Chrome
  DevTools accessibility tree, not verified by ear. Said directly in the
  Accessibility section rather than claiming a pass never observed.
- **Queueing writes made while offline** — explicitly called out in the
  brief as a bonus, not a requirement, and skipped for real: a correct
  implementation needs to reconcile queued writes against whatever changed
  server-side in the meantime (version conflicts, assets that no longer
  exist), which is a bigger feature than the remaining time justified.
- **No automated tests** — also optional per the brief ("a handful of sharp
  tests helps you; broad shallow coverage does not"). The pure logic that
  would be worth unit-testing (chunking, the 207 reducer, retry
  classification) is already factored into standalone functions in
  `bulkStatus.ts`/`concurrency.ts`/`client.ts` specifically so it *could*
  be tested without much restructuring — just not done.
- **Shift+Arrow range selection grows incrementally**, not from one fixed
  anchor the way shift-click does. A closer match to shift-click's
  semantics was possible but meaningfully more state to track for a
  difference most users wouldn't notice — a deliberate trade-off, not an
  oversight (see the Accessibility section's keyboard model above).
- **The per-filter-combination cache** (`useInfiniteAssets.ts`) is a
  "remember what I saw this session" cache, not a revalidating one — if
  the underlying data changes server-side while a filter view is cached,
  the restored view can go stale until a full page reload. Fine for a demo
  dataset that only changes through this app's own writes; would need
  revisiting for a real multi-user deployment.

## Critique of the API

- **Bulk-status takes no `version` field**, unlike the single-asset PATCH.
  That's workable (the per-item `conflict` code covers it), but it means
  bulk operations have no optimistic-concurrency story at all — two people
  bulk-editing overlapping selections at once just silently race, with
  whoever's request lands last winning, and no way for the client to even
  detect it happened beyond the random ~7% `conflict` rate. A `version`
  per id in the bulk request (even if partially fails validation) would
  let the client surface that more honestly.
- **Cursors are bound to a fingerprint of the exact query**, which is the
  right call for correctness, but it means there's no way to page back to
  an earlier position after a filter round-trip without re-fetching from
  scratch — the client-side cache in this app exists specifically to work
  around that, which feels like it's compensating for something the API
  could make cheaper (e.g., a cursor that's valid across filter changes
  but just returns nothing new until the underlying page happens to shift).
- **No way to know a bulk operation's ids up front were even valid** before
  sending — `not_found` only comes back after the round-trip, per id,
  mixed in with genuine transient failures. A cheap existence-check
  wouldn't help much here since it'd just be another race, so this is a
  minor one, not a real ask.
- **Chaos is genuinely well-designed for this exercise** — worth saying
  directly, not just critiquing: latency skewed toward short/broad
  queries specifically targets the race condition Task 1 asks about,
  and legal-hold being deterministic vs. conflict being random specifically
  tests whether retry logic can actually tell those apart. That's good
  API design *for a test harness*, even where the shape (no bulk
  `version`) creates real friction for the client.

## Anything you would like us to look at

- **The retry/cancellation layer in `api/client.ts`** — `withRetry`,
  `waitForConnectivity`, and `dedupedGet` are the piece of this codebase
  I'd most want to walk through live. It had a real, non-obvious bug: the
  GET de-dup map only freed a URL's slot once its promise fully settled,
  which happens *asynchronously* — so a request aborted and immediately
  re-issued for the same URL (which React's `StrictMode` does on every dev
  mount, and which a user flipping a filter back and forth would also
  trigger) would piggy-back on the already-doomed aborted request and
  never get a real response, leaving the UI stuck on "Loading…" forever
  with no error shown. Fixed by freeing the map slot synchronously the
  moment `.abort()` is called. Caught by watching the Network tab on a
  plain page load, not by reading the code — I can defend every line of
  the fix, not just that it resolved the symptom.
- **A decision I'm not fully settled on:** the detail panel's 409
  `version_conflict` handling refetches the latest version and shows a
  banner asking the user to review it again, rather than attempting any
  kind of merge. That's the simpler, more honest option (never silently
  discard a concurrent edit), but I'd be glad to talk through whether a
  smarter merge (e.g., only re-prompt if the *field being changed*
  actually conflicts) would be worth the added complexity for this
  product.
- **The card failure-badge + "View failed only" design for Task 3's
  partial-failure display** went through several iterations live (a plain
  list → grouped counts → a floating card → a bounded in-flow card →
  finally badges on the cards themselves) before landing somewhere that
  didn't fight the grid's own layout — happy to walk through why each
  earlier version got replaced, not just the final one.
