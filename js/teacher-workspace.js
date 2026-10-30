/* ThinkRight teacher/admin workspace: all privileged writes use checked database RPCs. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = kobo => new Intl.NumberFormat('en-NG', {style:'currency',currency:'NGN',maximumFractionDigits:2}).format(Number(kobo || 0)/100);
  const date = value => value ? new Date(value).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Lagos'}) : 'Not set';
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date());
  const paths = {dashboard:'tutor-dashboard.html',classes:'tutor-classes.html',class:'tutor-class.html',students:'tutor-students.html',analytics:'tutor-analytics.html',discussions:'tutor-discussions.html',earnings:'tutor-payouts.html',profile:'tutor-onboarding.html',admin:'admin.html'};
  const titles = {dashboard:'Home',classes:'My classes',class:'Class studio',students:'Students',analytics:'Dashboard',discussions:'Discussions',earnings:'Earnings',profile:'Profile',admin:'Administration'};
  /* Font Awesome names shared with the student view (same CDN build). */
  const fa = {dashboard:'fa-house',classes:'fa-book-open',students:'fa-user-graduate',analytics:'fa-chart-line',discussions:'fa-comments',earnings:'fa-wallet',profile:'fa-id-badge',admin:'fa-shield-halved',plus:'fa-plus',arrow:'fa-arrow-right',arrowLeft:'fa-arrow-left',menu:'fa-bars',close:'fa-xmark',sun:'fa-sun',moon:'fa-moon',check:'fa-check',checkCircle:'fa-circle-check',up:'fa-chevron-up',down:'fa-chevron-down',logout:'fa-arrow-right-from-bracket',play:'fa-play',bell:'fa-bell',users:'fa-users',layers:'fa-layer-group',clock:'fa-clock',flag:'fa-flag',question:'fa-circle-question',trend:'fa-arrow-trend-up',trendDown:'fa-arrow-trend-down',money:'fa-naira-sign',bank:'fa-building-columns',help:'fa-life-ring'};
  const icon = name => `<i class="fa-solid ${name==='analytics'?'fa-chart-pie':name==='menu'?'fa-ellipsis':fa[name] || 'fa-book-open'} tw-i" aria-hidden="true"></i>`;
  const button = (text, action, extra='', type='') => `<button type="button" class="tw-button ${type}" data-action="${action}" ${extra}>${text}</button>`;
  const link = (text, href, primary=false) => `<a class="tw-button ${primary?'primary':''}" href="${esc(href)}">${text}</a>`;
  const tag = state => `<span class="tw-tag ${esc(state)}">${esc(String(state || 'draft').replaceAll('_',' '))}</span>`;
  const empty = (title, text, action='') => `<div class="tw-empty">${icon('classes')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  const panel = (title, subtitle, content, action='') => `<section class="tw-panel"><div class="tw-panel-head"><div><h2>${title}</h2><p>${subtitle}</p></div>${action}</div>${content}</section>`;
  const field = (label, name, value='', type='text', extra='') => `<label class="tw-field"><span>${label}</span><input class="tw-input" name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const textArea = (label,name,value='',extra='') => `<label class="tw-field"><span>${label}</span><textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;
  const safeURL = value => {try{const url=new URL(value);return url.protocol==='https:'?url.href:'';}catch{return '';}};
  let page = document.body.dataset.workspacePage, data, user, draft, draftId, draftVersion=1, step=0, dirty=false, busy=false;
  let search='', statusFilter='all', subjectFilter='all', classFilter='all', period='30', fromDate='', toDate='', adminTab='reviews', profileTab='overview', profileModalOpen=false, profileEditorTab='about';
  const root = $('#workspace-root'), dialog = $('#workspace-dialog');
  const subject = id => data.subjects.find(s=>s.id===id);
  const cohort = id => data.classes.find(c=>c.id===id);
  const revision = id => data.revisions.find(r=>r.cohort_id===id);
  const tutor = id => data.tutors.find(t=>t.id===id);
  const student = id => data.students.find(s=>s.id===id)?.username || 'Student';
  const ownTutor = () => tutor(user.id) || {};
  const currentEnrollments = id => data.enrollments.filter(e=>(!id||e.cohort_id===id)&&e.status==='active'&&(!e.expires_at||new Date(e.expires_at)>new Date()));
  const lessons = id => data.lessons.filter(l=>l.cohort_id===id);
  const completion = (id, uid) => {const ls=lessons(id);if(!ls.length)return null;return Math.round(100*ls.filter(l=>data.progress.some(p=>p.lesson_id===l.id&&p.user_id===uid)).length/ls.length);};
  const stat = (name,value,hint) => `<div class="tw-stat"><span>${name}</span><strong>${value}</strong><small>${hint}</small></div>`;
  const progress = value => value===null?'<span class="tw-hint">No published lessons</span>':`<div class="tw-progress-label"><span>Lesson completion</span><span>${value}%</span></div><div class="tw-progress"><span style="width:${value}%"></span></div>`;
  function toast(message){const el=$('#workspace-toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),4500);}
  const fallbackSubjects=[{id:'english',name:'Use of English',enrollment_price:1000},{id:'math',name:'Mathematics',enrollment_price:1000},{id:'physics',name:'Physics',enrollment_price:1000},{id:'chemistry',name:'Chemistry',enrollment_price:1000},{id:'biology',name:'Biology',enrollment_price:1000},{id:'economics',name:'Economics',enrollment_price:1000},{id:'government',name:'Government',enrollment_price:1000},{id:'literature',name:'Literature in English',enrollment_price:1000}];
  async function rpc(name,args={}){const response=await window.supabase.rpc(name,args);if(response.error)throw new Error(response.error.message);return response.data;}
  async function refresh(fallbackIdentity){
    try{
      data=await rpc('workspace_snapshot');
    }catch(_err){
      const idObj=fallbackIdentity||data?.identity||{role:'teacher',status:'active',name:user?.user_metadata?.username||user?.email?.split('@')[0]||'Educator'};
      const safeSelect=async(table,col='*')=>{try{if(!window.supabase?.from)return[];const r=await window.supabase.from(table).select(col);return r.data||[];}catch{return[];}};
      const [subjects,tutors,classes,enrollments,lessons,progress,posts]=await Promise.all([safeSelect('subjects'),safeSelect('tutors'),safeSelect('cohorts'),safeSelect('enrollments'),safeSelect('lessons'),safeSelect('lesson_progress'),safeSelect('cohort_posts')]);
      const ownClasses=idObj.role==='admin'?classes:classes.filter(c=>!c.tutor_id||c.tutor_id===user?.id);
      const revisions=ownClasses.map(c=>({cohort_id:c.id,version:1,state:c.published?'published':'draft',body:{title:c.title||'',subject_id:c.subject_id||'physics',description:c.description||'',start_date:c.start_date||today(),whatsapp_link:c.whatsapp_link||'',lessons:lessons.filter(l=>l.cohort_id===c.id)}}));
      data={identity:idObj,subjects:subjects.length?subjects:fallbackSubjects,tutors:tutors.length?tutors:(user?[{id:user.id,display_name:idObj.name||'Educator',subjects:['physics'],status:idObj.status||'active'}]:[]),classes:ownClasses,revisions,students:[],enrollments,progress,lessons,posts,banks:[],earnings:[],payouts:[],audit:[]};
    }
  }
  async function action(name,payload){return rpc('workspace_action',{p_action:name,p_data:payload});}
  function applyTheme(dark){
    const mode=dark?'dark':'light';
    document.documentElement.dataset.theme=mode;
    document.documentElement.setAttribute('data-theme',mode);
    document.body.classList.toggle('dark',dark);
    document.body.classList.toggle('tr-dark',dark);
    try{localStorage.setItem('theme',mode);localStorage.setItem('thinkright_theme',mode);}catch(_e){}
    const dualIcons = '<i class="fa-solid fa-sun tr-navbar__icon-sun" aria-hidden="true"></i><i class="fa-solid fa-moon tr-navbar__icon-moon" aria-hidden="true"></i>';
    for(const btn of document.querySelectorAll('.tw-theme-btn')){
      if(!btn.querySelector('.tr-navbar__icon-sun')){
        btn.innerHTML = dualIcons;
      }
    }
    for(const lbl of document.querySelectorAll('.tw-theme-label')){
      lbl.textContent = dark ? 'Light mode' : 'Dark mode';
    }
    if(page==='analytics')initAnalyticsCharts();
  }
  function dismissPreloader(){
    window.ThinkRightLoader?.done('Workspace ready');
    const loader=$('#tr-preloader');
    if(loader&&!loader.classList.contains('is-hidden')){
      loader.classList.add('is-hiding');
      setTimeout(()=>{
        loader.classList.add('is-hidden');
        loader.setAttribute('aria-hidden','true');
        document.body.classList.remove('tr-loading');
      },420);
    }else{
      document.body.classList.remove('tr-loading');
    }
  }
  function head(eyebrow,title,description,actions=''){return `<header class="tw-page-head"><div>${eyebrow?`<span class="tw-eyebrow">${eyebrow}</span>`:''}<h1>${title}</h1><p>${description}</p></div><div class="tw-actions">${actions}</div></header>`;}
  function shell(){
    const admin=data.identity.role==='admin', name=ownTutor().display_name||data.identity.name||user.email?.split('@')[0]||'Educator';
    const navKeys=admin?['admin']:['dashboard','classes','students','discussions','earnings','profile'];
    const isDark = document.documentElement.dataset.theme === 'dark' || document.documentElement.getAttribute('data-theme') === 'dark';
    const unansweredCount = (data.posts||[]).filter(post=>!post.parent_id&&!post.resolved&&!(data.posts||[]).some(reply=>reply.parent_id===post.id)).length;
    const badges = {
      classes: (data.classes||[]).length ? String((data.classes||[]).length) : '',
      discussions: unansweredCount ? String(unansweredCount) : ''
    };
    const statusLabel = admin ? 'Super Admin' : (data.identity.status==='active' ? 'Verified Educator' : (data.identity.status==='pending' ? 'Application Pending' : 'Account Suspended'));
    const statusClass = admin ? 'admin' : (data.identity.status||'pending');

    root.innerHTML=`<div class="tw-scrim" data-action="close-menu"></div><aside class="tw-sidebar" id="teacher-navigation" aria-label="${admin?'Admin':'Teacher'} mobile navigation"><button class="tw-icon-btn tw-drawer-theme-btn tw-drawer-theme-top" data-action="theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode"><i class="fa-solid fa-sun tr-navbar__icon-sun" aria-hidden="true"></i><i class="fa-solid fa-moon tr-navbar__icon-moon" aria-hidden="true"></i></button><button class="tw-icon-btn tw-drawer-close" data-action="close-menu" aria-label="Close navigation">${icon('close')}</button><div class="tw-brand-block"><a class="tw-brand" href="${paths[admin?'admin':'dashboard']}">ThinkRight</a></div><nav class="tw-nav">${navKeys.map(key=>{const b=badges[key]?`<span class="tw-nav-badge">${badges[key]}</span>`:'';return `<a href="${paths[key]}" ${page===key||(page==='class'&&key==='classes')?'aria-current="page"':''}><span class="tw-nav-icon">${icon(key)}</span><span class="tw-nav-label">${titles[key]}</span>${b}</a>`;}).join('')}</nav><div class="tw-sidebar-foot"><div class="tw-foot-tools"><a class="tw-foot-btn" href="mailto:thinkright912@gmail.com" aria-label="Contact support" title="Contact support"><i class="fa-solid fa-life-ring tw-i" aria-hidden="true"></i><span>Support</span></a></div><div class="tw-user"><span class="tw-avatar">${esc(name.slice(0,1).toUpperCase())}<i class="tw-avatar-dot ${statusClass}" title="${statusLabel}" aria-label="${statusLabel}"></i></span><strong title="${esc(name)}">${esc(name)}</strong><button class="tw-foot-btn tw-logout-btn" data-action="logout" type="button" aria-label="Sign out" title="Sign out">${icon('logout')}</button></div></div></aside><header id="tr-navbar" class="tr-navbar tw-header" role="navigation" aria-label="${admin?'Admin':'Teacher'} main navigation"><div class="tr-navbar__container"><a href="${paths[admin?'admin':'dashboard']}" class="tr-navbar__logo tw-brand" aria-label="ThinkRight Home"><span class="tr-navbar__brand">ThinkRight</span></a><ul class="tr-navbar__nav" role="list"><li><a href="${paths[admin?'admin':'dashboard']}" class="tr-navbar__link tr-navbar__link--home" title="Home" aria-label="Home"><i class="fa-solid fa-house"></i></a></li>${navKeys.map(key=>{const isActive=page===key||(page==='class'&&key==='classes');const b=badges[key]?`<span class="tw-nav-badge">${badges[key]}</span>`:'';return `<li><a href="${paths[key]}" class="tr-navbar__link${isActive?' active':''}" ${isActive?'aria-current="page"':''}>${titles[key]}${b}</a></li>`;}).join('')}</ul><div id="tr-user-info" class="tr-navbar__user-info"><div class="tr-navbar__user-avatar" title="${esc(name)} · ${statusLabel}"><span class="tr-navbar__avatar-initial">${esc(name.slice(0,1).toUpperCase())}</span><i class="tw-avatar-dot ${statusClass}" title="${statusLabel}" aria-label="${statusLabel}"></i></div><button id="tr-logout-btn" class="tr-navbar__logout-btn" data-action="logout" type="button" title="Logout" aria-label="Logout"><i class="fa-solid fa-arrow-right-from-bracket"></i><span>Logout</span></button></div><button id="tr-theme-toggle" class="tr-navbar__theme-btn tw-theme-btn" data-action="theme" aria-label="Toggle dark mode" title="Toggle dark mode" type="button"><i class="fa-solid fa-sun tr-navbar__icon-sun" aria-hidden="true"></i><i class="fa-solid fa-moon tr-navbar__icon-moon" aria-hidden="true"></i></button><button id="tr-hamburger" class="tr-navbar__hamburger tw-mobile-menu" data-action="menu" aria-label="Toggle navigation menu" aria-controls="teacher-navigation" aria-expanded="false" type="button"><span class="tr-navbar__hamburger-line"></span><span class="tr-navbar__hamburger-line"></span><span class="tr-navbar__hamburger-line"></span></button></div></header><main id="workspace-main" class="tw-main" tabindex="-1"></main><nav class="tw-bottom-nav" aria-label="Quick navigation">${(admin?['admin','profile','earnings']:['dashboard','classes','earnings']).map(key=>`<a href="${admin?'admin.html#'+(key==='profile'?'teachers':key==='earnings'?'payouts':'reviews'):paths[key]}" ${page===key?'aria-current="page"':''}>${icon(key)}<span>${admin?({admin:'Reviews',profile:'Teachers',earnings:'Payouts'}[key]):titles[key]}</span></a>`).join('')}<button data-action="menu" aria-label="More navigation">${icon('menu')}<span>More</span></button></nav>`;
    if(!admin){
      root.querySelector('.tr-navbar__link--home')?.closest('li')?.remove();
      root.querySelector(`.tr-navbar__nav a[href="${paths.dashboard}"]`)?.insertAdjacentHTML('afterbegin',icon('dashboard'));
    }
  }
  function notice(){return data.identity.status==='pending'?'<div class="tw-notice">Your teacher application is under review. You can prepare drafts while ThinkRight reviews your profile.</div>':data.identity.status==='suspended'?'<div class="tw-notice error">Your teaching account is suspended. Existing records remain available; contact ThinkRight for support.</div>':'';}
  let teacherEnrollmentChartInst = null, teacherCompletionChartInst = null;
  function initDashboardCharts(){
    if(typeof Chart==='undefined')return;
    try{
      const isDark=document.documentElement.dataset.theme==='dark'||document.documentElement.getAttribute('data-theme')==='dark';
      const textColor=isDark?'#d0d5dd':'#475467';
      const gridColor=isDark?'rgba(255,255,255,0.08)':'rgba(16,24,40,0.06)';
      const accentColor=isDark?'#3b82f6':'#1d4ed8';
      const accentSoft=isDark?'rgba(59,130,246,0.22)':'rgba(29,78,216,0.12)';
      const enrollCanvas=document.getElementById('teacherEnrollmentChart');
      if(enrollCanvas){
        if(teacherEnrollmentChartInst){try{teacherEnrollmentChartInst.destroy();}catch(_){}teacherEnrollmentChartInst=null;}
        const days=[],counts=[],now=new Date();
        for(let i=13;i>=0;i--){
          const d=new Date(now.getTime()-i*86400000);
          const key=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(d);
          const label=new Intl.DateTimeFormat('en-NG',{day:'numeric',month:'short',timeZone:'Africa/Lagos'}).format(d);
          days.push(label);
          const c=(data?.enrollments||[]).filter(e=>{
            if(!e.enrolled_at)return false;
            const eKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date(e.enrolled_at));
            return eKey===key;
          }).length;
          counts.push(c);
        }
        teacherEnrollmentChartInst=new Chart(enrollCanvas,{
          type:'line',
          data:{labels:days,datasets:[{label:'Enrollments',data:counts,borderColor:accentColor,backgroundColor:accentSoft,borderWidth:2.5,fill:true,tension:0.35,pointBackgroundColor:accentColor,pointRadius:3,pointHoverRadius:6}]},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{padding:10,cornerRadius:8}},scales:{x:{grid:{color:gridColor},ticks:{color:textColor,font:{family:'Manrope',size:10}}},y:{beginAtZero:true,grid:{color:gridColor},ticks:{color:textColor,precision:0,font:{family:'Manrope',size:10}}}}}
        });
      }
      const compCanvas=document.getElementById('teacherCompletionChart');
      if(compCanvas){
        if(teacherCompletionChartInst){try{teacherCompletionChartInst.destroy();}catch(_){}teacherCompletionChartInst=null;}
        const enroll=currentEnrollments(),tiers={'0-25%':0,'26-50%':0,'51-75%':0,'76-100%':0};
        enroll.forEach(e=>{
          const c=completion(e.cohort_id,e.user_id);
          if(c===null)return;
          if(c<=25)tiers['0-25%']++;else if(c<=50)tiers['26-50%']++;else if(c<=75)tiers['51-75%']++;else tiers['76-100%']++;
        });
        teacherCompletionChartInst=new Chart(compCanvas,{
          type:'bar',
          data:{labels:Object.keys(tiers),datasets:[{label:'Students',data:Object.values(tiers),backgroundColor:['rgba(245,158,11,0.75)','rgba(59,130,246,0.75)','rgba(99,102,241,0.75)','rgba(16,185,129,0.75)'],borderRadius:6,borderSkipped:false}]},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{padding:10,cornerRadius:8}},scales:{x:{grid:{display:false},ticks:{color:textColor,font:{family:'Manrope',size:11}}},y:{beginAtZero:true,grid:{color:gridColor},ticks:{color:textColor,precision:0,font:{family:'Manrope',size:10}}}}}
        });
      }
    }catch(_){}
  }
  let analyticsEnrollmentChartInst = null, analyticsCompletionChartInst = null;
  function initAnalyticsCharts(){
    if(typeof Chart==='undefined')return;
    try{
      const isDark=document.documentElement.dataset.theme==='dark'||document.documentElement.getAttribute('data-theme')==='dark';
      const textColor=isDark?'#d0d5dd':'#475467';
      const gridColor=isDark?'rgba(255,255,255,0.08)':'rgba(16,24,40,0.06)';
      const accentColor=isDark?'#3b82f6':'#1d4ed8';
      const enrollCanvas=document.getElementById('analyticsEnrollmentChart');
      if(enrollCanvas){
        if(analyticsEnrollmentChartInst){try{analyticsEnrollmentChartInst.destroy();}catch(_){}analyticsEnrollmentChartInst=null;}
        const ids=filteredClasses().map(c=>c.id);
        const enroll=data.enrollments.filter(e=>ids.includes(e.cohort_id)&&inPeriod(e.enrolled_at));
        const buckets=new Map();
        enroll.forEach(e=>{
          const key=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date(e.enrolled_at));
          buckets.set(key,(buckets.get(key)||0)+1);
        });
        const points=[...buckets].sort((a,b)=>a[0].localeCompare(b[0]));
        const recent=points.slice(-14);
        const labels=recent.length?recent.map(p=>p[0].slice(5)):['No enrollments'];
        const counts=recent.length?recent.map(p=>p[1]):[0];
        analyticsEnrollmentChartInst=new Chart(enrollCanvas,{
          type:'bar',
          data:{labels,datasets:[{label:'Enrollments',data:counts,backgroundColor:accentColor,borderRadius:6}]},
          options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:gridColor},ticks:{color:textColor,font:{family:'Manrope',size:10}}},y:{beginAtZero:true,grid:{color:gridColor},ticks:{color:textColor,precision:0,font:{family:'Manrope',size:10}}}}}
        });
      }
      const compCanvas=document.getElementById('analyticsCompletionChart');
      if(compCanvas){
        if(analyticsCompletionChartInst){try{analyticsCompletionChartInst.destroy();}catch(_){}analyticsCompletionChartInst=null;}
        const ids=filteredClasses().map(c=>c.id);
        const active=currentEnrollments().filter(e=>ids.includes(e.cohort_id));
        const labels=[],dataVals=[];
        ids.slice(0,6).forEach(id=>{
          const c=cohort(id);
          const values=active.filter(e=>e.cohort_id===id).map(e=>completion(id,e.user_id)).filter(x=>x!==null);
          const rate=values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;
          labels.push((c?.title||'Class').slice(0,18));
          dataVals.push(rate);
        });
        analyticsCompletionChartInst=new Chart(compCanvas,{
          type:'bar',
          data:{labels:labels.length?labels:['No classes'],datasets:[{label:'Completion %',data:dataVals.length?dataVals:[0],backgroundColor:isDark?'#10b981':'#059669',borderRadius:6}]},
          options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100,grid:{color:gridColor},ticks:{color:textColor,font:{family:'Manrope',size:10},callback:v=>v+'%'}},y:{grid:{display:false},ticks:{color:textColor,font:{family:'Manrope',size:10}}}}}
        });
      }
    }catch(_){}
  }
  function dashboard(){
    const active=data.classes.filter(c=>c.published&&c.status!=='closed');
    const enroll=currentEnrollments();
    const averages=enroll.map(e=>completion(e.cohort_id,e.user_id)).filter(value=>value!==null);
    const avg=averages.length?Math.round(averages.reduce((sum,value)=>sum+value,0)/averages.length):null;
    const earnings=data.earnings.reduce((sum,entry)=>sum+Number(entry.teacher_kobo),0);
    const unanswered=data.posts.filter(post=>!post.parent_id&&!post.resolved&&!data.posts.some(reply=>reply.parent_id===post.id));
    const profile=ownTutor();
    const steps=[
      {label:'Complete teaching profile',done:Boolean(profile.bio&&profile.whatsapp_number&&profile.sample_video_url&&(profile.subjects||[]).length),href:paths.profile,icon:'fa-id-badge'},
      {label:'Add payout account',done:Boolean(data.banks.length),href:paths.earnings,icon:'fa-building-columns'},
      {label:'Create your first class',done:Boolean(data.classes.length),href:paths.class,icon:'fa-book-open'},
      {label:'Submit class for review',done:data.classes.some(c=>c.published)||data.revisions.some(r=>r.state==='in_review'||r.state==='published'),href:paths.classes,icon:'fa-paper-plane'}
    ];
    const stepsDone=steps.filter(item=>item.done).length;
    const changes=data.revisions.filter(r=>r.state==='changes_requested');
    const lead=data.identity.status==='suspended'
      ? {label:'Account status',title:'Teaching is paused',text:'Contact support for help with your account.',action:'Contact support',href:'mailto:thinkright912@gmail.com',icon:'fa-circle-exclamation'}
      : !steps[0].done
        ? {label:'Your next step',title:'Share what you know.',text:'Complete your profile and start your teaching journey.',action:'Complete profile',href:paths.profile,icon:'fa-chalkboard-user'}
        : changes.length
          ? {label:'Your next step',title:'A little polish. A big impact.',text:'Your class has feedback ready to review.',action:'Review feedback',href:`${paths.class}?id=${changes[0].cohort_id}`,icon:'fa-pen-to-square'}
          : unanswered.length
            ? {label:'Your next step',title:'Keep the learning going.',text:`${unanswered.length} student ${unanswered.length===1?'question needs':'questions need'} your reply.`,action:'Answer questions',href:paths.discussions,icon:'fa-comments'}
            : !data.classes.length
              ? {label:'Your next step',title:'Great lessons start with you.',text:'Turn your expertise into your first class.',action:'Create a class',href:paths.class,icon:'fa-chalkboard-user'}
              : {label:'Your teaching space',title:'Make room for the next big idea.',text:'Pick up a class and keep your students moving forward.',action:'Open my classes',href:paths.classes,icon:'fa-chalkboard-user'};
    const learnerCount=new Set(enroll.map(e=>e.user_id)).size;
    const weekAgo=Date.now()-7*86400000;
    const newThisWeek=enroll.filter(e=>e.enrolled_at&&new Date(e.enrolled_at).getTime()>=weekAgo).length;
    const hour=Number(new Intl.DateTimeFormat('en-NG',{hour:'numeric',hour12:false,timeZone:'Africa/Lagos'}).format(new Date()));
    const greeting=hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
    const teacherName=esc((profile.display_name||data.identity.name||'Educator').trim().split(/\s+/)[0]);
    const todayLabel=new Intl.DateTimeFormat('en-NG',{weekday:'short',day:'numeric',month:'short',timeZone:'Africa/Lagos'}).format(new Date());
    const metrics=[
      {label:'Students',value:learnerCount,icon:'fa-users',tone:'blue',href:paths.students},
      {label:'Live classes',value:active.length,icon:'fa-book-open',tone:'violet',href:paths.classes},
      {label:'Net earnings',value:money(earnings),icon:'fa-wallet',tone:'green',href:paths.earnings},
      {label:'Avg. completion',value:avg===null?'—':avg+'%',icon:'fa-chart-pie',tone:'amber',href:paths.analytics}
    ];
    const classList=data.classes.slice(0,3).map(item=>{
      const current=revision(item.id),state=current?.state||(item.published?'published':'draft');
      return `<a class="tw-dash-class" href="${paths.class}?id=${item.id}"><span class="tw-home-icon tw-home-icon--violet" aria-hidden="true"><i class="fa-solid fa-book-open"></i></span><span class="tw-dash-class-copy"><strong>${esc(current?.body.title||item.title)}</strong><small>${esc(subject(current?.body.subject_id||item.subject_id)?.name||'Class')} · ${currentEnrollments(item.id).length} students</small></span>${tag(state)}${icon('arrow')}</a>`;
    }).join('');
    const waiting=unanswered.slice(0,3).map(post=>`<a class="tw-question-item" href="${paths.discussions}"><div class="tw-question-top"><span class="tw-dash-avatar" aria-hidden="true">${esc(student(post.author_id).slice(0,1).toUpperCase())}</span><span class="tw-question-author">${esc(student(post.author_id))}<small>${esc(cohort(post.cohort_id)?.title||'Class')}</small></span>${icon('arrow')}</div><p class="tw-question-body">${esc(post.body.slice(0,100))}${post.body.length>100?'…':''}</p></a>`).join('');
    const recent=enroll.slice(0,3).map(entry=>`<div class="tw-dash-activity"><span class="tw-dash-avatar" aria-hidden="true">${esc(student(entry.user_id).slice(0,1).toUpperCase())}</span><span><strong>${esc(student(entry.user_id))}</strong><small>${esc(cohort(entry.cohort_id)?.title||'Class enrollment')}</small></span><time>${date(entry.enrolled_at)}</time></div>`).join('');
    const tools=[
      {title:'Student progress',text:'See how they are doing',icon:'fa-chart-line',tone:'green',href:paths.analytics},
      {title:'Earnings & payouts',text:'Your teaching, rewarded',icon:'fa-wallet',tone:'amber',href:paths.earnings},
      {title:'Teaching profile',text:'Make it yours',icon:'fa-id-badge',tone:'violet',href:paths.profile}
    ];
    return `<div class="tw-dashboard tw-teacher-home">
      <header class="tw-teacher-home-intro"><div><h1>${greeting}, ${teacherName} <i class="fa-solid fa-hand" aria-hidden="true"></i></h1><p>A little inspiration. A lasting impact.</p></div><span class="tw-home-date"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${todayLabel}</span></header>
      ${data.identity.status==='pending'?'<div class="tw-home-account-note"><i class="fa-solid fa-clock" aria-hidden="true"></i><span>Your teacher application is under review. You can prepare drafts while ThinkRight reviews your profile.</span></div>':''}
      <section class="tw-teacher-home-hero" aria-labelledby="tw-home-next-title"><div class="tw-teacher-home-focus"><h2 id="tw-home-next-title">${esc(lead.title)}</h2><p>${esc(lead.text)}</p><a href="${lead.href}" class="tw-teacher-home-cta">${esc(lead.action)} ${icon('arrow')}</a></div><div class="tw-teacher-home-impact"><span class="tw-home-impact-icon" aria-hidden="true"><i class="fa-solid fa-user-graduate"></i></span><strong>+${newThisWeek}</strong><p>new ${newThisWeek===1?'student':'students'} this week</p></div></section>
      <section class="tw-home-overview" aria-label="Teaching overview">${metrics.map(m=>`<a class="tw-home-metric" href="${m.href}"><span class="tw-home-icon tw-home-icon--${m.tone}" aria-hidden="true"><i class="fa-solid ${m.icon}"></i></span><span><strong>${esc(m.value)}</strong><small>${m.label}</small></span></a>`).join('')}</section>
      ${stepsDone<4&&data.identity.status!=='suspended'?`<details class="tw-home-setup"><summary><span class="tw-home-icon tw-home-icon--blue" aria-hidden="true"><i class="fa-solid fa-list-check"></i></span><span class="tw-home-setup-title">Finish setting up</span><span class="tw-home-setup-track" aria-hidden="true"><span style="width:${stepsDone*25}%"></span></span><span class="tw-home-setup-count">${stepsDone} of 4 complete</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary><div class="tw-home-setup-steps">${steps.filter(s=>!s.done).map(s=>`<a href="${s.href}"><i class="fa-solid ${s.icon}" aria-hidden="true"></i><span>${s.label}</span>${icon('arrow')}</a>`).join('')}</div></details>`:''}
      <div class="tw-teacher-home-content">
        <section class="tw-teacher-home-classes" aria-labelledby="tw-home-classes-title"><div class="tw-teacher-home-section-head"><h2 id="tw-home-classes-title"><i class="fa-solid fa-book-open" aria-hidden="true"></i> My classes</h2><a href="${paths.classes}">View all ${icon('arrow')}</a></div>${classList?`<div class="tw-dash-list">${classList}</div>`:`<div class="tw-home-empty"><span class="tw-home-empty-art" aria-hidden="true"><i class="fa-solid fa-book-open"></i><i class="fa-solid fa-star"></i></span><h3>Your next great class starts here</h3><p>Bring your subject to life, one lesson at a time.</p><a class="tw-button primary" href="${paths.class}">${icon('plus')} Create a class</a></div>`}</section>
        <section class="tw-teacher-home-questions" aria-labelledby="tw-home-questions-title"><div class="tw-teacher-home-section-head"><h2 id="tw-home-questions-title"><i class="fa-solid fa-comments" aria-hidden="true"></i> Questions <span class="tw-home-count">${unanswered.length}</span></h2><a href="${paths.discussions}">View all ${icon('arrow')}</a></div>${waiting?`<div class="tw-dash-questions">${waiting}</div>`:`<div class="tw-home-empty tw-home-empty--quiet"><span class="tw-home-empty-art" aria-hidden="true"><i class="fa-regular fa-comments"></i><i class="fa-solid fa-check"></i></span><h3>You're all caught up</h3><p>Student questions will appear here.</p></div>`}</section>
      </div>
      <section class="tw-home-tools" aria-labelledby="tw-home-tools-title"><h2 id="tw-home-tools-title">Your teaching toolkit</h2><div class="tw-home-tools-grid">${tools.map(t=>`<a href="${t.href}"><span class="tw-home-icon tw-home-icon--${t.tone}" aria-hidden="true"><i class="fa-solid ${t.icon}"></i></span><span><strong>${t.title}</strong><small>${t.text}</small></span>${icon('arrow')}</a>`).join('')}</div></section>
      ${recent?`<section class="tw-home-recent" aria-labelledby="tw-home-recent-title"><div class="tw-teacher-home-section-head"><h2 id="tw-home-recent-title">Recent enrollments</h2><a href="${paths.students}">All students ${icon('arrow')}</a></div><div class="tw-dash-activity-list">${recent}</div></section>`:''}
    </div>`;
  }
  function filters(withStatus=false,withDates=false){return `<div class="tw-filterbar"><label><span>Search</span><input class="tw-input" id="workspace-search" placeholder="Search ${page==='students'?'students':'classes'}…" value="${esc(search)}"></label><label><span>Subject</span><select data-filter="subject">${options([['all','All subjects'],...data.subjects.map(s=>[s.id,s.name])],subjectFilter)}</select></label>${withStatus?`<label><span>Status</span><select data-filter="status">${options(['all','draft','in_review','changes_requested','published'].map(s=>[s,s==='all'?'All statuses':s.replaceAll('_',' ')]),statusFilter)}</select></label>`:''}${withDates?`<label><span>Class</span><select data-filter="class">${options([['all','All classes'],...data.classes.map(c=>[c.id,c.title])],classFilter)}</select></label><label><span>Period</span><select data-filter="period">${options([['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days'],['custom','Custom dates']],period)}</select></label>${period==='custom'?`<label><span>From</span><input class="tw-input" type="date" data-filter="from" value="${esc(fromDate)}"></label><label><span>To</span><input class="tw-input" type="date" data-filter="to" value="${esc(toDate)}"></label>`:''}`:''}</div>`;}
  function options(items,value){return items.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(label)}</option>`).join('');}
  function filteredClasses(){return data.classes.filter(c=>{const r=revision(c.id);return (subjectFilter==='all'||(r?.body.subject_id||c.subject_id)===subjectFilter)&&(classFilter==='all'||c.id===classFilter)&&(statusFilter==='all'||r?.state===statusFilter)&&`${r?.body.title||c.title} ${subject(c.subject_id)?.name}`.toLowerCase().includes(search.toLowerCase());});}
  function classCards(){
    const stateOf=item=>revision(item.id)?.state||'published';
    const classBodyOf=item=>revision(item.id)?.body||item;
    const statusNames={draft:'Draft',in_review:'In review',changes_requested:'Changes requested',published:'Published'};
    const base=data.classes.filter(item=>{
      const body=classBodyOf(item);
      const subjectName=subject(body.subject_id||item.subject_id)?.name||'';
      return (subjectFilter==='all'||(body.subject_id||item.subject_id)===subjectFilter)
        && `${body.title||item.title} ${subjectName}`.toLowerCase().includes(search.toLowerCase());
    });
    const items=filteredClasses();
    const tabs=[['all','All classes'],['draft','Drafts'],['in_review','In review'],['changes_requested','Needs changes'],['published','Published']]
      .map(([value,label])=>`<button type="button" data-action="class-status" data-status="${value}" aria-pressed="${statusFilter===value}"><span>${label}</span><strong>${value==='all'?base.length:base.filter(item=>stateOf(item)===value).length}</strong></button>`).join('');

    if(!items.length){
      const filtered=Boolean(data.classes.length);
      return `<div class="tw-portfolio-tabs" role="group" aria-label="Filter classes by status">${tabs}</div>
        <div class="tw-portfolio-empty">
          <h2>${filtered?'No classes match this filter.':'Every great journey begins with a first class.'}</h2>
          <p>${filtered?'Try selecting another subject, status, or search query.':'Share your expertise with Nigerian students. Build your curriculum, add recorded lesson links, and submit for ThinkRight review.'}</p>
          ${filtered?button('Clear filters','clear-class-filters','','small'):link(`${icon('plus')} Create your first class`,paths.class,true)}
        </div>`;
    }

    const cardsMarkup=items.map(item=>{
      const cur=revision(item.id);
      const body=classBodyOf(item);
      const state=stateOf(item);
      const sName=subject(body.subject_id||item.subject_id)?.name||'Subject';
      const curriculum=Array.isArray(body.lessons)?body.lessons:lessons(item.id);
      const price=subject(body.subject_id||item.subject_id)?.enrollment_price;
      const progressValues=currentEnrollments(item.id).map(e=>completion(item.id,e.user_id)).filter(v=>v!==null);
      const compRate=progressValues.length?Math.round(progressValues.reduce((s,v)=>s+v,0)/progressValues.length):null;
      const enrolledCount=currentEnrollments(item.id).length;
      const href=`${paths.class}?id=${item.id}`;
      const actionLabel=state==='in_review'?'View submission':(state==='changes_requested'?'Review feedback':(state==='draft'?'Continue building':'Manage class'));

      return `<article class="tw-course-card">
        <div class="tw-course-top">
          <span class="tw-subject-tag"><i class="fa-solid fa-book-open"></i> ${esc(sName)}</span>
          ${tag(state)}
        </div>
        <h3 class="tw-course-title"><a href="${href}">${esc(body.title||item.title)}</a></h3>
        <p class="tw-course-desc">${esc(body.description||item.description||'Curriculum details and lesson topics for students.')}</p>
        ${cur?.feedback?`<div class="tw-course-feedback"><i class="fa-solid fa-triangle-exclamation"></i> <strong>Reviewer Note:</strong> ${esc(cur.feedback)}</div>`:''}
        <div class="tw-course-stats-bar">
          <span class="tw-course-stat-item"><i class="fa-solid fa-play"></i> ${curriculum.length} lesson${curriculum.length===1?'':'s'}</span>
          <span class="tw-course-stat-item"><i class="fa-solid fa-users"></i> ${enrolledCount} student${enrolledCount===1?'':'s'}</span>
          <span class="tw-course-stat-item"><i class="fa-solid fa-chart-line"></i> ${compRate===null?'—':compRate+'%'} completion</span>
        </div>
        <div class="tw-course-foot">
          <div class="tw-course-price">
            ${price==null?'Price pending':money(Number(price)*100)}
            <small>Subject enrollment price</small>
          </div>
          <a class="tw-button small ${state==='changes_requested'?'danger':(state==='draft'?'primary':'')}" href="${href}">${actionLabel} →</a>
        </div>
      </article>`;
    }).join('');

    return `<div class="tw-portfolio-tabs" role="group" aria-label="Filter classes by status">${tabs}</div>
      <div class="tw-portfolio-count">
        <span>${items.length} ${items.length===1?'class':'classes'} in view</span>
        <span>Subject enrollment prices are set by ThinkRight</span>
      </div>
      <div class="tw-classes-grid">${cardsMarkup}</div>`;
  }
  function classesPage(){return `<div class="tw-classes-page">${head('','My classes','The work you are building, the lessons students are exploring, and what comes next.',link(`${icon('plus')} Create class`,paths.class,true))}${notice()}<div class="tw-class-tools">${filters(false)}</div><div id="filtered-content">${classCards()}</div></div>`;}
  function studentsContent(){
    let enroll=currentEnrollments().filter(e=>(classFilter==='all'||e.cohort_id===classFilter)&&(subjectFilter==='all'||cohort(e.cohort_id)?.subject_id===subjectFilter)&&student(e.user_id).toLowerCase().includes(search.toLowerCase()));
    if(!enroll.length){
      return empty('No enrolled students in view',search||subjectFilter!=='all'?'No learners match the current search query or subject filter. Try clearing filters.':'Active class enrollments and recorded lesson completions will show here.');
    }
    return `<div class="tw-students-grid">${enroll.map(e=>{
      const c=cohort(e.cohort_id);
      const sub=subject(c?.subject_id);
      const sName=student(e.user_id);
      const comp=completion(e.cohort_id,e.user_id);
      const initial=sName.slice(0,1).toUpperCase();
      return `<article class="tw-student-card">
        <div class="tw-student-card-top">
          <div class="tw-student-avatar">${esc(initial)}</div>
          <div class="tw-student-info">
            <h3>${esc(sName)}</h3>
            <p><i class="fa-solid fa-graduation-cap"></i> ${esc(sub?.name||'General')}</p>
          </div>
        </div>
        <div class="tw-student-class">
          <strong>${esc(c?.title||'Untitled class')}</strong>
          <small>Cohort learning track</small>
        </div>
        <div class="tw-student-progress-box">
          <div class="tw-student-progress-labels">
            <span>Curriculum progress</span>
            <span>${comp===null?'0%':comp+'%'}</span>
          </div>
          <div class="tw-progress"><span style="width:${comp||0}%"></span></div>
        </div>
        <div class="tw-student-card-foot">
          <span class="tw-student-joined"><i class="fa-solid fa-calendar-check"></i> Enrolled ${date(e.enrolled_at)}</span>
          <button class="tw-button small" type="button" data-action="student" data-id="${e.user_id}">
            <i class="fa-solid fa-chart-line"></i> View progress
          </button>
        </div>
      </article>`;
    }).join('')}</div>`;
  }
  function studentsPage(){
    const allEnrolled=currentEnrollments();
    const uniqueStudents=new Set(allEnrolled.map(e=>e.user_id)).size;
    const activeCohortCount=new Set(allEnrolled.map(e=>e.cohort_id)).size;
    const allRates=allEnrolled.map(e=>completion(e.cohort_id,e.user_id)).filter(v=>v!==null);
    const avgComp=allRates.length?Math.round(allRates.reduce((a,b)=>a+b,0)/allRates.length):0;

    return `<div class="tw-students-page">
      ${head('','Your students. Their progress.','Follow learner enrollment, monitor lesson completion milestones, and guide each candidate.',link(`${icon('plus')} Create class`,paths.class,true))}
      ${notice()}
      <div class="tw-stats-grid">
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-users"></i></div></div>
          <div class="tw-metric-value">${uniqueStudents}</div>
          <div class="tw-metric-label">Enrolled learners</div>
          <div class="tw-metric-hint">Active accounts</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-book-bookmark"></i></div></div>
          <div class="tw-metric-value">${activeCohortCount}</div>
          <div class="tw-metric-label">Active cohorts</div>
          <div class="tw-metric-hint">With enrollments</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-chart-line"></i></div></div>
          <div class="tw-metric-value">${avgComp}%</div>
          <div class="tw-metric-label">Completion rate</div>
          <div class="tw-metric-hint">Overall progress</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-award"></i></div></div>
          <div class="tw-metric-value">${allRates.filter(r=>r===100).length}</div>
          <div class="tw-metric-label">Completed course</div>
          <div class="tw-metric-hint">All lessons done</div>
        </div>
      </div>
      <div class="tw-class-tools">${filters(false)}</div>
      <div id="filtered-content">${studentsContent()}</div>
    </div>`;
  }
  function inPeriod(value){const now=new Date(),end=period==='custom'&&toDate?new Date(toDate+'T23:59:59+01:00'):now;const start=period==='custom'&&fromDate?new Date(fromDate+'T00:00:00+01:00'):new Date(now.getTime()-Number(period==='custom'?30:period)*86400000);const t=new Date(value);return t>=start&&t<=end;}
  function analyticsContent(){
    const ids=filteredClasses().map(c=>c.id);
    const enroll=data.enrollments.filter(e=>ids.includes(e.cohort_id)&&inPeriod(e.enrolled_at));
    const income=data.earnings.filter(e=>ids.includes(e.cohort_id)&&inPeriod(e.created_at));
    const gross=income.reduce((s,e)=>s+Number(e.gross_kobo),0);
    const share=income.reduce((s,e)=>s+Number(e.teacher_kobo),0);
    const active=currentEnrollments().filter(e=>ids.includes(e.cohort_id));
    const rates=active.map(e=>completion(e.cohort_id,e.user_id)).filter(x=>x!==null);
    const avg=rates.length?Math.round(rates.reduce((s,x)=>s+x,0)/rates.length):null;
    const lessonBreakdown=data.lessons.filter(l=>ids.includes(l.cohort_id));

    return `<div class="tw-stats-grid">
      <div class="tw-metric-card">
        <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-user-plus"></i></div><span class="tw-metric-badge">Period</span></div>
        <div class="tw-metric-value">${enroll.length}</div>
        <div class="tw-metric-label">New enrollments</div>
        <div class="tw-metric-hint">Selected timeframe</div>
      </div>
      <div class="tw-metric-card">
        <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-naira-sign"></i></div><span class="tw-metric-badge">Verified</span></div>
        <div class="tw-metric-value">${money(gross)}</div>
        <div class="tw-metric-label">Enrollment sales</div>
        <div class="tw-metric-hint">Reconciled purchases</div>
      </div>
      <div class="tw-metric-card">
        <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-wallet"></i></div><span class="tw-metric-badge">70% Share</span></div>
        <div class="tw-metric-value">${money(share)}</div>
        <div class="tw-metric-label">Educator share</div>
        <div class="tw-metric-hint">Before provider fees</div>
      </div>
      <div class="tw-metric-card">
        <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-chart-pie"></i></div><span class="tw-metric-badge">All time</span></div>
        <div class="tw-metric-value">${avg===null?'—':avg+'%'}</div>
        <div class="tw-metric-label">Lesson completion</div>
        <div class="tw-metric-hint">Average progress rate</div>
      </div>
    </div>
    <div class="tw-analytics-charts-grid">
      <section class="tw-analytics-chart-card">
        <div class="tw-analytics-chart-head">
          <div>
            <h3>Enrollment velocity</h3>
            <p>New student registrations recorded over the selected timeframe.</p>
          </div>
        </div>
        <div class="tw-analytics-canvas-wrap">
          <canvas id="analyticsEnrollmentChart" aria-label="Enrollments over time"></canvas>
        </div>
      </section>
      <section class="tw-analytics-chart-card">
        <div class="tw-analytics-chart-head">
          <div>
            <h3>Class completion progress</h3>
            <p>Average student progress rates across your teaching portfolio.</p>
          </div>
        </div>
        <div class="tw-analytics-canvas-wrap">
          <canvas id="analyticsCompletionChart" aria-label="Class completion rates"></canvas>
        </div>
      </section>
    </div>
    <div class="tw-analytics-table-card">
      <div class="tw-analytics-table-head">
        <div>
          <h3>Lesson completion breakdown</h3>
          <p class="tw-hint">Recorded lesson completions during the selected period.</p>
        </div>
      </div>
      <div class="tw-table-wrap">
        <table class="tw-table responsive">
          <thead><tr><th>Lesson</th><th>Class</th><th>Completions</th></tr></thead>
          <tbody>
            ${lessonBreakdown.map(l=>`<tr>
              <td data-label="Lesson"><strong>${esc(l.title)}</strong><br><small class="tw-hint">${esc(l.syllabus_topic||'Topic')}</small></td>
              <td data-label="Class">${esc(cohort(l.cohort_id)?.title)}</td>
              <td data-label="Completions"><strong>${data.progress.filter(p=>p.lesson_id===l.id&&inPeriod(p.completed_at)).length}</strong></td>
            </tr>`).join('')||'<tr><td colspan="3" class="tw-hint" style="text-align:center;padding:24px">No lessons match the selected filters.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
  }
  function analyticsPage(){
    return `<div class="tw-analytics-page">
      ${head('TEACHING DASHBOARD','Your teaching, in perspective.','Explore enrollments and recorded lesson progress across your classes.')}
      ${notice()}
      <div class="tw-class-tools">${filters(false,true)}</div>
      <div id="filtered-content">${analyticsContent()}</div>
    </div>`;
  }
  function discussionsContent(){
    const sTerm=search.trim().toLowerCase();
    const roots=data.posts.filter(p=>!p.parent_id&&(classFilter==='all'||p.cohort_id===classFilter)).filter(p=>{
      if(!sTerm)return true;
      const sName=student(p.author_id).toLowerCase();
      const cTitle=(cohort(p.cohort_id)?.title||'').toLowerCase();
      const bodyText=(p.body||'').toLowerCase();
      return sName.includes(sTerm)||cTitle.includes(sTerm)||bodyText.includes(sTerm);
    });
    roots.sort((a,b)=>{
      if(a.resolved!==b.resolved)return a.resolved?1:-1;
      return b.created_at.localeCompare(a.created_at);
    });
    return roots.length?roots.map(p=>{
      const c=cohort(p.cohort_id);
      const sName=student(p.author_id);
      const initial=sName.slice(0,1).toUpperCase()||'S';
      const les=p.lesson_id?data.lessons.find(l=>l.id===p.lesson_id):null;
      const replies=data.posts.filter(reply=>reply.parent_id===p.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));
      return `<article class="tw-thread tw-thread-card">
        <div class="tw-thread-header">
          <div class="tw-thread-author-wrap">
            <div class="tw-thread-avatar">${esc(initial)}</div>
            <div class="tw-thread-author-meta">
              <h4>${esc(sName)}</h4>
              <div class="tw-thread-tags">
                <span class="tw-subject-tag"><i class="fa-solid fa-graduation-cap"></i> ${esc(c?.title||'Class')}</span>
                ${les?`<span class="tw-thread-lesson-badge"><i class="fa-solid fa-circle-play"></i> ${esc(les.title)}</span>`:''}
                <span class="tw-hint"><i class="fa-regular fa-clock"></i> ${date(p.created_at)}</span>
              </div>
            </div>
          </div>
          <div>
            ${p.resolved?'<span class="tw-status-pill active"><i class="fa-solid fa-circle-check"></i> Resolved</span>':'<span class="tw-status-pill pending"><i class="fa-solid fa-circle-dot"></i> Needs response</span>'}
          </div>
        </div>
        <div class="tw-thread-body">
          <p>${esc(p.body)}</p>
        </div>
        ${replies.length?`<div class="tw-thread-replies">${replies.map(reply=>{
          const isMe=reply.author_id===user.id;
          const rName=isMe?'You':esc(tutor(reply.author_id)?.display_name||student(reply.author_id));
          const rInit=isMe?'Y':rName.slice(0,1).toUpperCase();
          return `<div class="tw-reply-card ${isMe?'is-educator':''}">
            <div class="tw-reply-head">
              <span class="tw-reply-avatar">${esc(rInit)}</span>
              <strong>${esc(rName)}</strong>
              ${isMe?'<span class="tw-badge-educator"><i class="fa-solid fa-chalkboard-user"></i> Educator</span>':''}
              <small class="tw-hint">${date(reply.created_at)}</small>
            </div>
            <div class="tw-reply-body"><p>${esc(reply.body)}</p></div>
          </div>`;
        }).join('')}</div>`:''}
        <form class="tw-inline-form tw-thread-reply-form" data-form="reply" data-id="${p.id}">
          <div class="tw-reply-input-wrap">
            <input class="tw-input" name="body" required maxlength="4000" aria-label="Reply to this discussion" placeholder="Help this student take the next step…">
            <button class="tw-button primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Reply</button>
          </div>
          <div class="tw-thread-actions">
            ${button(p.resolved?'<i class="fa-solid fa-rotate-left"></i> Reopen discussion':'<i class="fa-solid fa-check"></i> Mark resolved','resolve',`data-id="${p.id}" data-resolved="${!p.resolved}"`,'small')}
          </div>
        </form>
      </article>`;
    }).join(''):empty('A space for questions','Student questions and your replies will appear here.');
  }
  function discussionsPage(){
    const allQs=data.posts.filter(p=>!p.parent_id);
    const unresQs=allQs.filter(p=>!p.resolved);
    const resQs=allQs.filter(p=>p.resolved);
    const resPct=allQs.length?Math.round((resQs.length/allQs.length)*100)+'%':'100%';
    return `<div class="tw-discussions-page">
      ${head('','Keep the conversation going.','Reply to questions from your classes and mark a discussion resolved when it is answered.')}
      ${notice()}
      <div class="tw-stats-grid">
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-comments"></i></div></div>
          <div class="tw-metric-value">${allQs.length}</div>
          <div class="tw-metric-label">Total questions</div>
          <div class="tw-metric-hint">Learner inquiries</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-circle-question"></i></div></div>
          <div class="tw-metric-value">${unresQs.length}</div>
          <div class="tw-metric-label">Needs reply</div>
          <div class="tw-metric-hint">Awaiting answers</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-circle-check"></i></div></div>
          <div class="tw-metric-value">${resQs.length}</div>
          <div class="tw-metric-label">Resolved queries</div>
          <div class="tw-metric-hint">Answered topics</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-chart-pie"></i></div></div>
          <div class="tw-metric-value">${resPct}</div>
          <div class="tw-metric-label">Resolution rate</div>
          <div class="tw-metric-hint">Community health</div>
        </div>
      </div>
      <div class="tw-class-tools">
        <div class="tw-filterbar">
          <label><span>Filter by Class</span><select data-filter="class">${options([['all','All classes'],...data.classes.map(c=>[c.id,c.title])],classFilter)}</select></label>
        </div>
      </div>
      <div id="filtered-content" class="tw-discussions-stream">${discussionsContent()}</div>
    </div>`;
  }
  function earningsPage(){
    const earned=data.earnings.reduce((s,e)=>s+Number(e.teacher_kobo),0);
    const paid=data.payouts.filter(p=>!p.reversed).reduce((s,p)=>s+Number(p.amount_kobo),0);
    const unpaid=earned-paid;
    const bank=data.banks.find(b=>b.tutor_id===user.id);
    const legacy=data.enrollments.filter(e=>Number(e.paid_amount)>0&&!data.earnings.some(x=>x.enrollment_id===e.id));
    const filteredEarnings=data.earnings.filter(e=>(classFilter==='all'||e.cohort_id===classFilter)&&inPeriod(e.created_at));
    return `<div class="tw-payouts-page">
      ${head('','Earnings, made completely clear.','Your 70% share of verified enrollment payments, with a transparent record of manual payouts.')}
      ${notice()}
      <div class="tw-stats-grid">
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-coins"></i></div></div>
          <div class="tw-metric-value">${money(earned)}</div>
          <div class="tw-metric-label">Your total earnings</div>
          <div class="tw-metric-hint">Verified + reconciled</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-building-columns"></i></div></div>
          <div class="tw-metric-value">${money(paid)}</div>
          <div class="tw-metric-label">Paid to you</div>
          <div class="tw-metric-hint">Completed transfers</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-wallet"></i></div></div>
          <div class="tw-metric-value">${money(unpaid)}</div>
          <div class="tw-metric-label">Unpaid balance</div>
          <div class="tw-metric-hint">Awaiting next payout</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-clock-rotate-left"></i></div></div>
          <div class="tw-metric-value">${legacy.length}</div>
          <div class="tw-metric-label">Historical payments</div>
          <div class="tw-metric-hint">Pending reconciliation</div>
        </div>
      </div>
      ${legacy.length?'<div class="tw-notice"><i class="fa-solid fa-circle-info"></i> Historical enrollment records are not included in your payable balance until ThinkRight reconciles the payment evidence.</div>':''}
      <div class="tw-payouts-layout">
        <div class="tw-payouts-main">
          <div class="tw-earnings-card">
            <div class="tw-card-section-head">
              <div>
                <h3>Enrollment revenue breakdown</h3>
                <p>Each payment keeps the price and 70% educator revenue split recorded at purchase.</p>
              </div>
            </div>
            <div class="tw-filterbar">
              <label><span>Class</span><select data-filter="class">${options([['all','All classes'],...data.classes.map(c=>[c.id,c.title])],classFilter)}</select></label>
              <label><span>Period</span><select data-filter="period">${options([['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days']],period)}</select></label>
            </div>
            <div class="tw-earnings-ledger">
              ${filteredEarnings.map(e=>`<div class="tw-earning-row">
                <div class="tw-earning-main">
                  <strong><i class="fa-solid fa-graduation-cap"></i> ${esc(cohort(e.cohort_id)?.title||'Class enrollment')}</strong>
                  <small>${date(e.created_at)} · Ref: ${esc(e.reference)}</small>
                </div>
                <div class="tw-earning-side">
                  <strong>${money(e.teacher_kobo)}</strong>
                  <small>70% of ${money(e.gross_kobo)}</small>
                </div>
              </div>`).join('')||empty('No earnings in this period','Choose another period or return after an enrollment payment.')}
            </div>
          </div>
          <div class="tw-payouts-history-card">
            <div class="tw-card-section-head">
              <div>
                <h3>Payout transfer history</h3>
                <p>Completed transfers recorded by ThinkRight to your bank account.</p>
              </div>
            </div>
            <div class="tw-payouts-ledger">
              ${data.payouts.length?data.payouts.map(p=>`<div class="tw-payout-row">
                <div class="tw-payout-main">
                  <strong>${money(p.amount_kobo)}</strong>
                  <small>${date(p.paid_at)} · Ref: ${esc(p.reference)}</small>
                  ${p.reversal_reason?`<div class="tw-reversal-note"><i class="fa-solid fa-triangle-exclamation"></i> Correction: ${esc(p.reversal_reason)}</div>`:''}
                </div>
                <div>${tag(p.reversed?'reversed':'paid')}</div>
              </div>`).join(''):empty('Your first payout is ahead','Completed payments will appear here once recorded by ThinkRight.')}
            </div>
          </div>
        </div>
        <aside class="tw-payouts-side">
          <div class="tw-payout-bank-card">
            <div class="tw-card-section-head">
              <div>
                <h3>Payout bank account</h3>
                <p>${bank?(bank.reviewed?'Reviewed & verified by ThinkRight':'Submitted · awaiting administrative review'):'Add your Nigerian bank details for manual payments.'}</p>
              </div>
            </div>
            ${bank?`<div class="tw-bank-account-preview">
              <div class="tw-bank-preview-label">Primary payout account</div>
              <div class="tw-bank-preview-bank">${esc(bank.bank)}</div>
              <div class="tw-bank-preview-number">${esc(bank.account_number)}</div>
              <div class="tw-bank-preview-name">${esc(bank.account_name)}</div>
              <div class="tw-bank-status-banner ${bank.reviewed?'is-verified':'is-pending'}">
                <i class="fa-solid ${bank.reviewed?'fa-circle-check':'fa-clock'}"></i>
                <span>${bank.reviewed?'Verified Account':'Review Pending'}</span>
              </div>
            </div>`:''}
            <form data-form="bank" class="tw-bank-form">
              ${field('Bank name','bank',bank?.bank||'','text','required maxlength="120" placeholder="e.g. Access Bank, GTBank, Zenith"')}
              ${field('Account number','account_number',bank?.account_number||'','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" autocomplete="off" placeholder="10-digit NUBAN"')}
              ${field('Account name','account_name',bank?.account_name||'','text','required maxlength="160" placeholder="Full name on account"')}
              <p class="tw-hint"><i class="fa-solid fa-shield-halved"></i> Changes require a new ThinkRight review. Saving details does not verify your bank account.</p>
              <button class="tw-button primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save bank details</button>
            </form>
          </div>
        </aside>
      </div>
    </div>`;
  }
  function profilePage(){
    const t=ownTutor();
    const displayName=t.display_name||data.identity.name||user?.email?.split('@')[0]||'Educator';
    const handle=String(displayName).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'educator';
    const status=t.status||data.identity.status||'pending';
    const isApproved=status==='active';
    const statusLabel=isApproved?'Verified Educator':(status==='suspended'?'Account Suspended':'Pending Review');
    const selectedSubjectIds=Array.isArray(t.subjects)?t.subjects:[];
    const selectedSubjects=selectedSubjectIds.map(id=>subject(id)).filter(Boolean);
    const subjectNames=selectedSubjects.map(s=>s.name);
    const ownClasses=data.classes.filter(c=>!c.tutor_id||c.tutor_id===user?.id);
    const publishedCount=ownClasses.filter(c=>c.published).length;
    const activeEnrollments=currentEnrollments().filter(e=>ownClasses.some(c=>c.id===e.cohort_id));
    const totalLessonsCount=ownClasses.reduce((sum,c)=>sum+lessons(c.id).length,0);
    const totalEarnedKobo=(data.earnings||[]).filter(e=>!e.tutor_id||e.tutor_id===user?.id).reduce((sum,e)=>sum+Number(e.teacher_kobo||0),0);
    const bank=(data.banks||[]).find(b=>!b.tutor_id||b.tutor_id===user?.id);
    const safeSampleUrl=safeURL(t.sample_video_url);
    const filledSteps=[Boolean(t.display_name),Boolean(t.whatsapp_number),Boolean(t.bio&&t.bio.length>=20),Boolean(safeSampleUrl),selectedSubjects.length>0].filter(Boolean).length;
    const completenessPct=Math.round((filledSteps/5)*100);
    const recentActivities=[
      ...activeEnrollments.slice(0,5).map(e=>({
        icon:'fa-user-graduate',
        color:'#1d4ed8',
        bg:'rgba(29,78,216,.12)',
        title:`${student(e.user_id)} enrolled`,
        desc:cohort(e.cohort_id)?.title||'Published class',
        time:date(e.enrolled_at),
        ts:new Date(e.enrolled_at||0).getTime()
      })),
      ...(data.posts||[]).filter(p=>ownClasses.some(c=>c.id===p.cohort_id)).slice(0,5).map(p=>({
        icon:'fa-comments',
        color:'#0284c7',
        bg:'rgba(2,132,199,.12)',
        title:p.parent_id?'Discussion reply posted':'New student question',
        desc:String(p.body||'').slice(0,110),
        time:date(p.created_at),
        ts:new Date(p.created_at||0).getTime()
      })),
      ...ownClasses.slice(0,4).map(c=>({
        icon:'fa-book-open',
        color:'#10b981',
        bg:'rgba(16,185,129,.12)',
        title:c.published?'Published class live':'Class draft in studio',
        desc:`${c.title||'Untitled class'} · ${subject(c.subject_id)?.name||'Subject'}`,
        time:date(c.start_date),
        ts:new Date(c.start_date||0).getTime()
      }))
    ].sort((a,b)=>b.ts-a.ts).slice(0,6);

    return `<div class="profile-container tw-social-profile">
      ${notice()}
      ${t.review_feedback?`<div class="profile-guest-notice" style="margin-bottom:20px"><i class="fa-solid fa-triangle-exclamation" style="font-size:18px;color:var(--warning,#d97706)"></i><div><strong>Reviewer Feedback:</strong> ${esc(t.review_feedback)}</div></div>`:''}
      <article class="social-card">
        <div class="social-header">
          <div class="social-top-row">
            <div class="social-identity-lead">
              <div class="social-avatar-container">
                <div class="social-avatar" id="socialAvatar">${esc(displayName.slice(0,1).toUpperCase())}</div>
                <span class="social-avatar__badge" style="background:${isApproved?'#10b981':status==='suspended'?'#ef4444':'#f59e0b'}" title="${esc(statusLabel)}"></span>
              </div>
              <div class="social-identity">
                <div class="social-name-row">
                  <h1 class="social-name" id="socialDisplayName">${esc(displayName)}</h1>
                  <span class="social-verified-badge" title="${esc(statusLabel)}" aria-label="${esc(statusLabel)}" ${isApproved?'':'hidden'}>
                    <i class="fa-solid fa-circle-check"></i>
                  </span>
                </div>
                <div class="social-meta-inline">
                  <span><strong>${esc(statusLabel)}</strong></span>
                  <span class="social-meta-sep" aria-hidden="true">·</span>
                  <span>${esc(user?.email||'Educator account')}</span>
                  ${t.whatsapp_number?`<span class="social-meta-sep" aria-hidden="true">·</span><span>${esc(t.whatsapp_number)}</span>`:''}
                  <span class="social-meta-sep" aria-hidden="true">·</span>
                  <span>Payouts: <strong>${esc(bank?(bank.reviewed?'Verified':'Pending'):'Not set')}</strong></span>
                  ${safeSampleUrl?`<span class="social-meta-sep" aria-hidden="true">·</span><a href="${esc(safeSampleUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent-primary);font-weight:600">Sample video ↗</a>`:''}
                </div>
                <p class="social-bio" id="socialBio">${esc(t.bio||'Add your teaching background, university credentials, and why students excel in your classes.')}</p>
              </div>
            </div>
            <div class="social-actions">
              <button type="button" class="social-btn social-btn--edit" id="openEditModalBtn" data-action="open-profile-modal" data-editor-tab="about" aria-label="Edit profile" title="Edit profile">
                <i class="fa-solid fa-pen"></i> Edit profile
              </button>
              <button type="button" class="social-btn social-btn--logout" data-action="logout" aria-label="Log out" title="Log out">
                <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Log out
              </button>
              <a href="${paths.classes}" class="social-btn social-btn--icon" title="My classes" aria-label="My classes">
                <i class="fa-solid fa-book-open" aria-hidden="true"></i>
              </a>
              <a href="${paths.earnings}" class="social-btn social-btn--icon" title="Payouts & earnings" aria-label="Payouts & earnings">
                <i class="fa-solid fa-wallet" aria-hidden="true"></i>
              </a>
            </div>
          </div>
        </div>

        <section class="social-stats-bar" aria-label="Educator statistics">
          <div class="social-stat-item">
            <span class="social-stat-value">${publishedCount}</span>
            <span class="social-stat-label">Published Classes</span>
          </div>
          <div class="social-stat-item">
            <span class="social-stat-value">${activeEnrollments.length}</span>
            <span class="social-stat-label">Active Students</span>
          </div>
          <div class="social-stat-item">
            <span class="social-stat-value">${totalLessonsCount}</span>
            <span class="social-stat-label">Video Lessons</span>
          </div>
          <div class="social-stat-item">
            <span class="social-stat-value">${money(totalEarnedKobo)}</span>
            <span class="social-stat-label">Net Earnings (70%)</span>
          </div>
        </section>

        <div class="profile-sections">
          <section class="social-section">
            <h2 class="social-section__title">
              <span>Studio status</span>
            </h2>
            <div class="social-spotlight-card">
              <div class="social-spotlight-info">
                <h3 class="social-spotlight-heading">${isApproved?`${publishedCount} Published ${publishedCount===1?'Class':'Classes'} · ${activeEnrollments.length} Active ${activeEnrollments.length===1?'Student':'Students'}`:(completenessPct===100?'Application Ready for ThinkRight Review':'Complete Your Educator Profile')}</h3>
                <p class="social-spotlight-sub">${isApproved?'Your profile is verified. Create structured JAMB classes, guide your students, and earn 70% of verified student enrollments.':`Profile readiness: ${completenessPct}% complete. Fill in your biography, WhatsApp contact, sample lesson video, and teaching subjects for review.`}</p>
                <div class="social-goal-track" aria-hidden="true"><span style="width:${completenessPct}%"></span></div>
              </div>
              ${completenessPct<100||!t.id?`<button type="button" class="social-spotlight-badge" data-action="open-profile-modal" data-editor-tab="about">Complete profile <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`:`<a class="social-spotlight-badge" href="${paths.class}">Create a class <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>`}
            </div>
          </section>

          <section class="social-section">
            <h2 class="social-section__title">
              <span>Teaching subjects</span>
              <button type="button" class="social-section__link" data-action="open-profile-modal" data-editor-tab="subjects">Modify subjects</button>
            </h2>
            <div class="social-combo-grid">
              ${selectedSubjects.length?selectedSubjects.map((s,idx)=>{
                const subjClasses=ownClasses.filter(c=>c.subject_id===s.id).length;
                return `<div class="social-combo-pill is-locked">
                  <div class="social-combo-pill__top">
                    <span>SUBJECT ${idx+1}</span>
                    <span class="social-combo-pill__badge">${subjClasses} ${subjClasses===1?'class':'classes'}</span>
                  </div>
                  <div class="social-combo-pill__name">
                    <i class="fa-solid fa-book-open" style="color:var(--accent-primary)"></i>
                    <span>${esc(s.name)}</span>
                  </div>
                  <a class="social-combo-pill__btn" href="${paths.classes}">Manage classes <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
                </div>`;
              }).join(''):`<div class="social-combo-pill">
                <div class="social-combo-pill__top"><span>TEACHING SUBJECTS</span><span class="social-combo-pill__badge">Required</span></div>
                <div class="social-combo-pill__name"><i class="fa-solid fa-book-open" style="color:var(--accent-primary)"></i><span>Choose subjects you teach</span></div>
                <button type="button" class="social-combo-pill__btn" data-action="open-profile-modal" data-editor-tab="subjects">Select subjects <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
              </div>`}
            </div>
          </section>

          <section class="social-section">
            <h2 class="social-section__title"><span>Milestones</span></h2>
            <div class="social-badges-grid">
              <div class="social-badge-card is-green ${isApproved?'':'is-locked'}">
                <div class="social-badge-icon"><i class="fa-solid fa-user-check"></i></div>
                <div class="social-badge-info"><strong>Verified Educator</strong><small>Approved by ThinkRight</small></div>
              </div>
              <div class="social-badge-card is-gold ${completenessPct===100?'':'is-locked'}">
                <div class="social-badge-icon"><i class="fa-solid fa-id-badge"></i></div>
                <div class="social-badge-info"><strong>Profile Complete</strong><small>Credentials & sample video set</small></div>
              </div>
              <div class="social-badge-card ${selectedSubjects.length?'':'is-locked'}">
                <div class="social-badge-icon"><i class="fa-solid fa-book-bookmark"></i></div>
                <div class="social-badge-info"><strong>Subject Specialist</strong><small>${selectedSubjects.length?`${selectedSubjects.length} subject${selectedSubjects.length===1?'':'s'} selected`:'Select teaching subjects'}</small></div>
              </div>
              <div class="social-badge-card is-green ${publishedCount>0?'':'is-locked'}">
                <div class="social-badge-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
                <div class="social-badge-info"><strong>Published Mentor</strong><small>Launched a live JAMB class</small></div>
              </div>
              <div class="social-badge-card ${activeEnrollments.length>0?'':'is-locked'}">
                <div class="social-badge-icon"><i class="fa-solid fa-users"></i></div>
                <div class="social-badge-info"><strong>Cohort Builder</strong><small>Enrolled active students</small></div>
              </div>
              <div class="social-badge-card is-gold ${totalEarnedKobo>0?'':'is-locked'}">
                <div class="social-badge-icon"><i class="fa-solid fa-award"></i></div>
                <div class="social-badge-info"><strong>First Earnings</strong><small>Earned from student cohorts</small></div>
              </div>
            </div>
          </section>
        </div>
      </article>

      <div class="social-modal-overlay ${profileModalOpen?'open':''}" id="editProfileModal" role="dialog" aria-modal="true" aria-labelledby="editModalTitle" aria-describedby="editModalIntro">
        <div class="social-modal">
          <div class="profile-editor-main">
            <div class="social-modal__header">
              <div>
                <h2 class="social-modal__title" id="editModalTitle">Edit educator profile</h2>
                <p class="social-modal__intro" id="editModalIntro">Update your teaching bio, sample lesson video, and UTME subjects.</p>
              </div>
              <button type="button" class="social-modal__close" data-action="close-profile-modal" aria-label="Close editor"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>
            <nav class="profile-editor-nav" role="tablist" aria-label="Editor sections">
              <button type="button" role="tab" aria-selected="${profileEditorTab==='about'}" data-action="profile-editor-tab" data-editor-tab="about" class="${profileEditorTab==='about'?'is-active':''}">About you</button>
              <button type="button" role="tab" aria-selected="${profileEditorTab==='credentials'}" data-action="profile-editor-tab" data-editor-tab="credentials" class="${profileEditorTab==='credentials'?'is-active':''}">Sample video</button>
              <button type="button" role="tab" aria-selected="${profileEditorTab==='subjects'}" data-action="profile-editor-tab" data-editor-tab="subjects" class="${profileEditorTab==='subjects'?'is-active':''}">Subjects</button>
            </nav>
            <form data-form="profile" novalidate>
              <div class="social-modal__body" id="editorScrollArea">
                <section class="profile-editor-section" data-editor-section="about" role="tabpanel" ${profileEditorTab==='about'?'':'hidden'}>
                  <div class="social-form-row">
                    <div class="social-form-group">
                      <label class="social-form-label" for="twInputDisplayName">Display name <span>Required</span></label>
                      <input class="social-input" id="twInputDisplayName" name="display_name" type="text" value="${esc(t.display_name||'')}" required maxlength="120" placeholder="e.g. Dr. Adebayo or Engr. Fatima">
                    </div>
                    <div class="social-form-group">
                      <label class="social-form-label" for="twInputWhatsapp">WhatsApp number <span>Required</span></label>
                      <input class="social-input" id="twInputWhatsapp" name="whatsapp_number" type="tel" value="${esc(t.whatsapp_number||'')}" required maxlength="25" placeholder="e.g. +234 801 234 5678">
                    </div>
                  </div>
                  <div class="social-form-group">
                    <div class="profile-editor-label-line">
                      <label class="social-form-label" for="twInputBio">Teaching experience & credentials <span>Required (min 20 chars)</span></label>
                      <span id="editorBioCount">${(t.bio||'').length} / 4000</span>
                    </div>
                    <textarea class="social-textarea" id="twInputBio" name="bio" required minlength="20" maxlength="4000" rows="4" placeholder="Detail your background, university degrees, teaching achievements, and why students excel in your classes...">${esc(t.bio||'')}</textarea>
                    <p class="profile-editor-hint">This biography appears directly on your educator profile and class pages.</p>
                  </div>
                </section>

                <section class="profile-editor-section" data-editor-section="credentials" role="tabpanel" ${profileEditorTab==='credentials'?'':'hidden'}>
                  <div class="social-form-group">
                    <label class="social-form-label" for="twInputSampleVideo">Sample lesson video (HTTPS) <span>Required</span></label>
                    <input class="social-input" id="twInputSampleVideo" name="sample_video_url" type="url" value="${esc(t.sample_video_url||'')}" required pattern="https://.*" placeholder="https://youtube.com/watch?v=... or https://vimeo.com/...">
                    <p class="profile-editor-hint"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Must begin with <code>https://</code>. ThinkRight reviewers watch this sample before approving your studio.</p>
                  </div>
                </section>

                <section class="profile-editor-section" data-editor-section="subjects" role="tabpanel" ${profileEditorTab==='subjects'?'':'hidden'}>
                  <div class="tw-checks">
                    ${data.subjects.map(s=>`<label class="tw-check"><input type="checkbox" name="subjects" value="${esc(s.id)}" ${selectedSubjectIds.includes(s.id)?'checked':''}><span>${esc(s.name)}</span></label>`).join('')}
                  </div>
                  <p class="profile-editor-hint" style="margin-top:12px"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Select at least one subject to save your educator profile.</p>
                </section>
              </div>
              <div class="social-modal__footer">
                <button type="button" class="social-btn social-btn--edit" data-action="close-profile-modal">Cancel</button>
                <button type="submit" class="social-btn social-btn--primary"><i class="fa-solid fa-check" aria-hidden="true"></i> ${t.id?'Save profile':'Submit teaching application'}</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>`;
  }
  function loadDraft(){draftId=new URLSearchParams(location.search).get('id');const r=draftId?revision(draftId):null;if(draftId&&!r)throw new Error('This class is unavailable to your account.');draft=r?structuredClone(r.body):{title:'',description:'',subject_id:data.subjects[0]?.id||'',start_date:today(),whatsapp_link:'',lessons:[]};draftVersion=r?.version||1;}
  function captureDraft(){const form=$('#class-editor');if(!form)return;for(const input of form.querySelectorAll('[data-draft]'))draft[input.dataset.draft]=input.value;for(const input of form.querySelectorAll('[data-lesson]')){const item=draft.lessons[Number(input.dataset.lesson)];if(item)item[input.name]=input.value;}}
  function editorPage(){
    const r=revision(draftId),readOnly=r?.state==='in_review',s=subject(draft.subject_id),savedClass=cohort(draftId);
    let content='';
    if(step===0){
      content=`<div class="tw-studio-canvas-step">
        <div class="tw-studio-section-head">
          <div>
            <h2>Class foundation & details</h2>
            <p class="tw-studio-subtitle">A clear title, focused description, and schedule set student expectations for success.</p>
          </div>
        </div>
        <div class="tw-form-grid">
          <label class="tw-field"><span>Subject</span><select data-draft="subject_id">${options(data.subjects.map(s=>[s.id,s.name]),draft.subject_id)}</select></label>
          ${field('Class title','title',draft.title,'text','data-draft="title" maxlength="160" required placeholder="e.g. Master JAMB Physics: Mechanics & Waves"')}
          ${field('Start date','start_date',draft.start_date,'date','data-draft="start_date" required')}
          ${field('WhatsApp group link (optional)','whatsapp_link',draft.whatsapp_link,'url','data-draft="whatsapp_link" pattern="https://.*" placeholder="https://chat.whatsapp.com/..."')}
        </div>
        ${textArea('What will students master? (Course description)','description',draft.description,'data-draft="description" maxlength="4000" placeholder="Describe the topics covered, learning outcomes, and prerequisites for students..."')}
        <div class="tw-price-pill"><i class="fa-solid fa-tag"></i> <span><strong>${s?.enrollment_price==null?'Price awaiting ThinkRight configuration':money(Number(s.enrollment_price)*100)}</strong> · Subject enrollment rate set by ThinkRight. Your educator share is 70% of verified student payments.</span></div>
      </div>`;
    }else if(step===1){
      content=`<div class="tw-studio-canvas-step">
        <div class="tw-studio-section-head">
          <div>
            <h2>Curriculum & video lessons</h2>
            <p class="tw-studio-subtitle">Structure your lessons in the logical order students should study them.</p>
          </div>
          ${button(`${icon('plus')} Add lesson`,'add-lesson','','primary small')}
        </div>
        <div class="tw-lessons-list">
          ${draft.lessons.map((l,i)=>`<section class="tw-lesson-card">
            <div class="tw-lesson-top">
              <span class="tw-lesson-badge"><i class="fa-solid fa-circle-play"></i> Lesson ${i+1}</span>
              <div class="tw-actions">
                <button type="button" class="tw-icon-btn" data-action="move-lesson" data-index="${i}" data-direction="-1" aria-label="Move lesson ${i+1} up" ${i===0?'disabled':''} title="Move lesson up"><i class="fa-solid fa-chevron-up"></i></button>
                <button type="button" class="tw-icon-btn" data-action="move-lesson" data-index="${i}" data-direction="1" aria-label="Move lesson ${i+1} down" ${i===draft.lessons.length-1?'disabled':''} title="Move lesson down"><i class="fa-solid fa-chevron-down"></i></button>
                <button type="button" class="tw-icon-btn" data-action="remove-lesson" data-index="${i}" aria-label="Remove lesson ${i+1}" title="Remove lesson"><i class="fa-solid fa-trash-can"></i></button>
              </div>
            </div>
            <div class="tw-form-grid">
              ${field('Lesson title','title',l.title,'text',`data-lesson="${i}" required maxlength="160" placeholder="e.g. Newton’s Laws of Motion"`)}
              ${field('Syllabus topic','syllabus_topic',l.syllabus_topic,'text',`data-lesson="${i}" required maxlength="160" placeholder="e.g. Mechanics"`)}
            </div>
            ${field('Lesson video URL (HTTPS)','video_url',l.video_url,'url',`data-lesson="${i}" required pattern="https://.*" placeholder="https://..."`)}
          </section>`).join('')||empty('Start with lesson one','Add a video lesson and connect it to a syllabus topic.',button(`${icon('plus')} Add first lesson`,'add-lesson','','primary small'))}
        </div>
      </div>`;
    }else{
      content=`<div class="tw-studio-canvas-step">
        <div class="tw-studio-section-head">
          <div>
            <h2>One final look before review</h2>
            <p class="tw-studio-subtitle">ThinkRight reviews your class curriculum and lesson videos before students can enroll.</p>
          </div>
        </div>
        ${r?.feedback?`<div class="tw-course-feedback" style="margin-bottom:20px"><i class="fa-solid fa-triangle-exclamation"></i> <strong>Reviewer feedback:</strong> ${esc(r.feedback)}</div>`:''}
        <div class="tw-studio-preview-wrap">
          ${previewContent(draft)}
        </div>
      </div>`;
    }
    return head('Class studio',draft.title?esc(draft.title):'Make something worth learning.','A focused curriculum. Your teaching style. One step at a time.',button('Student preview','preview')+link('All classes',paths.classes))
      +notice()
      +`<div class="tw-editor">
        ${r?`<div class="tw-studio-status-row">${tag(r.state)}<span class="tw-hint">${savedClass?.published?'The last approved revision is live.':'Not visible to students yet.'}</span></div>`:''}
        ${savedClass?.published?`<div class="tw-tabs"><button data-action="class-tab" data-tab="editor" aria-pressed="true">Editor</button><button data-action="class-tab" data-tab="students">Students</button><button data-action="class-tab" data-tab="discussions">Discussions</button></div><label class="tw-field"><span>Enrollment availability</span><select data-filter="availability">${options([['open','Open for enrollment'],['in_progress','In progress'],['closed','Closed to new enrollments']],savedClass.status)}</select></label>`:''}
        <div class="tw-steps" aria-label="Class creation steps">${['Details','Curriculum','Review'].map((name,i)=>`<button data-action="step" data-step="${i}" ${step===i?'aria-current="step"':''}><b>0${i+1}</b><span>${name}</span></button>`).join('')}</div>
        ${readOnly?'<div class="tw-notice">This revision is in review. Withdraw it if you need to make changes.</div>':''}
        <form id="class-editor"><fieldset class="tw-studio-canvas" ${readOnly?'disabled':''}>${content}</fieldset></form>
        <footer class="tw-editor-foot">
          <small id="draft-status">${dirty?'Unsaved changes':draftId?'Draft saved':'Not saved yet'}</small>
          <div class="tw-actions">
            ${readOnly?button('Withdraw submission','withdraw-class'):button('Save draft','save-class')}
            ${step<2?button('Continue →','step',`data-step="${step+1}"`,'primary'):readOnly?'':button('Submit for review','submit-class','','primary')}
          </div>
        </footer>
      </div>`;
  }
  function previewContent(body){
    const sub=subject(body.subject_id);
    const lessonsList=body.lessons||[];
    return `<div class="tw-preview-card">
      <div class="tw-preview-banner"><i class="fa-solid fa-eye"></i> Read-only student preview · No enrollment or progress is recorded.</div>
      <div class="tw-preview-body">
        <span class="tw-subject-tag"><i class="fa-solid fa-book-open"></i> ${esc(sub?.name||body.subject_id||'Subject')}</span>
        <h2 class="tw-preview-title">${esc(body.title||'Untitled class')}</h2>
        <p class="tw-preview-desc">${esc(body.description||'Add a description for your class.')}</p>
        <div class="tw-course-stats-bar">
          <span class="tw-course-stat-item"><i class="fa-solid fa-calendar-day"></i> Starts ${date(body.start_date)}</span>
          <span class="tw-course-stat-item"><i class="fa-solid fa-layer-group"></i> ${lessonsList.length} ${lessonsList.length===1?'lesson':'lessons'}</span>
          <span class="tw-course-stat-item"><i class="fa-solid fa-tag"></i> ${sub?.enrollment_price==null?'Price pending':money(Number(sub.enrollment_price)*100)}</span>
        </div>
        <div class="tw-preview-curriculum">
          <h3 style="font-size:1.05rem;margin:18px 0 10px;font-family:var(--font-heading)">Curriculum preview</h3>
          ${lessonsList.length?lessonsList.map((l,i)=>`<div class="tw-preview-lesson-row">
            <span class="tw-preview-lesson-num">${i+1}</span>
            <div class="tw-preview-lesson-info">
              <strong>${esc(l.title||'Untitled lesson')}</strong>
              <small>${esc(l.syllabus_topic||'General')}</small>
            </div>
            ${safeURL(l.video_url)?`<a href="${esc(safeURL(l.video_url))}" target="_blank" rel="noopener noreferrer" class="tw-preview-video-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open video</a>`:'<span class="tw-hint">Video link not added</span>'}
          </div>`).join(''):'<p class="tw-hint">No lessons added yet.</p>'}
        </div>
      </div>
    </div>`;
  }
  function adminPage(){
    const pending=data.revisions.filter(r=>r.state==='in_review');
    let body='';
    if(adminTab==='reviews'){
      body=`<div class="tw-admin-card">
        <div class="tw-admin-section-head">
          <h2>Class review queue</h2>
          <p>Preview the submitted revision before approving or requesting curriculum modifications.</p>
        </div>
        <div class="tw-admin-list">
          ${pending.length?pending.map(r=>`<div class="tw-admin-row">
            <div class="tw-admin-row-main">
              <h3>${esc(r.body.title)}</h3>
              <p>${esc(tutor(cohort(r.cohort_id)?.tutor_id)?.display_name)} · ${esc(subject(r.body.subject_id)?.name)}</p>
            </div>
            <div class="tw-actions">
              ${button('Review class','admin-class',`data-id="${r.cohort_id}"`,'primary')}
            </div>
          </div>`).join(''):empty('The queue is clear','Submitted classes will appear here for review.')}
        </div>
      </div>`;
    }else if(adminTab==='teachers'){
      body=`<div class="tw-admin-card">
        <div class="tw-admin-section-head">
          <h2>Teacher applications & accounts</h2>
          <p>Approval controls teaching access; suspension prevents new teaching actions.</p>
        </div>
        <div class="tw-admin-list">
          ${data.tutors.map(t=>`<div class="tw-admin-row">
            <div class="tw-admin-row-main">
              <h3>${esc(t.display_name)}</h3>
              <p>${esc((t.subjects||[]).map(id=>subject(id)?.name||id).join(', '))}</p>
              <div style="margin-top:6px">${tag(t.status)}</div>
            </div>
            <div>${button('Review teacher','admin-teacher',`data-id="${t.id}"`)}</div>
          </div>`).join('')||empty('No teacher applications','Applications will appear when educators sign up.')}
        </div>
      </div>`;
    }else if(adminTab==='pricing'){
      body=`<div class="tw-admin-card">
        <div class="tw-admin-section-head">
          <h2>Subject enrollment prices</h2>
          <p>A new price applies to future purchases across every class in that subject.</p>
        </div>
        <div class="tw-admin-list">
          ${data.subjects.map(s=>`<form class="tw-admin-row tw-price-row" data-form="price" data-id="${esc(s.id)}">
            <div class="tw-admin-row-main">
              <h3>${esc(s.name)}</h3>
              <p>${s.enrollment_price==null?'Not configured · enrollment disabled':money(Number(s.enrollment_price)*100)+' per enrollment'}</p>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <label style="display:flex;align-items:center;gap:8px">
                <span class="tw-hint">NGN</span>
                <input class="tw-input" type="number" min="0" step="0.01" required name="price" value="${esc(s.enrollment_price??'')}" aria-label="${esc(s.name)} price" style="width:130px">
              </label>
              <button class="tw-button primary" type="submit">Save price</button>
            </div>
          </form>`).join('')}
        </div>
      </div>`;
    }else if(adminTab==='payouts'){
      body=`<div class="tw-admin-card">
        <div class="tw-admin-section-head">
          <h2>Teacher balances & payouts</h2>
          <p>Record completed external transfers. This does not automatically send bank funds.</p>
        </div>
        <div class="tw-admin-list">
          ${data.tutors.map(t=>{
            const earned=data.earnings.filter(e=>e.tutor_id===t.id).reduce((s,e)=>s+Number(e.teacher_kobo),0);
            const paid=data.payouts.filter(p=>p.tutor_id===t.id&&!p.reversed).reduce((s,p)=>s+Number(p.amount_kobo),0);
            const b=data.banks.find(b=>b.tutor_id===t.id);
            return `<div class="tw-admin-row">
              <div class="tw-admin-row-main">
                <h3>${esc(t.display_name)}</h3>
                <p>${money(earned-paid)} unpaid balance · ${b?(b.reviewed?'Bank details reviewed':'Bank details awaiting review'):'No bank details'}</p>
              </div>
              <div class="tw-actions">${button('Bank & payout','admin-payout',`data-id="${t.id}"`)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="tw-admin-card" style="margin-top:24px">
        <div class="tw-admin-section-head">
          <h2>Recorded completed transfers</h2>
          <p>Corrections preserve the original record through audit trails.</p>
        </div>
        <div class="tw-admin-list">
          ${data.payouts.map(p=>`<div class="tw-admin-row">
            <div class="tw-admin-row-main">
              <strong>${esc(tutor(p.tutor_id)?.display_name)} · ${money(p.amount_kobo)}</strong>
              <p>${esc(p.reference)} · ${date(p.paid_at)}</p>
            </div>
            <div>${p.reversed?tag('reversed'):button('Reverse record','reverse-payout',`data-id="${p.id}"`,'danger small')}</div>
          </div>`).join('')||empty('No recorded payouts','Completed transfers will be listed here.')}
        </div>
      </div>`;
    }else if(adminTab==='reconcile'){
      const legacy=data.enrollments.filter(e=>Number(e.paid_amount)>0&&!data.earnings.some(x=>x.enrollment_id===e.id));
      body=`<div class="tw-admin-card">
        <div class="tw-admin-section-head">
          <h2>Historical payment reconciliation</h2>
          <p>Check external payment evidence before adding historical enrollment revenue to a payable balance.</p>
        </div>
        <div class="tw-admin-list">
          ${legacy.map(e=>`<form class="tw-admin-row" data-form="reconcile" data-id="${e.id}">
            <div class="tw-admin-row-main">
              <strong>${esc(cohort(e.cohort_id)?.title)}</strong>
              <p>${money(Number(e.paid_amount)*100)} · ${date(e.enrolled_at)} · ${esc(student(e.user_id))}</p>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <input class="tw-input" name="reference" required minlength="3" placeholder="Verified payment reference" aria-label="Verified external payment reference" style="width:240px">
              <button class="tw-button primary" type="submit">Confirm evidence</button>
            </div>
          </form>`).join('')||empty('All caught up','No unreconciled paid enrollment records.')}
        </div>
      </div>`;
    }else if(adminTab==='news'){
      body='<section id="admin-news" class="news-admin" aria-label="Website news publishing"></section>';
    }else if(adminTab==='broadcasts'){
      body=`<div class="tw-admin-card">
        <div class="tw-admin-section-head">
          <h2>Resend email news, exam alerts & announcements</h2>
          <p>Compose and dispatch JAMB UTME updates, urgent deadline alerts, and study reminders via Resend.</p>
        </div>
        <form data-form="broadcast" class="tw-broadcast-form" style="display:grid;gap:16px;padding:18px 0 6px">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
            <label class="tw-field">
              <span>Alert category</span>
              <select name="category">
                <option value="jamb_news">JAMB Insider News &amp; Policy</option>
                <option value="exam_alert">Urgent Exam / Deadline Alert</option>
                <option value="study_reminder">Study &amp; CBT Mock Reminder</option>
                <option value="announcement">Platform Announcement</option>
              </select>
            </label>
            <label class="tw-field">
              <span>Target audience</span>
              <select name="audience">
                <option value="all">All Subscribers, Students &amp; Educators</option>
                <option value="subscribers">Subscribed Alert Recipients Only</option>
                <option value="students">UTME Students Only</option>
                <option value="teachers">Educators Only</option>
                <option value="custom">Specific Email Address(es) Only</option>
              </select>
            </label>
          </div>
          ${field('Specific or test email addresses (comma-separated, used when audience is Specific or added to list)','custom_emails',user?.email||'','text','placeholder="e.g. scholar@example.com"')}
          ${field('Email subject line','subject','','text','required maxlength="160" placeholder="e.g. Official JAMB UTME Registration & Mock Exam Update"')}
          ${field('Headline title','title','','text','required maxlength="160" placeholder="e.g. Important Update on JAMB UTME Registration & Cut-Off Marks"')}
          ${textArea('Message content','body','','required rows="5" placeholder="Write the full news update, exam alert, or study reminder here..."')}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
            ${field('Action button text (optional)','action_text','Read on JAMB Insider','text','maxlength="60"')}
            ${field('Action button URL (optional)','action_url','https://thinkright.name.ng/insider.html','url','placeholder="https://thinkright.name.ng/insider.html"')}
          </div>
          <div class="tw-actions" style="justify-content:flex-end;margin-top:6px">
            <button class="tw-button primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Send email broadcast</button>
          </div>
        </form>
      </div>`;
    }else{
      body=`<div class="tw-admin-card">
        <div class="tw-admin-section-head">
          <h2>Activity & audit log</h2>
          <p>Administrative and teaching actions recorded chronologically.</p>
        </div>
        <div class="tw-admin-list">
          ${data.audit.map(e=>`<div class="tw-admin-row">
            <div class="tw-admin-row-main">
              <strong>${esc(e.action.replaceAll('_',' '))}</strong>
              <p>${esc(e.target||'Profile')} · Actor: ${esc(e.actor)} · ${date(e.created_at)}</p>
            </div>
          </div>`).join('')||empty('No activity yet','Changes will appear here.')}
        </div>
      </div>`;
    }
    return `<div class="tw-admin-page">
      ${head('THINKRIGHT CONTROL ROOM','Good teaching deserves a strong foundation.','Review the work, set consistent prices, and keep earnings accountable.')}
      <div class="tw-stats-grid">
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-list-check"></i></div><span class="tw-metric-badge">Queue</span></div>
          <div class="tw-metric-value">${pending.length}</div>
          <div class="tw-metric-label">Classes to review</div>
          <div class="tw-metric-hint">Submitted revisions</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-user-clock"></i></div><span class="tw-metric-badge">Review</span></div>
          <div class="tw-metric-value">${data.tutors.filter(t=>t.status==='pending').length}</div>
          <div class="tw-metric-label">Pending teachers</div>
          <div class="tw-metric-hint">Application queue</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-tags"></i></div><span class="tw-metric-badge">Rates</span></div>
          <div class="tw-metric-value">${data.subjects.filter(s=>s.enrollment_price==null).length}</div>
          <div class="tw-metric-label">Prices to configure</div>
          <div class="tw-metric-hint">Missing catalog price</div>
        </div>
        <div class="tw-metric-card">
          <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-building-columns"></i></div><span class="tw-metric-badge">Accounts</span></div>
          <div class="tw-metric-value">${data.banks.filter(b=>!b.reviewed).length}</div>
          <div class="tw-metric-label">Bank reviews</div>
          <div class="tw-metric-hint">Pending verification</div>
        </div>
      </div>
      <nav class="tw-tabs" aria-label="Admin sections">
        ${[['reviews','Class reviews'],['teachers','Teachers'],['pricing','Subject pricing'],['payouts','Payouts'],['reconcile','Reconciliation'],['news','Website news'],['broadcasts','Email alerts'],['audit','Activity']].map(([id,label])=>`<button data-action="admin-tab" data-tab="${id}" aria-pressed="${adminTab===id}">${label}</button>`).join('')}
      </nav>
      ${body}
    </div>`;
  }
  function render(){const views={dashboard,classes:classesPage,students:studentsPage,analytics:analyticsPage,discussions:discussionsPage,earnings:earningsPage,profile:profilePage,class:editorPage,admin:adminPage};$('#workspace-main').innerHTML=views[page]();if(page==='dashboard')initDashboardCharts();if(page==='analytics')initAnalyticsCharts();if(page==='admin'&&adminTab==='news')window.ThinkRightAdminNews?.mount($('#admin-news'));}
  function showDialog(title,content){dialog.innerHTML=`<div class="tw-dialog-head"><h2 id="dialog-title">${title}</h2><button class="tw-icon-btn" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div>${content}`;if(!dialog.open)dialog.showModal();}
  function menu(open){
    const nav=$('.tw-sidebar');
    const headerToggle=$('.tw-mobile-menu[data-action=menu]');
    const moreToggle=$('.tw-bottom-nav [data-action=menu]');
    nav.classList.toggle('open',open);
    $('.tw-scrim').classList.toggle('open',open);
    headerToggle?.setAttribute('aria-expanded',String(open));
    moreToggle?.setAttribute('aria-expanded',String(open));
    nav.inert=!open;
    document.body.style.overflow=open?'hidden':'';
    if(open){nav.querySelector('button').focus();$('#workspace-main').inert=true;}
    else{$('#workspace-main').inert=false;((typeof window.matchMedia==='function'&&window.matchMedia('(max-width:639px)').matches)?moreToggle:headerToggle)?.focus();}
  }
  async function saveDraft(){captureDraft();const result=await action('save_class',{id:draftId,version:draftVersion,body:draft});draftId=result.id;history.replaceState(null,'',`${paths.class}?id=${draftId}`);dirty=false;await refresh();draftVersion=revision(draftId).version;toast('Draft saved');}
  function switchProfileEditorTab(tab){
    profileEditorTab=tab||'about';
    for(const btn of document.querySelectorAll('[data-action="profile-editor-tab"]')){
      const active=btn.dataset.editorTab===profileEditorTab;
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-selected',String(active));
    }
    for(const sec of document.querySelectorAll('.profile-editor-section')){
      sec.hidden=sec.dataset.editorSection!==profileEditorTab;
    }
  }
  async function handleClick(event){const el=event.target.closest('[data-action]');if(!el)return;const op=el.dataset.action,id=el.dataset.id;
    if(op==='menu'||op==='close-menu'){menu(op==='menu');return;}if(op==='close-dialog'){dialog.close();return;}if(op==='theme'){const isDark=document.documentElement.dataset.theme==='dark'||document.documentElement.getAttribute('data-theme')==='dark';applyTheme(!isDark);return;}
    if(op==='profile-tab'){profileTab=el.dataset.profileTab||'overview';render();return;}
    if(op==='open-profile-modal'){profileEditorTab=el.dataset.editorTab||'about';profileModalOpen=true;render();return;}
    if(op==='close-profile-modal'){profileModalOpen=false;render();return;}
    if(op==='profile-editor-tab'){switchProfileEditorTab(el.dataset.editorTab);return;}
    if(page==='classes'&&op==='class-status'){statusFilter=el.dataset.status;$('#filtered-content').innerHTML=classCards();return;}
    if(page==='classes'&&op==='clear-class-filters'){subjectFilter='all';statusFilter='all';search='';render();return;}
    if(busy)return;
    try{
      if(op==='logout'){if(dirty&&!confirm('Leave without saving this draft?'))return;await window.logout();location.href='login.html';return;}
      if(op==='step'){captureDraft();step=Number(el.dataset.step);render();return;}
      if(op==='add-lesson'){captureDraft();draft.lessons.push({id:crypto.randomUUID(),title:'',syllabus_topic:'',video_url:''});dirty=true;render();return;}
      if(op==='move-lesson'){captureDraft();const i=Number(el.dataset.index),j=i+Number(el.dataset.direction);if(j>=0&&j<draft.lessons.length)[draft.lessons[i],draft.lessons[j]]=[draft.lessons[j],draft.lessons[i]];dirty=true;render();return;}
      if(op==='remove-lesson'){if(!confirm('Remove this lesson from the draft? Published content changes only after approval.'))return;captureDraft();draft.lessons.splice(Number(el.dataset.index),1);dirty=true;render();return;}
      if(op==='preview'){captureDraft();showDialog('Student preview',previewContent(draft));return;}
      if(op==='admin-tab'){adminTab=el.dataset.tab;history.replaceState(null,'','#'+adminTab);render();return;}
      if(op==='class-tab'){const tab=el.dataset.tab;if(tab==='editor')return;captureDraft();classFilter=draftId;showDialog(tab==='students'?'Class students':'Class discussions',tab==='students'?studentsContent():discussionsContent());return;}
      if(op==='student'){
        const sName=student(id);
        const userEnrollments=currentEnrollments().filter(e=>e.user_id===id);
        const modalBody=`<div class="tw-student-dialog-hero"><div class="tw-student-dialog-avatar">${esc(sName.slice(0,1).toUpperCase())}</div><div class="tw-student-dialog-meta"><h3>${esc(sName)}</h3><p>Enrolled in ${userEnrollments.length} ${userEnrollments.length===1?'class':'classes'}</p></div></div>`+userEnrollments.map(e=>{
          const c=cohort(e.cohort_id),comp=completion(e.cohort_id,id),cLessons=lessons(e.cohort_id);
          return `<div class="tw-student-cohort-block"><div class="tw-student-cohort-head"><h4>${esc(c?.title||'Class')}</h4>${tag(comp===100?'completed':(comp>0?'active':'pending'))}</div><div style="margin-bottom:14px">${progress(comp)}</div><div class="tw-student-lessons-list">${cLessons.map((l,i)=>{
            const isDone=data.progress.some(p=>p.lesson_id===l.id&&p.user_id===id);
            return `<div class="tw-student-lesson-row"><span><strong>${i+1}.</strong> ${esc(l.title)} <small class="tw-hint">(${esc(l.syllabus_topic||'Lesson')})</small></span>${tag(isDone?'completed':'pending')}</div>`;
          }).join('')||'<p class="tw-hint">No lessons published yet.</p>'}</div></div>`;
        }).join('');
        showDialog('Student Learning Journey',modalBody);
        return;
      }
      if(op==='admin-class'){const r=revision(id);showDialog('Review class',previewContent(r.body)+`<form data-form="class-review" data-id="${id}">${textArea('Feedback (required when requesting changes)','feedback')}<div class="tw-actions"><button class="tw-button" name="decision" value="changes" type="submit">Request changes</button><button class="tw-button primary" name="decision" value="approve" type="submit">Approve & publish</button></div></form>`);return;}
      if(op==='admin-teacher'){const t=tutor(id);showDialog(esc(t.display_name),`<p>${esc(t.bio||'No biography yet.')}</p><p>${esc((t.subjects||[]).join(', '))}</p>${safeURL(t.sample_video_url)?`<p><a class="tw-button" href="${esc(safeURL(t.sample_video_url))}" target="_blank" rel="noopener noreferrer">Watch sample lesson ↗</a></p>`:''}<form data-form="teacher-review" data-id="${id}"><label class="tw-field"><span>Account status</span><select name="status">${options([['pending','Pending review'],['active','Approved'],['suspended','Suspended']],t.status)}</select></label>${textArea('Decision feedback','feedback',t.review_feedback||'')}<button class="tw-button primary" type="submit">Save decision</button></form>`);return;}
      if(op==='admin-payout'){const b=data.banks.find(b=>b.tutor_id===id);showDialog('Bank details & manual payout',b?`<p><strong>${esc(tutor(id)?.display_name)}</strong></p><div class="tw-notice">${esc(b.bank)}<br>${esc(b.account_name)}<br>${esc(b.account_number)}<br>${b.reviewed?'Reviewed by ThinkRight':'Awaiting review'}</div>${b.reviewed?'':button('Mark details reviewed','bank-review',`data-id="${id}"`)}<form data-form="payout" data-id="${id}" style="margin-top:20px">${field('Amount transferred (NGN)','amount','','number','required min="0.01" step="0.01"')}${field('Payment date','paid_at',today(),'date','required')}${field('External transfer reference','reference','','text','required minlength="3"')}<p class="tw-hint">Only record a transfer already completed outside ThinkRight.</p><button class="tw-button primary" type="submit" ${b.reviewed?'':'disabled'}>Record completed payout</button></form>`:empty('No bank details submitted','Ask the teacher to add their payout account.'));return;}
      if(op==='reverse-payout'){showDialog('Correct a payout record',`<form data-form="reverse-payout" data-id="${id}">${textArea('Reason for reversing this record','reason','','required minlength="3"')}<p class="tw-hint">This restores the unpaid balance. It does not reverse a bank transfer.</p><button class="tw-button danger" type="submit">Reverse record</button></form>`);return;}
      busy=true;el.disabled=true;window.ThinkRightLoader?.ribbonStart();
      if(op==='save-class')await saveDraft();
      else if(op==='submit-class'){await saveDraft();await action('submit_class',{id:draftId});toast('Submitted to ThinkRight for review');}
      else if(op==='withdraw-class'){await action('withdraw_class',{id:draftId});toast('Submission withdrawn');}
      else if(op==='resolve')await action('resolve',{id,resolved:el.dataset.resolved==='true'});
      else if(op==='bank-review'){await action('bank_review',{id});dialog.close();toast('Bank details marked reviewed');}
      await refresh();if(page==='class')draftVersion=revision(draftId)?.version||draftVersion;render();
    }catch(error){toast(error.message);}finally{busy=false;el.disabled=false;window.ThinkRightLoader?.ribbonDone();}
  }
  async function submit(event){const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();if(busy)return;const fields=new FormData(form),payload=Object.fromEntries(fields),id=form.dataset.id;let op=form.dataset.form;busy=true;const submitter=event.submitter;if(submitter)submitter.disabled=true;window.ThinkRightLoader?.ribbonStart();
    try{
      if(op==='profile'){
        payload.subjects=fields.getAll('subjects');
        if(!String(payload.display_name||'').trim()){switchProfileEditorTab('about');throw new Error('Enter your display name');}
        if(!String(payload.whatsapp_number||'').trim()){switchProfileEditorTab('about');throw new Error('Enter your WhatsApp number');}
        if(String(payload.bio||'').trim().length<20){switchProfileEditorTab('about');throw new Error('Please share at least 20 characters about your teaching experience');}
        if(!safeURL(payload.sample_video_url)){switchProfileEditorTab('credentials');throw new Error('Enter a valid HTTPS sample lesson video URL');}
        if(!payload.subjects.length){switchProfileEditorTab('subjects');throw new Error('Choose at least one subject');}
      }
      if(op==='broadcast'){
        if(!window.ThinkRightEmail?.sendBroadcast)throw new Error('Resend email service is not loaded');
        const res=await window.ThinkRightEmail.sendBroadcast(payload);
        if(!res.ok)throw new Error(res.error||'Could not send broadcast');
        form.reset();
        toast(`Email broadcast sent to ${res.data?.recipient_count||1} recipient(s) via Resend`);
        return;
      }
      if(op==='price'){payload.subject_id=id;}
      if(op==='reply'||op==='reconcile'||op==='payout'||op==='reverse-payout'||op==='teacher-review'||op==='class-review')payload.id=id;
      if(op==='class-review'){payload.decision=event.submitter?.value;op='class_review';}
      if(op==='teacher-review')op='teacher_review';if(op==='reverse-payout')op='reverse_payout';
      if(op==='payout'){payload.amount_kobo=Math.round(Number(payload.amount)*100);payload.paid_at=payload.paid_at+'T00:00:00+01:00';}
      await action(op,payload);
      if(window.ThinkRightEmail){
        if(op==='teacher_review'){
          const t=tutor(id);
          window.ThinkRightEmail.notifyTeacherReview({recipient_user_id:id,name:t?.display_name||'Educator',status:payload.status,message:payload.feedback}).catch(()=>{});
        }else if(op==='class_review'){
          const c=cohort(id),r=revision(id),t=tutor(c?.tutor_id);
          window.ThinkRightEmail.notifyClassReview({recipient_user_id:c?.tutor_id,name:t?.display_name||'Educator',class_title:r?.body?.title||c?.title||'Class',decision:payload.decision,feedback:payload.feedback,class_id:id}).catch(()=>{});
        }else if(op==='reply'){
          const parentPost=(data.posts||[]).find(p=>p.id===id);
          const c=cohort(parentPost?.cohort_id);
          const responderName=ownTutor().display_name||data.identity.name||'Educator';
          if(parentPost?.author_id&&parentPost.author_id!==user?.id){
            window.ThinkRightEmail.notifyDiscussionReply({recipient_user_id:parentPost.author_id,recipient_name:student(parentPost.author_id),responder_name:responderName,class_title:c?.title||'Class Discussion',excerpt:String(payload.body||'').slice(0,180)}).catch(()=>{});
          }
        }
      }
      await refresh();if(dialog.open)dialog.close();if(op==='profile')profileModalOpen=false;shell();render();toast('Saved successfully');
    }catch(error){toast(error.message);}finally{busy=false;if(submitter)submitter.disabled=false;window.ThinkRightLoader?.ribbonDone();}
  }
  function wire(){
    document.addEventListener('click',handleClick);document.addEventListener('submit',submit);
    document.addEventListener('input',event=>{if(event.target.closest('#class-editor')){dirty=true;$('#draft-status').textContent='Unsaved changes';}if(event.target.id==='twInputDisplayName'){const v=event.target.value.trim()||'Educator';const av=$('#editorAvatar'),nm=$('#editorPreviewName'),hd=$('#editorPreviewHandle');if(av)av.textContent=v.slice(0,1).toUpperCase();if(nm)nm.textContent=v;if(hd)hd.textContent='@'+(v.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'educator');}if(event.target.id==='twInputBio'){const cnt=$('#editorBioCount');if(cnt)cnt.textContent=`${event.target.value.length} / 4000`;}if(event.target.id==='workspace-search'){search=event.target.value;clearTimeout(wire.timer);wire.timer=setTimeout(()=>{const fn={classes:classCards,students:studentsContent,analytics:analyticsContent,discussions:discussionsContent};if(fn[page])$('#filtered-content').innerHTML=fn[page]();},150);}});
    document.addEventListener('change',async event=>{const key=event.target.dataset.filter;if(event.target.dataset.draft==='subject_id'){captureDraft();render();return;}if(!key)return;if(key==='availability'){window.ThinkRightLoader?.ribbonStart();try{await action('availability',{id:draftId,status:event.target.value});await refresh();toast('Availability updated');}catch(error){toast(error.message);render();}finally{window.ThinkRightLoader?.ribbonDone();}return;}({subject:v=>subjectFilter=v,status:v=>statusFilter=v,class:v=>classFilter=v,period:v=>period=v,from:v=>fromDate=v,to:v=>toDate=v}[key])?.(event.target.value);render();});
    document.addEventListener('keydown',event=>{const nav=$('.tw-sidebar');if(!nav?.classList.contains('open'))return;if(event.key==='Escape'){menu(false);return;}if(event.key==='Tab'){const items=[...nav.querySelectorAll('button,a[href]')].filter(e=>e.offsetParent!==null),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
    window.addEventListener('hashchange',()=>{if(page==='admin'){adminTab=location.hash.slice(1)||'reviews';menu(false);render();}});
    document.addEventListener('click',event=>{if(dirty&&event.target.closest('a[href]')&&!event.target.closest('a[target=_blank]')&&!confirm('Leave without saving your draft?'))event.preventDefault();});
    const resize=()=>{const narrow=matchMedia('(max-width:1023px)').matches;$('.tw-sidebar').inert=!$('.tw-sidebar').classList.contains('open');if(!narrow){$('.tw-sidebar').classList.remove('open');$('.tw-scrim').classList.remove('open');$('.tw-mobile-menu[data-action=menu]')?.setAttribute('aria-expanded','false');$('#workspace-main').inert=false;document.body.style.overflow='';}};window.addEventListener('resize',resize);resize();
  }
  async function start(){
    try{
      window.ThinkRightLoader?.setProgress(25,'Verifying educator credentials...');
      if(!window.authInitialized&&!window.ThinkRightAuth.initSupabase())throw new Error('Authentication could not load. Check your connection and retry.');
      const result=await window.supabase.auth.getUser();user=result.data?.user;
      if(!user){location.replace('login.html?next='+encodeURIComponent(location.pathname+location.search));return;}
      window.ThinkRightLoader?.setProgress(48,'Resolving studio access...');
      const identity=await window.resolveWorkspaceIdentity();
      if(page==='admin'&&identity.role!=='admin'){location.replace(identity.role==='teacher'?paths.dashboard:'dashboard.html');return;}
      if(identity.role==='admin'&&page!=='admin'){location.replace(paths.admin);return;}
      if(identity.role==='student'&&page!=='profile'){location.replace('dashboard.html');return;}
      window.ThinkRightLoader?.setProgress(68,'Syncing studio records...');
      if(identity.role==='student'&&page==='profile'){
        let subjects=fallbackSubjects;
        try{if(window.supabase?.from){const res=await window.supabase.from('subjects').select('*');if(!res.error&&res.data?.length)subjects=res.data;}}catch(_e){}
        data={identity,subjects,tutors:[],classes:[],revisions:[],students:[],enrollments:[],progress:[],lessons:[],posts:[],banks:[],earnings:[],payouts:[],audit:[]};
      }else await refresh(identity);
      if(page==='dashboard'&&location.hash==='#classes'){location.replace(paths.classes);return;}
      if(page==='analytics'){location.replace(paths.dashboard);return;}
      if(page==='class')loadDraft();if(page==='admin'&&location.hash)adminTab=location.hash.slice(1);
      window.ThinkRightLoader?.setProgress(90,'Rendering workspace...');
      const theme=localStorage.getItem('thinkright_theme')||localStorage.getItem('theme');
      applyTheme(theme==='dark');
      shell();render();wire();
      dismissPreloader();
    }catch(error){
      dismissPreloader();
      root.innerHTML=`<main class="tw-start"><a class="tw-brand" href="index.html">ThinkRight<span>.</span></a><h1>We couldn’t open your workspace.</h1><p>${esc(error.message)}</p><p class="tw-hint">If the workspace has just been released, ThinkRight must finish its database setup before it can open.</p><button class="tw-button primary" onclick="location.reload()">Try again</button> <a class="tw-button" href="mailto:thinkright912@gmail.com">Contact support</a></main>`;
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
