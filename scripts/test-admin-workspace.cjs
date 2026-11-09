const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const {parseHTML}=require('linkedom');
const {window,document}=parseHTML('<html><body><main></main></body></html>');
let mobile=false;window.matchMedia=()=>({matches:mobile});
runInNewContext(readFileSync('js/admin-workspace.js','utf8'),{window,document,Intl,Date});
const workspace=window.ThinkRightAdminWorkspace;
const data={subjects:[{id:'english',name:'English'}],tutors:[{id:'teacher',display_name:'Teacher <script>x</script>',status:'pending',subjects:['english']}],classes:[{id:'class',title:'Reading',subject_id:'english',tutor_id:'teacher',price:3000}],revisions:[{cohort_id:'class',state:'in_review',body:{title:'Reading',subject_id:'english',proposed_price:3000,lessons:[{title:'Lesson'}]}}],banks:[{reviewed:false}],earnings:[{teacher_kobo:270000}],payouts:[{amount_kobo:100000}],enrollments:[],audit:[]};
const root=document.querySelector('main');
const render=(tab,extra={})=>{root.innerHTML=workspace.render({tab,body:'<section>Existing actions</section>',data,...extra});};
for(const tab of ['overview','teachers','reviews','payments','payouts','textbooks','news','broadcasts','audit','reconcile']){render(tab);assert.ok(root.querySelector('h1'));assert.equal(root.querySelector('script'),null);assert.equal(root.querySelector('.aw-navigation').hasAttribute('open'),true);}
render('overview');assert.equal(root.querySelector('[data-tab="pricing"]'),null);assert.equal(root.querySelectorAll('.aw-task').length,5);assert.match(root.querySelector('.aw-balance').textContent,/1,700/);assert.ok(root.querySelector('#admin-console'));
render('teachers');assert.equal(root.querySelectorAll('[data-aw-record]').length,1);root.querySelector('[data-aw-search]').value='absent';workspace.filter(root);assert.equal(root.querySelector('[data-aw-record]').hidden,true);assert.equal(root.querySelector('[data-aw-empty]').hidden,false);root.querySelector('[data-aw-search]').value='english';workspace.filter(root);assert.equal(root.querySelector('[data-aw-record]').hidden,false);
render('reviews');assert.ok(root.querySelector('[data-action="admin-class"]'));assert.match(root.querySelector('[data-aw-record]').textContent,/Reading/);
mobile=true;render('overview');assert.equal(root.querySelector('[data-tab="pricing"]'),null);assert.equal(root.querySelector('.aw-navigation').hasAttribute('open'),false);
render('teachers',{detail:{title:'Review teacher',content:'<form data-form="teacher-review"></form>'}});assert.ok(root.querySelector('[data-action="admin-review-back"]'));assert.ok(root.querySelector('[data-form="teacher-review"]'));assert.equal(root.querySelector('dialog'),null);
console.log('PASS redesigned admin: all sections, task counts, payout balance, record search, escaped names, mobile menu and full-page reviews.');

render('payouts');assert.equal(root.querySelector('[data-aw-panel="history"]').hidden,true);root.querySelector('[data-aw-pane="history"]').click();assert.equal(root.querySelector('[data-aw-panel="history"]').hidden,false);assert.equal(root.querySelector('[data-aw-panel="balances"]').hidden,true);assert.ok(root.querySelector('[data-action="reverse-payout"]'));

render("overview");assert.equal(root.querySelector(".aw-content").parentElement.className,"tw-admin-page aw-layout","Content must be outside the collapsible navigation");
