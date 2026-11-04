import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.922.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.922.0';
import { inspectMP4 } from './mp4.ts';

const env = (key: string) => Deno.env.get(key) || '';
const base = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY'), anon = env('SUPABASE_ANON_KEY');
const bucket = env('R2_VIDEO_BUCKET');
const s3 = new S3Client({ region: 'auto', endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
const CHUNK = 10 * 1024 * 1024, MAX = 500 * 1024 * 1024;
const origins = [env('SITE_URL'), ...env('VIDEO_ALLOWED_ORIGINS').split(',')].map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const uuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function db(path: string, method = 'GET', body?: unknown, bearer = service) {
  const response = await fetch(`${base}/rest/v1/${path}`, { method, headers: { apikey: bearer === service ? service : anon, authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Video database request failed');
  return data;
}
async function parts(asset: any) {
  const result = await s3.send(new ListPartsCommand({ Bucket: bucket, Key: asset.object_key, UploadId: asset.upload_id }));
  return result.Parts || [];
}
async function allowed(bearer: string, fn: string, body: unknown) {
  if (!await db(`rpc/${fn}`, 'POST', body, bearer)) throw new Error('You do not have access to this video');
}
async function verify(asset: any) {
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.object_key }));
  if (head.ContentLength !== Number(asset.size_bytes) || head.ContentType !== 'video/mp4') throw new Error('Uploaded video size or type does not match');
  return await inspectMP4(Number(asset.size_bytes), async (start, end) => {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: asset.object_key, Range: `bytes=${start}-${end}` }));
    const bytes = await object.Body!.transformToByteArray();
    if (bytes.length !== end - start + 1) throw new Error('Incomplete video metadata');
    return bytes;
  });
}
export async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('origin') || '';
  const headers: Record<string,string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (origins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.includes(origin)) return json(403, { error: 'Origin is not allowed' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json(405, { error: 'POST required' });
  try {
    if (!bucket || !env('R2_ACCOUNT_ID') || !env('R2_ACCESS_KEY_ID') || !env('R2_SECRET_ACCESS_KEY')) return json(503, { error: 'Video uploads are not configured yet' });
    const bearer = (request.headers.get('authorization') || '').replace(/^Bearer /i, '');
    const body = await request.json();
    if (body.action === 'cleanup') {
      if (!env('VIDEO_CLEANUP_SECRET') || bearer !== env('VIDEO_CLEANUP_SECRET')) return json(401, { error: 'Unauthorized' });
      const candidates = await db('rpc/video_cleanup_claim', 'POST', {}); let removed = 0;
      for (const asset of candidates) {
        try {
          if (asset.upload_id) await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: asset.object_key, UploadId: asset.upload_id })).catch((e: any) => { if (e.name !== 'NoSuchUpload') throw e; });
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: asset.object_key }));
          await db(`video_assets?id=eq.${asset.id}&state=eq.deleting`, 'DELETE'); removed++;
        } catch { /* Leave deleting records for the next cleanup retry. */ }
      }
      return json(200, { removed });
    }
    const auth = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(15000) });
    if (!auth.ok) return json(401, { error: 'Please sign in again' });
    const user = await auth.json();
    if (body.action !== 'playback' && env('VIDEO_UPLOADS_ENABLED') !== 'true') return json(503, { error: 'Video uploads are temporarily unavailable' });
    if (body.action === 'initiate') {
      if (!uuid(body.cohort_id) || !uuid(body.lesson_id) || !Number.isSafeInteger(body.size_bytes) || body.size_bytes < 1 || body.size_bytes > MAX || body.content_type !== 'video/mp4' || !/^[a-f0-9]{64}$/.test(body.fingerprint || '')) throw new Error('Choose an MP4 video up to 500 MB');
      await allowed(bearer, 'video_upload_allowed', { p_cohort: body.cohort_id, p_lesson: body.lesson_id });
      const existing = await db(`video_assets?teacher_id=eq.${user.id}&cohort_id=eq.${body.cohort_id}&lesson_id=eq.${body.lesson_id}&fingerprint=eq.${body.fingerprint}&size_bytes=eq.${body.size_bytes}&state=in.(uploading,verifying,ready)&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
      if (existing[0]?.upload_id) return json(200, { asset_id: existing[0].id, chunk_size: CHUNK, state: existing[0].state });
      const active = await db(`video_assets?teacher_id=eq.${user.id}&state=in.(uploading,verifying)&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id`);
      if (active.length >= 10) throw new Error('Finish or cancel an existing upload first (maximum 10 active uploads)');
      const id = crypto.randomUUID(), key = `${user.id}/${body.cohort_id}/${body.lesson_id}/${id}.mp4`;
      // Persist intent before contacting R2 so abandoned multipart sessions have an owner.
      await db('video_assets', 'POST', { id, teacher_id: user.id, cohort_id: body.cohort_id, lesson_id: body.lesson_id, object_key: key, size_bytes: body.size_bytes, fingerprint: body.fingerprint, filename: String(body.filename || 'lesson.mp4').slice(0, 200) });
      const upload = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: 'video/mp4' }));
      try { await db(`video_assets?id=eq.${id}`, 'PATCH', { upload_id: upload.UploadId }); }
      catch (error) { await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: upload.UploadId })); throw error; }
      return json(200, { asset_id: id, chunk_size: CHUNK });
    }
    if (!uuid(body.asset_id)) throw new Error('Invalid video ID');
    const [asset] = await db(`video_assets?id=eq.${body.asset_id}&limit=1`);
    if (!asset) return json(404, { error: 'Video not found' });
    if (body.action === 'playback') {
      await allowed(bearer, 'video_playback_allowed', { p_asset: asset.id });
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: asset.object_key }), { expiresIn: 3600 });
      return json(200, { url, expires_at: Date.now() + 3600000 });
    }
    if (asset.teacher_id !== user.id) return json(403, { error: 'This upload belongs to another teacher' });
    await allowed(bearer, 'video_upload_allowed', { p_cohort: asset.cohort_id, p_lesson: asset.lesson_id });
    if (body.action === 'complete' && asset.state === 'ready') return json(200, { asset_id: asset.id, state: 'ready' });
    if (Date.parse(asset.expires_at) <= Date.now() || !['uploading','verifying'].includes(asset.state)) throw new Error('Upload expired or cancelled. Choose the file again to start a new upload.');
    if (body.action === 'cancel') {
      if (asset.upload_id) await s3.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: asset.object_key, UploadId: asset.upload_id })).catch((e: any) => { if (e.name !== 'NoSuchUpload') throw e; });
      await db(`video_assets?id=eq.${asset.id}`, 'PATCH', { state: 'failed', expires_at: new Date().toISOString() });
      return json(200, { cancelled: true });
    }
    if (body.action === 'status') return json(200, { parts: (await parts(asset)).map(p => ({ number: p.PartNumber, size: p.Size })), chunk_size: CHUNK });
    if (body.action === 'sign') {
      if (!Number.isInteger(body.part_number) || body.part_number < 1 || body.part_number > Math.ceil(asset.size_bytes / CHUNK)) throw new Error('Invalid upload chunk');
      const length = Math.min(CHUNK, asset.size_bytes - (body.part_number - 1) * CHUNK);
      const url = await getSignedUrl(s3, new UploadPartCommand({ Bucket: bucket, Key: asset.object_key, UploadId: asset.upload_id, PartNumber: body.part_number, ContentLength: length }), { expiresIn: 900 });
      return json(200, { url });
    }
    if (body.action === 'complete') {
      try {
        if (asset.state === 'uploading') {
          let uploaded;
          try { uploaded = await parts(asset); }
          catch (error: any) { if (error.name !== 'NoSuchUpload') throw error; }
          if (uploaded) {
            const count = Math.ceil(asset.size_bytes / CHUNK);
            if (uploaded.length !== count || uploaded.some((p, i) => p.PartNumber !== i + 1 || p.Size !== Math.min(CHUNK, asset.size_bytes - i * CHUNK))) throw new Error('Some video chunks are missing or have the wrong size');
            await s3.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: asset.object_key, UploadId: asset.upload_id, MultipartUpload: { Parts: uploaded.map(p => ({ ETag: p.ETag, PartNumber: p.PartNumber })) } })).catch((error: any) => { if (error.name !== 'NoSuchUpload') throw error; });
          }
          await db(`video_assets?id=eq.${asset.id}&state=eq.uploading`, 'PATCH', { state: 'verifying' });
        }
        const metadata = await verify(asset);
        const updated = await db(`video_assets?id=eq.${asset.id}&state=in.(verifying,ready)`, 'PATCH', { state: 'ready', ...metadata, error: null });
        if (!updated.length) throw new Error('Upload was cancelled');
        return json(200, { asset_id: asset.id, state: 'ready', ...metadata });
      } catch (error) {
        // Keep transient R2 failures retryable. Invalid media is retained for cleanup only.
        throw error;
      }
    }
    return json(400, { error: 'Unknown video operation' });
  } catch (error) {
    // Do not return provider errors containing signed URLs or credentials.
    const message = error instanceof Error ? error.message : '';
    const safe = /^(Choose|Export|Upload|Uploaded|Invalid MP4|Incomplete video|Truncated MP4|MP4 metadata|Some video|Finish or cancel|You do not|Invalid video|Invalid upload)/.test(message);
    return json(400, { error: safe ? message : 'Video request failed. Please retry.' });
  }
}
Deno.serve(handler);
