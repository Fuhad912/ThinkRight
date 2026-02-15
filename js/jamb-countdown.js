/*
  ThinkRight JAMB Countdown
  Single source of truth for exam date + days remaining calculation.

  Sanity check:
  - Feb 15, 2026 -> Apr 16, 2026 = 60 days remaining
*/
(function () {
  "use strict";

  const JAMB_EXAM_DATE = "2026-04-16";
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const root = typeof window !== "undefined" ? window : globalThis;

  function parseISODateToLocalMidnight(isoDate) {
    if (typeof isoDate !== "string") return null;
    const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return date;
  }

  function normalizeToMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function parseTodayValue(mockToday) {
    if (mockToday == null) {
      return normalizeToMidnight(new Date());
    }

    if (mockToday instanceof Date && Number.isFinite(mockToday.getTime())) {
      return normalizeToMidnight(mockToday);
    }

    if (typeof mockToday === "string") {
      const parsedISO = parseISODateToLocalMidnight(mockToday);
      if (parsedISO) return parsedISO;
    }

    const parsed = new Date(mockToday);
    if (!Number.isFinite(parsed.getTime())) {
      return normalizeToMidnight(new Date());
    }
    return normalizeToMidnight(parsed);
  }

  function toDayNumber(date) {
    return Math.floor(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY
    );
  }

  function getDaysRemaining(examDateISO, mockToday) {
    const examDate = parseISODateToLocalMidnight(examDateISO);
    const today = parseTodayValue(mockToday);
    if (!examDate || !today) return 0;

    const dayDiff = toDayNumber(examDate) - toDayNumber(today);
    return Math.max(0, dayDiff);
  }

  function renderJambCountdown(cardElement, mockToday) {
    if (!cardElement) return;

    const daysRemaining = getDaysRemaining(JAMB_EXAM_DATE, mockToday);
    const daysTextElement = cardElement.querySelector("[data-countdown-days]");
    const examDateElement = cardElement.querySelector("[data-countdown-date]");

    if (daysTextElement) {
      const suffix = daysRemaining === 1 ? "" : "s";
      daysTextElement.textContent = `${daysRemaining} day${suffix} remaining`;
    }

    if (examDateElement) {
      examDateElement.textContent = "Exam starts Apr 16, 2026";
    }
  }

  function renderAllJambCountdowns(mockToday) {
    if (typeof document === "undefined") return;
    const cards = document.querySelectorAll("[data-jamb-countdown]");
    cards.forEach((card) => renderJambCountdown(card, mockToday));
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      renderAllJambCountdowns();
      root.setInterval(function () {
        renderAllJambCountdowns();
      }, REFRESH_INTERVAL_MS);
    });
  }

  root.ThinkRightCountdown = {
    JAMB_EXAM_DATE,
    getDaysRemaining,
    renderJambCountdown,
    renderAllJambCountdowns
  };
})();
