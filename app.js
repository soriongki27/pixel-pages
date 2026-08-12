/* ===========================================================
   Pixel Pages — app logic
   - Serves random prompts (never the same one twice in a row)
   - Live word count
   - Saves entries to localStorage with a date/time stamp
   - Notebook view: browse, delete, export all
   =========================================================== */

// --- Element references ---
const el = {
  nav:         document.querySelector('.nav'),
  navWrite:    document.getElementById('nav-write'),
  navNotebook: document.getElementById('nav-notebook'),
  navStreak:   document.getElementById('nav-streak'),
  viewWrite:   document.getElementById('view-write'),
  viewNotebook:document.getElementById('view-notebook'),
  viewStreak:  document.getElementById('view-streak'),
  viewSignin:  document.getElementById('view-signin'),
  viewSignup:  document.getElementById('view-signup'),
  viewReset:   document.getElementById('view-reset'),
  viewNewpassword: document.getElementById('view-newpassword'),

  promptText:  document.getElementById('prompt-text'),
  allDone:     document.getElementById('all-done'),
  newPrompt:   document.getElementById('new-prompt'),
  answer:      document.getElementById('answer'),
  wordCount:   document.getElementById('word-count'),
  saveEntry:   document.getElementById('save-entry'),
  saveMsg:     document.getElementById('save-msg'),

  savedModal:  document.getElementById('saved-modal'),
  savedModalOk:document.getElementById('saved-modal-ok'),

  entries:     document.getElementById('entries'),
  emptyNote:   document.getElementById('empty-note'),
  exportAll:   document.getElementById('export-all'),
  entryTotal:  document.getElementById('entry-total'),

  // Selection controls
  selectionControls: document.getElementById('selection-controls'),
  selectionCount:    document.getElementById('selection-count'),
  clearSelectionBtn: document.getElementById('clear-selection'),
  shareSocial:       document.getElementById('share-social'),
  exportPDF:         document.getElementById('export-pdf'),
};

// Holds the most recent streak data so badge visibility can be decided
// without re-reading the store. The detailed view and the badge each own
// their own DOM (see streak-detail.js / streak-badge.js).
let lastStreakData = null;
// Tracks the visible main screen so we know when to show the side badge.
let currentScreen = 'write';

let lastPromptIndex = -1;

// Set of prompt texts the user has already answered. A prompt counts as
// answered once it appears in a saved entry, so this is rebuilt from the store
// on init, after every save, and after every delete. Prompts in this set are
// never shown on the Write screen again (until their entry is deleted).
let answeredPrompts = new Set();

// Set of selected entry IDs for collection export
let selectedEntryIds = new Set();

// Active storage backend. Defaults to guest (local); auth.js swaps in a
// cloud store when a user is signed in.
let store = window.LocalStore;

// Control surface used by auth.js to switch backends and re-render.
window.App = {
  setStore(s) { store = s; },
  getStore() { return store; },
  async refresh() {
    await refreshAnswered();
    showRandomPrompt();
    renderStreak();
    return renderNotebook();
  },
  showScreen(name) { return switchView(name); },
};

// --- Word count ---
function countWords(text) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function updateWordCount() {
  const n = countWords(el.answer.value);
  el.wordCount.textContent = n + (n === 1 ? ' word' : ' words');
}

// --- Prompts ---
// Indexes of prompts the user hasn't answered yet — the pool we draw from.
function unansweredIndexes() {
  const out = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    if (!answeredPrompts.has(PROMPTS[i])) out.push(i);
  }
  return out;
}

// Rebuild the answered set from the store. Call whenever entries change.
async function refreshAnswered() {
  try {
    const entries = await store.getEntries();
    answeredPrompts = new Set(entries.map((e) => e.prompt));
  } catch (e) {
    // Non-critical: keep whatever we had rather than wiping the pool.
  }
}

function showRandomPrompt() {
  const pool = unansweredIndexes();

  // No prompts left to answer → switch to the "all done" state.
  if (pool.length === 0) {
    setAllDone(true);
    return;
  }
  setAllDone(false);

  let idx;
  // avoid repeating the same prompt twice in a row (when the pool allows it)
  do {
    idx = pool[Math.floor(Math.random() * pool.length)];
  } while (idx === lastPromptIndex && pool.length > 1);
  lastPromptIndex = idx;
  el.promptText.textContent = PROMPTS[idx];
}

// Toggle the Write screen between the normal writing state and the
// "you've answered everything" state (prompt hidden, inputs disabled).
function setAllDone(done) {
  el.promptText.classList.toggle('hidden', done);
  el.allDone.classList.toggle('hidden', !done);
  el.newPrompt.disabled = done;
  el.saveEntry.disabled = done;
  el.answer.disabled = done;
  if (done) {
    lastPromptIndex = -1;
    el.answer.value = '';
    updateWordCount();
  }
}

// --- Date formatting ---
function formatStamp(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// --- Save an entry ---
async function saveEntry() {
  const answer = el.answer.value.trim();
  const prompt = el.promptText.textContent;

  if (!answer) {
    flash('Write something first!');
    el.answer.focus();
    return;
  }

  setBtnLoading(el.saveEntry, true, 'Saving…');
  try {
    await store.addEntry({
      prompt: prompt,
      answer: answer,
      wordCount: countWords(answer),
    });
  } catch (e) {
    flash("Couldn't save — check your connection and try again.");
    return; // keep the text in the textarea so nothing is lost
  } finally {
    setBtnLoading(el.saveEntry, false);
  }

  el.answer.value = '';
  updateWordCount();

  // The prompt just answered is now off the table. Rebuild the answered set,
  // then auto-advance to the next unanswered prompt (or the all-done state).
  await refreshAnswered();
  showRandomPrompt();

  showSavedModal();
  renderNotebook();
  renderStreak();
}

// --- Saved modal ---
function showSavedModal() {
  el.savedModal.classList.remove('hidden');
  el.savedModalOk.focus();
}

function hideSavedModal() {
  el.savedModal.classList.add('hidden');
}

function flash(message) {
  el.saveMsg.textContent = message;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { el.saveMsg.textContent = ''; }, 2500);
}

// Updates visibility and content of selection controls based on selectedEntryIds
function updateSelectionUI() {
  const count = selectedEntryIds.size;
  const hasSelection = count > 0;

  el.exportAll.classList.toggle('hidden', hasSelection);
  el.selectionControls.classList.toggle('hidden', !hasSelection);

  if (hasSelection) {
    el.selectionCount.textContent =
      count + (count === 1 ? ' entry selected' : ' entries selected');
  }

  // Update selected class on entry cards
  document.querySelectorAll('.entry').forEach((entryEl) => {
    const checkbox = entryEl.querySelector('.entry-checkbox');
    if (checkbox) {
      const isSelected = selectedEntryIds.has(checkbox.dataset.entryId);
      entryEl.classList.toggle('selected', isSelected);
      checkbox.checked = isSelected;
    }
  });
}

function clearSelection() {
  selectedEntryIds.clear();
  updateSelectionUI();
}

async function getSelectedEntries() {
  const allEntries = await store.getEntries();
  return allEntries.filter((e) => selectedEntryIds.has(e.id));
}

// Shared button feedback: shows a spinner + label while an async action runs
// and disables the button so it can't be double-fired. Restores the original
// label when done. Used here and by auth.js.
function setBtnLoading(btn, loading, loadingText) {
  if (loading) {
    if (btn.dataset.label === undefined) btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML =
      '<span class="spinner" aria-hidden="true"></span>' + loadingText;
  } else {
    btn.disabled = false;
    btn.classList.remove('is-loading');
    if (btn.dataset.label !== undefined) {
      btn.textContent = btn.dataset.label;
      delete btn.dataset.label;
    }
  }
}
window.setBtnLoading = setBtnLoading;
window.flash = flash;

// --- Notebook rendering ---
async function renderNotebook() {
  let entries;
  try {
    entries = (await store.getEntries()).slice().reverse(); // newest first
  } catch (e) {
    flash("Couldn't load your notebook — check your connection.");
    return;
  }
  el.entries.innerHTML = '';

  el.entryTotal.textContent =
    entries.length + (entries.length === 1 ? ' entry' : ' entries');

  if (entries.length === 0) {
    el.emptyNote.classList.remove('hidden');
    return;
  }
  el.emptyNote.classList.add('hidden');

  for (const entry of entries) {
    el.entries.appendChild(buildEntryEl(entry));
  }

  // Update selection UI to reflect current state
  updateSelectionUI();
}

function buildEntryEl(entry) {
  const wrap = document.createElement('article');
  wrap.className = 'entry';

  // Checkbox for selection
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'entry-checkbox';
  checkbox.dataset.entryId = entry.id;
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      selectedEntryIds.add(entry.id);
    } else {
      selectedEntryIds.delete(entry.id);
    }
    updateSelectionUI();
  });

  const checkboxCustom = document.createElement('span');
  checkboxCustom.className = 'entry-checkbox-custom';

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  const when = document.createElement('span');
  when.textContent = formatStamp(entry.timestamp);
  const words = document.createElement('span');
  words.textContent = entry.wordCount +
    (entry.wordCount === 1 ? ' word' : ' words');
  meta.append(when, words);

  const prompt = document.createElement('p');
  prompt.className = 'entry-prompt';
  prompt.textContent = entry.prompt;

  const answer = document.createElement('p');
  answer.className = 'entry-answer';
  answer.textContent = entry.answer;

  const del = document.createElement('button');
  del.className = 'entry-delete';
  del.type = 'button';
  del.textContent = 'Delete';
  del.addEventListener('click', () => deleteEntry(entry.id));

  wrap.append(checkbox, checkboxCustom, meta, prompt, answer, del);
  return wrap;
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  try {
    await store.deleteEntry(id);
  } catch (e) {
    flash("Couldn't delete — check your connection and try again.");
    return;
  }

  // Remove from selection if it was selected
  selectedEntryIds.delete(id);

  // That prompt is available again. If the Write screen was showing the
  // all-done state, bring a fresh prompt back; otherwise leave the current
  // prompt untouched so we don't interrupt any in-progress writing.
  await refreshAnswered();
  if (!el.allDone.classList.contains('hidden')) showRandomPrompt();
  renderNotebook();
  renderStreak();

  // Update selection UI to reflect new state
  updateSelectionUI();
}

// --- Export ---
async function exportAll() {
  let entries;
  try {
    entries = await store.getEntries();
  } catch (e) {
    flash("Couldn't export — check your connection.");
    return;
  }
  if (entries.length === 0) {
    flash('Nothing to export yet.');
    switchView('write');
    return;
  }

  const lines = ['PIXEL PAGES — MY NOTEBOOK', '='.repeat(40), ''];
  entries.forEach((entry, i) => {
    lines.push(`Entry ${i + 1} — ${formatStamp(entry.timestamp)}`);
    lines.push(`Prompt: ${entry.prompt}`);
    lines.push(`Words: ${entry.wordCount}`);
    lines.push('');
    lines.push(entry.answer);
    lines.push('');
    lines.push('-'.repeat(40));
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pixel-pages-notebook.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// --- Streak ---
// Thin coordinator: read the store once, compute streak data, and hand it to
// the two streak modules (detailed view + side badge). All streak rendering
// lives in streak-detail.js and streak-badge.js.
async function renderStreak() {
  let entries;
  try {
    entries = await store.getEntries();
  } catch (e) {
    return; // streak is non-critical; leave whatever's shown
  }

  const data = Streak.computeStreakData(entries);
  lastStreakData = data;
  StreakDetail.render(data);
  StreakBadge.render(data);
  updateBadgeVisibility();
}

// The side badge shows on the Write/Notebook screens once there's at least
// one entry — it's hidden on auth screens and on the Streak view itself.
function updateBadgeVisibility() {
  const onMainScreen = currentScreen === 'write' || currentScreen === 'notebook';
  const hasEntries = !!lastStreakData && lastStreakData.totalEntries > 0;
  StreakBadge.setVisible(onMainScreen && hasEntries);
}

// --- View switching ---
// Shows exactly one screen. The auth screens are a full-screen takeover:
// the main nav is hidden while they're up.
const AUTH_SCREENS = ['signin', 'signup', 'reset', 'newpassword'];

function switchView(name) {
  currentScreen = name;
  el.viewWrite.classList.toggle('hidden', name !== 'write');
  el.viewNotebook.classList.toggle('hidden', name !== 'notebook');
  el.viewStreak.classList.toggle('hidden', name !== 'streak');
  el.viewSignin.classList.toggle('hidden', name !== 'signin');
  el.viewSignup.classList.toggle('hidden', name !== 'signup');
  el.viewReset.classList.toggle('hidden', name !== 'reset');
  el.viewNewpassword.classList.toggle('hidden', name !== 'newpassword');

  const isAuth = AUTH_SCREENS.includes(name);
  el.nav.classList.toggle('hidden', isAuth);
  el.navWrite.classList.toggle('active', name === 'write');
  el.navNotebook.classList.toggle('active', name === 'notebook');
  el.navStreak.classList.toggle('active', name === 'streak');

  updateBadgeVisibility();

  if (name === 'notebook') return renderNotebook();
  if (name === 'streak') return renderStreak();
}

// --- Wire up events ---
async function init() {
  StreakDetail.init();
  StreakBadge.init({ onOpen: () => switchView('streak') });

  await refreshAnswered();
  showRandomPrompt();
  updateWordCount();
  await renderNotebook();
  await renderStreak();

  el.newPrompt.addEventListener('click', () => {
    showRandomPrompt();
    el.newPrompt.classList.remove('spin');
    void el.newPrompt.offsetWidth; // restart the icon spin
    el.newPrompt.classList.add('spin');
  });
  el.newPrompt.addEventListener('animationend', () => el.newPrompt.classList.remove('spin'));
  el.answer.addEventListener('input', updateWordCount);
  el.saveEntry.addEventListener('click', saveEntry);

  // Saved modal: dismiss on OK, on overlay click, or Esc.
  el.savedModalOk.addEventListener('click', hideSavedModal);
  el.savedModal.addEventListener('click', (e) => {
    if (e.target === el.savedModal) hideSavedModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.savedModal.classList.contains('hidden')) {
      hideSavedModal();
    }
  });
  el.exportAll.addEventListener('click', exportAll);
  el.navWrite.addEventListener('click', () => switchView('write'));
  el.navNotebook.addEventListener('click', () => switchView('notebook'));
  el.navStreak.addEventListener('click', () => switchView('streak'));

  // Selection controls
  el.clearSelectionBtn.addEventListener('click', clearSelection);
  el.shareSocial.addEventListener('click', async () => {
    const entries = await getSelectedEntries();
    if (entries.length === 0) {
      flash('Select at least one entry to export');
      return;
    }
    await Share.exportCollectionImages(entries);
    clearSelection();
  });
  el.exportPDF.addEventListener('click', async () => {
    const entries = await getSelectedEntries();
    if (entries.length === 0) {
      flash('Select at least one entry to export');
      return;
    }
    await Share.exportCollectionPDF(entries);
    clearSelection();
  });
}

init();
