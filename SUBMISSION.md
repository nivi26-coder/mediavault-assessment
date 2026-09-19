# Submission

Keep this tight. Bullet points are fine. We read this before we read your code,
and a clear account of your reasoning carries real weight — including where you
chose not to do something.

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Link:**

---

## How to run it

Anything we need to know beyond `npm install && npm run dev`.

## Time spent

Roughly, and how you split it.

---

## Baseline defects found

| # | Defect | Where | Category | Fixed / left / out of scope |
| --- | --- | --- | --- | --- |
| 1 | Bulk update sends >50 ids in one call; API rejects with `400 too_many_ids` above that cap | `App.tsx` (`applyBulkStatus`) | Correctness | Fixed (Task 3) |
| 2 | `handleSaved` is a no-op stub — editing status in the detail panel never updates the grid, so rows go stale after a save | `App.tsx` (`handleSaved`) | Correctness | Fixed (Task 3) |
| 3 | Every keystroke in the search box fires a request immediately — no debounce | `App.tsx` / `useAssets.ts` | Performance | Fixed (Task 1) |
| 4 | No request cancellation and no response-ordering guard — a slow response to an earlier query can overwrite a newer one (the "type 'tra' then finish quickly" race, since short-prefix queries are deliberately slower server-side) | `useAssets.ts`, `api/client.ts` | Correctness | Fixed (Task 1) |
| 5 | `nextCursor` is fetched but never used — the hook always shows just the first page, so most of the 12,400 assets are unreachable, and there's no pagination/infinite-scroll at all | `useAssets.ts` | Correctness / Scale | Fixed (Task 1/2) |
| 6 | Filter/search/sort state lives only in local `useState` — lost on reload, unshareable via URL, and stale cursors from prior queries are never invalidated | `App.tsx` | Correctness | Fixed (Task 1) |
| 7 | Every row is rendered into the DOM regardless of result size — no virtualization, so DOM/memory grow unbounded as more assets load | `AssetGrid.tsx` | Performance / Scale | Fixed (Task 2) |
| 8 | The grid is one component, so toggling a single card's selection re-renders every rendered card | `AssetGrid.tsx` | Performance | Fixed (Task 2) |
| 9 | Grid has no keyboard model — cards/checkboxes are only reachable via native tab order, no roving tabindex, no arrow-key navigation, no ARIA grid semantics (`role`, `aria-selected`) | `AssetGrid.tsx` | Accessibility | Left — planned for Task 5 |
| 10 | Errors are flattened into a single string (`"${status}: ${detail}"`); callers can't branch on `error.code`, so retryable failures (503/429) can't be distinguished from terminal ones (400/409/422), and there's no retry/backoff at all | `api/client.ts` | Correctness / Resilience | Fixed (Task 1) |
| 11 | Detail-panel save has no optimistic update, no retry, and treats `409 version_conflict` the same as any other error — a generic string instead of a deliberate refetch/merge decision | `AssetDetail.tsx` (`setStatus`) | Correctness | Fixed (Task 3) — 409 now shows a dedicated "refresh to see the latest" banner instead of a generic error |
| 12 | Detail panel has no focus management — focus doesn't move into the panel on open, Escape doesn't close it, and focus isn't returned to the triggering card on close | `AssetDetail.tsx` | Accessibility | Left — planned for Task 5 |
| 13 | No error boundary anywhere in the app — an unexpected render error takes down the whole page with no recovery | `App.tsx` / app root | Resilience | Left — planned for Task 4 |
| 14 | No offline detection — writes/reads are attempted the same way regardless of connectivity, with no banner or recovery behavior | app-wide | Resilience | Left — planned for Task 4 |
| 15 | Status is conveyed primarily by color; `draft` has no dedicated pill color/shape distinct from the others, so status is hard to read without relying on color alone | `styles.css` | Accessibility | Left — planned for Task 6 |
| 16 | No `prefers-reduced-motion` handling anywhere — any motion added later (e.g. a loading shimmer) would run unconditionally for users who've asked their OS to reduce motion (correction: this row originally claimed missing `:focus-visible` styling, which was wrong — the baseline already had a global rule for it; verified by diffing against the original commit) | `styles.css` | Accessibility | Fixed (Task 2) |
| 17 | Bulk-action result only reports aggregate counts ("N updated, N failed") with no indication of which assets failed or why | `App.tsx` (`applyBulkStatus`) | UX / Correctness | Fixed (Task 3) |

---

## Key decisions

For each significant choice: what you did, what you rejected, and why. Three to
six of these is about right.

**Data fetching and caching**

**Stale response handling**

**Virtualization approach**

**Optimistic updates and rollback**

**Retry and backoff policy**

**State placement and URL sync**

---

## Performance

Measured on Windows 11, Chrome 152.0.7977.83, headless (via `puppeteer-core`
driving the actual installed Chrome, not a simulated/estimated number),
against the app running under default `CHAOS=1 LATENCY=1`. "Before" was
measured by checking out the original scaffold commit into a separate git
worktree and running it live, not reasoned about after the fact.

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 5,000 rows loaded | N/A — baseline can never load past 24 (`nextCursor` was fetched but never used) | 551 total DOM nodes / 72 rendered cards, at 5,064 assets logically loaded | Scrolled the live app until the "N of 12,400 shown" counter passed 5,000, then `document.querySelectorAll('*').length` / `.card` count |
| Cards re-rendered when toggling one selection | 24 (entire list; no memoization existed) | 1 | Temporarily instrumented `AssetCard`'s render body with a counter, reset it after initial load settled, clicked one checkbox, read the delta. (First attempt used a `MutationObserver` on the real DOM instead — that gave a misleading "1" even *before* the fix, since React can skip real DOM writes for unchanged output regardless of memoization. The render-counter approach is the correct one; removed after measuring.) |
| Longest task during sustained scroll | Not applicable — baseline has nothing to scroll (stuck at 24 rows) | 0 long tasks (none >50ms) across ~3s of continuous scrolling | `PerformanceObserver` with `entryTypes: ['longtask']` while scrolling the grid programmatically |
| Requests fired while typing a 6-character query | 6 (one per keystroke, confirmed live) | 1 | Typed the same 6 characters into `.search` at a natural typing cadence (60ms/keystroke) on both versions, counted `GET /api/assets` requests via Puppeteer's request listener |
| Production bundle, gzipped | 49.82 kB | 58.72 kB | `npm run build` output, both versions |

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

See `PROGRESS.md` for the full story of both bugs, including how they were
found and what the fix actually was.

---

## Accessibility

- Keyboard model you implemented, in one paragraph.
- How you tested it, including any screen reader.
- Known gaps.

---

## Interface decisions

Three or four sentences: what you were optimising for, and the decisions that
follow from it. Then briefly:

- **Visual system.** Your colour, spacing and type decisions, and where they live.
- **Status treatment.** How the four statuses read as a progression, and how they
  stay distinguishable without relying on colour.
- **States.** What you did with loading, empty, error, offline and partial
  failure.
- **Contrast.** What you checked against, and with what.
- **Copy.** Any user-facing message you rewrote and why.

Screenshots in the repo are welcome — link them here.

---

## Trade-offs and cuts

What you deliberately did not do, and what you would do with another day.

## Critique of the API

What you would change about the backend contract, and what it forced you to do in
the client that you would rather not have.

## Anything you would like us to look at

Code you are proud of, or a decision you are unsure about and want to discuss.
