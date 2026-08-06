# Accounts & Guest Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Supabase email/password accounts with cross-device sync to Pixel Pages, alongside the existing local-only guest mode, including guest-to-account entry import.

**Architecture:** Keep the pure static site. Introduce a storage abstraction (`store.js`) with two implementations — `LocalStore` (guest → localStorage) and a cloud store (signed in → Supabase). `app.js` is refactored to talk only to the active store through an async interface and exposes a tiny `window.App` control surface. `auth.js` owns authentication, the header auth UI, and choosing which store is active based on the Supabase session.

**Tech Stack:** HTML, CSS, vanilla JS (no build step), Supabase JS v2 (loaded via CDN), Supabase Postgres + Auth + Row-Level Security.

## Global Constraints

- **No build step.** All code loads as plain `<script>` tags; Supabase via CDN.
- **Supabase JS v2** from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`; the UMD build exposes `window.supabase`.
- **Public keys are intentional.** The Supabase URL + anon key live in `config.js` and are committed. Security is enforced by Row-Level Security, not by hiding the key.
- **Email confirmation is OFF** in Supabase for v1 — a successful signup returns a session immediately.
- **Guest-first UX preserved.** App opens straight into guest write mode; signing in is optional via a header button.
- **Manual testing only.** No test runner is added (per approved spec §8). Each task ends with explicit manual verification steps.
- **Match the existing theme:** forest/cream/ember palette and CSS variables in `style.css`; Fraunces (serif) + Inter (sans) fonts; existing `.btn` / `.label` / `.hidden` conventions.
- **Entry shape across the app:** `{ id, prompt, answer, wordCount, timestamp }`. `LocalStore` uses numeric `id` (`Date.now()`) and ISO `timestamp`; cloud uses uuid `id` and `created_at` as `timestamp`. The app treats `id` as opaque.

---

### Task 1: Supabase project & schema setup (external, one-time)

**Files:** none in the repo. This task provisions the backend and yields the config values Task 2 needs.

**Interfaces:**
- Produces: a Supabase project URL and anon key; an `entries` table with owner-only RLS.

- [ ] **Step 1: Create the project**

In the Supabase dashboard: create a new project. Once ready, open **Project Settings → API** and copy the **Project URL** and the **anon public** key. Keep them for Task 2.

- [ ] **Step 2: Create the table and RLS policies**

In **SQL Editor**, run:

```sql
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  answer text not null,
  word_count int not null,
  created_at timestamptz not null default now()
);

alter table public.entries enable row level security;

create policy "Users can read own entries"
  on public.entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own entries"
  on public.entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own entries"
  on public.entries for update
  using (auth.uid() = user_id);

create policy "Users can delete own entries"
  on public.entries for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 3: Turn off email confirmation**

In **Authentication → Providers → Email** (or **Authentication → Sign In / Providers**), disable **Confirm email** so signup returns a session immediately. Ensure **Email** provider is enabled.

- [ ] **Step 4: Verify**

In **Table Editor**, confirm the `entries` table exists with the six columns and that RLS is shown as **enabled**. No commit (nothing changed in the repo).

---

### Task 2: Add Supabase client + config bootstrap

**Files:**
- Create: `config.js`
- Modify: `index.html` (script tags at end of `<body>`)

**Interfaces:**
- Produces: `window.PIXEL_PAGES_CONFIG = { SUPABASE_URL, SUPABASE_ANON_KEY }`; the global `window.supabase` (from the CDN UMD build) available to later scripts.

- [ ] **Step 1: Create `config.js`**

Use the values from Task 1. These are public by design.

```js
// Supabase connection settings for Pixel Pages.
// These values are PUBLIC by design and safe to commit in a static site —
// data access is protected by Row-Level Security, not by hiding this key.
window.PIXEL_PAGES_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
};
```

- [ ] **Step 2: Wire scripts into `index.html`**

Replace the two existing script tags at the end of `<body>`:

```html
  <script src="prompts.js"></script>
  <script src="app.js"></script>
```

with (order matters — Supabase, then config, then data layer, then app, then auth last):

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script src="prompts.js"></script>
  <script src="store.js"></script>
  <script src="app.js"></script>
  <script src="auth.js"></script>
```

Note: `store.js` and `auth.js` don't exist yet — they're added in Tasks 3 and 5. The page will 404 on them until then; that's expected and doesn't break the existing app.

- [ ] **Step 3: Manual verify**

Open `index.html` in a browser. Open DevTools console and run:

```js
typeof window.supabase.createClient      // "function"
window.PIXEL_PAGES_CONFIG.SUPABASE_URL   // your project URL
```

Expected: both resolve as shown. The Write screen still renders a prompt (existing app unaffected). Ignore 404s for `store.js`/`auth.js` for now.

- [ ] **Step 4: Commit**

```bash
git add config.js index.html
git commit -m "feat: add Supabase client and config bootstrap"
```

---

### Task 3: Storage abstraction + refactor app to use it (guest mode preserved)

**Files:**
- Create: `store.js`
- Modify: `app.js`

**Interfaces:**
- Produces: `window.LocalStore` with async methods `getEntries(): Promise<Entry[]>`, `addEntry(entry): Promise<Entry>`, `deleteEntry(id): Promise<void>`, `clear(): Promise<void>`.
- Produces: `window.App` with `setStore(store): void`, `getStore(): store`, `refresh(): Promise<void>`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Create `store.js` with `LocalStore`**

```js
/* ===========================================================
   Pixel Pages — storage abstraction
   One async interface, two backends:
     - LocalStore  : guest mode, browser localStorage
     - CloudStore  : signed-in, Supabase (added in a later task)
   Entry shape: { id, prompt, answer, wordCount, timestamp }
   =========================================================== */

const STORAGE_KEY = 'pixelPagesEntries';

window.LocalStore = {
  async getEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  },

  async addEntry(entry) {
    const entries = await this.getEntries();
    const record = {
      id: Date.now(),
      prompt: entry.prompt,
      answer: entry.answer,
      wordCount: entry.wordCount,
      timestamp: new Date().toISOString(),
    };
    entries.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return record;
  },

  async deleteEntry(id) {
    const entries = (await this.getEntries()).filter((e) => e.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  },

  async clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
```

- [ ] **Step 2: Refactor `app.js` — remove direct storage, add active store + App surface**

Delete the old `STORAGE_KEY`, `loadEntries`, and `saveEntries` (now owned by `store.js`). At the top of `app.js`, after the `el` object, add:

```js
// Active storage backend. Defaults to guest (local); auth.js swaps in a
// cloud store when a user is signed in.
let store = window.LocalStore;

// Control surface used by auth.js to switch backends and re-render.
window.App = {
  setStore(s) { store = s; },
  getStore() { return store; },
  refresh() { return renderNotebook(); },
};
```

- [ ] **Step 3: Make `saveEntry` async and route through the store**

Replace the whole `saveEntry` function with:

```js
async function saveEntry() {
  const answer = el.answer.value.trim();
  const prompt = el.promptText.textContent;

  if (!answer) {
    flash('Write something first!');
    return;
  }

  try {
    await store.addEntry({
      prompt: prompt,
      answer: answer,
      wordCount: countWords(answer),
    });
  } catch (e) {
    flash("Couldn't save — check your connection and try again.");
    return; // keep the text in the textarea so nothing is lost
  }

  el.answer.value = '';
  updateWordCount();
  flash('Saved to your notebook!');
  renderNotebook();
}
```

- [ ] **Step 4: Make `renderNotebook` async and load from the store**

Replace the first two lines of `renderNotebook` (the `const entries = ...` and `el.entries.innerHTML = ''`) so it awaits the store:

```js
async function renderNotebook() {
  let entries;
  try {
    entries = (await store.getEntries()).slice().reverse(); // newest first
  } catch (e) {
    flash("Couldn't load your notebook — check your connection.");
    return;
  }
  el.entries.innerHTML = '';
  // ...rest of the function is unchanged...
```

- [ ] **Step 5: Make `deleteEntry` async and route through the store**

Replace the `deleteEntry` function with:

```js
async function deleteEntry(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  try {
    await store.deleteEntry(id);
  } catch (e) {
    flash("Couldn't delete — check your connection and try again.");
    return;
  }
  renderNotebook();
}
```

- [ ] **Step 6: Make `exportAll` async and load from the store**

Replace the first line of `exportAll`'s body (`const entries = loadEntries();`) with:

```js
async function exportAll() {
  let entries;
  try {
    entries = await store.getEntries();
  } catch (e) {
    flash("Couldn't export — check your connection.");
    return;
  }
  // ...rest of the function is unchanged...
```

- [ ] **Step 7: Make `switchView` and `init` async**

In `switchView`, change the last line so the render is awaited:

```js
  if (!write) return renderNotebook();
```

In `init`, make it async and await the initial render:

```js
async function init() {
  showRandomPrompt();
  updateWordCount();
  await renderNotebook();

  el.newPrompt.addEventListener('click', showRandomPrompt);
  el.answer.addEventListener('input', updateWordCount);
  el.saveEntry.addEventListener('click', saveEntry);
  el.exportAll.addEventListener('click', exportAll);
  el.navWrite.addEventListener('click', () => switchView('write'));
  el.navNotebook.addEventListener('click', () => switchView('notebook'));
}

init();
```

- [ ] **Step 8: Manual verify (guest mode unchanged)**

Open `index.html`. As a guest (no account): write an answer and Save → it appears in Notebook. Reload → entry persists. Delete it → it disappears and stays gone after reload. Save two entries and Export All → downloaded `.txt` contains both. Confirm no console errors (the `auth.js` 404 is still expected until Task 5).

- [ ] **Step 9: Commit**

```bash
git add store.js app.js
git commit -m "refactor: route entries through an async storage abstraction"
```

---

### Task 4: Cloud store (Supabase-backed implementation)

**Files:**
- Modify: `store.js`

**Interfaces:**
- Consumes: `window.supabase` (CDN), `window.PIXEL_PAGES_CONFIG` (Task 2).
- Produces: `window.createCloudStore(client, userId)` returning an object with the same interface as `LocalStore` — `getEntries()`, `addEntry(entry)`, `deleteEntry(id)` — plus `importEntries(entries): Promise<void>` for the guest→account flow.

- [ ] **Step 1: Add `createCloudStore` to `store.js`**

Append to `store.js`:

```js
// Factory for a Supabase-backed store bound to one signed-in user.
window.createCloudStore = function createCloudStore(client, userId) {
  return {
    async getEntries() {
      const { data, error } = await client
        .from('entries')
        .select('id, prompt, answer, word_count, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        prompt: row.prompt,
        answer: row.answer,
        wordCount: row.word_count,
        timestamp: row.created_at,
      }));
    },

    async addEntry(entry) {
      const { data, error } = await client
        .from('entries')
        .insert({
          user_id: userId,
          prompt: entry.prompt,
          answer: entry.answer,
          word_count: entry.wordCount,
        })
        .select('id, prompt, answer, word_count, created_at')
        .single();
      if (error) throw error;
      return {
        id: data.id,
        prompt: data.prompt,
        answer: data.answer,
        wordCount: data.word_count,
        timestamp: data.created_at,
      };
    },

    async deleteEntry(id) {
      const { error } = await client.from('entries').delete().eq('id', id);
      if (error) throw error;
    },

    async importEntries(entries) {
      if (!entries.length) return;
      const rows = entries.map((e) => ({
        user_id: userId,
        prompt: e.prompt,
        answer: e.answer,
        word_count: e.wordCount,
      }));
      const { error } = await client.from('entries').insert(rows);
      if (error) throw error;
    },
  };
};
```

- [ ] **Step 2: Manual verify via console**

Open `index.html`. In DevTools console, create a client, a throwaway user, and exercise the store:

```js
const c = window.supabase.createClient(
  window.PIXEL_PAGES_CONFIG.SUPABASE_URL,
  window.PIXEL_PAGES_CONFIG.SUPABASE_ANON_KEY
);
// create a temporary account (confirmation is off, so this returns a session)
let s = await c.auth.signUp({ email: 'test1@example.com', password: 'password123' });
const uid = s.data.user.id;
const cloud = window.createCloudStore(c, uid);
await cloud.addEntry({ prompt: 'P', answer: 'A', wordCount: 1 });
await cloud.getEntries();   // -> array with one entry, id is a uuid string
```

Expected: `getEntries()` returns the inserted entry with a uuid `id` and a `timestamp`. Confirm the row appears in the Supabase **Table Editor**. Then clean up:

```js
await cloud.deleteEntry((await cloud.getEntries())[0].id);
await c.auth.signOut();
```

- [ ] **Step 3: Commit**

```bash
git add store.js
git commit -m "feat: add Supabase-backed cloud store"
```

---

### Task 5: Auth UI + session-driven store switching

**Files:**
- Create: `auth.js`
- Modify: `index.html` (header markup), `style.css` (auth styles)

**Interfaces:**
- Consumes: `window.supabase`, `window.PIXEL_PAGES_CONFIG`, `window.LocalStore`, `window.createCloudStore`, `window.App` (`setStore`/`refresh`).
- Produces: header auth control + auth form behavior; on load, sets the active store based on the current session.

- [ ] **Step 1: Add header auth markup to `index.html`**

Inside `<header class="topbar">`, add an auth bar just before `<nav class="nav">`:

```html
      <div class="auth-bar">
        <button id="auth-open" class="btn auth-open" type="button">Sign in / Sign up</button>
        <div id="auth-user" class="auth-user hidden">
          <span id="auth-user-email" class="auth-user-email"></span>
          <button id="auth-logout" class="btn" type="button">Sign out</button>
        </div>
      </div>
```

Then, immediately after the closing `</header>`, add the auth panel:

```html
    <!-- AUTH PANEL -->
    <div id="auth-panel" class="auth-panel hidden">
      <form id="auth-form" class="auth-form">
        <h2 id="auth-title" class="label">Log in</h2>
        <label class="label" for="auth-email">Email</label>
        <input id="auth-email" class="auth-input" type="email" autocomplete="email" required />
        <label class="label" for="auth-password">Password</label>
        <input id="auth-password" class="auth-input" type="password" autocomplete="current-password" minlength="6" required />
        <p id="auth-error" class="auth-error" aria-live="polite"></p>
        <div class="auth-actions">
          <button id="auth-submit" class="btn btn-primary" type="submit">Log in</button>
          <button id="auth-cancel" class="btn" type="button">Cancel</button>
        </div>
        <p class="auth-switch">
          <span id="auth-switch-text">New here?</span>
          <button id="auth-toggle" class="auth-link" type="button">Create an account</button>
        </p>
      </form>
    </div>
```

- [ ] **Step 2: Create `auth.js`**

```js
/* ===========================================================
   Pixel Pages — authentication + auth UI
   - Email/password via Supabase (email confirmation is OFF)
   - Chooses the active store based on the session:
       signed in -> cloud store ; guest -> LocalStore
   - On new signup, offers to import local guest entries
   =========================================================== */

const supabaseClient = window.supabase.createClient(
  window.PIXEL_PAGES_CONFIG.SUPABASE_URL,
  window.PIXEL_PAGES_CONFIG.SUPABASE_ANON_KEY
);

const a = {
  open:      document.getElementById('auth-open'),
  panel:     document.getElementById('auth-panel'),
  form:      document.getElementById('auth-form'),
  email:     document.getElementById('auth-email'),
  password:  document.getElementById('auth-password'),
  submit:    document.getElementById('auth-submit'),
  cancel:    document.getElementById('auth-cancel'),
  error:     document.getElementById('auth-error'),
  title:     document.getElementById('auth-title'),
  toggle:    document.getElementById('auth-toggle'),
  switchTxt: document.getElementById('auth-switch-text'),
  userBox:   document.getElementById('auth-user'),
  userEmail: document.getElementById('auth-user-email'),
  logout:    document.getElementById('auth-logout'),
};

let mode = 'login'; // 'login' | 'signup'

function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  a.title.textContent = signup ? 'Create your account' : 'Log in';
  a.submit.textContent = signup ? 'Sign up' : 'Log in';
  a.switchTxt.textContent = signup ? 'Already have an account?' : 'New here?';
  a.toggle.textContent = signup ? 'Log in instead' : 'Create an account';
  a.password.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  a.error.textContent = '';
}

function openPanel() { a.panel.classList.remove('hidden'); a.email.focus(); }
function closePanel() {
  a.panel.classList.add('hidden');
  a.form.reset();
  a.error.textContent = '';
}
function showError(msg) { a.error.textContent = msg; }

// Point the app at the right backend for this session and re-render.
async function applySession(session) {
  if (session) {
    const cloud = window.createCloudStore(supabaseClient, session.user.id);
    window.App.setStore(cloud);
    a.userEmail.textContent = session.user.email;
    a.userBox.classList.remove('hidden');
    a.open.classList.add('hidden');
  } else {
    window.App.setStore(window.LocalStore);
    a.userBox.classList.add('hidden');
    a.open.classList.remove('hidden');
  }
  await window.App.refresh();
}

// On new signup, offer to bring guest entries along; clear them after import.
async function maybeImportGuestEntries(userId) {
  const local = await window.LocalStore.getEntries();
  if (!local.length) return;
  const noun = local.length === 1 ? 'entry' : 'entries';
  if (!confirm(`Import your ${local.length} existing ${noun} into your account?`)) return;
  const cloud = window.createCloudStore(supabaseClient, userId);
  await cloud.importEntries(local);
  await window.LocalStore.clear();
}

async function handleSubmit(event) {
  event.preventDefault();
  showError('');
  const email = a.email.value.trim();
  const password = a.password.value;

  if (mode === 'signup') {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) { showError(error.message); return; }
    if (!data.session) {
      // Only happens if email confirmation is on in Supabase.
      showError('Check your email to confirm your account, then log in.');
      return;
    }
    await maybeImportGuestEntries(data.session.user.id);
    closePanel();
    await applySession(data.session);
  } else {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { showError(error.message); return; }
    closePanel();
    await applySession(data.session);
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  await applySession(null);
}

async function initAuth() {
  a.open.addEventListener('click', () => { setMode('login'); openPanel(); });
  a.cancel.addEventListener('click', closePanel);
  a.toggle.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
  a.form.addEventListener('submit', handleSubmit);
  a.logout.addEventListener('click', handleLogout);

  const { data } = await supabaseClient.auth.getSession();
  await applySession(data.session);
}

initAuth();
```

- [ ] **Step 3: Add auth styles to `style.css`**

Append (uses the existing theme variables):

```css
/* ---------- Auth ---------- */
.auth-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.auth-user {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auth-user-email {
  font-family: var(--sans);
  font-size: 0.85rem;
  color: var(--tan);
}

.auth-panel {
  max-width: 420px;
  margin: 0 auto 30px;
  background: var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--r);
  padding: 26px;
  box-shadow: var(--shadow-soft);
  animation: rise 0.28s ease both;
}

.auth-form .label { margin-top: 14px; }
.auth-form .label:first-child { margin-top: 0; }

.auth-input {
  width: 100%;
  font-family: var(--sans);
  font-size: 1rem;
  color: var(--text);
  background: var(--field);
  border: 1px solid var(--hair);
  border-radius: var(--r-sm);
  padding: 12px 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.auth-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(217, 119, 87, 0.22);
}

.auth-error {
  font-family: var(--sans);
  font-size: 0.85rem;
  color: var(--accent);
  min-height: 1.2em;
  margin: 12px 0 0;
}

.auth-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.auth-switch {
  font-family: var(--sans);
  font-size: 0.85rem;
  color: var(--tan);
  margin: 16px 0 0;
  text-align: center;
}

.auth-link {
  font-family: var(--sans);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 4px;
}

.auth-link:hover { text-decoration: underline; }
```

- [ ] **Step 4: Manual verify (log in / log out cycle)**

Open `index.html`. Use the temporary account from Task 4 (`test1@example.com` / `password123`), or create a fresh one.
- Click **Sign in / Sign up** → panel opens in Log in mode. Click **Create an account** → title/button switch to signup.
- Log in with valid credentials → panel closes, header shows the email + **Sign out**, Notebook shows that account's cloud entries.
- Add an entry while signed in → reload the page → entry persists (loaded from Supabase, not localStorage). Confirm the row in the Supabase Table Editor.
- Click **Sign out** → header shows **Sign in / Sign up** again and the notebook reverts to guest (local) entries.
- Try a wrong password → inline error appears in the form; try an already-registered email in signup mode → inline error appears.

- [ ] **Step 5: Commit**

```bash
git add index.html style.css auth.js
git commit -m "feat: add auth UI and session-driven store switching"
```

---

### Task 6: Guest → account import verification & polish

**Files:** none expected (import logic was implemented in Task 5). This task verifies the end-to-end guest-to-account flow and fixes anything it surfaces.

**Interfaces:**
- Consumes: everything from Tasks 3–5.

- [ ] **Step 1: Verify import-on-signup (accept)**

Start signed out with a clean slate: in console run `localStorage.clear()` then reload. As a guest, save **2** entries. Click **Sign in / Sign up → Create an account**, sign up with a brand-new email. Expect a confirm dialog: *"Import your 2 existing entries into your account?"* Click **OK**.
- Expected: header shows the new email; Notebook shows both imported entries; both rows exist in the Supabase Table Editor under the new user.
- Sign out, then check `localStorage.getItem('pixelPagesEntries')` in console → should be `null` (local guest entries were cleared after import).

- [ ] **Step 2: Verify import-on-signup (decline)**

`localStorage.clear()`, reload, save 1 guest entry. Sign up with another new email and click **Cancel** on the import dialog.
- Expected: account notebook is empty; the guest entry is untouched in localStorage (still present after signing out).

- [ ] **Step 3: Verify no-prompt when no guest entries**

`localStorage.clear()`, reload, and without writing anything, sign up with a new email.
- Expected: no import dialog appears; account starts empty.

- [ ] **Step 4: Full spec checklist pass**

Run the manual checklist from spec §8 end to end. Note any failures and fix them (fixes belong in the file that owns the behavior — `store.js`, `auth.js`, or `app.js`), then re-verify.

- [ ] **Step 5: Commit (only if fixes were made)**

```bash
git add -A
git commit -m "fix: polish guest-to-account import flow"
```

---

## Self-Review

**Spec coverage:**
- §3 provider/auth decisions → Tasks 1–5 (Supabase, email/password, header button, import, confirmation off). ✔
- §4 architecture (`config.js`, `store.js`, `auth.js`, `app.js` refactor, `index.html`, `style.css`) → Tasks 2–5. ✔
- §5 data model + RLS + ID normalization → Task 1 (schema/RLS) and Task 4 (map `word_count`/`created_at`, uuid ids). ✔
- §6 user flows (guest open, signup, import+clear, login, write/delete, signout→guest) → Tasks 3, 5, 6. ✔
- §7 error handling (inline auth errors; `flash()` on network failure; draft preserved on failed save) → Task 3 (save/render/delete/export try-catch), Task 5 (`showError`). ✔
- §8 manual testing → verification steps in every task; full pass in Task 6. ✔
- §9 out of scope → not implemented (no offline queue, OAuth, edit, sharing). ✔
- §10 Supabase setup checklist → Task 1. ✔

**Placeholder scan:** No TBD/TODO. `config.js` contains literal placeholder credential strings by necessity — Step 1 of Task 2 instructs replacing them with Task 1's real values. No vague "add error handling" — each catch block and message is spelled out.

**Type consistency:** Store interface names match across tasks — `getEntries`/`addEntry`/`deleteEntry`/`clear` on `LocalStore`; cloud adds `importEntries`; both consumed via `window.App.setStore`/`getStore`/`refresh`. `createCloudStore(client, userId)` signature matches its callers in `auth.js` (`applySession`, `maybeImportGuestEntries`). Entry fields (`id`, `prompt`, `answer`, `wordCount`, `timestamp`) are consistent; cloud maps `word_count`→`wordCount` and `created_at`→`timestamp` in both `getEntries` and `addEntry`.
