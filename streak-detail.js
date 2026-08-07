/* ===========================================================
   Pixel Pages — detailed streak view (its own module)
   Owns the stats, the browsable month calendar, and the Share
   button on the Streak screen. Given streak data (from streak.js)
   it renders itself; it keeps its own "which month is shown" state.
   =========================================================== */

window.StreakDetail = (function () {
  let els = null;
  let data = null;
  let viewMonth = null; // { y, m } currently shown; null until first render

  // The calendar browses the last 6 months (current back through 5 ago).
  // Months compare as a single integer: year*12 + month.
  function monthBounds() {
    const t = new Date();
    const maxIdx = t.getFullYear() * 12 + t.getMonth();
    return { maxIdx, minIdx: maxIdx - 5 };
  }
  function viewIdx() { return viewMonth.y * 12 + viewMonth.m; }

  function init() {
    els = {
      currentN: document.getElementById('streak-current-n'),
      longestN: document.getElementById('streak-longest-n'),
      totalN:   document.getElementById('streak-total-n'),
      empty:    document.getElementById('streak-empty'),
      calPrev:  document.getElementById('cal-prev'),
      calNext:  document.getElementById('cal-next'),
      calMonth: document.getElementById('cal-month'),
      calGrid:  document.getElementById('cal-grid'),
      share:    document.getElementById('share-streak'),
    };
    els.calPrev.addEventListener('click', () => step(-1));
    els.calNext.addEventListener('click', () => step(1));
    els.share.addEventListener('click', onShare);
  }

  function render(d) {
    data = d;
    els.currentN.textContent = d.currentStreak;
    els.longestN.textContent = d.longestStreak;
    els.totalN.textContent = d.totalEntries;
    els.empty.classList.toggle('hidden', d.totalEntries > 0);

    if (!viewMonth) {
      const t = new Date();
      viewMonth = { y: t.getFullYear(), m: t.getMonth() };
    }
    renderCalendar();
  }

  function renderCalendar() {
    if (!data) return;
    const grid = Streak.buildMonthGrid(
      data.countsByDay, viewMonth.y, viewMonth.m, new Date()
    );

    els.calMonth.textContent = grid.label;
    els.calGrid.innerHTML = '';
    for (const week of grid.weeks) {
      for (const cell of week) {
        els.calGrid.appendChild(buildCell(cell));
      }
    }

    const { minIdx, maxIdx } = monthBounds();
    els.calPrev.disabled = viewIdx() <= minIdx;
    els.calNext.disabled = viewIdx() >= maxIdx;
  }

  function buildCell(cell) {
    const box = document.createElement('span');
    box.className = 'cal-cell';
    if (cell.blank) {
      box.classList.add('is-blank');
      return box;
    }
    box.textContent = cell.day;
    box.dataset.level = cell.level;
    if (cell.isToday) box.classList.add('is-today');
    if (cell.isFuture) box.classList.add('is-future');

    const label = cell.date.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    const n = cell.count;
    box.title = `${label} — ${n === 0 ? 'no entries' : n + (n === 1 ? ' entry' : ' entries')}`;
    return box;
  }

  function step(delta) {
    const { minIdx, maxIdx } = monthBounds();
    const next = viewIdx() + delta;
    if (next < minIdx || next > maxIdx) return;
    viewMonth = { y: Math.floor(next / 12), m: next % 12 };
    renderCalendar();
  }

  async function onShare() {
    if (!data) return;
    setBtnLoading(els.share, true, 'Rendering…');
    let ok = true;
    try {
      await Share.exportStreakImage(data);
    } catch (e) {
      ok = false;
    }
    setBtnLoading(els.share, false); // restores the "Share" label
    if (!ok) {
      els.share.textContent = 'Try again';
      setTimeout(() => { els.share.textContent = 'Share'; }, 2000);
    }
  }

  return { init, render };
})();
