const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=readFileSync('js/teacher-workspace.js','utf8');
const handler=source.slice(source.indexOf('  async function submit(event)'),source.indexOf('  function wire(){'));
async function check(failure='',existing=false){
 const calls=[],errors=[];let finishUpload,heartbeat,uploadCount=0;
 const values={display_name:'Ada',whatsapp_number:'08012345678',bio:'Experienced physics teacher preparing JAMB students.',sample_video_url:'https://example.com/sample',subjects:'physics',application_legal_name:'Ada',application_declaration:'on'};
 if(failure==='validation')values.bio='';
 const form={dataset:{form:'profile'},querySelector:()=>({files:existing?[]:[{name:'certificate.pdf'}]})};
 const submitter={disabled:false};
 class Fields {constructor(){this.values=new Map(Object.entries(values));} [Symbol.iterator](){return this.values[Symbol.iterator]();} has(k){return this.values.has(k);} get(k){return this.values.get(k);} getAll(k){return this.values.has(k)?[this.values.get(k)]:[];}}
 const loader={show:()=>calls.push('show'),hold:()=>calls.push('hold'),setProgress:(n,label)=>calls.push(label),release:()=>calls.push('release'),done:()=>calls.push('done'),ribbonStart(){},ribbonDone(){}};
 const context={FormData:Fields,Object,String,Number,Math,Date,busy:false,user:{id:'teacher'},applicationFields:[['legal_name','Name']],dialog:{open:false},document:{body:{style:{}}},profileModalOpen:false,
   window:{ThinkRightLoader:loader,setInterval:fn=>{heartbeat=fn;return 1;},clearInterval:()=>calls.push('clear'),supabase:{from:()=>({select:()=>({limit:async()=>({})})})},ThinkRightDocuments:{upload:async()=>{uploadCount++;if(failure==='upload')throw Error('Upload failed');return await new Promise(resolve=>{finishUpload=()=>resolve({credential_path:'teacher/cert.pdf',credential_name:'certificate.pdf'});});}}},
   ownTutor:()=>({application:existing?{credential_path:'teacher/saved.pdf',credential_name:'saved.pdf'}:{}}),switchProfileEditorTab(){},safeURL:v=>v.startsWith('https://'),toast:m=>errors.push(m),action:async()=>{calls.push('save');if(failure==='save')throw Error('Save failed');},refresh:async()=>{calls.push('refresh');if(failure==='refresh')throw Error('Refresh failed');},shell:()=>calls.push('shell'),render:()=>calls.push('render')};
 runInNewContext(handler+';this.submit=submit;',context);
 const event={target:{closest:()=>form},submitter,preventDefault(){}};
 const pending=context.submit(event);
 for(let i=0;i<5;i++)await Promise.resolve();
 if(finishUpload){
   assert.equal(submitter.disabled,true);
   assert.equal(calls.includes('done'),false,'loader must remain until upload finishes');
   heartbeat();assert.equal(calls.filter(c=>c==='hold').length,2,'long uploads refresh loader hold');
   await context.submit(event);assert.equal(uploadCount,1,'duplicate submission must not upload twice');
   finishUpload();
 }
 await pending;
 assert.equal(context.busy,false);assert.equal(submitter.disabled,false);
 assert.ok(calls.includes('clear'));assert.ok(calls.includes('release'));assert.ok(calls.includes('done'));
 assert.ok(calls.indexOf('show')<calls.indexOf('done'));
 if(failure)assert.ok(errors.some(e=>/failed|characters/.test(e)));
 else{assert.ok(calls.indexOf('save')<calls.indexOf('refresh'));assert.ok(calls.indexOf('render')<calls.indexOf('done'));assert.ok(errors.includes('Saved successfully'));}
 if(failure==='upload'||failure==='validation')assert.equal(calls.includes('save'),false);
}
(async()=>{for(const failure of ['','upload','save','refresh','validation'])await check(failure);await check('',true);console.log('PASS: onboarding loader covers upload/save/refresh, long upload hold, existing certificate, duplicate submit and retry cleanup.');})().catch(error=>{console.error(error);process.exit(1);});
