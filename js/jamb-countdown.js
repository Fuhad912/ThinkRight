/*
  ThinkRight JAMB Countdown
  Single source of truth for exam date + smart countdown display.

  Sanity check:
  - Feb 15, 2026 -> Apr 16, 2026 = 60 days remaining
*/
(function () {
  "use strict";

  const JAMB_EXAM_DATE = new Date("2026-04-16T00:00:00");
  const MS_PER_SECOND = 1000;
  const SECONDS_PER_MINUTE = 60;
  const SECONDS_PER_HOUR = 60 * 60;
  const SECONDS_PER_DAY = 24 * 60 * 60;
  const REFRESH_INTERVAL_MS = 1000;
  const FULL_COUNTDOWN_THRESHOLD_DAYS = 30;
  const root = typeof window !== "undefined" ? window : globalThis;
  let countdownIntervalId = null;

  function isValidDate(value) {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  function parseDateOnlyToLocalMidnight(value) {
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (!isValidDate(date)) return null;

    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  function coerceDate(value, fallbackValue) {
    if (isValidDate(value)) return new Date(value.getTime());
    if (typeof value === "string") {
      const dateOnly = parseDateOnlyToLocalMidnight(value);
      if (dateOnly) return dateOnly;
      const parsed = new Date(value);
      if (isValidDate(parsed)) return parsed;
    }
    if (typeof value === "number") {
      const parsed = new Date(value);
      if (isValidDate(parsed)) return parsed;
    }
    return new Date(fallbackValue.getTime());
  }

  function toTwoDigits(value) {
    return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
  }

  function getCountdownParts(nowInput, examDateInput) {
    const now = coerceDate(nowInput, new Date());
    const examDate = coerceDate(examDateInput, JAMB_EXAM_DATE);
    const diffMs = examDate.getTime() - now.getTime();
    if (!Number.isFinite(diffMs) || diffMs <= 0) {
      return {
        totalDays: 0,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0
      };
    }

    const totalSeconds = Math.floor(diffMs / MS_PER_SECOND);
    const totalDays = Math.floor(totalSeconds / SECONDS_PER_DAY);
    const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
    const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;

    return {
      totalDays,
      days: totalDays,
      hours,
      minutes,
      seconds
    };
  }

  function getDaysRemaining(examDateISO, mockToday) {
    const parts = getCountdownParts(
      mockToday == null ? new Date() : mockToday,
      examDateISO == null ? JAMB_EXAM_DATE : examDateISO
    );
    return parts.totalDays;
  }

  function hasStarted(parts) {
    return (
      parts.totalDays === 0 &&
      parts.hours === 0 &&
      parts.minutes === 0 &&
      parts.seconds === 0
    );
  }

  function formatDaysOnly(parts) {
    const dayLabel = parts.totalDays === 1 ? "Day" : "Days";
    return `<strong class="jamb-countdown-number">${parts.totalDays}</strong> ${dayLabel} Remaining`;
  }

  function formatFullCountdown(parts) {
    return `<strong class="jamb-countdown-number">${parts.days}</strong>d <strong class="jamb-countdown-number">${toTwoDigits(parts.hours)}</strong>h <strong class="jamb-countdown-number">${toTwoDigits(parts.minutes)}</strong>m <strong class="jamb-countdown-number">${toTwoDigits(parts.seconds)}</strong>s`;
  }

  function renderJambCountdown(cardElement, nowInput) {
    if (!cardElement) return;

    const parts = getCountdownParts(nowInput == null ? new Date() : nowInput, JAMB_EXAM_DATE);
    const daysTextElement = cardElement.querySelector("[data-countdown-days]");
    const examDateElement = cardElement.querySelector("[data-countdown-date]");

    if (daysTextElement) {
      if (hasStarted(parts)) {
        daysTextElement.textContent = "JAMB starts today";
      } else if (parts.totalDays > FULL_COUNTDOWN_THRESHOLD_DAYS) {
        daysTextElement.innerHTML = formatDaysOnly(parts);
      } else {
        daysTextElement.innerHTML = formatFullCountdown(parts);
      }
    }

    if (examDateElement) {
      examDateElement.textContent = "Exam starts Apr 16, 2026";
    }

    return hasStarted(parts);
  }

  function renderAllJambCountdowns(nowInput) {
    if (typeof document === "undefined") return;
    const cards = document.querySelectorAll("[data-jamb-countdown]");
    let allReached = cards.length > 0;
    cards.forEach((card) => {
      const reached = renderJambCountdown(card, nowInput);
      if (!reached) {
        allReached = false;
      }
    });
    return allReached;
  }

  function stopCountdownTicker() {
    if (countdownIntervalId != null) {
      root.clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
  }

  function startCountdownTicker() {
    stopCountdownTicker();
    const completedOnFirstRender = renderAllJambCountdowns();
    if (completedOnFirstRender) {
      return;
    }

    countdownIntervalId = root.setInterval(function () {
      const completed = renderAllJambCountdowns();
      if (completed) {
        stopCountdownTicker();
      }
    }, REFRESH_INTERVAL_MS);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      startCountdownTicker();
    });

    root.addEventListener("pagehide", stopCountdownTicker);
    root.addEventListener("beforeunload", stopCountdownTicker);
  }

  root.ThinkRightCountdown = {
    JAMB_EXAM_DATE,
    getCountdownParts,
    getDaysRemaining,
    renderJambCountdown,
    renderAllJambCountdowns,
    startCountdownTicker,
    stopCountdownTicker
  };
})();
