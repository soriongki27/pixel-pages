/* ===========================================================
   Pixel Pages — story image export
   Renders a 9:16 (1080×1920) shareable card on a <canvas> and
   downloads it as JPEG. No external libraries: native Canvas 2D
   avoids web-font / gradient screenshot glitches and gives an
   exact story-sized image.
   =========================================================== */

window.Share = (function () {
  const W = 1080;
  const H = 1920;

  const SERIF = "'Fraunces', Georgia, 'Times New Roman', serif";
  const SANS = "'Inter', system-ui, -apple-system, sans-serif";

  // Palette (mirrors style.css :root)
  const C = {
    bg:      '#1F2A24',
    surface: '#32443A',
    field:   '#2A3830',
    primary: '#5B8C5A',
    tan:     '#C2A878',
    accent:  '#D97757',
    text:    '#F2EAD3',
    sage:    '#A9D18E',
  };

  // Written-day level -> fill (matches the on-screen calendar)
  const LEVEL = {
    1: C.primary, // any entry that day: clearly green
    2: C.sage,
    3: C.accent,
  };

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Wraps text to maxWidth, preserving the author's paragraph structure.
  // Newlines are hard breaks: each paragraph is wrapped independently and a
  // blank source line becomes a blank output line, so multi-paragraph entries
  // read the same on the card as they do in the notebook.
  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = String(text == null ? '' : text).split(/\r?\n/);

    for (const paragraph of paragraphs) {
      const words = paragraph.split(/[ \t]+/).filter(Boolean);

      // Blank source line → blank output line (paragraph spacing)
      if (words.length === 0) {
        lines.push('');
        continue;
      }

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
    }

    return lines;
  }

  function measureTextHeight(lines, lineHeight) {
    return lines.length * lineHeight;
  }

  function drawWrappedText(ctx, lines, x, y, lineHeight) {
    let currentY = y;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, currentY);
      currentY += lineHeight;
    }
    return currentY;
  }

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
    // maxWidth keeps the single-line meta row inside the card even when a
    // locale produces a long date or the word count runs to five digits.
    ctx.fillText(metaText, innerX, innerY + 22, innerW);

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
      // Text doesn't fit on this card. We render what fits and report it —
      // multi-card continuation is future work, but truncation must never be
      // silent (callers surface it to the user).
      const maxLines = Math.max(0, Math.floor(availableH / answerLineHeight));
      const visibleLines = answerLines.slice(0, maxLines);
      const droppedLines = answerLines.length - visibleLines.length;
      console.warn(
        `[Share] Entry #${entryNum} was truncated on the exported card: ` +
        `${droppedLines} of ${answerLines.length} lines did not fit ` +
        `(card height ${Math.round(h)}px). Continuation across multiple cards ` +
        `is not implemented yet.`
      );
      drawWrappedText(ctx, visibleLines, innerX, currentY + answerLineHeight, answerLineHeight);
      return false;
    }

    drawWrappedText(ctx, answerLines, innerX, currentY + answerLineHeight, answerLineHeight);
    return true;
  }

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

    // Body - two columns or single centered column.
    // Column width is derived from the canvas so the pair always fits inside
    // the safe margin: 2 columns + gap + both margins === W.
    const bodyTop = 180;
    const bodyBottom = H - 140;
    const bodyH = bodyBottom - bodyTop;
    const gap = 24;
    const margin = 48;
    const columnW = (W - margin * 2 - gap) / 2; // 480 at W=1080

    // Tracks whether any card had to drop text so the caller can tell the user.
    let complete = true;

    if (leftEntry && rightEntry) {
      // Two-column layout
      const leftX = margin;
      const rightX = leftX + columnW + gap;
      const leftOk = renderEntryCard(ctx, leftEntry, leftX, bodyTop, columnW, bodyH, leftNum);
      const rightOk = renderEntryCard(ctx, rightEntry, rightX, bodyTop, columnW, bodyH, rightNum);
      complete = leftOk && rightOk;
    } else if (leftEntry || rightEntry) {
      // Single centered column (a lone right entry is treated the same way)
      const entry = leftEntry || rightEntry;
      const num = leftEntry ? leftNum : rightNum;
      const centerW = 640;
      const centerX = (W - centerW) / 2;
      complete = renderEntryCard(ctx, entry, centerX, bodyTop, centerW, bodyH, num);
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

    return complete;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function drawBackground(ctx) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    // ember glow from the top, sage from the top-right — echoes the site
    let g = ctx.createRadialGradient(W / 2, -120, 0, W / 2, -120, 900);
    g.addColorStop(0, 'rgba(217, 119, 87, 0.22)');
    g.addColorStop(1, 'rgba(217, 119, 87, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W, 0, 0, W, 0, 900);
    g.addColorStop(0, 'rgba(91, 140, 90, 0.16)');
    g.addColorStop(1, 'rgba(91, 140, 90, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Draw the current month as a familiar calendar inside the panel
  // (x, y, w, h), sizing cells to fit both width and height.
  function drawMonthCalendar(ctx, data, x, y, w, h) {
    const now = new Date();
    const grid = Streak.buildMonthGrid(
      data.countsByDay, now.getFullYear(), now.getMonth(), now
    );

    const padX = 34, padTop = 34, padBottom = 26, gap = 12;
    const titleY = y + padTop + 34;
    const headerY = titleY + 56;
    const gridTop = headerY + 26;
    const availH = (y + h - padBottom) - gridTop;

    ctx.textAlign = 'center';
    ctx.fillStyle = C.tan;
    ctx.font = `600 42px ${SANS}`;
    ctx.fillText(grid.label.toUpperCase(), x + w / 2, titleY);

    const rows = grid.weeks.length;
    const cellW = (w - padX * 2 - gap * 6) / 7;
    const cellH = (availH - gap * (rows - 1)) / rows;
    const cell = Math.min(cellW, cellH);

    const gridW = cell * 7 + gap * 6;
    const startX = x + (w - gridW) / 2;
    const gridH = cell * rows + gap * (rows - 1);
    const startY = gridTop + (availH - gridH) / 2;

    // weekday header
    const wd = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    ctx.font = `600 30px ${SANS}`;
    ctx.fillStyle = 'rgba(242, 234, 211, 0.5)';
    for (let i = 0; i < 7; i++) {
      ctx.fillText(wd[i], startX + i * (cell + gap) + cell / 2, headerY);
    }

    // day cells
    ctx.textBaseline = 'middle';
    const numFont = Math.round(cell * 0.34);
    for (let r = 0; r < rows; r++) {
      const cy = startY + r * (cell + gap);
      for (let i = 0; i < 7; i++) {
        const c = grid.weeks[r][i];
        if (c.blank) continue;
        const cx = startX + i * (cell + gap);

        ctx.fillStyle = c.level ? LEVEL[c.level] : 'rgba(242, 234, 211, 0.05)';
        roundRect(ctx, cx, cy, cell, cell, 12);
        ctx.fill();
        if (c.isToday) {
          ctx.strokeStyle = C.text;
          ctx.lineWidth = 3;
          roundRect(ctx, cx, cy, cell, cell, 12);
          ctx.stroke();
        }

        ctx.fillStyle = c.level ? C.bg : 'rgba(242, 234, 211, 0.55)';
        ctx.font = `${c.level ? 600 : 500} ${numFont}px ${SANS}`;
        ctx.fillText(String(c.day), cx + cell / 2, cy + cell / 2 + 2);
      }
    }
    ctx.textBaseline = 'alphabetic';
  }

  async function exportStreakImage(data) {
    // Use real fonts if they've loaded; fall back to system stacks otherwise.
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* ignore */ }
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    drawBackground(ctx);

    // Logo + wordmark
    const logo = await loadImage('logo-256.png');
    if (logo) {
      const size = 130;
      ctx.save();
      ctx.shadowColor = 'rgba(217, 119, 87, 0.45)';
      ctx.shadowBlur = 40;
      ctx.drawImage(logo, (W - size) / 2, 120, size, size);
      ctx.restore();
    }
    ctx.fillStyle = C.text;
    ctx.font = `600 66px ${SERIF}`;
    ctx.fillText('PIXEL PAGES', W / 2, 340);
    ctx.fillStyle = C.tan;
    ctx.font = `italic 400 34px ${SERIF}`;
    ctx.fillText('a cozy corner for daily reflection', W / 2, 392);

    // Big current-streak number with flame
    ctx.font = `400 110px ${SANS}`;
    ctx.fillText('🔥', W / 2, 560);
    ctx.fillStyle = C.accent;
    ctx.font = `600 240px ${SERIF}`;
    ctx.fillText(String(data.currentStreak), W / 2, 800);
    ctx.fillStyle = C.text;
    ctx.font = `500 54px ${SANS}`;
    ctx.fillText('day streak', W / 2, 872);

    // Secondary stats
    ctx.fillStyle = C.tan;
    ctx.font = `500 42px ${SANS}`;
    ctx.fillText(
      `Longest ${data.longestStreak}   ·   ${data.totalEntries} ${data.totalEntries === 1 ? 'entry' : 'entries'}`,
      W / 2, 962
    );

    // Calendar panel
    const panelX = 70;
    const panelY = 1020;
    const panelW = W - panelX * 2;
    const panelH = 800;
    ctx.fillStyle = 'rgba(50, 68, 58, 0.55)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(194, 168, 120, 0.22)';
    ctx.lineWidth = 2;
    roundRect(ctx, panelX, panelY, panelW, panelH, 28);
    ctx.stroke();

    drawMonthCalendar(ctx, data, panelX, panelY, panelW, panelH);

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(242, 234, 211, 0.55)';
    ctx.font = `500 36px ${SANS}`;
    ctx.fillText('pixel-pages.vercel.app', W / 2, 1890);

    await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) downloadBlob(blob, 'pixel-pages-streak.jpg');
          resolve();
        },
        'image/jpeg',
        0.92
      );
    });
  }

  // Returns true when every spread was generated and downloaded, false when
  // the export bailed out. Callers rely on this to decide whether it's safe to
  // discard the user's selection.
  async function exportCollectionImages(entries) {
    if (!entries || entries.length === 0) {
      console.error('No entries to export');
      return false;
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
      let truncated = false;
      for (let i = 0; i < spreads.length; i++) {
        const spread = spreads[i];
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        const complete = await renderMagazineSpread(
          ctx,
          spread.left,
          spread.right,
          spread.leftNum,
          spread.rightNum,
          'full'
        );
        if (!complete) truncated = true;

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
        const label = `${spreads.length} ${spreads.length === 1 ? 'image' : 'images'} downloaded!`;
        window.flash(
          truncated
            ? label + ' Some long entries were shortened to fit.'
            : label
        );
      }
      return true;
    } catch (error) {
      console.error('Export failed:', error);
      if (window.flash) {
        window.flash('Export failed. Try selecting fewer entries or refresh the page.');
      }
      return false;
    } finally {
      if (shareSocialBtn && window.setBtnLoading) {
        window.setBtnLoading(shareSocialBtn, false);
      }
    }
  }

  // Returns true when the PDF was produced and saved, false otherwise.
  async function exportCollectionPDF(entries) {
    if (!entries || entries.length === 0) {
      console.error('No entries to export');
      return false;
    }

    // Check if jsPDF is available
    if (!window.jspdf || !window.jspdf.jsPDF) {
      console.error('jsPDF not loaded');
      if (window.flash) {
        window.flash('PDF export unavailable. Check your connection.');
      }
      return false;
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
      let truncated = false;
      for (let i = 0; i < spreads.length; i++) {
        const spread = spreads[i];
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        const complete = await renderMagazineSpread(
          ctx,
          spread.left,
          spread.right,
          spread.leftNum,
          spread.rightNum,
          'minimal' // Use minimal branding for PDF
        );
        if (!complete) truncated = true;

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
        window.flash(
          truncated
            ? 'PDF saved! Some long entries were shortened to fit.'
            : 'PDF saved!'
        );
      }
      return true;
    } catch (error) {
      console.error('PDF export failed:', error);
      if (window.flash) {
        window.flash("PDF creation failed. Try the 'Share to Social' option instead.");
      }
      return false;
    } finally {
      if (exportPDFBtn && window.setBtnLoading) {
        window.setBtnLoading(exportPDFBtn, false);
      }
    }
  }

  return {
    exportStreakImage,
    exportCollectionImages,
    exportCollectionPDF,
    // Exposed for the text-rendering test harness (test-text-utils.html)
    wrapText,
    measureTextHeight,
    drawWrappedText
  };
})();
