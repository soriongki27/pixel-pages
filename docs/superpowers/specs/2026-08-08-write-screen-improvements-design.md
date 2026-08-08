# Write Screen Improvements — Design

Date: 2026-08-08

## Goal

Improve the Write screen of Pixel Pages with four changes requested by the user,
plus a critical bug fix.

## Changes

### 0. Bug fix (blocking)
`prompts.js` line 1 currently reads `ca// Built-in prompt bank...`. The stray
`ca` is a bare identifier that throws a `ReferenceError` on load, breaking the
whole app. Remove it so the line is a normal comment again.

### 1. Answered-prompt tracking (source: saved entries)
- A prompt counts as "answered" if its text appears in any saved entry.
- Maintain a cached `Set<string>` of answered prompt texts, rebuilt from
  `store.getEntries()` on init, after each save, and after each delete.
- Deleting an entry frees its prompt again (re-enters the unanswered pool).
- Works across devices when signed in, because it derives from stored entries.

### 2. Never land on an answered prompt
- `showRandomPrompt` and the **New prompt** button pick only from the pool of
  *unanswered* prompts. The user can never be shown a prompt they've answered.

### 3. Auto-advance after answering
- After a successful save, the just-answered prompt is added to the answered set
  and the screen automatically advances to the next unanswered prompt.

### 4. "All done" state
- When no unanswered prompts remain, the prompt card shows
  "You've answered every prompt! 🎉" and the answer textarea, Save button, and
  New-prompt button are disabled.
- If the user later deletes an entry, a prompt frees up and the screen
  re-enables with a fresh prompt.

### 5. Bigger, centered writing space
- Keep the prompt card on top (question above the answer).
- Make the `<textarea>` much taller (roughly half the viewport, via `min-height`
  with a `vh` value and a px floor) so the writing space dominates the screen.
- Keep the existing centered `.console` column; ensure the write column reads as
  centered and spacious.

### 6. "Saved" confirmation modal
- Replace the inline success `flash()` with a centered modal:
  a dimmed overlay + card reading "Saved to your notebook! ✓" and an **OK**
  button. Dismiss on OK, overlay click, or Esc.
- Inline `flash()` remains for error/validation cases ("Write something first!",
  connection failures).

## Files touched
- `prompts.js` — remove stray `ca`.
- `index.html` — add modal markup; add an "all done" message element in the
  prompt card.
- `style.css` — taller textarea, modal styles, all-done styling.
- `app.js` — answered-set tracking, unanswered-pool prompt selection,
  auto-advance, all-done enable/disable, modal show/hide wiring.

## Non-goals
- No change to storage schema or the notebook/streak screens beyond what tracking
  requires (tracking reads existing entries only).
- No new prompts added.

## Verification
- Load the app headless (see memory: verify-with-headless-chrome), confirm no
  console errors, screenshot the Write screen (bigger textarea, question above),
  save an entry (modal appears, auto-advances), and confirm answered prompts do
  not reappear.
