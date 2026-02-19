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

  function canAccessSyllabus({ isPremium, isAdmin }) {
    if (typeof isPremium !== "boolean" || typeof isAdmin !== "boolean") {
      throw new Error(
        "canAccessSyllabus expects strict booleans for isPremium and isAdmin"
      );
    }
    return isAdmin === true || isPremium === true;
  }

  function canViewSyllabus({ subjectName, isPremium, isAdmin }) {
    if (typeof isPremium !== "boolean" || typeof isAdmin !== "boolean") {
      throw new Error(
        "canViewSyllabus expects strict booleans for isPremium and isAdmin"
      );
    }

    const normalized = normalizeSubject(subjectName);
    if (normalized === "english" || normalized === "math") {
      return true;
    }
    return Boolean(isAdmin || isPremium);
  }

  function toEntitlement(row) {
    const plan = normalizePlan(row?.plan);
    const status = (row?.status || "active").toString().trim().toLowerCase();
    const expiresAt = row?.expires_at ? new Date(row.expires_at) : null;
    const notExpired = !expiresAt || expiresAt > new Date();

    const isAdmin = plan === "admin";
    const isPremiumPlan = plan === "monthly" || plan === "3-month" || plan === "admin";
    const isPremium = status === "active" && notExpired && isPremiumPlan;

    return {
      isAdmin: isAdmin === true,
      isPremium: isPremium === true,
      plan,
      status,
      expiresAt: row?.expires_at || null,
      source: "subscriptions",
    };
  }

  async function fetchSyllabusEntitlement({ supabase, userId }) {
    if (!supabase || !userId) {
      return {
        isAdmin: false,
        isPremium: false,
        plan: "free",
        status: "active",
        expiresAt: null,
        source: "none",
      };
    }

    const selectLatest = async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("user_id, plan, status, expires_at, updated_at, started_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }
      return data || null;
    };

    let row = await selectLatest();

    // Guarantee row existence.
    if (!row) {
      const defaultRow = {
        user_id: userId,
        plan: "free",
        status: "active",
        started_at: new Date().toISOString(),
        expires_at: null,
      };

      const { data: created, error: createError } = await supabase
        .from("subscriptions")
        .upsert(defaultRow, { onConflict: "user_id" })
        .select("user_id, plan, status, expires_at, updated_at, started_at")
        .maybeSingle();

      if (createError && createError.code !== "23505") {
        throw createError;
      }
      row = created || (await selectLatest()) || defaultRow;
    }

    const entitlement = toEntitlement(row);
    devLog("fetched entitlement", {
      user_id: userId,
      isAdmin: entitlement.isAdmin,
      isPremium: entitlement.isPremium,
    });
    return entitlement;
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

