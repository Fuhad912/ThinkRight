/* Private certificate uploads shared by the application and reviewer views. */
(() => {
  'use strict';
  const bucket = 'teacher-credentials', maxBytes = 5 * 1024 * 1024;
  const uploaded = new WeakMap();
  async function validate(file) {
    if (!file || !file.size) throw new Error('Choose a certificate document to upload.');
    if (file.size > maxBytes) throw new Error('Your document must be 5 MB or smaller.');
    const ext = file.name.split('.').pop().toLowerCase();
    const types = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
    if (!types[ext] || (file.type && file.type !== types[ext])) throw new Error('Choose a PDF, JPG or PNG document.');
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const valid = ext === 'pdf' ? [37,80,68,70,45].every((v,i)=>bytes[i]===v)
      : ext === 'png' ? [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
      : bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    if (!valid) throw new Error('This file does not match its format. Choose a valid PDF, JPG or PNG.');
    return { ext, contentType: types[ext] };
  }
  window.ThinkRightDocuments = {
    bucket, maxBytes, validate,
    async upload(file, userId) {
      const type = await validate(file);
      if (uploaded.has(file)) return uploaded.get(file);
      const path = `${userId}/${crypto.randomUUID()}.${type.ext}`;
      const response = await window.supabase.storage.from(bucket).upload(path, file, { contentType: type.contentType, upsert: false });
      if (response.error) throw new Error('Document upload failed. Please try again. If it keeps failing, contact ThinkRight support.');
      const document = { credential_path: path, credential_name: file.name.slice(0, 200) };
      uploaded.set(file, document);
      return document;
    },
    async signedURL(path) {
      const response = await window.supabase.storage.from(bucket).createSignedUrl(path, 300);
      if (response.error || !response.data?.signedUrl) throw new Error('The document could not be opened. Please try again.');
      return response.data.signedUrl;
    }
  };
})();
