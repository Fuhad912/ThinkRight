/**
 * ThinkRight - Tutor Onboarding Application Handler
 * Handles tutor sign-up, application submission, and status checking.
 */

(function () {
  "use strict";

  const applyForm = document.getElementById("tutorApplyForm");
  const formStatus = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitTutorBtn");
  const tutorStatusBox = document.getElementById("tutorStatusBox");
  const statusIcon = document.getElementById("statusIcon");
  const statusTitle = document.getElementById("statusTitle");
  const statusDesc = document.getElementById("statusDesc");
  const statusAction = document.getElementById("statusAction");

  async function resolveUser() {
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

  async function checkExistingTutorStatus() {
    let retries = 0;
    while (!window.authInitialized && retries < 15) {
      await new Promise((r) => setTimeout(r, 100));
      retries++;
    }

    const user = await resolveUser();
    if (!user) {
      // User is not logged in yet. Allow them to fill form or prompt login.
      return;
    }

    if (!window.supabase) return;

    try {
      const { data, error } = await window.supabase
        .from("tutors")
        .select("id, status, display_name, subjects")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("Could not check tutor status:", error);
        return;
      }

      if (data) {
        showStatusView(data);
      }
    } catch (err) {
      console.warn("Tutor check error:", err);
    }
  }

  function showStatusView(tutor) {
    if (applyForm) applyForm.style.display = "none";
    if (tutorStatusBox) tutorStatusBox.style.display = "block";

    if (tutor.status === "active") {
      if (statusIcon) statusIcon.textContent = "🎉";
      if (statusTitle) statusTitle.textContent = "You are an Approved Tutor!";
      if (statusDesc) {
        statusDesc.textContent = `Welcome back, ${tutor.display_name}. Your tutor account is active. You can manage your classes, upload lessons, and interact with students.`;
      }
      if (statusAction) {
        statusAction.innerHTML = `<a href="tutor-dashboard.html" class="tr-btn tr-btn--primary">Go to Tutor Dashboard</a>`;
      }
    } else if (tutor.status === "suspended") {
      if (statusIcon) statusIcon.textContent = "⚠️";
      if (statusTitle) statusTitle.textContent = "Account Suspended";
      if (statusDesc) {
        statusDesc.textContent = "Your tutor account is currently suspended. Please contact ThinkRight support via WhatsApp for assistance.";
      }
      if (statusAction) {
        statusAction.innerHTML = `<a href="https://wa.me/2348160271964" target="_blank" class="tr-btn tr-btn--primary">Contact Support</a>`;
      }
    } else {
      // Pending
      if (statusIcon) statusIcon.textContent = "⏳";
      if (statusTitle) statusTitle.textContent = "Application Under Review";
      if (statusDesc) {
        statusDesc.textContent = `Thanks for applying, ${tutor.display_name}! Our academic team is reviewing your subjects (${(tutor.subjects || []).join(", ")}) and sample video. We will reach out via WhatsApp within 24–48 hours.`;
      }
      if (statusAction) {
        statusAction.innerHTML = `
          <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-top: 1rem;">
            <a href="tutor-dashboard.html" class="tr-btn tr-btn--primary">
              <i class="fa-solid fa-chalkboard"></i> Go to Classes &amp; Dashboard
            </a>
            <a href="https://wa.me/2348160271964" target="_blank" class="tr-btn tr-btn--outline">
              <i class="fa-brands fa-whatsapp"></i> Chat with Support
            </a>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 1rem;">Need to make changes? <a href="mailto:thinkright912@gmail.com">Email us</a> or reach out on WhatsApp.</p>
        `;
      }
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();

    const user = await resolveUser();
    if (!user) {
      // Redirect to login/signup with return URL
      window.location.href = "login.html?next=" + encodeURIComponent("tutor-onboarding.html");
      return;
    }

    const displayName = document.getElementById("tutorName")?.value.trim();
    const whatsapp = document.getElementById("tutorWhatsapp")?.value.trim();
    const bio = document.getElementById("tutorBio")?.value.trim();
    const sampleVideo = document.getElementById("tutorVideo")?.value.trim();

    const checkedSubjects = Array.from(
      document.querySelectorAll('input[name="tutor_subject"]:checked')
    ).map((el) => el.value);

    if (!displayName || !whatsapp || !bio || checkedSubjects.length === 0) {
      if (formStatus) {
        formStatus.textContent = "Please fill in all required fields and select at least one subject.";
        formStatus.style.color = "#ef4444";
      }
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting Application...";
    }

    try {
      const { error } = await window.supabase
        .from("tutors")
        .upsert({
          id: user.id,
          display_name: displayName,
          whatsapp_number: whatsapp,
          bio: bio,
          sample_video_url: sampleVideo || null,
          subjects: checkedSubjects,
          status: "pending",
          revenue_share_pct: 70.0,
          updated_at: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      showStatusView({
        status: "pending",
        display_name: displayName,
        subjects: checkedSubjects
      });
    } catch (err) {
      console.error("Failed to submit tutor application:", err);
      if (formStatus) {
        formStatus.textContent = "Failed to submit: " + (err.message || "Please try again later.");
        formStatus.style.color = "#ef4444";
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Tutor Application";
      }
    }
  }

  if (applyForm) {
    applyForm.addEventListener("submit", handleFormSubmit);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkExistingTutorStatus);
  } else {
    checkExistingTutorStatus();
  }
})();
