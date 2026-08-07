/* ===========================================================
   Pixel Pages — streak logic (pure)
   No DOM, no storage: takes entries in, returns data out.
   A "day" is the user's LOCAL calendar date (near-midnight
   entries must land on the right day, so we build keys from
   local components — never toISOString, which is UTC).
   =========================================================== */

window.Streak = (function () {
  const DAY_MS = 24 * 60 * 60 * 1000;

  // "YYYY-MM-DD" from local date components
  function dayKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Local midnight for a given date (strips time-of-day)
  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function intensityLevel(count) {
    if (!count) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    return 3;
  }

  // entries: [{ timestamp, ... }]  ->  aggregate stats
  function computeStreakData(entries) {
    const countsByDay = new Map();
    for (const entry of entries) {
      const key = dayKey(new Date(entry.timestamp));
      countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    }

    return {
      currentStreak: currentStreak(countsByDay, new Date()),
      longestStreak: longestStreak(countsByDay),
      totalEntries: entries.length,
      countsByDay,
    };
  }

  // Consecutive days ending today. If today has no entry yet but
  // yesterday does, the streak still counts — it only breaks after
  // a full missed calendar day.
  function currentStreak(countsByDay, today) {
    let cursor = startOfDay(today);
    if (!countsByDay.has(dayKey(cursor))) {
      cursor = new Date(cursor.getTime() - DAY_MS); // fall back to yesterday
    }
    let streak = 0;
    while (countsByDay.has(dayKey(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }
    return streak;
  }

  // Longest run of consecutive calendar days ever recorded.
  function longestStreak(countsByDay) {
    const keys = Array.from(countsByDay.keys()).sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const key of keys) {
      const day = startOfDay(new Date(key + 'T00:00:00'));
      if (prev && day.getTime() - prev.getTime() === DAY_MS) {
        run++;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = day;
    }
    return longest;
  }

  // Build a familiar month calendar for (year, month): weeks of 7 cells,
  // Sun..Sat, with leading/trailing { blank:true } padding. Each real day
  // carries its day-of-month, entry count, intensity level, and flags.
  function buildMonthGrid(countsByDay, year, month, today) {
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();               // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStart = today ? startOfDay(today) : null;
    const todayKey = today ? dayKey(today) : null;

    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ blank: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const key = dayKey(date);
      const count = countsByDay.get(key) || 0;
      cells.push({
        day: d,
        key,
        date,
        count,
        level: intensityLevel(count),
        isToday: key === todayKey,
        isFuture: todayStart ? date.getTime() > todayStart.getTime() : false,
      });
    }
    while (cells.length % 7 !== 0) cells.push({ blank: true });

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const label = first.toLocaleDateString(undefined, {
      month: 'long', year: 'numeric',
    });
    return { year, month, weeks, label };
  }

  return { dayKey, intensityLevel, computeStreakData, buildMonthGrid };
})();
