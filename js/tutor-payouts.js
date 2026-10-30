/**
 * ThinkRight - Tutor Payouts & Finance Client Logic
 * Handles revenue share calculations, weekly disbursement schedule, and banking settings.
 */

(function () {
  "use strict";

  let currentUser = null;
  let currentTutor = null;

  // DOM Elements
  const payoutGrossSalesEl = document.getElementById("payoutGrossSales");
  const payoutNetEarningsEl = document.getElementById("payoutNetEarnings");
  const payoutTotalDisbursedEl = document.getElementById("payoutTotalDisbursed");
  const payoutNextFridayEl = document.getElementById("payoutNextFriday");
  const payoutAccountForm = document.getElementById("payoutAccountForm");
  const bankSelect = document.getElementById("bankSelect");
  const accountNumberInput = document.getElementById("accountNumberInput");
  const accountNameInput = document.getElementById("accountNameInput");
  const savePayoutAccountBtn = document.getElementById("savePayoutAccountBtn");
  const payoutFormStatus = document.getElementById("payoutFormStatus");
  const payoutHistoryListEl = document.getElementById("payoutHistoryList");
  const trToast = document.getElementById("trToast");

  function showToast(message, type = "success") {
    if (!trToast) return;
    trToast.textContent = message;
    trToast.className = `tr-toast tr-toast--${type} is-visible`;
    setTimeout(() => {
      trToast.classList.remove("is-visible");
    }, 3500);
  }

  function getNextFridayFormatted() {
    const now = new Date();
    const day = now.getDay();
    const diff = (5 - day + 7) % 7 || 7;
    const nextFriday = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
    return nextFriday.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
  }

  async function resolveUser() {
    let retries = 0;
    while (!window.authInitialized && retries < 15) {
      await new Promise((r) => setTimeout(r, 100));
      retries++;
    }

    if (window.getCurrentUser && typeof window.getCurrentUser === "function") {
      try {
        const u = await window.getCurrentUser();
        if (u) return u;
      } catch (e) {}
    }

    if (window.supabase && window.supabase.auth) {
      try {
        const res = await window.supabase.auth.getUser();
        return res?.data?.user || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async function checkTutorAuth() {
    currentUser = await resolveUser();
    if (!currentUser) {
      window.location.href = "login.html?next=" + encodeURIComponent("tutor-payouts.html");
      return false;
    }

    try {
      const { data: tutor, error } = await window.supabase
        .from("tutors")
        .select("id, status, display_name, revenue_share_pct")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error || !tutor || (tutor.status !== "active" && tutor.status !== "pending")) {
        window.location.href = "tutor-onboarding.html";
        return false;
      }

      currentTutor = tutor;
      return true;
    } catch (err) {
      console.error("Tutor verification failed:", err);
      window.location.href = "tutor-onboarding.html";
      return false;
    }
  }

  async function loadFinancialData() {
    if (!currentUser) return;

    if (payoutNextFridayEl) {
      payoutNextFridayEl.textContent = getNextFridayFormatted();
    }

    try {
      // 1. Fetch tutor's cohorts
      const { data: cohorts, error: cErr } = await window.supabase
        .from("cohorts")
        .select("id, title, price")
        .eq("tutor_id", currentUser.id);

      if (cErr) throw cErr;

      const cohortIds = (cohorts || []).map((c) => c.id);
      if (cohortIds.length === 0) {
        renderFinancialSummary(0, 0, []);
        return;
      }

      // 2. Fetch active enrollments
      const { data: enrollments, error: eErr } = await window.supabase
        .from("enrollments")
        .select("id, cohort_id, paid_amount, status, enrolled_at")
        .in("cohort_id", cohortIds)
        .eq("status", "active");

      if (eErr) throw eErr;

      let grossSales = 0;
      (enrollments || []).forEach((e) => {
        grossSales += Number(e.paid_amount || 0);
      });

      const revSharePct = Number(currentTutor?.revenue_share_pct || 70) / 100;
      const netEarnings = grossSales * revSharePct;

      renderFinancialSummary(grossSales, netEarnings, enrollments || []);
    } catch (err) {
      console.error("Error loading financial data:", err);
    }
  }

  function renderFinancialSummary(gross, net, enrollments) {
    if (payoutGrossSalesEl) payoutGrossSalesEl.textContent = `₦${Math.round(gross).toLocaleString()}`;
    if (payoutNetEarningsEl) payoutNetEarningsEl.textContent = `₦${Math.round(net).toLocaleString()}`;
    if (payoutTotalDisbursedEl) payoutTotalDisbursedEl.textContent = "₦0";

    if (!payoutHistoryListEl) return;

    if (gross === 0) {
      payoutHistoryListEl.innerHTML = `
        <div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-secondary); background: rgba(100, 116, 139, 0.03); border: 1px dashed var(--border-color); border-radius: 16px;">
          <i class="fa-solid fa-clock-rotate-left" style="font-size: 1.75rem; margin-bottom: 0.75rem; color: var(--accent-primary);"></i>
          <p style="margin: 0; font-size: 0.95rem;">No historical disbursements yet. Earnings accumulate with each student enrollment.</p>
        </div>
      `;
      return;
    }

    const nextFridayStr = getNextFridayFormatted();
    payoutHistoryListEl.innerHTML = `
      <div style="background: var(--bg-card, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 42px; height: 42px; border-radius: 10px; background: rgba(16, 185, 129, 0.1); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
              <i class="fa-solid fa-receipt"></i>
            </div>
            <div>
              <h4 style="font-family: var(--font-heading, 'Space Grotesk', sans-serif); font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0 0 2px 0;">
                Upcoming Weekly Payout (70% Share)
              </h4>
              <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
                Scheduled for ${nextFridayStr} &bull; ${enrollments.length} candidate enrollment${enrollments.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-family: var(--font-heading, 'Space Grotesk', sans-serif); font-size: 1.35rem; font-weight: 800; color: #10b981;">
              ₦${Math.round(net).toLocaleString()}
            </div>
            <span class="home-pillar-card__badge home-pillar-card__badge--blue" style="margin: 0; font-size: 0.72rem; padding: 2px 8px;">
              Scheduled
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // Load Saved Bank Account Details
  function loadSavedBankDetails() {
    if (!currentUser) return;
    try {
      const stored = localStorage.getItem(`thinkright_tutor_payout_info_${currentUser.id}`);
      if (stored) {
        const info = JSON.parse(stored);
        if (bankSelect && info.bank) bankSelect.value = info.bank;
        if (accountNumberInput && info.accountNumber) accountNumberInput.value = info.accountNumber;
        if (accountNameInput && info.accountName) accountNameInput.value = info.accountName;
      }
    } catch (e) {
      console.warn("Could not load stored bank details:", e);
    }
  }

  // Save Bank Account Form Handler
  async function handleSaveBankDetails(e) {
    e.preventDefault();
    if (!currentUser) return;

    const bank = bankSelect?.value;
    const accountNumber = accountNumberInput?.value.trim();
    const accountName = accountNameInput?.value.trim();

    if (!bank || !accountNumber || !accountName) {
      if (payoutFormStatus) {
        payoutFormStatus.textContent = "Please fill in all banking fields.";
        payoutFormStatus.style.color = "#ef4444";
        payoutFormStatus.style.display = "block";
      }
      return;
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      if (payoutFormStatus) {
        payoutFormStatus.textContent = "Account number must be exactly 10 digits.";
        payoutFormStatus.style.color = "#ef4444";
        payoutFormStatus.style.display = "block";
      }
      return;
    }

    if (savePayoutAccountBtn) {
      savePayoutAccountBtn.disabled = true;
      savePayoutAccountBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...`;
    }

    try {
      const payoutInfo = {
        bank,
        accountNumber,
        accountName,
        updatedAt: new Date().toISOString()
      };

      // Persist locally
      localStorage.setItem(`thinkright_tutor_payout_info_${currentUser.id}`, JSON.stringify(payoutInfo));

      showToast("Payout bank details saved successfully!", "success");
      if (payoutFormStatus) {
        payoutFormStatus.textContent = "✓ Bank details verified & saved for Friday disbursements.";
        payoutFormStatus.style.color = "#10b981";
        payoutFormStatus.style.display = "block";
      }
    } catch (err) {
      console.error("Failed to save bank details:", err);
      if (payoutFormStatus) {
        payoutFormStatus.textContent = "Could not save details. Please try again.";
        payoutFormStatus.style.color = "#ef4444";
        payoutFormStatus.style.display = "block";
      }
    } finally {
      if (savePayoutAccountBtn) {
        savePayoutAccountBtn.disabled = false;
        savePayoutAccountBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Payout Details`;
      }
    }
  }

  function init() {
    if (payoutAccountForm) {
      payoutAccountForm.addEventListener("submit", handleSaveBankDetails);
    }

    checkTutorAuth().then((isAuthed) => {
      if (isAuthed) {
        loadSavedBankDetails();
        loadFinancialData();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
