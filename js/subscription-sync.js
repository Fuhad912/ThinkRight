(function () {
  const PLAN_MAP = {
    quarterly: "3-month",
    "3-month": "3-month",
    "3 months": "3-month",
    "3months": "3-month",
    "3month": "3-month",
    "3-months": "3-month",
    monthly: "monthly",
    free: "free",
    trial: "trial",
    admin: "admin",
  };

  function normalizePlan(plan) {
    const raw = (plan || "").toString().trim().toLowerCase();
    if (PLAN_MAP[raw]) return PLAN_MAP[raw];
    const compact = raw.replace(/\s+/g, "").replace(/_/g, "-");
    return PLAN_MAP[compact] || "free";
  }

  function isPaidPlan(plan) {
    const normalized = normalizePlan(plan);
    return normalized === "monthly" || normalized === "3-month" || normalized === "admin";
  }

  async function ensureFreeSubscriptionRow() {
    if (!window.supabase || !window.Subscription || !window.getCurrentUser) return null;

    const user = await window.getCurrentUser();
    if (!user) return null;

    const { data, error } = await window.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("subscriptions read failed:", error);
      return null;
    }

    if (data) return data;

    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertError } = await window.supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan: "free",
          status: "active",
          started_at: nowIso,
          expires_at: null,
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .maybeSingle();

    if (insertError && insertError.code !== "23505") {
      console.warn("subscriptions bootstrap insert failed:", insertError);
      return null;
    }
    return inserted || null;
  }

  async function getLatestSubscriptionRow() {
    if (!window.supabase || !window.getCurrentUser) return null;
    const user = await window.getCurrentUser();
    if (!user) return null;

    const { data, error } = await window.supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("subscriptions latest row fetch failed:", error);
      return null;
    }
    return data || null;
  }

  async function markSubscriptionExpiredIfNeeded(row) {
    if (!row || !row.expires_at) return row;
    if (!["active", "trial"].includes((row.status || "").toLowerCase())) return row;

    const expiresAt = new Date(row.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || new Date() < expiresAt) return row;

    const { data, error } = await window.supabase
      .from("subscriptions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", row.user_id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.warn("failed to mark subscription expired:", error);
      return row;
    }
    return data || row;
  }

  function installOverrides() {
    if (!window.Subscription) return;

    const originalInit = window.Subscription.init;
    window.Subscription.init = async function initWithSync() {
      const ok = typeof originalInit === "function" ? await originalInit() : true;
      try {
        const row = (await ensureFreeSubscriptionRow()) || (await getLatestSubscriptionRow());
        if (row) {
          const current = await markSubscriptionExpiredIfNeeded(row);
          window.Subscription.__latestSubscriptionRow = current;
        }
      } catch (err) {
        console.warn("subscription sync init warning:", err);
      }
      return ok;
    };

    window.Subscription.isPremium = function isPremiumByStatus() {
      const row = window.Subscription.__latestSubscriptionRow;
      if (row) {
        const status = (row.status || "active").toString().toLowerCase();
        const plan = normalizePlan(row.plan);
        const hasNotExpired = !row.expires_at || new Date(row.expires_at) > new Date();
        if (status === "active" && hasNotExpired && isPaidPlan(plan)) {
          return true;
        }
        if (["expired", "canceled", "cancelled"].includes(status)) {
          return false;
        }
      }

      // fallback to legacy behavior if row unavailable
      if (typeof window.Subscription.getPremiumStatus === "function") {
        const meta = window.Subscription.getPremiumStatus();
        const metaPlan = normalizePlan(meta.subscription_plan);
        if ((meta.is_premium === true || meta.is_premium === "true") && isPaidPlan(metaPlan)) {
          if (meta.subscription_expires_at && new Date(meta.subscription_expires_at) <= new Date()) {
            return false;
          }
          return true;
        }
      }
      return false;
    };

    window.Subscription.canAccessDashboard = function canAccessDashboardByStatus() {
      return window.Subscription.isPremium();
    };

    window.Subscription.canAccessSyllabus = function canAccessSyllabusByStatus() {
      const row = window.Subscription.__latestSubscriptionRow;
      const isAdmin = normalizePlan(row?.plan) === "admin";
      const isPremium = window.Subscription.isPremium() === true;

      if (window.ThinkRightEntitlements && typeof window.ThinkRightEntitlements.canAccessSyllabus === "function") {
        try {
          return window.ThinkRightEntitlements.canAccessSyllabus({
            isPremium,
            isAdmin
          });
        } catch (err) {
          console.warn("canAccessSyllabus helper failed:", err);
        }
      }

      return isAdmin || isPremium;
    };

    const originalEnsureValid = window.Subscription.ensureSubscriptionValid;
    window.Subscription.ensureSubscriptionValid = async function ensureValidAndStatus() {
      if (typeof originalEnsureValid === "function") {
        await originalEnsureValid();
      }
      try {
        const row = await getLatestSubscriptionRow();
        if (!row) return;
        const updated = await markSubscriptionExpiredIfNeeded(row);
        window.Subscription.__latestSubscriptionRow = updated;
      } catch (err) {
        console.warn("ensureSubscriptionValid sync warning:", err);
      }
    };

    window.Subscription.cancelSubscription = async function cancelSubscriptionCanonical() {
      if (!window.supabase || !window.getCurrentUser) {
        return { success: false, error: "Supabase not initialized" };
      }
      const user = await window.getCurrentUser();
      if (!user) {
        return { success: false, error: "User not authenticated" };
      }

      const { data, error } = await window.supabase
        .from("subscriptions")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select("*")
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message };
      }
      window.Subscription.__latestSubscriptionRow = data || null;
      return { success: true, subscription: data || null };
    };

    window.Subscription.updateSubscriptionAfterPayment = async function updateAfterPaymentCanonical(
      plan,
      txRef,
      amount
    ) {
      if (!window.supabase || !window.getCurrentUser) {
        return { success: false, error: "Supabase not initialized" };
      }
      const user = await window.getCurrentUser();
      if (!user) return { success: false, error: "User not authenticated" };

      const normalizedPlan = normalizePlan(plan);
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + (normalizedPlan === "3-month" ? 90 : 30));

      const { data, error } = await window.supabase
        .from("subscriptions")
        .upsert(
          {
            user_id: user.id,
            plan: normalizedPlan,
            status: "active",
            started_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            updated_at: now.toISOString(),
          },
          { onConflict: "user_id" }
        )
        .select("*")
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message };
      }

      // Preserve existing metadata-based compatibility
      try {
        await window.supabase.auth.updateUser({
          data: {
            is_premium: true,
            subscription_plan: plan,
            subscription_started_at: now.toISOString(),
            subscription_expires_at: expiresAt.toISOString(),
            tx_ref: txRef || null,
            last_payment_date: now.toISOString(),
          },
        });
      } catch (metaErr) {
        console.warn("metadata update warning:", metaErr);
      }

      window.Subscription.__latestSubscriptionRow = data || null;
      return { success: true, subscription: data || null, amount_paid: amount || null };
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installOverrides);
  } else {
    installOverrides();
  }
})();
