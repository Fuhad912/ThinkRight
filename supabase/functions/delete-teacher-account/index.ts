// Delete only the authenticated teacher's sign-in. Retain teaching/payment rows for students and payouts.
const env = (name: string) => Deno.env.get(name) || '';
export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin') || '';
  const allowed = ['https://thinkright.com.ng', 'https://www.thinkright.com.ng'].includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const headers = { 'content-type': 'application/json', 'access-control-allow-origin': allowed ? origin : 'https://thinkright.com.ng', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' };
  const reply = (status: number, message: string) => new Response(JSON.stringify({ message }), { status, headers });
  if (origin && !allowed) return reply(403, 'Origin not allowed');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, 'Method not allowed');
  const bearer = request.headers.get('authorization');
  if (!bearer?.startsWith('Bearer ')) return reply(401, 'Sign in again to continue.');
  try {
    const body = await request.text();
    if (body.length > 2048 || JSON.parse(body).confirmation !== 'DELETE') return reply(400, 'Type DELETE to confirm.');
    const base = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY'), service = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!base || !anon || !service) return reply(503, 'Account deletion is temporarily unavailable.');
    const userResponse = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, authorization: bearer }, signal: AbortSignal.timeout(15000) });
    if (!userResponse.ok) return reply(401, 'Sign in again to continue.');
    const user = await userResponse.json();
    if (!user.id || user.deleted_at) return reply(401, 'Sign in again to continue.');
    const signedIn = Date.parse(user.last_sign_in_at || '');
    if (!Number.isFinite(signedIn) || signedIn > Date.now() || Date.now() - signedIn > 10 * 60 * 1000) return reply(403, 'For account security, sign out and sign back in, then return here within 10 minutes to delete your account.');
    const identityResponse = await fetch(`${base}/rest/v1/rpc/workspace_identity`, { method: 'POST', headers: { apikey: anon, authorization: bearer, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
    if (!identityResponse.ok || (await identityResponse.json()).role !== 'teacher') return reply(403, 'Teacher account required.');
    const deletion = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' }, body: JSON.stringify({ should_soft_delete: true }), signal: AbortSignal.timeout(15000) });
    if (!deletion.ok) return reply(502, 'Your account could not be deleted. Please try again or contact support.');
    return reply(200, 'Account deleted.');
  } catch {
    return reply(400, 'The request could not be completed. Check your connection and try again.');
  }
}
Deno.serve(handler);
