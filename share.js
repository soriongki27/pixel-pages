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

  return { exportStreakImage };
})();
