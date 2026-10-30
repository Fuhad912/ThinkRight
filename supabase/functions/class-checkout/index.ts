// Class payments are separate from CBT subscriptions. Amounts are always integer kobo in database.
// API reference: https://developer.flutterwave.com/docs/collecting-payments/hosted-checkout/
const env = (key: string) => Deno.env.get(key) || '';
const base = env('SUPABASE_URL');
const anon = env('SUPABASE_ANON_KEY');
const service = env('SUPABASE_SERVICE_ROLE_KEY');
const secret = env('FLUTTERWAVE_SECRET_KEY');
const secretHash = env('FLUTTERWAVE_SECRET_HASH');
const site = env('SITE_URL').replace(/\/$/, '');
const allowedOrigins = [site, ...env('CHECKOUT_ALLOWED_ORIGINS').split(',').map(s => s.trim())].filter(Boolean);

async function rpc(name: string, args: Record<string, unknown>, bearer: string, privileged = false) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { 'content-type': 'application/json', apikey: privileged ? service : anon, authorization: `Bearer ${bearer}` },
    body: JSON.stringify(args), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Enrollment could not be updated');
  return result;
}

async function verify(reference: string, userId?: string) {
  const response = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  const payment = result.data;
  if (!response.ok || result.status !== 'success' || (payment?.status !== 'successful' && payment?.status !== 'completed')) {
    throw new Error('Payment is not confirmed yet. Please retry verification.');
  }
  const amountKobo = Math.round(Number(payment.amount) * 100);
  if (payment.tx_ref !== reference || !Number.isSafeInteger(amountKobo)) {
    throw new Error('Invalid payment reference or amount');
  }
  const owner = payment.meta?.user_id;
  if (!owner || (userId && owner !== userId)) {
    throw new Error('This payment does not belong to your account');
  }
  const paidAt = payment.created_at || new Date().toISOString();
  return await rpc('class_order_settle', {
    p_reference: reference,
    p_amount: amountKobo,
    p_currency: payment.currency || 'NGN',
    p_paid_at: paidAt,
    p_user: owner
  }, service, true);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') || '';
  const headers = {
    'content-type': 'application/json',
    'access-control-allow-origin': allowedOrigins.includes(origin) ? origin : site,
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
    'cache-control': 'no-store'
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json(405, { error: 'POST required' });
  if (!base || !service || !anon || !secret || !site) return json(503, { error: 'Class checkout is not configured yet.' });
  if (origin && !allowedOrigins.includes(origin)) return json(403, { error: 'Origin not allowed' });

  try {
    const raw = await request.text();
    if (raw.length > 100000) return json(413, { error: 'Request too large' });

    // Handle Flutterwave webhook
    const flutterwaveSignature = request.headers.get('verif-hash');
    if (flutterwaveSignature) {
      if (secretHash && flutterwaveSignature !== secretHash) {
        return json(401, { error: 'Invalid signature' });
      }
      const event = JSON.parse(raw);
      const txRef = event.data?.tx_ref || event.txRef;
      if (String(txRef || '').startsWith('TR-')) {
        await verify(txRef);
      }
      return json(200, { received: true });
    }

    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Sign in required' });
    const authResponse = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: anon, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });
    const user = await authResponse.json();
    if (!authResponse.ok || !user.id) return json(401, { error: 'Sign in required' });

    const body = JSON.parse(raw);
    if (body.action === 'verify') {
      if (!/^TR-[a-f0-9-]{36}$/i.test(body.reference || '')) return json(400, { error: 'Invalid payment reference' });
      return json(200, { cohort_id: await verify(body.reference, user.id) });
    }

    if (body.action !== 'initialize') return json(400, { error: 'Unknown checkout action' });

    const order = await rpc('class_order_create', { p_cohort: body.cohort_id }, token);
    if (order.enrolled) return json(200, { enrolled: true });

    const amountNaira = order.amount_kobo / 100;
    const response = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        tx_ref: order.reference,
        amount: amountNaira,
        currency: 'NGN',
        redirect_url: `${site}/classes.html`,
        customer: {
          email: user.email,
          name: user.user_metadata?.full_name || user.email
        },
        meta: {
          user_id: user.id,
          cohort_id: order.cohort_id
        },
        customizations: {
          title: 'ThinkRight Class Enrollment',
          description: 'JAMB UTME Preparation Class'
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    const payment = await response.json();
    if (!response.ok || payment.status !== 'success' || !payment.data?.link) {
      throw new Error('Payment provider could not start checkout. Please retry.');
    }

    return json(200, {
      authorization_url: payment.data.link,
      reference: order.reference,
      expires_at: order.expires_at
    });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : 'Unable to process enrollment' });
  }
});
