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

  // Build the heatmap grid: `weeks` columns (oldest first), each a
  // 7-cell array Sun..Sat. Cells before the first day are { empty:true }.
  function buildHeatmap(countsByDay, today, weeks) {
    weeks = weeks || 26;
    const end = startOfDay(today);
    // last column ends on the Saturday of this week
    const endOfWeek = new Date(end.getTime() + (6 - end.getDay()) * DAY_MS);
    const totalDays = weeks * 7;
    const start = new Date(endOfWeek.getTime() - (totalDays - 1) * DAY_MS);

    const columns = [];
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * DAY_MS);
        if (date.getTime() > end.getTime()) {
          col.push({ empty: true }); // future days in the current week
          continue;
        }
        const key = dayKey(date);
        const count = countsByDay.get(key) || 0;
        col.push({ key, date, count, level: intensityLevel(count) });
      }
      columns.push(col);
    }
    return { columns };
  }

  return { dayKey, intensityLevel, computeStreakData, buildHeatmap };
})();
