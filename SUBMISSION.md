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
| 1 | Bulk update sends >50 ids in one call; API rejects with `400 too_many_ids` above that cap | `App.tsx` (`applyBulkStatus`) | Correctness | |
| 2 | `handleSaved` is a no-op stub — editing status in the detail panel never updates the grid, so rows go stale after a save | `App.tsx` (`handleSaved`) | Correctness | |
| 3 | Every keystroke in the search box fires a request immediately — no debounce | `App.tsx` / `useAssets.ts` | Performance | |
| 4 | No request cancellation and no response-ordering guard — a slow response to an earlier query can overwrite a newer one (the "type 'tra' then finish quickly" race, since short-prefix queries are deliberately slower server-side) | `useAssets.ts`, `api/client.ts` | Correctness | |
| 5 | `nextCursor` is fetched but never used — the hook always shows just the first page, so most of the 12,400 assets are unreachable, and there's no pagination/infinite-scroll at all | `useAssets.ts` | Correctness / Scale | |
| 6 | Filter/search/sort state lives only in local `useState` — lost on reload, unshareable via URL, and stale cursors from prior queries are never invalidated | `App.tsx` | Correctness | |
| 7 | Every row is rendered into the DOM regardless of result size — no virtualization, so DOM/memory grow unbounded as more assets load | `AssetGrid.tsx` | Performance / Scale | |
| 8 | The grid is one component, so toggling a single card's selection re-renders every rendered card | `AssetGrid.tsx` | Performance | |
| 9 | Grid has no keyboard model — cards/checkboxes are only reachable via native tab order, no roving tabindex, no arrow-key navigation, no ARIA grid semantics (`role`, `aria-selected`) | `AssetGrid.tsx` | Accessibility | |
| 10 | Errors are flattened into a single string (`"${status}: ${detail}"`); callers can't branch on `error.code`, so retryable failures (503/429) can't be distinguished from terminal ones (400/409/422), and there's no retry/backoff at all | `api/client.ts` | Correctness / Resilience | |
| 11 | Detail-panel save has no optimistic update, no retry, and treats `409 version_conflict` the same as any other error — a generic string instead of a deliberate refetch/merge decision | `AssetDetail.tsx` (`setStatus`) | Correctness | |
| 12 | Detail panel has no focus management — focus doesn't move into the panel on open, Escape doesn't close it, and focus isn't returned to the triggering card on close | `AssetDetail.tsx` | Accessibility | |
| 13 | No error boundary anywhere in the app — an unexpected render error takes down the whole page with no recovery | `App.tsx` / app root | Resilience | |
| 14 | No offline detection — writes/reads are attempted the same way regardless of connectivity, with no banner or recovery behavior | app-wide | Resilience | |
| 15 | Status is conveyed primarily by color; `draft` has no dedicated pill color/shape distinct from the others, so status is hard to read without relying on color alone | `styles.css` | Accessibility | |
| 16 | No `:focus-visible` styling anywhere — keyboard focus position is invisible | `styles.css` | Accessibility | |
| 17 | Bulk-action result only reports aggregate counts ("N updated, N failed") with no indication of which assets failed or why | `App.tsx` (`applyBulkStatus`) | UX / Correctness | |

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

Fill in real measurements, not estimates. Say which machine and browser.

| Metric | Before | After | How measured |
| --- | --- | --- | --- |
| Rendered DOM nodes at 5,000 rows loaded | | | |
| Cards re-rendered when toggling one selection | | | |
| Longest task during sustained scroll | | | |
| Requests fired while typing a 6-character query | | | |
| Production bundle, gzipped | | | |

What was the actual bottleneck, and how did you find it?

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
