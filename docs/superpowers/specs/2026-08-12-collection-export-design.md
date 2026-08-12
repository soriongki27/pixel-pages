# Magazine-Style Collection Export Design

**Date:** 2026-08-12  
**Feature:** Visual collection export for notebook entries  
**Goal:** Enable users to create beautiful, shareable magazine-style collections of their writing entries

## Overview

Replace the current plain-text export with a visual collection export system that lets users select specific entries and generate either social-media-ready story images or a multi-page PDF. The export should match Pixel Pages' cozy literary journal aesthetic with a magazine spread layout.

## User Flow

1. User navigates to Notebook view
2. Checkboxes appear on all entry cards (always visible)
3. User selects 1+ entries they want to include in their collection
4. Selection counter appears ("3 entries selected")
5. Two export buttons replace the "Export All" button:
   - "Share to Social" - generates 1080×1920 story images
   - "Export PDF" - generates multi-page PDF document
6. User clicks their preferred export format
7. System generates the collection and downloads files
8. Selection clears after successful export

## Selection Interface

### Notebook View Changes

**Entry cards:**
- Add checkbox in top-left corner of each entry card
- Checkbox styled to match Pixel Pages theme (terracotta accent when checked)
- Selected entries get subtle terracotta border glow (`box-shadow: 0 0 0 2px var(--accent)`)

**Button bar:**
When no entries selected:
- Show existing "Export All" button (preserves plain-text export functionality)

When 1+ entries selected:
- Hide "Export All" button
- Show "Share to Social" button (primary, terracotta accent)
- Show "Export PDF" button (secondary, standard button style)
- Show selection counter: "X entries selected"
- Show "Clear selection" link

### Interaction Details

- Click checkbox to toggle selection
- Selected state persists while user browses (until they export or manually clear)
- Clear selection after successful export for clean state
- Disable export buttons during generation to prevent double-clicks

## Magazine Spread Layout

### Canvas Specifications

- Dimensions: 1080×1920 pixels (9:16 portrait, Instagram story format)
- Format: JPEG at 0.92 quality for story images
- Background: Same as streak share - deep forest (`#1F2A24`) with gradient glows

### Layout Structure

**Header (top ~140px):**
- Logo mark (80×80px, centered)
- "PIXEL PAGES" wordmark (Fraunces serif, 48px, centered)
- Subtle ember glow on logo (consistent with streak share)

**Body (middle ~1640px):**
- Two-column layout: left entry (540px width) and right entry (540px width)
- Each entry in a translucent card: `rgba(50, 68, 58, 0.55)` with tan hairline border
- 32px padding inside each card
- 24px gap between left and right columns

**Footer (bottom ~140px):**
- Story images: Full branding (logo + wordmark + tagline + "pixel-pages.vercel.app")
- PDF: Minimal branding (just "PIXEL PAGES" wordmark)

### Entry Card Design

Each entry card contains:

**Metadata row (top):**
- Format: "Entry #12 • Dec 15, 2025 • 247 words"
- Typography: Inter 500, 22px, tan color (`#C2A878`)
- Spacing: 12px margin-bottom

**Prompt:**
- Typography: Fraunces serif medium, 32-36px, cream color (`#F2EAD3`)
- Spacing: 20px margin-bottom
- May be italic if the actual prompt text uses italic formatting

**Answer:**
- Typography: Fraunces serif regular, 24-28px, cream color (`#F2EAD3`)
- Line height: 1.6 for readability
- Full text of the entry (no truncation)

### Text Handling & Pagination

**Standard case (entries fit):**
- Pair selected entries into groups of 2
- Generate one spread per pair
- Each entry occupies one column

**Odd number of entries:**
- Last spread has 1 entry
- Single entry centered or takes full width (design decision: centered single column, 640px width)

**Long entries:**
1. First attempt: fit text within card height (~1400px available)
2. If doesn't fit: reduce font size incrementally (minimum 20px)
3. If still doesn't fit: split entry across multiple cards
   - First card shows: entry metadata, prompt, beginning of answer, "continued →" indicator
   - Continuation cards show: "← continued" at top, rest of answer text
   - Continuation cards maintain same entry # for consistency

**Very long single entries:**
- Entry that needs more than half the available spread height gets its own full spread
- Takes both columns (single wide card, ~1116px width after margins)

## Export Generation

### Story Images (Share to Social)

**Process:**
1. Pair selected entries into groups of 2
2. For each pair, create a 1080×1920 canvas
3. Render magazine spread layout with full branding footer
4. Convert canvas to JPEG blob (quality: 0.92)
5. Download as `pixel-pages-collection-1.jpg`, `pixel-pages-collection-2.jpg`, etc.

**Branding:**
- Full footer: logo + "PIXEL PAGES" + "a cozy corner for daily reflection" + "pixel-pages.vercel.app"
- Typography matches current streak share implementation

**Loading state:**
- Button shows: "Generating images..." with spinner
- Button disabled during generation
- Success message: "3 images downloaded!" (flash message, 2.5s)

### PDF Export

**Process:**
1. Generate same spreads as story images
2. Use jsPDF library to create PDF document
3. Add each spread as a portrait page (story dimensions)
4. Apply minimal branding footer (just wordmark)
5. Download as `pixel-pages-collection-YYYY-MM-DD.pdf`

**jsPDF integration:**
- Library: jsPDF 2.5.1+ via CDN
- Size: ~100kb
- Load via: `<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>`

**Branding:**
- Minimal footer: just "PIXEL PAGES" wordmark, no URL or tagline
- Cleaner for printing/archiving

**Loading state:**
- Button shows: "Creating PDF..." with spinner
- Button disabled during generation
- Success message: "PDF saved!" (flash message, 2.5s)

## Technical Implementation

### File Changes

**`index.html`:**
- Add jsPDF script tag
- Add checkboxes to entry card markup in #entries template
- Update notebook button container to support two export buttons + counter

**`style.css`:**
- Custom checkbox styles (match Pixel Pages theme)
- Selected entry highlight (terracotta border glow)
- Two-button layout for export controls
- Selection counter badge
- Clear selection link

**`app.js`:**
- Add `selectedEntryIds = new Set()` state
- Add checkbox toggle handlers
- Add selection UI update logic (show/hide buttons, update counter)
- Wire "Share to Social" button → `Share.exportCollectionImages(selectedEntries)`
- Wire "Export PDF" button → `Share.exportCollectionPDF(selectedEntries)`
- Clear selection after successful export

**`share.js` (expand existing file):**
- Keep existing `exportStreakImage()` function
- Add `exportCollectionImages(entries)` - main entry point for story images
- Add `exportCollectionPDF(entries)` - main entry point for PDF
- Add `renderMagazineSpread(ctx, leftEntry, rightEntry, pageNum, totalPages, brandingMode)` - core layout renderer
- Add `renderEntryCard(ctx, entry, x, y, w, h)` - renders one entry within bounds
- Add `wrapText(ctx, text, maxWidth)` - splits text into lines that fit width
- Add `measureTextHeight(ctx, lines, lineHeight)` - calculates total text height
- Add text pagination helper for long entries

### Font Loading

- Wait for `document.fonts.ready` before rendering (like current streak share)
- Fallback fonts: Georgia for Fraunces, system-ui for Inter
- If fonts fail to load, generation still proceeds with fallbacks

### Error Handling

**Empty selection:**
- Export buttons only visible when `selectedEntryIds.size > 0`
- Belt-and-suspenders: if triggered with 0 entries, show error "Select at least one entry to export"

**Canvas failures:**
- Try-catch around canvas creation and rendering
- Error message: "Export failed. Try selecting fewer entries or refresh the page."
- Log error to console for debugging

**Very long entries:**
- Warn in console if single entry requires 5+ spreads (indicates unusually long entry)
- Still generate successfully, just logs warning

**PDF generation failures:**
- Try-catch around jsPDF operations
- Error message: "PDF creation failed. Try the 'Share to Social' option instead."
- Graceful degradation: story images should always work even if PDF fails

**Network/CDN issues:**
- If jsPDF fails to load from CDN, hide "Export PDF" button
- Show warning: "PDF export unavailable. Check your connection."
- Story images still work (no external dependencies)

## Design Principles

**Privacy-first:**
- All generation happens client-side
- No entries sent to servers
- Works completely offline (after initial page load)

**Aesthetic consistency:**
- Match existing Pixel Pages visual identity
- Reuse color palette, typography, and effects from streak share
- Magazine spread feels like an extension of the app, not a separate export

**User control:**
- Let users curate what they share
- Two formats serve different needs (quick social share vs. comprehensive archive)
- Preserve existing plain-text export for those who want it

**Performance:**
- Limit selection to reasonable size (warn if 50+ entries selected)
- Generate spreads sequentially to avoid memory issues
- Use efficient canvas rendering (no unnecessary redraws)

## Success Metrics

Users should be able to:
- Select any combination of entries easily
- Generate beautiful, shareable images in under 3 seconds (for typical 2-6 entry selections)
- Create PDFs of their favorite writing moments
- Share their Pixel Pages journey on social media with pride

The export should feel like a natural extension of the journal - cozy, thoughtful, and personal.
