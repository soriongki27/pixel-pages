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
  viewWrite:   document.getElementById('view-write'),
  viewNotebook:document.getElementById('view-notebook'),
  viewSignin:  document.getElementById('view-signin'),
  viewSignup:  document.getElementById('view-signup'),

  promptText:  document.getElementById('prompt-text'),
  newPrompt:   document.getElementById('new-prompt'),
  answer:      document.getElementById('answer'),
  wordCount:   document.getElementById('word-count'),
  saveEntry:   document.getElementById('save-entry'),
  saveMsg:     document.getElementById('save-msg'),

  entries:     document.getElementById('entries'),
  emptyNote:   document.getElementById('empty-note'),
  exportAll:   document.getElementById('export-all'),
  entryTotal:  document.getElementById('entry-total'),
};

let lastPromptIndex = -1;

// Active storage backend. Defaults to guest (local); auth.js swaps in a
// cloud store when a user is signed in.
let store = window.LocalStore;

// Control surface used by auth.js to switch backends and re-render.
window.App = {
  setStore(s) { store = s; },
  getStore() { return store; },
  refresh() { return renderNotebook(); },
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
function showRandomPrompt() {
  if (PROMPTS.length === 0) return;
  let idx;
  // avoid repeating the same prompt twice in a row
  do {
    idx = Math.floor(Math.random() * PROMPTS.length);
  } while (idx === lastPromptIndex && PROMPTS.length > 1);
  lastPromptIndex = idx;
  el.promptText.textContent = PROMPTS[idx];
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

function flash(message) {
  el.saveMsg.textContent = message;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { el.saveMsg.textContent = ''; }, 2500);
}

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
}

function buildEntryEl(entry) {
  const wrap = document.createElement('article');
  wrap.className = 'entry';

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

  wrap.append(meta, prompt, answer, del);
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
  renderNotebook();
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

// --- View switching ---
// Shows exactly one screen. The two auth screens are a full-screen takeover:
// the Write/Notebook nav is hidden while they're up.
function switchView(name) {
  el.viewWrite.classList.toggle('hidden', name !== 'write');
  el.viewNotebook.classList.toggle('hidden', name !== 'notebook');
  el.viewSignin.classList.toggle('hidden', name !== 'signin');
  el.viewSignup.classList.toggle('hidden', name !== 'signup');

  const isAuth = name === 'signin' || name === 'signup';
  el.nav.classList.toggle('hidden', isAuth);
  el.navWrite.classList.toggle('active', name === 'write');
  el.navNotebook.classList.toggle('active', name === 'notebook');

  if (name === 'notebook') return renderNotebook();
}

// --- Wire up events ---
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
