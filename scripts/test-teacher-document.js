const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {runInNewContext} = require('node:vm');
(async () => {
  let uploads=0, signedExpiry;
  const window={supabase:{storage:{from:bucket=>{assert.equal(bucket,'teacher-credentials');return {
    upload:async(path,file,options)=>{uploads++;assert.equal(options.upsert,false);assert.equal(options.contentType,'application/pdf');assert.match(path,/^teacher\/.+\.pdf$/);return {data:{path}};},
    createSignedUrl:async(path,expiry)=>{signedExpiry=expiry;return {data:{signedUrl:'https://example.com/private-download'}};}
  };}}}};
  runInNewContext(readFileSync('js/teacher-document.js','utf8'),{window,crypto:require('node:crypto').webcrypto,Uint8Array,WeakMap});
  const api=window.ThinkRightDocuments;
  const valid=new File(['%PDF-1.7 certificate'],'certificate.pdf',{type:'application/pdf'});
  await api.validate(valid);
  await assert.rejects(()=>api.validate(new File([new Uint8Array(5*1024*1024+1)],'large.pdf',{type:'application/pdf'})),/5 MB/);
  await assert.rejects(()=>api.validate(new File(['hello'],'certificate.svg',{type:'image/svg+xml'})),/PDF, JPG or PNG/);
  await assert.rejects(()=>api.validate(new File(['not a PDF'],'fake.pdf',{type:'application/pdf'})),/does not match/);
  const doc=await api.upload(valid,'teacher');assert.equal(doc.credential_name,'certificate.pdf');
  assert.equal((await api.upload(valid,'teacher')).credential_path,doc.credential_path);assert.equal(uploads,1);
  assert.equal(await api.signedURL(doc.credential_path),'https://example.com/private-download');assert.equal(signedExpiry,300);
  console.log('PASS: document type, signature and 5 MB validation, private upload, retry reuse and expiring download');
})().catch(error=>{console.error(error);process.exitCode=1;});
