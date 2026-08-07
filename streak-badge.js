/* ===========================================================
   Pixel Pages — minimized streak badge (its own module)
   A small "🔥 N" badge that floats at the side of the screen and,
   when clicked, opens the detailed Streak view. It only shows the
   current-streak number; the app decides when it's visible.
   =========================================================== */

window.StreakBadge = (function () {
  let els = null;
  let onOpen = null;

  function init(opts) {
    onOpen = opts && opts.onOpen;
    els = {
      badge: document.getElementById('streak-badge'),
      n:     document.getElementById('badge-n'),
    };
    els.badge.addEventListener('click', () => { if (onOpen) onOpen(); });
  }

  function render(data) {
    els.n.textContent = data.currentStreak;
  }

  function setVisible(visible) {
    els.badge.classList.toggle('hidden', !visible);
  }

  return { init, render, setVisible };
})();
