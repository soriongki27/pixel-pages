/* ===========================================================
   Pixel Pages — app logic
   - Serves random prompts (never the same one twice in a row)
   - Live word count
   - Saves entries to localStorage with a date/time stamp
   - Notebook view: browse, delete, export all
   =========================================================== */

const STORAGE_KEY = 'pixelPagesEntries';

// --- Element references ---
const el = {
  navWrite:    document.getElementById('nav-write'),
  navNotebook: document.getElementById('nav-notebook'),
  viewWrite:   document.getElementById('view-write'),
  viewNotebook:document.getElementById('view-notebook'),

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

// --- Storage helpers ---
function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

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
function saveEntry() {
  const answer = el.answer.value.trim();
  const prompt = el.promptText.textContent;

  if (!answer) {
    flash('Write something first!');
    return;
  }

  const entries = loadEntries();
  entries.push({
    id: Date.now(),
    prompt: prompt,
    answer: answer,
    wordCount: countWords(answer),
    timestamp: new Date().toISOString(),
  });
  saveEntries(entries);

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
function renderNotebook() {
  const entries = loadEntries().slice().reverse(); // newest first
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

function deleteEntry(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  const entries = loadEntries().filter((e) => e.id !== id);
  saveEntries(entries);
  renderNotebook();
}

// --- Export ---
function exportAll() {
  const entries = loadEntries();
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
function switchView(name) {
  const write = name === 'write';
  el.viewWrite.classList.toggle('hidden', !write);
  el.viewNotebook.classList.toggle('hidden', write);
  el.navWrite.classList.toggle('active', write);
  el.navNotebook.classList.toggle('active', !write);
  if (!write) renderNotebook();
}

// --- Wire up events ---
function init() {
  showRandomPrompt();
  updateWordCount();
  renderNotebook();

  el.newPrompt.addEventListener('click', showRandomPrompt);
  el.answer.addEventListener('input', updateWordCount);
  el.saveEntry.addEventListener('click', saveEntry);
  el.exportAll.addEventListener('click', exportAll);
  el.navWrite.addEventListener('click', () => switchView('write'));
  el.navNotebook.addEventListener('click', () => switchView('notebook'));
}

init();
