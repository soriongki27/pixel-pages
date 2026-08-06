# Separate Sign In / Sign Up Screens — Design

**Date:** 2026-08-06
**Status:** Approved

## Problem

Authentication currently lives in a single `#auth-panel` containing one form
that toggles between "Log in" and "Sign up" modes via a link (`auth.js`
`setMode`). The panel opens *above* the journal, which stays visible
underneath. We want sign-in and sign-up to be two distinct screens.

## Goal

Split the single toggling auth form into two separate in-app screens — **Sign
In** and **Sign Up** — presented as a full-screen takeover. No separate HTML
files, no page reload, no change to the underlying Supabase auth, guest-entry
import, or storage behavior.

## Design

### Screens

Add two new `.view` screens alongside the existing Write and Notebook views:

- `#view-signin` — heading, email input, password input, error line,
  **Log in** submit button, **Cancel** link, and a switch link
  ("New here? Create an account" → Sign Up).
- `#view-signup` — heading, email input, password input, error line,
  **Sign up** submit button, **Cancel** link, and a switch link
  ("Already have an account? Log in" → Sign In).

Each screen has its own form and its own error line (no shared mutable `mode`).

### Full-screen takeover

A shared screen-switcher shows exactly one screen at a time from the set
`{ write, notebook, signin, signup }`. While on `signin` or `signup`:

- the Write/Notebook nav (`.nav`) is hidden, and
- only the header (logo + tagline) and the auth form are visible.

**Cancel** or a successful login/signup returns to the journal (the Write
view).

### File changes

- **index.html** — remove the `#auth-panel` block; add `#view-signin` and
  `#view-signup` sections. Reuse the existing `.auth-form` / `.auth-input` /
  `.label` / `.btn` styles so little or no new CSS is required.
- **app.js** — generalize view switching to cover all four screens and hide
  `.nav` on the two auth screens; expose `window.App.showScreen(name)` for
  `auth.js` to call.
- **auth.js** — remove the `mode` / `setMode` / `openPanel` / `closePanel` /
  toggle machinery. Wire:
  - the header "Sign in / Sign up" button → Sign In screen,
  - two independent submit handlers (login vs signup, each reading its own
    inputs),
  - the switch links between the two screens,
  - **Cancel** → back to the journal.

  The session logic — `applySession`, `maybeImportGuestEntries`,
  `handleLogout`, and initial `getSession` — is unchanged.

## Out of scope / no change

- Supabase auth calls (`signUp`, `signInWithPassword`, `signOut`).
- Guest-entry import on signup.
- Local vs cloud store selection.
- Journal (Write / Notebook) functionality.

## Verification

No test framework exists in this static app. Drive it in headless Chrome:

1. Header "Sign in / Sign up" button opens the **Sign In** screen with the
   Write/Notebook nav hidden.
2. The switch link swaps to the **Sign Up** screen (and back).
3. **Cancel** returns to the journal (Write view) with the nav visible again.
