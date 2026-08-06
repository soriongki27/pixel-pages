# Pixel Pages — Accounts & Guest Mode Design

**Date:** 2026-08-06
**Status:** Approved (design), pending implementation plan

## 1. Goal

Add real user accounts (sign up / log in) with cross-device sync to Pixel Pages,
while preserving the existing local-only **guest mode**. A guest who already has
entries can import them into a new account, so they never lose their previous
notebook.

## 2. Constraints & context

- Pixel Pages is currently a **pure static site**: `index.html`, `style.css`,
  `app.js`, `prompts.js`. No build step, no bundler, no backend.
- Today all entries are saved to `localStorage` under a single key
  (`pixelPagesEntries`) as an array of `{ id, prompt, answer, wordCount, timestamp }`.
- The account system must **not** introduce a build step. All new code loads as
  plain scripts (Supabase via CDN).

## 3. Provider & auth decisions (settled)

| Decision | Choice |
|---|---|
| Backend | **Supabase** (Postgres + Auth + RLS, CDN JS client) |
| Sign-in method | **Email + password** only |
| Entry flow | Open straight into guest write mode; **Sign in / Sign up** button in header |
| Guest → account | On new signup, **offer to import** existing local entries |
| After import | **Clear** local guest entries (avoid stale duplicates on later logout) |
| Email confirmation | **Off** for v1 (signup logs the user straight in) |

## 4. Architecture

Static site remains. New code is split into small, single-purpose modules.

### New files

- **`config.js`** — Supabase project URL + anon (public) key.
  - These values are **public by design** and safe to commit in a static site.
    Security is enforced by Row-Level Security in the database, not by hiding the
    key. This is intentional and documented here to prevent "leaked secret" alarm.

- **`store.js`** — the storage abstraction. A single async interface:
  - `getEntries(): Promise<Entry[]>`
  - `addEntry(entry): Promise<Entry>`
  - `deleteEntry(id): Promise<void>`
  - Two implementations:
    - `LocalStore` — reads/writes `localStorage` (guest mode; current behavior,
      wrapped in an async interface).
    - `CloudStore` — reads/writes Supabase for the signed-in user.
  - The rest of the app depends only on the interface, never on the backend.

- **`auth.js`** — authentication + auth UI wiring:
  - `signUp(email, password)`, `logIn(email, password)`, `logOut()`
  - session detection on load (`supabase.auth.getSession`)
  - reacts to auth state changes and tells the app which store is active
  - drives the header auth button and the auth form panel

### Changed files

- **`app.js`** — refactor from direct, synchronous `localStorage` access to the
  async store interface. `renderNotebook`, `saveEntry`, `deleteEntry`, `exportAll`,
  and `init` become `async` and `await` the active store. Pure helpers
  (`countWords`, `formatStamp`, `showRandomPrompt`) are unchanged. The app asks
  `auth.js` for the active store rather than choosing storage itself.

- **`index.html`** — add the Supabase CDN `<script>`, then `config.js`,
  `store.js`, `auth.js`, `app.js` (order matters: config → store/auth → app).
  Add a header **Sign in / Sign up** button and a small auth panel (email +
  password form with a Sign up / Log in toggle and an inline error area).

- **`style.css`** — styles for the auth button, the signed-in state
  (email + Sign out), and the auth form panel, matching the existing aesthetic.

## 5. Data model (Supabase)

Table **`entries`**:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key, default `gen_random_uuid()` |
| `user_id` | uuid | references `auth.users(id)`, not null |
| `prompt` | text | not null |
| `answer` | text | not null |
| `word_count` | int | not null |
| `created_at` | timestamptz | default `now()` |

**Row-Level Security:** enabled. Policies restrict `select`, `insert`, `update`,
`delete` to rows where `user_id = auth.uid()`.

**ID normalization:** `LocalStore` entries use numeric IDs (`Date.now()`);
`CloudStore` entries use uuids. The store returns a consistent `Entry` shape so
`deleteEntry(id)` and rendering work identically for both. The app treats `id` as
an opaque value.

`Entry` shape used across the app:
`{ id, prompt, answer, wordCount, timestamp }` where `timestamp` maps to
`created_at` for cloud entries.

## 6. User flows

1. **Open app (guest):** loads straight into guest write mode, as today. Header
   shows **Sign in / Sign up**. `LocalStore` is active.
2. **Sign up:** user enters email + password. Account is created and (email
   confirmation off) the session starts immediately. Header switches to the
   user's email + **Sign out**. `CloudStore` becomes active.
3. **Guest → account import (new signup only):** if local guest entries exist,
   prompt *"Import your N existing entries into your account?"* If yes, bulk-insert
   them into `entries` for the new `user_id`. On success, **clear** the local guest
   entries so a later logout doesn't resurface duplicates.
4. **Log in (returning user):** email + password. On success, `CloudStore`
   becomes active and the notebook shows their synced entries.
5. **Write / save / delete:** identical UI; operations route through the active
   store. Signed-in writes go to Supabase and appear on any device.
6. **Sign out:** end the Supabase session, revert to `LocalStore` (guest),
   re-render. Guest mode starts fresh (local entries were cleared at import time).

## 7. Error handling

- **Auth errors** (wrong password, email already registered, weak password)
  display inline in the auth form.
- **Network / Supabase failures** on save/load/delete surface via the existing
  `flash()` banner (e.g. "Couldn't reach the server — try again"). No silent data
  loss: a failed cloud save reports failure and keeps the text in the textarea.
- **Offline while signed in:** operations fail with a clear message rather than
  silently succeeding.

## 8. Testing (manual)

No test runner exists today; v1 uses a manual checklist rather than new test
infrastructure.

- [ ] Guest can write, save, view, delete, and export without an account.
- [ ] Sign up with a fresh email logs in immediately (no confirmation step).
- [ ] Import prompt appears on signup when guest entries exist; declining leaves
      the account empty; accepting uploads all entries and clears local ones.
- [ ] Signed-in entries persist across a reload and appear in a second browser.
- [ ] Delete removes the entry from Supabase (verify in the dashboard).
- [ ] Log out returns to a fresh guest state; log back in restores cloud entries.
- [ ] Wrong password / duplicate email show inline form errors.
- [ ] Save while offline (signed in) shows an error and preserves the draft.

## 9. Out of scope (v1)

- Offline write queue / background sync for signed-in users.
- OAuth / magic-link / password reset flows.
- Editing existing entries (current app only creates and deletes).
- Sharing or multi-user notebooks.

## 10. Supabase setup checklist (one-time, outside the repo)

- [ ] Create a Supabase project; copy the URL + anon key into `config.js`.
- [ ] Create the `entries` table (schema in §5).
- [ ] Enable RLS and add the four owner-only policies.
- [ ] Turn **off** email confirmation in Auth settings for v1.
