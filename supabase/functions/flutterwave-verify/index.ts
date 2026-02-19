import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MONTHLY_PRICE = 1499;
const QUARTERLY_PRICE = 3999;
const PLAN_BY_PRICE = new Map<number, "monthly" | "quarterly">([
  [MONTHLY_PRICE, "monthly"],
  [QUARTERLY_PRICE, "quarterly"],
]);

function asMoney(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100) / 100;
}

function normalizeStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function resolveBaseAmount(
  payload: Record<string, unknown>,
): {
  matchedAmount: number | null;
  matchedField: string | null;
  matchedPlan: "monthly" | "quarterly" | null;
  candidates: Array<{ field: string; value: number }>;
} {
  const meta = (payload.meta && typeof payload.meta === "object")
    ? payload.meta as Record<string, unknown>
    : {};

  const chargedAmount = asMoney(payload.charged_amount);
  const appFee = asMoney(payload.app_fee) ?? 0;
  const merchantFee = asMoney(payload.merchant_fee) ?? 0;

  const candidateRows: Array<{ field: string; raw: unknown }> = [
    { field: "meta.subscription_price", raw: meta.subscription_price },
    { field: "meta.base_amount", raw: meta.base_amount },
    { field: "amount", raw: payload.amount },
    { field: "amount_settled", raw: payload.amount_settled },
    { field: "amount_requested", raw: payload.amount_requested },
    {
      field: "charged_amount_minus_app_fee",
      raw: chargedAmount === null ? null : chargedAmount - appFee,
    },
    {
      field: "charged_amount_minus_fees",
      raw: chargedAmount === null ? null : chargedAmount - appFee - merchantFee,
    },
  ];

  const candidates: Array<{ field: string; value: number }> = [];
  for (const row of candidateRows) {
    const value = asMoney(row.raw);
    if (value === null) continue;
    candidates.push({ field: row.field, value });
  }

  for (const candidate of candidates) {
    const plan = PLAN_BY_PRICE.get(candidate.value);
    if (plan) {
      return {
        matchedAmount: candidate.value,
        matchedField: candidate.field,
        matchedPlan: plan,
        candidates,
      };
    }
  }

  return {
    matchedAmount: null,
    matchedField: null,
    matchedPlan: null,
    candidates,
  };
}

function jsonResponse(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: CORS_HEADERS,
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const flwSecret = Deno.env.get("FLUTTERWAVE_SECRET_KEY");
  const debugMode = Deno.env.get("THINKRIGHT_DEBUG_PAYMENTS") === "1";
  if (!flwSecret) {
    return jsonResponse(500, { ok: false, error: "FLUTTERWAVE_SECRET_KEY is not configured" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse(400, { ok: false, error: "Invalid JSON body" });
  }

  const transactionId = String(body.transaction_id || "").trim();
  const txRef = String(body.tx_ref || "").trim();

  if (!transactionId) {
    return jsonResponse(400, { ok: false, error: "transaction_id is required" });
  }

  const verifyUrl = `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`;
  let verifyResponse: Response;
  let verifyJson: Record<string, unknown>;

  try {
    verifyResponse = await fetch(verifyUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${flwSecret}`,
      },
    });
    verifyJson = await verifyResponse.json() as Record<string, unknown>;
  } catch (error) {
    return jsonResponse(502, {
      ok: false,
      error: "Unable to reach Flutterwave verify API",
      details: String(error),
    });
  }

  if (debugMode) {
    console.log("[flutterwave-verify] full webhook payload:", JSON.stringify(verifyJson));
  }

  if (!verifyResponse.ok || normalizeStatus(verifyJson.status) !== "success") {
    return jsonResponse(400, {
      ok: false,
      error: "Flutterwave verification failed",
      flutterwave_status: verifyJson.status ?? null,
      flutterwave_message: verifyJson.message ?? null,
    });
  }

  const payload = (verifyJson.data && typeof verifyJson.data === "object")
    ? verifyJson.data as Record<string, unknown>
    : {};

  const payloadStatus = normalizeStatus(payload.status);
  if (!["successful", "completed"].includes(payloadStatus)) {
    return jsonResponse(400, {
      ok: false,
      error: "Transaction is not successful",
      transaction_status: payloadStatus || null,
    });
  }

  const payloadTxRef = String(payload.tx_ref || "").trim();
  if (txRef && payloadTxRef && txRef !== payloadTxRef) {
    return jsonResponse(400, {
      ok: false,
      error: "tx_ref mismatch",
      expected_tx_ref: txRef,
      actual_tx_ref: payloadTxRef,
    });
  }

  const amountValidation = resolveBaseAmount(payload);
  console.log(
    "[flutterwave-verify] validating amount field:",
    amountValidation.matchedField ?? "none",
  );
  console.log(
    "[flutterwave-verify] matched subscription plan:",
    amountValidation.matchedPlan ?? "none",
  );

  if (!amountValidation.matchedPlan || amountValidation.matchedAmount === null) {
    return jsonResponse(400, {
      ok: false,
      error: "Unable to map transaction to base subscription price",
      allowed_prices: [MONTHLY_PRICE, QUARTERLY_PRICE],
      candidate_amounts: amountValidation.candidates,
    });
  }

  return jsonResponse(200, {
    ok: true,
    data: {
      transaction_id: payload.id ?? transactionId,
      tx_ref: payloadTxRef || txRef || null,
      status: payloadStatus,
      amount_validation: {
        matched_field: amountValidation.matchedField,
        subscription_price: amountValidation.matchedAmount,
        candidates: amountValidation.candidates,
      },
      subscription_plan: amountValidation.matchedPlan,
      subscription_price: amountValidation.matchedAmount,
    },
  });
});
