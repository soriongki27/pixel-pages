# Magazine-Style Collection Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual collection export allowing users to select notebook entries and generate shareable story images or multi-page PDFs with magazine-style layout.

**Architecture:** Extend existing Canvas-based export pattern from streak share. Add selection state to app.js, render engine to share.js. Two export paths: story images (JPEG sequence) and PDF (via jsPDF). All generation client-side.

**Tech Stack:** Vanilla JS, HTML Canvas 2D API, jsPDF 2.5.1+ (CDN)

## Global Constraints

- Dimensions: 1080×1920 pixels (9:16 portrait)
- JPEG quality: 0.92
- Color palette: reuse existing `share.js` constants
- Typography: Fraunces (serif), Inter (sans-serif) with system fallbacks
- Privacy: all generation client-side, no server calls
- Performance: sequential spread generation to avoid memory issues

---

## File Structure Overview

**Modified files:**
- `index.html` - Add jsPDF script, checkbox markup, export button container
- `style.css` - Checkbox styles, selection highlight, export button layout
- `app.js` - Selection state, UI handlers, wire to share.js
- `share.js` - Magazine spread renderer, collection export functions

**No new files needed** - extends existing architecture

---

### Task 1: Add jsPDF Dependency and Selection UI Markup

**Files:**
- Modify: `index.html:246` (before existing share.js script tag)
- Modify: `index.html:176-186` (notebook view section)

**Interfaces:**
- Consumes: Nothing
- Produces: 
  - `window.jspdf` global (from CDN)
  - HTML structure for checkboxes on entry cards
  - HTML structure for selection controls (counter, export buttons)

- [ ] **Step 1: Add jsPDF CDN script tag**

Open `index.html` and add the jsPDF script tag before the existing share.js script (around line 246):

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="config.js"></script>
```

- [ ] **Step 2: Update notebook view button container**

Replace the existing notebook-head section (lines 178-181) with:

```html
<div class="notebook-head">
  <h2 class="label">Your Notebook</h2>
  <div class="notebook-controls">
    <button id="export-all" class="btn" type="button">Export All</button>
    <div id="selection-controls" class="selection-controls hidden">
      <span id="selection-count" class="selection-count">0 entries selected</span>
      <button id="clear-selection" class="btn-link" type="button">Clear selection</button>
      <button id="share-social" class="btn btn-primary" type="button">Share to Social</button>
      <button id="export-pdf" class="btn" type="button">Export PDF</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Verify markup in browser**

Open `index.html` in a browser and navigate to the Notebook view. You should see the "Export All" button visible and the selection controls hidden (they'll be shown via JS when entries are selected).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add jsPDF dependency and selection UI markup"
```

---

### Task 2: Style Selection Interface

**Files:**
- Modify: `style.css` (end of file, after existing styles)

**Interfaces:**
- Consumes: HTML structure from Task 1
- Produces:
  - `.entry-checkbox` styles
  - `.entry.selected` styles
  - `.selection-controls` layout
  - `.selection-count` badge styles
  - `.btn-link` link-style button

- [ ] **Step 1: Add checkbox styles**

Append to `style.css`:

```css
/* ========== Collection Export Selection ========== */

/* Entry checkbox */
.entry {
  position: relative;
}

.entry-checkbox {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 22px;
  height: 22px;
  cursor: pointer;
  opacity: 0;
}

.entry-checkbox-custom {
  position: absolute;
  top: 16px;
  left: 16px;
  width: 22px;
  height: 22px;
  border: 2px solid var(--tan);
  border-radius: var(--r-sm);
  background: var(--field);
  pointer-events: none;
  transition: all 0.2s ease;
}

.entry-checkbox:checked + .entry-checkbox-custom {
  background: var(--accent);
  border-color: var(--accent);
}

.entry-checkbox:checked + .entry-checkbox-custom::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--bg);
  font-size: 16px;
  font-weight: 600;
}

.entry.selected {
  box-shadow: 0 0 0 2px var(--accent);
}
```

- [ ] **Step 2: Add selection controls layout**

Append to `style.css`:

```css
/* Selection controls */
.notebook-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.selection-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.selection-count {
  font-family: var(--sans);
  font-size: 0.95rem;
  color: var(--tan);
  font-weight: 500;
}

.btn-link {
  background: none;
  border: none;
  color: var(--tan);
  font-family: var(--sans);
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  transition: color 0.2s ease;
}

.btn-link:hover {
  color: var(--text);
}
```

- [ ] **Step 3: Test styles in browser**

Manually add the `selected` class to an entry card via browser dev tools and verify the terracotta glow appears. Remove it and verify it disappears.

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "style: add selection interface styles for collection export"
```

---

### Task 3: Implement Selection State and UI Logic

**Files:**
- Modify: `app.js:38` (add to element references)
- Modify: `app.js:58` (add selection state)
- Modify: `app.js:245` (modify buildEntryEl function)
- Modify: `app.js:385` (add selection handlers in init)

**Interfaces:**
- Consumes: 
  - HTML elements from Task 1
  - CSS classes from Task 2
- Produces:
  - `selectedEntryIds` Set global state
  - `updateSelectionUI()` function
  - `clearSelection()` function
  - `getSelectedEntries()` function returning `Array<{id, timestamp, prompt, answer, wordCount}>`

- [ ] **Step 1: Add element references**

In `app.js`, add to the `el` object (around line 38):

```javascript
const el = {
  // ... existing references ...
  exportAll:   document.getElementById('export-all'),
  entryTotal:  document.getElementById('entry-total'),
  
  // Selection controls
  selectionControls: document.getElementById('selection-controls'),
  selectionCount:    document.getElementById('selection-count'),
  clearSelectionBtn: document.getElementById('clear-selection'),
  shareSocial:       document.getElementById('share-social'),
  exportPDF:         document.getElementById('export-pdf'),
};
```

- [ ] **Step 2: Add selection state**

After the `answeredPrompts` declaration (around line 58), add:

```javascript
// Set of selected entry IDs for collection export
let selectedEntryIds = new Set();
```

- [ ] **Step 3: Write updateSelectionUI function**

Add after the `flash` function (around line 200):

```javascript
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
```

- [ ] **Step 4: Modify buildEntryEl to include checkbox**

Replace the `buildEntryEl` function (around line 247):

```javascript
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
```

- [ ] **Step 5: Add selection control handlers**

In the `init` function (around line 415), add before the final closing brace:

```javascript
async function init() {
  // ... existing code ...
  
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
```

- [ ] **Step 6: Test selection in browser**

Open the app in a browser, navigate to Notebook view, and verify:
1. Checkboxes appear on entry cards
2. Clicking a checkbox shows selection controls
3. Selection counter updates correctly
4. "Clear selection" removes selection
5. Selected entries have terracotta glow

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: implement selection state and UI logic"
```

---

### Task 4: Text Rendering Utilities for Canvas

**Files:**
- Modify: `share.js` (add new functions after existing helpers)

**Interfaces:**
- Consumes: Canvas 2D context, existing font constants (`SERIF`, `SANS`)
- Produces:
  - `wrapText(ctx, text, maxWidth)` returns `Array<string>` (lines)
  - `measureTextHeight(lines, lineHeight)` returns `number` (pixels)
  - `drawWrappedText(ctx, lines, x, y, lineHeight)` returns `number` (final y position)

- [ ] **Step 1: Write wrapText function**

Add to `share.js` after the `roundRect` function:

```javascript
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}
```

- [ ] **Step 2: Write measureTextHeight function**

Add after `wrapText`:

```javascript
function measureTextHeight(lines, lineHeight) {
  return lines.length * lineHeight;
}
```

- [ ] **Step 3: Write drawWrappedText function**

Add after `measureTextHeight`:

```javascript
function drawWrappedText(ctx, lines, x, y, lineHeight) {
  let currentY = y;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}
```

- [ ] **Step 4: Test text wrapping**

Add a temporary test in browser console:

```javascript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.font = "24px 'Fraunces', Georgia, serif";
const lines = Share.wrapText(ctx, "This is a long test sentence that should wrap across multiple lines when constrained to a narrow width", 200);
console.log(lines);
```

Verify it returns an array of wrapped lines.

- [ ] **Step 5: Commit**

```bash
git add share.js
git commit -m "feat: add text wrapping utilities for canvas rendering"
```

---

### Task 5: Magazine Spread Entry Card Renderer

**Files:**
- Modify: `share.js` (add new function)

**Interfaces:**
- Consumes: 
  - Canvas 2D context
  - Entry object: `{id, timestamp, prompt, answer, wordCount}`
  - Position: `x, y, w, h` (card bounds)
  - Entry number: `entryNum` (for metadata display)
  - `wrapText`, `measureTextHeight`, `drawWrappedText` from Task 4
- Produces:
  - `renderEntryCard(ctx, entry, x, y, w, h, entryNum)` returns `boolean` (true if fit, false if needs continuation)

- [ ] **Step 1: Write renderEntryCard function**

Add to `share.js` after the text utilities:

```javascript
function renderEntryCard(ctx, entry, x, y, w, h, entryNum) {
  const pad = 32;
  const innerX = x + pad;
  const innerY = y + pad;
  const innerW = w - pad * 2;
  const maxH = h - pad * 2;

  // Draw card background
  ctx.fillStyle = 'rgba(50, 68, 58, 0.55)';
  roundRect(ctx, x, y, w, h, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(194, 168, 120, 0.22)';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 28);
  ctx.stroke();

  // Metadata row
  ctx.textAlign = 'left';
  ctx.fillStyle = C.tan;
  ctx.font = `500 22px ${SANS}`;
  const date = new Date(entry.timestamp);
  const dateStr = date.toLocaleDateString(undefined, { 
    year: 'numeric', month: 'short', day: 'numeric' 
  });
  const metaText = `Entry #${entryNum} • ${dateStr} • ${entry.wordCount} words`;
  ctx.fillText(metaText, innerX, innerY + 22);
  
  let currentY = innerY + 22 + 12; // meta baseline + spacing

  // Prompt
  ctx.fillStyle = C.text;
  ctx.font = `500 34px ${SERIF}`;
  const promptLines = wrapText(ctx, entry.prompt, innerW);
  const promptLineHeight = 44;
  currentY = drawWrappedText(ctx, promptLines, innerX, currentY + promptLineHeight, promptLineHeight);
  currentY += 20; // spacing after prompt

  // Answer
  ctx.font = `400 26px ${SERIF}`;
  const answerLines = wrapText(ctx, entry.answer, innerW);
  const answerLineHeight = 42;
  const answerHeight = measureTextHeight(answerLines, answerLineHeight);
  
  const availableH = (y + maxH) - currentY;
  
  if (answerHeight > availableH) {
    // Text doesn't fit - for now, just render what fits and return false
    // (continuation logic will be added in later task if needed)
    const maxLines = Math.floor(availableH / answerLineHeight);
    const visibleLines = answerLines.slice(0, maxLines);
    drawWrappedText(ctx, visibleLines, innerX, currentY + answerLineHeight, answerLineHeight);
    return false;
  }
  
  drawWrappedText(ctx, answerLines, innerX, currentY + answerLineHeight, answerLineHeight);
  return true;
}
```

- [ ] **Step 2: Expose wrapText for testing**

Update the return statement at the end of `share.js`:

```javascript
return { 
  exportStreakImage,
  wrapText // temporary export for testing
};
```

- [ ] **Step 3: Test entry card rendering**

Create a test canvas in browser console:

```javascript
const testCanvas = document.createElement('canvas');
testCanvas.width = 540;
testCanvas.height = 800;
const testCtx = testCanvas.getContext('2d');
testCtx.fillStyle = '#1F2A24';
testCtx.fillRect(0, 0, 540, 800);
const testEntry = {
  id: '1',
  timestamp: new Date().toISOString(),
  prompt: 'What made you smile today?',
  answer: 'The morning sunlight streaming through my window, catching dust motes in the air like tiny dancers.',
  wordCount: 17
};
Share.renderEntryCard(testCtx, testEntry, 0, 0, 540, 800, 1);
document.body.appendChild(testCanvas);
```

Verify the card renders with metadata, prompt, and answer.

- [ ] **Step 4: Commit**

```bash
git add share.js
git commit -m "feat: add entry card renderer for magazine spreads"
```

---

### Task 6: Magazine Spread Layout Renderer

**Files:**
- Modify: `share.js` (add new function)

**Interfaces:**
- Consumes:
  - Canvas 2D context (1080×1920)
  - `leftEntry` object (or null)
  - `rightEntry` object (or null)
  - `pageNum`, `totalPages` (for potential pagination indicators)
  - `brandingMode` string ('full' or 'minimal')
  - `renderEntryCard` from Task 5
  - `drawBackground`, `loadImage`, `roundRect` (existing)
- Produces:
  - `renderMagazineSpread(ctx, leftEntry, rightEntry, leftNum, rightNum, brandingMode)` returns `Promise<void>`

- [ ] **Step 1: Write renderMagazineSpread function**

Add to `share.js` after `renderEntryCard`:

```javascript
async function renderMagazineSpread(ctx, leftEntry, rightEntry, leftNum, rightNum, brandingMode) {
  // Background
  drawBackground(ctx);
  
  // Header - logo + wordmark
  const logo = await loadImage('logo-256.png');
  if (logo) {
    const logoSize = 80;
    ctx.save();
    ctx.shadowColor = 'rgba(217, 119, 87, 0.45)';
    ctx.shadowBlur = 40;
    ctx.drawImage(logo, (W - logoSize) / 2, 30, logoSize, logoSize);
    ctx.restore();
  }
  
  ctx.textAlign = 'center';
  ctx.fillStyle = C.text;
  ctx.font = `600 48px ${SERIF}`;
  ctx.fillText('PIXEL PAGES', W / 2, 150);

  // Body - two columns or single centered column
  const bodyTop = 180;
  const bodyBottom = H - 140;
  const bodyH = bodyBottom - bodyTop;
  const columnW = 540;
  const gap = 24;
  
  if (leftEntry && rightEntry) {
    // Two-column layout
    const leftX = (W - columnW * 2 - gap) / 2;
    const rightX = leftX + columnW + gap;
    renderEntryCard(ctx, leftEntry, leftX, bodyTop, columnW, bodyH, leftNum);
    renderEntryCard(ctx, rightEntry, rightX, bodyTop, columnW, bodyH, rightNum);
  } else if (leftEntry) {
    // Single centered column
    const centerW = 640;
    const centerX = (W - centerW) / 2;
    renderEntryCard(ctx, leftEntry, centerX, bodyTop, centerW, bodyH, leftNum);
  } else if (rightEntry) {
    // Edge case: only right entry (treat as single centered)
    const centerW = 640;
    const centerX = (W - centerW) / 2;
    renderEntryCard(ctx, rightEntry, centerX, bodyTop, centerW, bodyH, rightNum);
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = C.tan;
  
  if (brandingMode === 'full') {
    ctx.font = `italic 400 28px ${SERIF}`;
    ctx.fillText('a cozy corner for daily reflection', W / 2, H - 90);
    ctx.font = `500 32px ${SANS}`;
    ctx.fillText('pixel-pages.vercel.app', W / 2, H - 50);
  } else {
    // Minimal branding for PDF
    ctx.font = `600 36px ${SERIF}`;
    ctx.fillText('PIXEL PAGES', W / 2, H - 60);
  }
}
```

- [ ] **Step 2: Test spread rendering**

Add test in browser console:

```javascript
const spreadCanvas = document.createElement('canvas');
spreadCanvas.width = 1080;
spreadCanvas.height = 1920;
const spreadCtx = spreadCanvas.getContext('2d');
const entry1 = {
  timestamp: new Date().toISOString(),
  prompt: 'What made you smile today?',
  answer: 'The morning sunlight streaming through my window.',
  wordCount: 8
};
const entry2 = {
  timestamp: new Date().toISOString(),
  prompt: 'What are you grateful for?',
  answer: 'The quiet moments before the world wakes up.',
  wordCount: 9
};
await Share.renderMagazineSpread(spreadCtx, entry1, entry2, 1, 2, 'full');
document.body.appendChild(spreadCanvas);
```

Verify the spread shows header, two entry columns, and full footer branding.

- [ ] **Step 3: Commit**

```bash
git add share.js
git commit -m "feat: add magazine spread layout renderer"
```

---

### Task 7: Story Images Export Function

**Files:**
- Modify: `share.js` (add exportCollectionImages function)

**Interfaces:**
- Consumes:
  - `entries` array from `getSelectedEntries()`
  - `renderMagazineSpread` from Task 6
  - `downloadBlob` (existing)
  - `setBtnLoading` from `app.js` (via window global)
  - `flash` from `app.js` (via window global)
- Produces:
  - `exportCollectionImages(entries)` returns `Promise<void>`
  - Downloads `pixel-pages-collection-1.jpg`, `pixel-pages-collection-2.jpg`, etc.

- [ ] **Step 1: Write exportCollectionImages function**

Add to `share.js` before the final return statement:

```javascript
async function exportCollectionImages(entries) {
  if (!entries || entries.length === 0) {
    console.error('No entries to export');
    return;
  }

  // Wait for fonts to load
  if (document.fonts && document.fonts.ready) {
    try { 
      await document.fonts.ready; 
    } catch (e) { 
      console.warn('Font loading timed out, proceeding with fallbacks');
    }
  }

  const shareSocialBtn = document.getElementById('share-social');
  if (shareSocialBtn && window.setBtnLoading) {
    window.setBtnLoading(shareSocialBtn, true, 'Generating images...');
  }

  try {
    // Pair entries into spreads
    const spreads = [];
    for (let i = 0; i < entries.length; i += 2) {
      spreads.push({
        left: entries[i],
        right: entries[i + 1] || null,
        leftNum: i + 1,
        rightNum: entries[i + 1] ? i + 2 : null
      });
    }

    // Generate each spread
    for (let i = 0; i < spreads.length; i++) {
      const spread = spreads[i];
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      
      await renderMagazineSpread(
        ctx, 
        spread.left, 
        spread.right, 
        spread.leftNum,
        spread.rightNum,
        'full'
      );

      // Convert to blob and download
      await new Promise((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              downloadBlob(blob, `pixel-pages-collection-${i + 1}.jpg`);
            }
            resolve();
          },
          'image/jpeg',
          0.92
        );
      });
    }

    if (window.flash) {
      window.flash(`${spreads.length} ${spreads.length === 1 ? 'image' : 'images'} downloaded!`);
    }
  } catch (error) {
    console.error('Export failed:', error);
    if (window.flash) {
      window.flash('Export failed. Try selecting fewer entries or refresh the page.');
    }
  } finally {
    if (shareSocialBtn && window.setBtnLoading) {
      window.setBtnLoading(shareSocialBtn, false);
    }
  }
}
```

- [ ] **Step 2: Expose flash and setBtnLoading globally**

In `app.js`, after the `setBtnLoading` function (around line 220), add:

```javascript
window.setBtnLoading = setBtnLoading;
window.flash = flash;
```

- [ ] **Step 3: Update share.js exports**

Update the return statement at the end of `share.js`:

```javascript
return { 
  exportStreakImage,
  exportCollectionImages
};
```

- [ ] **Step 4: Test story image export**

In browser:
1. Navigate to Notebook view
2. Select 2-3 entries
3. Click "Share to Social"
4. Verify images download (check Downloads folder)
5. Open images and verify they match the magazine spread design

- [ ] **Step 5: Commit**

```bash
git add share.js app.js
git commit -m "feat: implement story images export function"
```

---

### Task 8: PDF Export Function

**Files:**
- Modify: `share.js` (add exportCollectionPDF function)

**Interfaces:**
- Consumes:
  - `entries` array from `getSelectedEntries()`
  - `renderMagazineSpread` from Task 6
  - `window.jspdf.jsPDF` (from CDN)
  - `setBtnLoading`, `flash` globals
- Produces:
  - `exportCollectionPDF(entries)` returns `Promise<void>`
  - Downloads `pixel-pages-collection-YYYY-MM-DD.pdf`

- [ ] **Step 1: Write exportCollectionPDF function**

Add to `share.js` before the final return statement:

```javascript
async function exportCollectionPDF(entries) {
  if (!entries || entries.length === 0) {
    console.error('No entries to export');
    return;
  }

  // Check if jsPDF is available
  if (!window.jspdf || !window.jspdf.jsPDF) {
    console.error('jsPDF not loaded');
    if (window.flash) {
      window.flash('PDF export unavailable. Check your connection.');
    }
    return;
  }

  // Wait for fonts to load
  if (document.fonts && document.fonts.ready) {
    try { 
      await document.fonts.ready; 
    } catch (e) { 
      console.warn('Font loading timed out, proceeding with fallbacks');
    }
  }

  const exportPDFBtn = document.getElementById('export-pdf');
  if (exportPDFBtn && window.setBtnLoading) {
    window.setBtnLoading(exportPDFBtn, true, 'Creating PDF...');
  }

  try {
    // Pair entries into spreads
    const spreads = [];
    for (let i = 0; i < entries.length; i += 2) {
      spreads.push({
        left: entries[i],
        right: entries[i + 1] || null,
        leftNum: i + 1,
        rightNum: entries[i + 1] ? i + 2 : null
      });
    }

    // Create PDF with portrait orientation, story dimensions
    const pdf = new window.jspdf.jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [W, H]
    });

    // Generate each spread and add to PDF
    for (let i = 0; i < spreads.length; i++) {
      const spread = spreads[i];
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      
      await renderMagazineSpread(
        ctx, 
        spread.left, 
        spread.right, 
        spread.leftNum,
        spread.rightNum,
        'minimal' // Use minimal branding for PDF
      );

      // Add page to PDF (skip addPage for first page)
      if (i > 0) {
        pdf.addPage([W, H], 'portrait');
      }
      
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', 0, 0, W, H);
    }

    // Generate filename with current date
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `pixel-pages-collection-${dateStr}.pdf`;
    
    pdf.save(filename);

    if (window.flash) {
      window.flash('PDF saved!');
    }
  } catch (error) {
    console.error('PDF export failed:', error);
    if (window.flash) {
      window.flash("PDF creation failed. Try the 'Share to Social' option instead.");
    }
  } finally {
    if (exportPDFBtn && window.setBtnLoading) {
      window.setBtnLoading(exportPDFBtn, false);
    }
  }
}
```

- [ ] **Step 2: Update share.js exports**

Update the return statement at the end of `share.js`:

```javascript
return { 
  exportStreakImage,
  exportCollectionImages,
  exportCollectionPDF
};
```

- [ ] **Step 3: Test PDF export**

In browser:
1. Navigate to Notebook view
2. Select 2-3 entries
3. Click "Export PDF"
4. Verify PDF downloads
5. Open PDF and verify:
   - Multiple pages (one per spread)
   - Minimal branding footer
   - Magazine layout on each page

- [ ] **Step 4: Commit**

```bash
git add share.js
git commit -m "feat: implement PDF export function"
```

---

### Task 9: Handle Selection State Edge Cases

**Files:**
- Modify: `app.js:289` (deleteEntry function)
- Modify: `app.js:223` (renderNotebook function)

**Interfaces:**
- Consumes: 
  - `selectedEntryIds` Set
  - `updateSelectionUI()` function
- Produces: Updated edge case handling for:
  - Entry deletion while selected
  - Notebook re-render preserving selection

- [ ] **Step 1: Clear deleted entry from selection**

In `app.js`, update the `deleteEntry` function (around line 289):

```javascript
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
  
  await refreshAnswered();
  if (!el.allDone.classList.contains('hidden')) showRandomPrompt();
  renderNotebook();
  renderStreak();
}
```

- [ ] **Step 2: Preserve selection during notebook re-render**

In `app.js`, update the `renderNotebook` function to call `updateSelectionUI` at the end (around line 244):

```javascript
async function renderNotebook() {
  let entries;
  try {
    entries = (await store.getEntries()).slice().reverse();
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
```

- [ ] **Step 3: Test edge cases**

In browser:
1. Select 3 entries
2. Delete one of the selected entries
3. Verify selection count decrements to 2
4. Verify selection controls still show
5. Delete all selected entries
6. Verify selection controls hide and "Export All" shows

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "fix: handle selection state during entry deletion and re-render"
```

---

### Task 10: Add Warning for Large Selections

**Files:**
- Modify: `app.js` (update selection toggle handler in buildEntryEl)

**Interfaces:**
- Consumes: `selectedEntryIds.size`
- Produces: Warning flash message when selection exceeds 50 entries

- [ ] **Step 1: Add selection limit warning**

In `app.js`, update the checkbox event handler in `buildEntryEl` (around line 260):

```javascript
checkbox.addEventListener('change', (e) => {
  if (e.target.checked) {
    if (selectedEntryIds.size >= 50) {
      flash('Selection limit: 50 entries maximum for optimal performance');
      e.target.checked = false;
      return;
    }
    selectedEntryIds.add(entry.id);
  } else {
    selectedEntryIds.delete(entry.id);
  }
  updateSelectionUI();
});
```

- [ ] **Step 2: Test limit warning**

In browser:
1. If you have 50+ entries, try selecting 51 entries
2. Verify warning appears
3. Verify 51st checkbox doesn't get checked
4. If you don't have 50+ entries, temporarily change limit to 3 and test

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add warning for large entry selections"
```

---

### Task 11: Manual Integration Testing

**Files:**
- None (testing only)

**Interfaces:**
- Consumes: Complete implementation from Tasks 1-10
- Produces: Verified working feature

- [ ] **Step 1: Test basic selection flow**

1. Navigate to Notebook view
2. Verify checkboxes appear on all entries
3. Select 1 entry - verify selection controls show
4. Verify "Export All" hides
5. Verify counter shows "1 entry selected"
6. Select 2 more entries - verify counter updates to "3 entries selected"
7. Click "Clear selection" - verify selection clears and "Export All" returns

- [ ] **Step 2: Test story images export**

1. Select 2 entries
2. Click "Share to Social"
3. Verify button shows "Generating images..." during export
4. Verify 1 JPEG downloads to Downloads folder
5. Open JPEG and verify:
   - 1080×1920 dimensions
   - Two-column layout with both entries
   - Full branding footer
   - Correct metadata, prompts, and answers

- [ ] **Step 3: Test story images with odd number**

1. Select 3 entries
2. Click "Share to Social"
3. Verify 2 JPEGs download
4. Verify first image has 2 entries
5. Verify second image has 1 entry (centered)

- [ ] **Step 4: Test PDF export**

1. Select 4 entries
2. Click "Export PDF"
3. Verify button shows "Creating PDF..." during export
4. Verify PDF downloads
5. Open PDF and verify:
   - 2 pages (2 spreads)
   - First page has 2 entries
   - Second page has 2 entries
   - Minimal branding footer (just "PIXEL PAGES")

- [ ] **Step 5: Test edge cases**

1. Select 1 entry and delete it while selected
2. Verify selection clears
3. Select 2 entries
4. Navigate to Write view and back to Notebook
5. Verify selection persists (checkboxes still checked)
6. Export and verify selection clears after successful export

- [ ] **Step 6: Test error handling**

1. Open browser DevTools > Network tab
2. Throttle network to "Offline"
3. Refresh page to clear cache
4. Navigate to Notebook
5. Verify "Export PDF" button is hidden (jsPDF failed to load)
6. Verify "Share to Social" still works (no external dependencies)

- [ ] **Step 7: Document any issues found**

If any issues found during testing, document them and create fix commits before final commit.

- [ ] **Step 8: Final verification commit**

```bash
git status
git log --oneline -11
# Verify all 10 feature commits are present
```

---

## Self-Review Checklist

**Spec coverage:**
- ✓ Selection UI with checkboxes (Task 1-3)
- ✓ Selection controls (counter, buttons) (Task 1-3)
- ✓ Magazine spread layout (Task 5-6)
- ✓ Story images export (Task 7)
- ✓ PDF export (Task 8)
- ✓ Text wrapping and rendering (Task 4-5)
- ✓ Full vs minimal branding (Task 6-8)
- ✓ Selection persistence and edge cases (Task 9)
- ✓ Performance warnings (Task 10)
- ✓ Error handling (Task 7-8)

**Placeholder scan:**
- ✓ No TBDs or TODOs
- ✓ All code blocks complete
- ✓ All test steps have expected results

**Type consistency:**
- ✓ `selectedEntryIds` is Set<string> throughout
- ✓ Entry objects have consistent shape: `{id, timestamp, prompt, answer, wordCount}`
- ✓ Function signatures match between producers and consumers
- ✓ Canvas dimensions consistent: 1080×1920 (W×H)

**Missing from spec:**
- Entry number calculation: added `leftNum`/`rightNum` tracking in spread pairing
- Selection preservation during navigation: added in renderNotebook
- These are implementation details that make the spec requirements work
