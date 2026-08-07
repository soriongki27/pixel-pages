# Streak Calendar & Story Share — Design

**Date:** 2026-08-07
**Status:** Approved (design)

## Summary

Add a GitHub-style **streak heatmap** to the top of the Write screen so users can see
their daily-writing consistency at a glance, plus a **"Share" button** that renders a
9:16 story image (JPEG) suitable for Instagram / Facebook stories.

The feature reads existing entry data — no schema changes. It works identically for
guest (localStorage) and signed-in (Supabase) users because both flow through the
shared `store.getEntries()` interface. Entries already carry an ISO `timestamp`.

## Goals

- Show a heatmap of the last ~6 months (26 weeks × 7 days) at the top of the Write view.
- Show motivating stats: current streak (with flame), longest streak, total entries.
- Let users export a branded 9:16 story image as a JPEG download.
- Zero new dependencies.

## Non-goals

- No reminders / notifications.
- No changes to how entries are stored or synced.
- No server-side image generation or share-to-social APIs (user downloads, then posts).
- No configurable time ranges or themes (fixed 6-month window, one color treatment).

## Streak logic — `streak.js` (new, pure functions)

A new file exposing pure helpers on `window` (matching the project's global-script
style). No DOM, no storage access — takes entries in, returns data out. This keeps the
math testable in isolation.

### Definitions

- A **day** is the user's *local* calendar date, derived from an entry's `timestamp`
  (`new Date(timestamp)` → local year/month/day). Two entries on the same local date
  count as the same day.
- **Day key:** `YYYY-MM-DD` built from local date components (not `toISOString`, which
  is UTC and would shift days near midnight).

### API

```
window.Streak = {
  dayKey(date) -> "YYYY-MM-DD"            // local components
  computeStreakData(entries) -> {
    currentStreak,     // number
    longestStreak,     // number
    totalEntries,      // number (entries.length)
    countsByDay,       // Map<"YYYY-MM-DD", number>  entries written that day
  }
  buildHeatmap(countsByDay, today, weeks=26) -> {
    columns,   // array of weeks, each = array of 7 cells (Sun..Sat), oldest first
    // each cell: { key, date, count, level }  or  { empty:true } for padding
  }
  intensityLevel(count) -> 0|1|2|3        // 0 none, 1 = one, 2 = two, 3 = three+
}
```

### Current streak rule

Count consecutive days with ≥1 entry ending at **today**. If today has no entry *yet*
but yesterday does, the streak still counts (walk starts from yesterday) — a streak
only breaks after a full missed calendar day, so it never drops to zero mid-day.

Algorithm: start cursor at today's key. If today has no entry, move cursor to
yesterday. Then walk backward one day at a time while `countsByDay` has the cursor key,
incrementing the count. Stop at the first gap.

### Longest streak

Sort the distinct day keys ascending, walk them, tracking the longest run where each
day is exactly one calendar day after the previous. Return the max run length.

### Intensity → level

`0 → 0`, `1 → 1`, `2 → 2`, `>=3 → 3`.

## On-screen UI

### Markup (`index.html`)

Add a `<section class="streak-card">` as the **first child of `#view-write`**, above the
existing `.prompt-card`:

```
<section class="streak-card">
  <div class="streak-head">
    <span class="label">Your Streak</span>
    <button id="share-streak" class="btn" type="button">Share</button>
  </div>
  <div class="streak-stats">
    <span class="streak-current"><span class="flame">🔥</span> <b id="streak-current-n">0</b> day streak</span>
    <span class="streak-stat">Longest <b id="streak-longest-n">0</b></span>
    <span class="streak-stat"><b id="streak-total-n">0</b> entries</span>
  </div>
  <div id="streak-grid" class="streak-grid" aria-label="Writing activity, last 6 months"></div>
  <p id="streak-empty" class="streak-empty hidden">Write today to start your streak.</p>
</section>
```

Add `<script src="streak.js"></script>` and `<script src="share.js"></script>` before
`app.js` in the script list.

### Rendering (`app.js`)

- New `renderStreak()`:
  1. `const entries = await store.getEntries()` (guard with try/catch like other renders).
  2. `const data = Streak.computeStreakData(entries)`.
  3. Fill the three stat numbers.
  4. Build the heatmap via `Streak.buildHeatmap(data.countsByDay, new Date())` and render
     columns of day cells into `#streak-grid` (DOM built with `createElement`, matching
     `buildEntryEl` style). Each cell gets `data-level` (0–3) and a `title` tooltip like
     `Aug 7, 2026 — 2 entries`.
  5. Toggle `#streak-empty` when `totalEntries === 0`.
- Call `renderStreak()`:
  - in `init()` on load,
  - at the end of `saveEntry()` (after a successful save),
  - inside `window.App.refresh()` so auth.js sign-in/out (which already calls
    `App.refresh()`) also refreshes the streak. `refresh()` will now run both
    `renderNotebook()` and `renderStreak()`.
- Add the Share button listener → `Share.exportStreakImage(data)` (import current data
  at click time so it's fresh).

### Styles (`style.css`)

- `.streak-card`: same surface/hairline/radius/shadow language as `.prompt-card`.
- `.streak-head`: flex row, label left, Share button right.
- `.streak-stats`: flex row, wraps on narrow; current streak emphasized in `--accent`,
  flame slightly larger.
- `.streak-grid`: `display:flex; gap:3px; overflow-x:auto` (columns), each column a
  vertical flex of 7 cells. Cells ~13px squares, `border-radius:3px`.
- Level colors:
  - `0` → `var(--field)` with a faint `--hair-soft` inset (empty).
  - `1` → a muted sage.
  - `2` → `var(--sage)`.
  - `3` → `var(--accent)` (the ember, top tier).
- Respect the cozy palette; no new global tokens needed beyond level shades declared
  locally.

## Story image export — `share.js` (new)

Native **Canvas 2D** rendering — no library. Exposes:

```
window.Share = { exportStreakImage(streakData) }
```

### Rendering

- Canvas **1080 × 1920** (9:16 story).
- Background: forest `--bg` fill + the two radial ember/sage glows (drawn with
  `createRadialGradient`) to echo the site background.
- Content, vertically stacked and centered:
  1. Pixel Pages logo image (`logo-256.png`, drawn once loaded) + "PIXEL PAGES" wordmark
     in a serif-ish system fallback (canvas can't rely on Fraunces being loaded; use a
     bold serif stack — acceptable for an image).
  2. Big current-streak number (e.g. `7`) with a flame glyph, plus "day streak" caption.
  3. Secondary stats line: "Longest 12 · 28 entries".
  4. The heatmap redrawn directly on canvas (same 26×7 grid, same level colors) scaled
     up to fill the width nicely.
  5. Footer: `pixel-pages.vercel.app`.
- Font loading: call `await document.fonts.ready` before drawing text so custom fonts
  are used when available; fall back to system stacks otherwise.
- Logo loading: load `logo-256.png` via `new Image()` and await `onload` before drawing;
  if it fails, skip the logo (draw text wordmark only).
- Export: `canvas.toBlob(blob => downloadBlob(blob, 'pixel-pages-streak.jpg'), 'image/jpeg', 0.92)`.
  Download uses the same anchor-click pattern as `exportAll()` in `app.js`.

### Edge cases

- 0 entries: still exports a valid card showing `0 day streak` and an empty grid (button
  stays enabled; harmless). The on-screen empty note nudges them to write first.

## Testing

The project has no test harness (vanilla JS, no `package.json`). The only non-trivial
logic is `computeStreakData` / `buildHeatmap`, which are pure. Verification plan:

- **Logic:** a one-off standalone check (a small `<script>` or Node snippet run once
  during development) exercising fixtures: no entries; single day; consecutive run
  through today; run ending yesterday (still counts); a broken run (gap resets); two
  entries same day (counts as one streak day, count=2 in heatmap); entries spanning
  a local-midnight boundary land on the correct local day.
- **Rendering & export:** manual browser verification — grid shows correct filled days
  and tooltips, stats match, Share downloads a 1080×1920 JPEG that looks correct in a
  story preview, and everything refreshes after save and after sign-in/out.

## Files

- **New:** `streak.js`, `share.js`
- **Changed:** `index.html`, `app.js`, `style.css`
