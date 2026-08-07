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

  // Heatmap level -> fill (matches the on-screen scale)
  const LEVEL = {
    0: 'rgba(242, 234, 211, 0.07)', // faint empty
    1: '#3E5A44',                    // muted sage
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

  function drawHeatmap(ctx, data, topY) {
    const { columns } = Streak.buildHeatmap(data.countsByDay, new Date());
    const cols = columns.length;
    const gap = 8;
    const gridW = 860;
    const cell = (gridW - gap * (cols - 1)) / cols;
    const startX = (W - gridW) / 2;

    for (let w = 0; w < cols; w++) {
      for (let d = 0; d < 7; d++) {
        const c = columns[w][d];
        if (c.empty) continue;
        const x = startX + w * (cell + gap);
        const y = topY + d * (cell + gap);
        ctx.fillStyle = LEVEL[c.level];
        roundRect(ctx, x, y, cell, cell, 4);
        ctx.fill();
      }
    }
    return topY + 7 * (cell + gap); // bottom Y
  }

  async function exportStreakImage(data) {
    // Use real fonts if they've loaded; fall back to system stacks otherwise.
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* ignore */ }
    }
    const serif = "'Fraunces', Georgia, 'Times New Roman', serif";
    const sans = "'Inter', system-ui, -apple-system, sans-serif";

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
      const size = 150;
      ctx.save();
      ctx.shadowColor = 'rgba(217, 119, 87, 0.45)';
      ctx.shadowBlur = 40;
      ctx.drawImage(logo, (W - size) / 2, 150, size, size);
      ctx.restore();
    }
    ctx.fillStyle = C.text;
    ctx.font = `600 72px ${serif}`;
    ctx.fillText('PIXEL PAGES', W / 2, 400);
    ctx.fillStyle = C.tan;
    ctx.font = `italic 400 38px ${serif}`;
    ctx.fillText('a cozy corner for daily reflection', W / 2, 456);

    // Big current-streak number with flame
    ctx.font = `400 130px ${sans}`;
    ctx.fillText('🔥', W / 2, 700);
    ctx.fillStyle = C.accent;
    ctx.font = `600 300px ${serif}`;
    ctx.fillText(String(data.currentStreak), W / 2, 1000);
    ctx.fillStyle = C.text;
    ctx.font = `500 60px ${sans}`;
    ctx.fillText('day streak', W / 2, 1090);

    // Secondary stats
    ctx.fillStyle = C.tan;
    ctx.font = `500 44px ${sans}`;
    ctx.fillText(
      `Longest ${data.longestStreak}   ·   ${data.totalEntries} ${data.totalEntries === 1 ? 'entry' : 'entries'}`,
      W / 2, 1210
    );

    // Heatmap panel
    const panelY = 1300;
    const panelH = 380;
    ctx.fillStyle = 'rgba(50, 68, 58, 0.55)';
    roundRect(ctx, 80, panelY, W - 160, panelH, 28);
    ctx.fill();
    ctx.strokeStyle = 'rgba(194, 168, 120, 0.22)';
    ctx.lineWidth = 2;
    roundRect(ctx, 80, panelY, W - 160, panelH, 28);
    ctx.stroke();

    ctx.fillStyle = C.tan;
    ctx.font = `600 32px ${sans}`;
    ctx.fillText('LAST 6 MONTHS', W / 2, panelY + 70);
    drawHeatmap(ctx, data, panelY + 120);

    // Footer
    ctx.fillStyle = 'rgba(242, 234, 211, 0.55)';
    ctx.font = `500 38px ${sans}`;
    ctx.fillText('pixel-pages.vercel.app', W / 2, 1840);

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
