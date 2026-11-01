const {parseHTML}=require('linkedom');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const assert=require('node:assert/strict');
(async()=>{
 const {window,document}=parseHTML('<html><body><section id="root"></section></body></html>');
 let root=document.querySelector('#root');
 const workspace={subjects:[{id:'physics',name:'Physics'}],tutors:[],revisions:[],banks:[]};
 const snapshot={order_count:1,paid_count:1,pending_count:0,gross_kobo:100000,orders:[{reference:'TR-test',user_id:'student',subject_id:'physics',amount_kobo:100000,status:'paid',created_at:new Date().toISOString()}],books:[{id:'book',title:'Physics <script>unsafe</script>',subject_id:'physics',file_path:'book.pdf',image_url:'javascript:alert(1)',published:true}]};
 let denied=false;
 window.supabase={rpc:async name=>denied?{error:{message:'Admin access required'}}:{data:name==='workspace_snapshot'?workspace:snapshot}};
 runInNewContext(readFileSync('js/admin-console.js','utf8'),{window,document,URL,Intl,Date,console,FormData});
 for(const tab of ['overview','payments','textbooks']){
  root=document.createElement('section');document.body.replaceChildren(root);
  await window.ThinkRightAdminConsole.mount(root,tab,workspace);
  assert.ok(root.querySelector('h2'));
  assert.equal(root.querySelector('script'),null,'Book titles must remain text');
  assert.equal(root.querySelector('img[src^="javascript:"]'),null,'Untrusted image schemes must be rejected');
  if(tab==='overview'){
   for(const target of ['teachers','reviews','pricing','payouts','textbooks','news','audit']){
    const link=root.querySelector(`[href="#${target}"]`);
    assert.equal(link?.dataset.action,'admin-tab',`${target} must use workspace tab navigation`);
    assert.equal(link?.dataset.tab,target);
   }
  }
  if(tab==='payments'){
   const input=root.querySelector('#ac-order-search');input.value='no-match';input.dispatchEvent(new window.Event('input',{bubbles:true}));assert.ok(root.querySelector('[data-reference]').hidden);
  }
  if(tab==='textbooks'){root.querySelector('[data-ac=edit]').click();assert.equal(root.querySelector('[name=title]').value,snapshot.books[0].title);}
 }
 denied=true;document.body.append(root);await window.ThinkRightAdminConsole.mount(root,'payments',workspace);
 assert.match(root.textContent,/Admin records unavailable/);
 assert.equal(root.querySelector('table'),null,'Access failures cannot expose cached orders');
 console.log('Admin UI: overview, payment search, escaped content, image URL validation, editing and denied access passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
