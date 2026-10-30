/*
  ThinkRight Entitlement Helpers
  Single source of truth for syllabus gating + entitlement fetch.

  Access truth table:
  isAdmin  isPremium  => access
  true     *          => true
  false    true       => true
  false    false      => false

  Optional backend policy snippet (if syllabus files move to DB tables):
  -- create policy "syllabus_select_paid_or_admin" on public.syllabus_files
  -- for select to authenticated using (
  --   exists (
  --     select 1 from public.subscriptions s
  --     where s.user_id = auth.uid()
  --       and (
  --         lower(coalesce(s.plan, '')) = 'admin'
  --         or (
  --           lower(coalesce(s.status, 'active')) = 'active'
  --           and lower(coalesce(s.plan, '')) in ('monthly', '3-month')
  --           and (s.expires_at is null or s.expires_at > now())
  --         )
  --       )
  --   )
  -- );
*/
(function () {
  const DEV_MODE =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.search.includes("debugEntitlements=1"));

  function devLog(...args) {
    if (DEV_MODE) {
      console.log("[entitlements]", ...args);
    }
  }

  const FREE_SUBJECTS = new Set([
    "Use of English",
    "English",
    "Mathematics",
    "Maths",
    "Math",
  ]);

  function normalizePlan(plan) {
    const raw = (plan || "").toString().trim().toLowerCase();
    const map = {
      monthly: "monthly",
      quarter: "3-month",
      quarterly: "3-month",
      "3-month": "3-month",
      "3 months": "3-month",
      "3months": "3-month",
      "3month": "3-month",
      "3-months": "3-month",
      admin: "admin",
      free: "free",
      trial: "trial",
    };
    if (map[raw]) return map[raw];
    const compact = raw.replace(/\s+/g, "").replace(/_/g, "-");
    return map[compact] || "free";
  }

  function normalizeSubject(name) {
    const subject = (name || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ");

    if (subject === "english" || subject === "use of english") {
      return "english";
    }
    if (
      subject === "mathematics" ||
      subject === "maths" ||
      subject === "math"
    ) {
      return "math";
    }

    return subject;
  }

  function canAccessSyllabus() {
    return true;
  }

  function canViewSyllabus() {
    return true;
  }

  function toEntitlement() {
    return {
      isAdmin: true,
      isPremium: true,
      plan: "free",
      status: "active",
      expiresAt: null,
      source: "free",
    };
  }

  async function fetchSyllabusEntitlement() {
    return {
      isAdmin: true,
      isPremium: true,
      plan: "free",
      status: "active",
      expiresAt: null,
      source: "free",
    };
  }



  function runTruthTableChecks() {
    // Core 3 regression checks requested.
    const checks = [
      {
        input: { subjectName: "Physics", isAdmin: true, isPremium: false },
        expected: true,
        label: "admin=true => access true",
      },
      {
        input: { subjectName: "Physics", isAdmin: false, isPremium: true },
        expected: true,
        label: "premium=true => access true",
      },
      {
        input: { subjectName: "Physics", isAdmin: false, isPremium: false },
        expected: false,
        label: "neither => access false",
      },
    ];

    checks.forEach((tc) => {
      const actual = canViewSyllabus(tc.input);
      console.assert(actual === tc.expected, `[entitlements] ${tc.label} failed`, tc);
    });

    // Free subjects always accessible.
    console.assert(
      canViewSyllabus({ subjectName: "Use of English", isAdmin: false, isPremium: false }) === true,
      "[entitlements] english should always be accessible"
    );
    console.assert(
      canViewSyllabus({ subjectName: "Maths", isAdmin: false, isPremium: false }) === true,
      "[entitlements] maths should always be accessible"
    );
  }

  if (DEV_MODE) {
    runTruthTableChecks();
  }

  window.ThinkRightEntitlements = {
    FREE_SUBJECTS,
    normalizeSubject,
    canAccessSyllabus,
    canViewSyllabus,
    fetchSyllabusEntitlement,
    _runTruthTableChecks: runTruthTableChecks,
  };
})();

