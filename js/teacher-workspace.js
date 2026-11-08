/* ThinkRight teacher/admin workspace: all privileged writes use checked database RPCs. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = kobo => new Intl.NumberFormat('en-NG', {style:'currency',currency:'NGN',maximumFractionDigits:2}).format(Number(kobo || 0)/100);
  const date = value => value ? new Date(value).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Lagos'}) : 'Not set';
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(new Date());
  const paths = {dashboard:'tutor-dashboard.html',classes:'tutor-classes.html',class:'tutor-class.html',students:'tutor-students.html',analytics:'tutor-analytics.html',discussions:'tutor-discussions.html',earnings:'tutor-payouts.html',profile:'tutor-onboarding.html',settings:'tutor-settings.html',admin:'admin.html'};
  const titles = {dashboard:'Home',classes:'My classes',class:'Class studio',students:'Students',analytics:'Dashboard',discussions:'Discussions',earnings:'Earnings',profile:'Profile',settings:'Settings',admin:'Administration'};
  /* Font Awesome names shared with the student view (same CDN build). */
  const fa = {dashboard:'fa-house',classes:'fa-book-open',students:'fa-user-graduate',analytics:'fa-chart-line',discussions:'fa-comments',earnings:'fa-wallet',profile:'fa-user',settings:'fa-gear',admin:'fa-shield-halved',plus:'fa-plus',arrow:'fa-arrow-right',arrowLeft:'fa-arrow-left',menu:'fa-bars',close:'fa-xmark',sun:'fa-sun',moon:'fa-moon',check:'fa-check',checkCircle:'fa-circle-check',up:'fa-chevron-up',down:'fa-chevron-down',logout:'fa-arrow-right-from-bracket',play:'fa-play',bell:'fa-bell',users:'fa-users',layers:'fa-layer-group',clock:'fa-clock',flag:'fa-flag',question:'fa-circle-question',trend:'fa-arrow-trend-up',trendDown:'fa-arrow-trend-down',money:'fa-naira-sign',bank:'fa-building-columns',help:'fa-life-ring'};
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
  const adminTabs=['overview','reviews','teachers','payments','textbooks','pricing','payouts','reconcile','news','broadcasts','audit'];
  const validAdminTab=value=>adminTabs.includes(value)?value:'overview';
  let search='', statusFilter='all', subjectFilter='all', classFilter='all', period='30', fromDate='', toDate='', adminTab='overview', profileTab='overview', profileModalOpen=false, profileEditorTab='about';
  const root = $('#workspace-root'), dialog = $('#workspace-dialog');
  let payoutDialogOverflow='';
  let dismissedReviewerFeedback='';
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
      if(page==='earnings'||page==='admin'||idObj.role==='admin')throw _err;
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
    const pendingTeacher=!admin&&data.identity.status==='pending';
    const navKeys=(admin?['admin']:pendingTeacher?['profile','settings']:['dashboard','classes','students','discussions','earnings','profile','settings']).filter(key=>page!=='settings'||key!=='settings');
    const isDark = document.documentElement.dataset.theme === 'dark' || document.documentElement.getAttribute('data-theme') === 'dark';
    const unansweredCount = (data.posts||[]).filter(post=>!post.parent_id&&!post.resolved&&!(data.posts||[]).some(reply=>reply.parent_id===post.id)).length;
    const badges = {
      classes: (data.classes||[]).length ? String((data.classes||[]).length) : '',
      discussions: unansweredCount ? String(unansweredCount) : ''
    };
    const statusLabel = admin ? 'Super Admin' : (data.identity.status==='active' ? 'Verified Educator' : (data.identity.status==='pending' ? 'Application Pending' : 'Account Suspended'));
    const statusClass = admin ? 'admin' : (data.identity.status||'pending');

    root.innerHTML=`<div class="tw-scrim" data-action="close-menu"></div><aside class="tw-sidebar" id="teacher-navigation" aria-label="${admin?'Admin':'Teacher'} mobile navigation"><button class="tw-icon-btn tw-drawer-theme-btn tw-drawer-theme-top" data-action="theme" type="button" aria-label="Toggle dark mode" title="Toggle dark mode"><i class="fa-solid fa-sun tr-navbar__icon-sun" aria-hidden="true"></i><i class="fa-solid fa-moon tr-navbar__icon-moon" aria-hidden="true"></i></button><button class="tw-icon-btn tw-drawer-close" data-action="close-menu" aria-label="Close navigation">${icon('close')}</button><div class="tw-more-heading"><span>${admin?'ADMIN WORKSPACE':'TEACHER WORKSPACE'}</span><h2 id="teacher-more-title">More</h2></div><div class="tw-brand-block"><a class="tw-brand" href="${paths[admin?'admin':'dashboard']}">ThinkRight</a></div><nav class="tw-nav">${navKeys.map(key=>{const b=badges[key]?`<span class="tw-nav-badge">${badges[key]}</span>`:'';return `<a data-nav-key="${key}" href="${paths[key]}" ${page===key||(page==='class'&&key==='classes')?'aria-current="page"':''}><span class="tw-nav-icon">${icon(key)}</span><span class="tw-nav-label">${key==='profile'?'Teaching profile':titles[key]}</span>${b}<i class="fa-solid fa-chevron-right tw-more-chevron" aria-hidden="true"></i></a>`;}).join('')}</nav><div class="tw-sidebar-foot"><div class="tw-foot-tools"><a class="tw-foot-btn" href="mailto:thinkright912@gmail.com" aria-label="Contact support" title="Contact support"><i class="fa-solid fa-life-ring tw-i" aria-hidden="true"></i><span>Support</span></a></div><div class="tw-user"><span class="tw-avatar">${esc(name.slice(0,1).toUpperCase())}<i class="tw-avatar-dot ${statusClass}" title="${statusLabel}" aria-label="${statusLabel}"></i></span><strong title="${esc(name)}">${esc(name)}</strong><button class="tw-foot-btn tw-logout-btn" data-action="logout" type="button" aria-label="Sign out" title="Sign out">${icon('logout')}</button></div></div></aside><header id="tr-navbar" class="tr-navbar tw-header" role="navigation" aria-label="${admin?'Admin':'Teacher'} main navigation"><div class="tr-navbar__container"><a href="${paths[admin?'admin':'dashboard']}" class="tr-navbar__logo tw-brand" aria-label="ThinkRight Home"><span class="tr-navbar__brand">ThinkRight</span></a><ul class="tr-navbar__nav" role="list"><li><a href="${paths[admin?'admin':'dashboard']}" class="tr-navbar__link tr-navbar__link--home" title="Home" aria-label="Home"><i class="fa-solid fa-house"></i></a></li>${navKeys.map(key=>{const isActive=page===key||(page==='class'&&key==='classes');const b=badges[key]?`<span class="tw-nav-badge">${badges[key]}</span>`:'';return `<li><a href="${paths[key]}" class="tr-navbar__link${isActive?' active':''}" ${isActive?'aria-current="page"':''}>${titles[key]}${b}</a></li>`;}).join('')}</ul><div id="tr-user-info" class="tr-navbar__user-info"><div class="tr-navbar__user-avatar" title="${esc(name)} · ${statusLabel}"><span class="tr-navbar__avatar-initial">${esc(name.slice(0,1).toUpperCase())}</span><i class="tw-avatar-dot ${statusClass}" title="${statusLabel}" aria-label="${statusLabel}"></i></div><button id="tr-logout-btn" class="tr-navbar__logout-btn" data-action="logout" type="button" title="Logout" aria-label="Logout"><i class="fa-solid fa-arrow-right-from-bracket"></i><span>Logout</span></button></div><button id="tr-theme-toggle" class="tr-navbar__theme-btn tw-theme-btn" data-action="theme" aria-label="Toggle dark mode" title="Toggle dark mode" type="button"><i class="fa-solid fa-sun tr-navbar__icon-sun" aria-hidden="true"></i><i class="fa-solid fa-moon tr-navbar__icon-moon" aria-hidden="true"></i></button><button class="tr-navbar__logout-btn tw-mobile-logout" data-action="logout" type="button" aria-label="Log out"><i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i><span>Log out</span></button><button id="tr-hamburger" class="tr-navbar__hamburger tw-mobile-menu" data-action="menu" aria-label="Toggle navigation menu" aria-controls="teacher-navigation" aria-expanded="false" type="button"><span class="tr-navbar__hamburger-line"></span><span class="tr-navbar__hamburger-line"></span><span class="tr-navbar__hamburger-line"></span></button></div></header><main id="workspace-main" class="tw-main" tabindex="-1"></main><nav class="tw-bottom-nav" aria-label="Quick navigation">${(admin?['admin','profile','earnings']:data.identity.status==='pending'?['profile']:['dashboard','classes','earnings']).map(key=>`<a href="${admin?'admin.html#'+(key==='profile'?'teachers':key==='earnings'?'payouts':'reviews'):paths[key]}" ${page===key?'aria-current="page"':''}>${icon(key)}<span>${admin?({admin:'Reviews',profile:'Teachers',earnings:'Payouts'}[key]):titles[key]}</span></a>`).join('')}<button data-action="menu" aria-label="More navigation">${icon('menu')}<span>More</span></button></nav>`;
    if(admin){
      const analyticsLink=document.createElement('a');
      analyticsLink.href='admin-analytics.html';analyticsLink.className='tw-button';analyticsLink.textContent='Analytics';
      root.querySelector('.tw-header .tr-navbar__container').appendChild(analyticsLink);
    }
    // Keep logout in the profile and admin headers, outside the navigation drawer.
    const headerLogout = root.querySelector('#tr-logout-btn');
    root.querySelectorAll('.tw-sidebar [data-action="logout"], .tw-mobile-logout').forEach(button=>button.remove());
    if(headerLogout){
      headerLogout.classList.add('tr-profile-header-logout');
      root.querySelector('.tw-header .tr-navbar__container').appendChild(headerLogout);
    }else headerLogout?.remove();
    if(!admin){
      root.querySelector('.tr-navbar__nav a[href="tutor-settings.html"]')?.closest('li')?.remove();
      if(page!=='settings')headerLogout?.insertAdjacentHTML('beforebegin',`<a class="tw-header-settings tw-icon-btn" href="${paths.settings}" aria-label="Settings" title="Settings">${icon('settings')}</a>`);
      root.querySelector('.tr-navbar__link--home')?.closest('li')?.remove();
      root.querySelector(`.tr-navbar__nav a[href="${paths.dashboard}"]`)?.insertAdjacentHTML('afterbegin',icon('dashboard'));
    }
  }
  function notice(){return data.identity.status==='pending'?'<div class="tw-notice">Your teacher application is under review. You can prepare drafts while ThinkRight reviews your profile.</div>':data.identity.status==='suspended'?'<div class="tw-notice error">Your teaching account is suspended. Existing records remain available; contact ThinkRight for support.</div>':'';}
  function reviewerFeedback(t){
    let saved='';try{saved=localStorage.getItem('thinkright_dismissed_review_'+user.id)||'';}catch{}
    return t.review_feedback&&t.review_feedback!==dismissedReviewerFeedback&&t.review_feedback!==saved?`<div class="tw-notice tw-reviewer-feedback" data-reviewer-feedback><p><strong>Reviewer feedback:</strong> ${esc(t.review_feedback)}</p><button class="tw-icon-btn" type="button" data-action="dismiss-reviewer-feedback" aria-label="Dismiss reviewer feedback" title="Dismiss feedback">${icon('close')}</button></div>`:'';
  }
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
      <header class="tw-teacher-home-intro"><div><h1>${greeting}, ${teacherName}</h1><p>A little inspiration. A lasting impact.</p></div><span class="tw-home-date"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ${todayLabel}</span></header>
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
    const priority={changes_requested:0,draft:1,in_review:2,published:3};
    const naira=value=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(value||0));
    const base=data.classes.filter(item=>{
      const body=classBodyOf(item);
      const subjectName=subject(body.subject_id||item.subject_id)?.name||'';
      return (subjectFilter==='all'||(body.subject_id||item.subject_id)===subjectFilter)
        && `${body.title||item.title} ${subjectName}`.toLowerCase().includes(search.toLowerCase());
    });
    const items=filteredClasses();
    const tabs=[['all','All'],['draft','Drafts'],['in_review','In review'],['changes_requested','Needs changes'],['published','Published']]
      .map(([value,label])=>{
        const count=value==='all'?base.length:base.filter(item=>stateOf(item)===value).length;
        return `<button type="button" data-action="class-status" data-status="${value}" aria-pressed="${statusFilter===value}"${value==='changes_requested'&&count?' data-alert="true"':''}><span>${label}</span><strong>${count}</strong></button>`;
      }).join('');
    const tabBar=`<div class="tc-tabs" role="group" aria-label="Filter classes by status">${tabs}</div>`;

    if(!items.length){
      if(data.classes.length){
        return `${tabBar}<div class="tc-empty"><h2>No classes match</h2><p>Try a different subject or status, or clear your search.</p>${button('Clear filters','clear-class-filters','','small')}</div>`;
      }
      return `<div class="tc-empty tc-empty--first">
        <h2>Create your first class</h2>
        <p>Record your lessons once. Students watch them any time, at their own pace.</p>
        <ol class="tc-steps">
          <li><strong>Choose a subject</strong><span>Pick the JAMB subject you teach.</span></li>
          <li><strong>Upload your lessons</strong><span>Add your recorded video lessons in teaching order.</span></li>
          <li><strong>Submit for review</strong><span>ThinkRight checks your class, then publishes it to students.</span></li>
        </ol>
        ${link(`${icon('plus')} Create your first class`,paths.class,true)}
      </div>`;
    }

    // Classes that need the teacher come first (changes requested, then drafts) when no status filter is active.
    const ordered=statusFilter==='all'?[...items].sort((a,b)=>(priority[stateOf(a)]??9)-(priority[stateOf(b)]??9)):items;

    const cardsMarkup=ordered.map(item=>{
      const cur=revision(item.id);
      const body=classBodyOf(item);
      const state=stateOf(item);
      const sName=subject(body.subject_id||item.subject_id)?.name||'Subject';
      const title=body.title||item.title||'Untitled class';
      const curriculum=Array.isArray(body.lessons)?body.lessons:lessons(item.id);
      const price=item.course_type?item.price:body.course_type?body.proposed_price:subject(body.subject_id||item.subject_id)?.enrollment_price;
      const progressValues=currentEnrollments(item.id).map(e=>completion(item.id,e.user_id)).filter(v=>v!==null);
      const compRate=progressValues.length?Math.round(progressValues.reduce((s,v)=>s+v,0)/progressValues.length):null;
      const enrolledCount=currentEnrollments(item.id).length;
      const href=`${paths.class}?id=${item.id}`;
      const actionLabel=state==='in_review'?'View submission':(state==='changes_requested'?'Review feedback':(state==='draft'?'Continue building':'Manage class'));
      const thumb=thumbnailURL(body.thumbnail_path||item.thumbnail_path);
      const cover=thumb
        ? `<div class="tc-cover"><img src="${esc(thumb)}" alt="" width="640" height="360" loading="lazy" decoding="async"><span class="tc-cover__tag">${esc(sName)}</span></div>`
        : `<div class="tc-cover tc-cover--type" aria-hidden="true"><span class="tc-cover__subject">${esc(sName)}</span></div>`;

      return `<article class="tc-card tc-card--${esc(state)}">
        ${cover}
        <div class="tc-card__body">
          <div class="tc-card__top">
            <span class="tc-status tc-status--${esc(state)}"><i aria-hidden="true"></i>${esc(statusNames[state]||state)}</span>
            <h3 class="tc-title">${esc(title)}</h3>
            <p class="tc-desc">${esc(body.description||item.description||'Curriculum details and lesson topics for students.')}</p>
            ${cur?.feedback?`<p class="tc-note"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span><strong>Reviewer note</strong><span class="tc-note__text">${esc(cur.feedback)}</span></span></p>`:''}
          </div>
          <dl class="tc-stats">
            <div><dt>${curriculum.length===1?'Lesson':'Lessons'}</dt><dd>${curriculum.length}</dd></div>
            <div><dt>${enrolledCount===1?'Student':'Students'}</dt><dd>${enrolledCount}</dd></div>
            <div><dt>Completion</dt><dd>${compRate===null?'—':compRate+'%'}</dd></div>
          </dl>
        </div>
        <div class="tc-card__foot">
          <p class="tc-price">${price==null?'<strong class="tc-price--pending">Price pending</strong><span>Set by ThinkRight</span>':`<strong>${naira(price)}</strong><span>Enrollment price</span>`}</p>
          <a class="tc-action tc-action--${esc(state)}" href="${href}">${actionLabel}<span class="tc-sr">: ${esc(title)}</span> ${icon('arrow')}</a>
        </div>
      </article>`;
    }).join('');

    return `${tabBar}
      <div class="tc-count">
        <span>${items.length} ${items.length===1?'class':'classes'}</span>
        <span>Enrollment prices are set by ThinkRight</span>
      </div>
      <div class="tc-grid">${cardsMarkup}</div>`;
  }
  function classesPage(){
    const hasClasses=data.classes.length>0;
    const liveCount=data.classes.filter(c=>(revision(c.id)?.state||'published')==='published').length;
    const studentCount=new Set(data.classes.flatMap(c=>currentEnrollments(c.id).map(e=>e.user_id))).size;
    const rates=data.classes.flatMap(c=>currentEnrollments(c.id).map(e=>completion(c.id,e.user_id))).filter(v=>v!==null);
    const avg=rates.length?Math.round(rates.reduce((s,v)=>s+v,0)/rates.length):null;
    return `<div class="tc-page">
      <header class="tc-head">
        <div><h1>My classes</h1><p>Build lessons, follow reviews and manage your published classes.</p></div>
        ${hasClasses?`<a class="tw-button primary tc-create" href="${esc(paths.class)}">${icon('plus')} Create class</a>`:''}
      </header>
      ${notice()}
      ${hasClasses?`<dl class="tc-summary" aria-label="Your classes at a glance">
        <div><dt>Published</dt><dd>${liveCount}</dd></div>
        <div><dt>Students</dt><dd>${studentCount}</dd></div>
        <div><dt>Avg. completion</dt><dd>${avg===null?'—':avg+'%'}</dd></div>
      </dl>
      <div class="tc-toolbar">
        <label class="tc-search"><span class="tc-sr">Search classes</span><i class="fa-solid fa-magnifying-glass tw-i" aria-hidden="true"></i><input id="workspace-search" type="search" value="${esc(search)}" placeholder="Search by class or subject" autocomplete="off"></label>
        <div class="tc-subject"><span class="tc-sr" id="class-subject-label">Subject</span><button type="button" data-action="classes-subject-picker" aria-haspopup="dialog" aria-labelledby="class-subject-label class-subject-value"><span id="class-subject-value">${esc(subjectFilter==='all'?'All subjects':subject(subjectFilter)?.name||'All subjects')}</span>${icon('down')}</button></div>
      </div>`:''}
      <div id="filtered-content">${classCards()}</div>
    </div>`;
  }
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
        <div class="tw-metric-header"><div class="tw-metric-icon"><i class="fa-solid fa-wallet"></i></div><span class="tw-metric-badge">90% Share</span></div>
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
  const payoutBank = () => data.banks.find(bank=>bank.tutor_id===user.id);
  const hasPayoutBank = () => {const bank=payoutBank();return Boolean(bank?.bank?.trim()&&bank?.account_name?.trim()&&/^\d{10}$/.test(bank?.account_number||''));};
  function earningsPage(){
    const earned=data.earnings.reduce((sum,entry)=>sum+Number(entry.teacher_kobo),0);
    const paid=data.payouts.filter(entry=>!entry.reversed).reduce((sum,entry)=>sum+Number(entry.amount_kobo),0);
    const bank=payoutBank(), bankReady=hasPayoutBank();
    const legacy=data.enrollments.filter(entry=>Number(entry.paid_amount)>0&&!data.earnings.some(earning=>earning.enrollment_id===entry.id));
    const filtered=data.earnings.filter(entry=>(classFilter==='all'||entry.cohort_id===classFilter)&&inPeriod(entry.created_at));
    const suspended=data.identity.status==='suspended';
    return `<div class="tw-payouts-page">
      ${head('','Earnings','Your share of class payments and the transfers recorded by ThinkRight.')}
      ${notice()}
      <section class="tw-earnings-overview" aria-label="All-time earnings">
        <div class="tw-earnings-balance"><h2>Unpaid balance</h2><strong>${money(earned-paid)}</strong><p>Earned so far, minus completed payouts.</p></div>
        <dl class="tw-earnings-totals"><div><dt>Total earned</dt><dd>${money(earned)}</dd></div><div><dt>Paid to you</dt><dd>${money(paid)}</dd></div></dl>
      </section>
      ${legacy.length?`<p class="tw-earnings-reconciliation">${legacy.length} historical payment${legacy.length===1?'':'s'} awaiting reconciliation. These are not included in your balance until ThinkRight checks the payment evidence.</p>`:''}
      <div class="tw-payouts-layout">
        <div class="tw-payouts-main">
          <section class="tw-earnings-section" aria-labelledby="earnings-records-title">
            <header class="tw-earnings-section-head"><h2 id="earnings-records-title">Class earnings</h2><p>Your recorded share of each enrollment payment.</p></header>
            <div class="tw-filterbar">
              <div class="tw-earnings-filter"><span id="earnings-class-label">Class</span><button type="button" data-action="earnings-picker" data-picker="class" aria-haspopup="dialog" aria-labelledby="earnings-class-label earnings-class-value"><span id="earnings-class-value">${esc(classFilter==='all'?'All classes':cohort(classFilter)?.title||'All classes')}</span>${icon('down')}</button></div>
              <div class="tw-earnings-filter"><span id="earnings-period-label">Period</span><button type="button" data-action="earnings-picker" data-picker="period" aria-haspopup="dialog" aria-labelledby="earnings-period-label earnings-period-value"><span id="earnings-period-value">Last ${esc(period)} days</span>${icon('down')}</button></div>
            </div>
            <p class="tw-earnings-filter-note">Filters apply to class earnings only. The balances above show all time.</p>
            <div class="tw-earnings-ledger">
              ${filtered.map(entry=>`<article class="tw-earning-row">
                <div class="tw-earning-main"><h3>${esc(cohort(entry.cohort_id)?.title||'Class enrollment')}</h3><p>${date(entry.created_at)} <span aria-hidden="true">·</span> Ref: ${esc(entry.reference)}</p></div>
                <div class="tw-earning-side"><strong>${money(entry.teacher_kobo)}</strong><small>${Number(entry.gross_kobo)>0?`${Number((Number(entry.teacher_kobo)/Number(entry.gross_kobo)*100).toFixed(2))}% of ${money(entry.gross_kobo)}`:'Your recorded share'}</small></div>
              </article>`).join('')||`<div class="tw-earnings-empty"><h3>No earnings in this period</h3><p>${data.earnings.length?'Try another class or a longer period.':'Your share appears here when a student pays to enroll in your class.'}</p>${data.earnings.length?button('Reset filters','reset-earnings-filters'):''}</div>`}
            </div>
          </section>
          <section class="tw-earnings-section" aria-labelledby="payout-history-title">
            <header class="tw-earnings-section-head"><h2 id="payout-history-title">Payout history</h2><p>Bank transfers recorded by ThinkRight. Corrected records stay visible.</p></header>
            <div class="tw-payouts-ledger">
              ${data.payouts.map(entry=>`<article class="tw-payout-row">
                <div class="tw-payout-main"><strong>${money(entry.amount_kobo)}</strong><p>${date(entry.paid_at)} <span aria-hidden="true">·</span> Ref: ${esc(entry.reference)}</p>${entry.reversal_reason?`<p class="tw-reversal-note">Correction: ${esc(entry.reversal_reason)}</p>`:''}</div>
                <span class="tw-payout-status${entry.reversed?' is-reversed':''}">${entry.reversed?'Reversed':'Paid'}</span>
              </article>`).join('')||'<div class="tw-earnings-empty"><h3>No payouts recorded yet</h3><p>Completed transfers will appear here with their date and reference.</p></div>'}
            </div>
          </section>
        </div>
        <aside class="tw-payouts-side" aria-label="Payout account and information">
          <section class="tw-payout-account" aria-labelledby="payout-account-title">
            <h2 id="payout-account-title">Payout account</h2>
            ${bankReady?`<dl class="tw-payout-account-details"><div><dt>Bank</dt><dd>${esc(bank.bank)}</dd></div><div><dt>Account number</dt><dd>•••••• ${esc(bank.account_number.slice(-4))}</dd></div><div><dt>Account name</dt><dd>${esc(bank.account_name)}</dd></div></dl><p class="tw-payout-account-status">${icon(bank.reviewed?'checkCircle':'clock')} ${bank.reviewed?'Reviewed by ThinkRight':'Awaiting ThinkRight review'}</p>`:'<p>Add the bank account where you want to receive your payouts.</p>'}
            ${suspended?'<p>Contact support to update your payout account.</p>':button(bankReady?'Edit bank details':'Add bank details','edit-payout-bank','','primary')}
          </section>
          <section class="tw-payout-info"><h2>How payouts work</h2><p>ThinkRight reviews your bank details before recording a payout. Saving an account does not send money or confirm a transfer.</p><p>Changing your details starts a new review.</p><a href="mailto:thinkright912@gmail.com">Ask about a payout ${icon('arrow')}</a></section>
        </aside>
      </div>
    </div>`;
  }
  function showPayoutBank(){
    if(page!=='earnings'||data.identity.role!=='teacher'||data.identity.status==='suspended')return;
    const bank=payoutBank();
    dialog.classList.add('tw-bank-drawer');
    showDialog(hasPayoutBank()?'Edit bank details':'Add your payout account',`
      <p id="bank-form-description">Enter the Nigerian bank account where you want to receive your teaching payouts.</p>
      <form data-form="bank" class="tw-bank-form" aria-describedby="bank-form-description">
        ${field('Bank name','bank',bank?.bank||'','text','required maxlength="120" autocomplete="off" autofocus placeholder="e.g. Access Bank"')}
        ${field('Account number','account_number',bank?.account_number||'','text','required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" autocomplete="off" placeholder="10-digit account number"')}
        ${field('Account name','account_name',bank?.account_name||'','text','required maxlength="160" autocomplete="name" placeholder="Name on your bank account"')}
        <p class="tw-hint">Check all details before saving. ThinkRight will review this account before a payout.</p>
        <p class="tw-bank-error" data-bank-error role="alert" tabindex="-1" hidden></p>
        <button class="tw-button primary" type="submit">Save bank details</button>
        ${button('Not now','close-dialog')}
      </form>`);
    dialog.setAttribute('aria-describedby','bank-form-description');
    payoutDialogOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
  }
  function promptPayoutBank(){
    if(page==='earnings'&&data.identity.role==='teacher'&&data.identity.status!=='suspended'&&!hasPayoutBank()&&!dialog.open)showPayoutBank();
  }
  const applicationFields = [
    ['legal_name','Full legal name','text'],['location','City and state / country','text'],
    ['qualification','Highest qualification and course of study','text'],['institution','Awarding institution','text'],
    ['qualification_year','Year qualification was awarded','number'],['experience_years','Years of teaching experience (0 if new)','number'],
    ['weekly_hours','Hours available each week','number'],
    ['equipment','Recording device, microphone and internet access','text']
  ];
  function applicationEvidence(t){
    const a=t.application||{};
    return `<h2>Qualifications and availability</h2><p class="tw-hint">These details and your certificate are visible only to you and ThinkRight reviewers.</p><div class="tw-application-grid">${applicationFields.map(([key,label,type])=>field(label,'application_'+key,a[key]||'',type,`required maxlength="1000" ${type==='url'?'pattern="https://.*"':''} ${key==='qualification_year'?`min="1950" max="${new Date().getFullYear()}"`:key==='experience_years'?'min="0" max="60"':key==='weekly_hours'?'min="1" max="60"':''}`)).join('')}</div>
      <label class="tw-field"><span>Upload your certificate or qualification document</span><input class="tw-input" type="file" name="application_document" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" ${a.credential_path?'':'required'} aria-describedby="credentialUploadHelp"></label>
      <p class="tw-hint" id="credentialUploadHelp">PDF, JPG or PNG. Maximum size: 5 MB. Upload a clear, readable copy.</p>
      ${a.credential_path?`<p class="tw-hint">Uploaded: ${esc(a.credential_name||'Certificate document')} ${button('View document','open-credential',`data-id="${esc(user.id)}"`)}</p>`:''}
      ${textArea('JAMB teaching experience and results','application_jamb_experience',a.jamb_experience||'','required minlength="50" maxlength="4000" rows="4" placeholder="Describe where you have taught, the JAMB subjects you know, and results you can support. If new to teaching, explain your preparation and subject knowledge."')}
      ${textArea('How would you teach one difficult JAMB topic?','application_teaching_plan',a.teaching_plan||'','required minlength="100" maxlength="4000" rows="5" placeholder="Name a topic, state the learning goal, explain your approach, and give a practice question or a way to check understanding."')}
      <label class="tw-check"><input type="checkbox" name="application_declaration" required ${a.declaration==='true'?'checked':''}><span>I confirm these details and materials are accurate, I have permission to share them, and I agree to ThinkRight reviewing them.</span></label>`;
  }
  function needsTeacherApplication(t){
    return !t.id || (t.status!=='active' && (!t.application?.credential_path || !t.display_name || !t.whatsapp_number || String(t.bio||'').trim().length<20 || !safeURL(t.sample_video_url) || !t.subjects?.length));
  }
  function teacherApplication(t){
    return `${head('','Tell us about yourself','Share your teaching experience, contact details and a sample lesson so our team can review your application.')}
      <section class="tw-panel tw-application"><form data-form="profile">
        <h2>Your details</h2>
        <div class="tw-application-grid">
          ${field('Full name / educator name','display_name',t.display_name||user.user_metadata?.username||'','text','required maxlength="120" autocomplete="name"')}
          ${field('WhatsApp number','whatsapp_number',t.whatsapp_number||'','tel','required maxlength="25" autocomplete="tel" placeholder="+234 801 234 5678"')}
        </div>
        ${textArea('Teaching experience and qualifications','bio',t.bio||'','required minlength="20" maxlength="4000" rows="5" placeholder="Tell us about your education, subjects you teach and teaching experience."')}
        ${field('Sample lesson video link','sample_video_url',t.sample_video_url||'','url','required pattern="https://.*" placeholder="https://youtube.com/watch?v=..."')}
        <p class="tw-hint">Share an HTTPS video link our reviewers can open to see how you teach.</p>
        <fieldset class="tw-application-subjects"><legend>Subjects you teach</legend><p class="tw-hint">Select at least one subject.</p><div class="tw-checks">${data.subjects.map(s=>`<label class="tw-check"><input type="checkbox" name="subjects" value="${esc(s.id)}" ${(t.subjects||[]).includes(s.id)?'checked':''}><span>${esc(s.name)}</span></label>`).join('')}</div></fieldset>
        ${applicationEvidence(t)}
        <p class="tw-hint">Submitting does not guarantee approval. Our team reviews your qualifications, sample lesson and teaching approach before making a decision.</p>
        <button type="submit" class="tw-button primary">Submit teaching application ${icon('arrow')}</button>
      </form></section>`;
  }
  function profilePage(){
    const t=ownTutor();
    if(needsTeacherApplication(t)) return teacherApplication(t);
    if(t.status==='pending'||data.identity.status==='pending') return `${head('APPLICATION STATUS','Your application is under review','You can use your workspace once ThinkRight approves your teaching application.')}${notice()}<section class="tw-panel tw-application-status"><span class="tw-application-status__icon"><i class="fa-solid fa-clock" aria-hidden="true"></i></span><h2>Thanks for applying, ${esc(t.display_name||data.identity.name||'Educator')}.</h2><p>Our team is reviewing your qualifications, certificate, teaching experience and sample lesson. We?ll update you when a decision is ready.</p>${reviewerFeedback(t)}<a class="tw-button" href="mailto:thinkright912@gmail.com">Contact support ${icon('arrow')}</a></section>`;

    const displayName=t.display_name||data.identity.name||user?.email?.split('@')[0]||'Educator';
    const handle=String(displayName).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'educator';
    const status=t.status||data.identity.status||'pending';
    const isApproved=status==='active';
    const statusLabel=isApproved?'Verified Educator':(status==='suspended'?'Account Suspended':'Pending Review');
    const selectedSubjectIds=Array.isArray(t.subjects)?t.subjects:[];
    const selectedSubjects=selectedSubjectIds.map(id=>subject(id)).filter(Boolean);
    const safeSampleUrl=safeURL(t.sample_video_url);
    const application=t.application||{};
    return `<div class="profile-container tw-social-profile tw-educator-profile">
      ${notice()}
      ${reviewerFeedback(t)}
      <header class="tw-educator-intro">
        <div class="tw-educator-avatar" aria-hidden="true">${esc(displayName.slice(0,1).toUpperCase())}</div>
        <div><p class="tw-educator-role">JAMB educator</p><h1 id="socialDisplayName">${esc(displayName)}</h1><p class="tw-educator-status">${isApproved?icon('checkCircle'):icon('clock')} ${esc(statusLabel)}</p></div>
        <button type="button" class="tw-button tw-profile-edit-icon" id="openEditModalBtn" data-action="open-profile-modal" data-editor-tab="about" aria-label="Edit profile" title="Edit profile"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
      </header>
      <div class="tw-educator-layout">
        <div>
          <section class="tw-educator-section"><h2>About me</h2><p class="tw-educator-bio" id="socialBio">${esc(t.bio||'Add your teaching background and how you help students learn.')}</p></section>
          <section class="tw-educator-section"><div class="tw-educator-section-head"><h2>Subjects I teach</h2><a class="tw-educator-link" href="tutor-settings.html#subjects">Edit subjects</a></div>
            ${selectedSubjects.length?`<ul class="tw-educator-subjects">${selectedSubjects.map(item=>`<li>${esc(item.name)}</li>`).join('')}</ul>`:'<p>No subjects added yet. Choose your teaching subjects in Edit profile.</p>'}
          </section>
          ${application.qualification||application.institution?`<section class="tw-educator-section"><h2>Qualifications</h2><p>${esc(application.qualification||'')}${application.institution?`<br><span class="tw-educator-secondary">${esc(application.institution)}</span>`:''}</p>${application.experience_years?`<p class="tw-educator-secondary">${esc(application.experience_years)} years of teaching experience</p>`:''}</section>`:''}
          ${safeSampleUrl?`<section class="tw-educator-section"><h2>Sample lesson</h2><p>A preview of your teaching approach.</p><a class="tw-educator-link" href="${esc(safeSampleUrl)}" target="_blank" rel="noopener noreferrer">Watch sample lesson ${icon('play')}<span class="news-sr-only"> (opens in a new tab)</span></a></section>`:''}
        </div>
        <aside class="tw-educator-contact"><h2>Contact details</h2><p class="tw-educator-secondary">Your account and teaching contact.</p><dl><div><dt>Email address</dt><dd>${esc(user?.email||'Not provided')}</dd></div><div><dt>WhatsApp</dt><dd>${esc(t.whatsapp_number||'Not added')}</dd></div></dl></aside>
      </div>

      <div class="social-modal-overlay ${profileModalOpen?'open':''}" id="editProfileModal" role="dialog" aria-modal="true" aria-labelledby="editModalTitle" aria-describedby="editModalIntro">
        <div class="social-modal">
          <div class="profile-editor-main">
            <div class="social-modal__header">
              <div>
                <h2 class="social-modal__title" id="editModalTitle">Edit profile</h2>
                <p class="social-modal__intro" id="editModalIntro">Your teaching identity, all in one place.</p>
              </div>
              <button type="button" class="social-modal__close" data-action="close-profile-modal" aria-label="Close editor"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
            </div>
            <nav class="profile-editor-nav" role="tablist" aria-label="Editor sections">
              <button type="button" role="tab" aria-selected="${profileEditorTab==='about'}" data-action="profile-editor-tab" data-editor-tab="about" class="${profileEditorTab==='about'?'is-active':''}">About you</button>
              <button type="button" role="tab" aria-selected="${profileEditorTab==='credentials'}" data-action="profile-editor-tab" data-editor-tab="credentials" class="${profileEditorTab==='credentials'?'is-active':''}">Sample video</button>
            </nav>
            <form data-form="profile" novalidate>
              <div class="social-modal__body" id="editorScrollArea">
                <section class="profile-editor-section" data-editor-section="about" role="tabpanel" ${profileEditorTab==='about'?'':'hidden'}>
                  <div class="social-form-row">
                    <div class="social-form-group">
                      <label class="social-form-label" for="twInputDisplayName">Display name <span>Required</span></label>
                      <input class="social-input" id="twInputDisplayName" name="display_name" type="text" value="${esc(t.display_name||'')}" required maxlength="120" readonly>
                      <a class="profile-editor-hint" href="tutor-settings.html">Change your name in Settings</a>
                    </div>
                    <div class="social-form-group">
                      <label class="social-form-label" for="twInputWhatsapp">WhatsApp number <span>Required</span></label>
                      <input class="social-input" id="twInputWhatsapp" name="whatsapp_number" type="tel" value="${esc(t.whatsapp_number||'')}" required maxlength="25" placeholder="e.g. +234 801 234 5678">
                    </div>
                  </div>
                  <div class="social-form-group">
                    <div class="profile-editor-label-line">
                      <label class="social-form-label" for="twInputBio">About your teaching <span>Required</span></label>
                      <span id="editorBioCount">${(t.bio||'').length} / 4000</span>
                    </div>
                    <textarea class="social-textarea" id="twInputBio" name="bio" required minlength="20" maxlength="4000" rows="4" placeholder="Detail your background, university degrees, teaching achievements, and why students excel in your classes...">${esc(t.bio||'')}</textarea>
                    <p class="profile-editor-hint">This biography appears directly on your educator profile and class pages.</p>
                    ${t.application?`<details class="tw-profile-evidence"><summary>Application & credentials</summary><p class="profile-editor-hint">Your submitted qualifications and teaching experience.</p>${applicationEvidence(t)}</details>`:''}
                  </div>
                </section>

                <section class="profile-editor-section" data-editor-section="credentials" role="tabpanel" ${profileEditorTab==='credentials'?'':'hidden'}>
                  <div class="social-form-group">
                    <label class="social-form-label" for="twInputSampleVideo">Sample lesson video (HTTPS) <span>Required</span></label>
                    <input class="social-input" id="twInputSampleVideo" name="sample_video_url" type="url" value="${esc(t.sample_video_url||'')}" required pattern="https://.*" placeholder="https://youtube.com/watch?v=... or https://vimeo.com/...">
                    <p class="profile-editor-hint"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Must begin with <code>https://</code>. ThinkRight reviewers watch this sample before approving your studio.</p>
                  </div>
                </section>

                <section class="profile-editor-section" data-editor-section="subjects" hidden>
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
  const teachingSubjects=()=>data.identity.role==='admin'?data.subjects:data.subjects.filter(s=>(ownTutor().subjects||[]).includes(s.id));
  function loadDraft(){draftId=new URLSearchParams(location.search).get('id');const r=draftId?revision(draftId):null;if(draftId&&!r)throw new Error('This class is unavailable to your account.');draft=r?structuredClone(r.body):{title:'',description:'',subject_id:teachingSubjects()[0]?.id||'',start_date:today(),whatsapp_link:'',lessons:[]};draftVersion=r?.version||1;draft.course_type??=r?'':'topic';draft.focused_topics??='';draft.outcomes??='';draft.proposed_price??='';if(!draft.lessons.length)draft.lessons.push({id:crypto.randomUUID(),title:'',syllabus_topic:'',video_url:''});}
  function captureDraft(){const form=$('#class-editor');if(!form)return;for(const input of form.querySelectorAll('[data-draft]'))if(input.type!=='radio'||input.checked)draft[input.dataset.draft]=input.value;for(const input of form.querySelectorAll('[data-lesson]')){const item=draft.lessons[Number(input.dataset.lesson)];if(item)item[input.name]=input.value;}}
  function reviewDraftError(body){return window.ThinkRightCourseStudio.validate(body,teachingSubjects());}
  function editorPage(){
    return notice()+window.ThinkRightCourseStudio.render({draft,revision:revision(draftId),course:cohort(draftId),subjects:teachingSubjects(),step,dirty,coverURL:thumbnailURL,videoEditor:window.ThinkRightVideo.editor});
  }
  function thumbnailURL(path){if(!path||!/^[-a-f0-9]+\/[-a-f0-9]+\.(jpg|png|webp)$/.test(path))return '';return window.supabase?.storage?.from('class-thumbnails').getPublicUrl(path).data.publicUrl||'';}
  async function uploadLessonVideo(event){
    const input=event.target,lessonId=input.dataset.videoLesson,file=input.files?.[0];
    if(!lessonId||!file)return;
    if(uploadLessonVideo.preparing||window.ThinkRightVideo.busy()){toast('Finish or cancel the current upload first.');return;}
    uploadLessonVideo.preparing=true;
    input.disabled=true;
    try{
      captureDraft();
      // Read the selected file immediately, before awaiting any network request.
      // Persist IDs after fingerprinting, but before the upload authorization request.
      const assetId=await window.ThinkRightVideo.upload(file,draftId,lessonId,async()=>{await saveDraft();return draftId;});
      const lesson=draft.lessons.find(l=>l.id===lessonId);
      if(!lesson)throw new Error('Lesson removed. Upload was not attached.');
      lesson.video_asset_id=assetId;lesson.video_url='';dirty=true;
      await saveDraft();render();toast('Video uploaded and draft saved. Submit for review when ready.');
    }catch(error){toast(error.message||'Video upload failed. Reselect the same file to retry.');render();}
    finally{uploadLessonVideo.preparing=false;input.disabled=false;input.value='';}
  }
  async function uploadClassThumbnail(event){
    if(event.target.id!=='class-thumbnail-upload')return;
    const input=event.target,file=input.files?.[0];if(!file)return;
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
    if(!ext||file.size>3*1024*1024){toast('Choose a JPG, PNG or WebP image up to 3 MB.');input.value='';return;}
    input.disabled=true;
    try{captureDraft();const path=`${user.id}/${crypto.randomUUID()}.${ext}`;const {error}=await window.supabase.storage.from('class-thumbnails').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;draft.thumbnail_path=path;dirty=true;render();toast('Thumbnail uploaded. Save your draft to keep it.');}
    catch(error){toast(error.message||'Thumbnail upload failed. Please retry.');input.disabled=false;input.value='';}
  }
  function previewContent(body){
    const sub=subject(body.subject_id);
    const lessonsList=body.lessons||[];
    return `<div class="tw-preview-card">
      ${thumbnailURL(body.thumbnail_path)?`<img class="tw-class-cover" src="${esc(thumbnailURL(body.thumbnail_path))}" alt="${esc(body.title||'Class cover')}" width="640" height="360">`:''}
      <div class="tw-preview-body">
        <span class="tw-subject-tag"><i class="fa-solid fa-book-open"></i> ${esc(sub?.name||body.subject_id||'Subject')}</span>
        <h2 class="tw-preview-title">${esc(body.title||'Untitled class')}</h2>
        <p class="tw-preview-desc">${esc(body.description||'Add a description for your class.')}</p>
        <div class="tw-course-stats-bar">
          <span class="tw-course-stat-item"><i class="fa-solid fa-circle-play"></i> Recorded · Learn at your own pace</span>
          <span class="tw-course-stat-item"><i class="fa-solid fa-layer-group"></i> ${lessonsList.length} ${lessonsList.length===1?'lesson':'lessons'}</span>
          <span class="tw-course-stat-item"><i class="fa-solid fa-tag"></i> ${body.course_type?money(Number(body.proposed_price)*100):sub?.enrollment_price==null?'Price pending':money(Number(sub.enrollment_price)*100)}</span>
        </div>
        ${body.course_type?`<p>${body.course_type==='complete'?'Complete subject course':'Focused topic course'}</p>${body.course_type==='topic'?`<p>Topics: ${esc(body.focused_topics)}</p>`:''}<h3>Learning outcomes</h3><p style="white-space:pre-wrap">${esc(body.outcomes)}</p>`:''}<div class="tw-preview-curriculum">
          <h3 style="font-size:1.05rem;margin:18px 0 10px;font-family:var(--font-heading)">Curriculum preview</h3>
          ${lessonsList.length?lessonsList.map((l,i)=>`<div class="tw-preview-lesson-row">
            <span class="tw-preview-lesson-num">${i+1}</span>
            <div class="tw-preview-lesson-info">
              <strong>${esc(l.title||'Untitled lesson')}</strong>
              <small>${esc(l.syllabus_topic||'General')}</small>
            </div>
            ${l.video_asset_id?window.ThinkRightVideo.inlinePlayer(l.video_asset_id):safeURL(l.video_url)?`<a href="${esc(safeURL(l.video_url))}" target="_blank" rel="noopener noreferrer" class="tw-preview-video-link">Watch existing video</a>`:'<span class="tw-hint">Video not uploaded</span>'}
          </div>`).join(''):'<p class="tw-hint">No lessons added yet.</p>'}
        </div>
      </div>
    </div>`;
  }
  function adminPage(){
    const pending=data.revisions.filter(r=>r.state==='in_review');
    let body='';
    if(['overview','payments','textbooks'].includes(adminTab)){
      body='<section id="admin-console" aria-live="polite"></section>';
    }else if(adminTab==='reviews'){
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
          <h2>Email notifications & announcements</h2>
          <p>General notifications reach every registered user by default. Choose a role to send updates only to students, teachers or admins; no subscription is required.</p>
        </div>
        <form data-form="broadcast" class="tw-broadcast-form" style="display:grid;gap:16px;padding:18px 0 6px">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
            <label class="tw-field">
              <span>Alert category</span>
              <select name="category">
                <option value="announcement">General notification</option>
                <option value="jamb_news">JAMB Insider News &amp; Policy</option>
                <option value="exam_alert">Urgent Exam / Deadline Alert</option>
                <option value="study_reminder">Study &amp; CBT Mock Reminder</option>
              </select>
            </label>
            <label class="tw-field">
              <span>Target audience</span>
              <select name="audience">
                <option value="all">General — all registered users</option>
                <option value="subscribers">Subscribed Alert Recipients Only</option>
                <option value="students">UTME Students Only</option>
                <option value="teachers">Educators Only</option>
                <option value="admins">Admins Only</option>
                <option value="custom">Specific Email Address(es) Only</option>
              </select>
            </label>
          </div>
          ${field('Specific email addresses (used only for the Specific audience)','custom_emails','','text','placeholder="e.g. scholar@example.com"')}
          ${field('Email subject line','subject','','text','required maxlength="160" placeholder="e.g. Official JAMB UTME Registration & Mock Exam Update"')}
          ${field('Headline title','title','','text','required maxlength="160" placeholder="e.g. Important Update on JAMB UTME Registration & Cut-Off Marks"')}
          ${textArea('Message content','body','','required rows="5" placeholder="Write the full news update, exam alert, or study reminder here..."')}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
            ${field('Action button text (optional)','action_text','Read on JAMB Insider','text','maxlength="60"')}
            ${field('Action button URL (optional)','action_url','https://thinkright.com.ng/insider.html','url','placeholder="https://thinkright.com.ng/insider.html"')}
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
      ${head('ADMINISTRATION','Your platform, at a glance.','Manage learning, review applications, and keep track of payments.')}
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
        ${adminTabs.map((id,index)=>`<button data-action="admin-tab" data-tab="${id}" aria-pressed="${adminTab===id}">${['Overview','Class reviews','Teachers','Payments','Textbooks','Pricing','Payouts','Reconciliation','News','Email alerts','Activity'][index]}</button>`).join('')}
      </nav>
      ${body}
    </div>`;
  }
  function render(){const views={dashboard,classes:classesPage,students:studentsPage,analytics:analyticsPage,discussions:discussionsPage,earnings:earningsPage,settings:()=>window.ThinkRightTeacherSettings.render(data,user,async()=>{await refresh();shell();render();}),profile:profilePage,class:editorPage,admin:adminPage};window.ThinkRightVideo.unmountInline($('#workspace-main'));$('#workspace-main').innerHTML=views[page]();window.ThinkRightVideo.mountInline($('#workspace-main'));if(page==='dashboard')initDashboardCharts();if(page==='analytics')initAnalyticsCharts();if(page==='admin'&&adminTab==='news')window.ThinkRightAdminNews?.mount($('#admin-news'));if(page==='admin'&&$('#admin-console'))window.ThinkRightAdminConsole?.mount($('#admin-console'),adminTab,data);}
  function showDialog(title,content){window.ThinkRightVideo.unmountInline(dialog);dialog.innerHTML=`<div class="tw-dialog-head"><h2 id="dialog-title">${title}</h2><button class="tw-icon-btn" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button></div>${content}`;if(!dialog.open)dialog.showModal();window.ThinkRightVideo.mountInline(dialog);dialog.onclose=()=>window.ThinkRightVideo.unmountInline(dialog);}
  function menu(open){
    const nav=$('.tw-sidebar');
    const headerToggle=$('.tw-mobile-menu[data-action=menu]');
    const moreToggle=$('.tw-bottom-nav [data-action=menu]');
    nav.classList.toggle('open',open);
    $('.tw-scrim').classList.toggle('open',open);
    headerToggle?.setAttribute('aria-expanded',String(open));
    moreToggle?.setAttribute('aria-expanded',String(open));
    nav.inert=!open;
    if(open){nav.setAttribute('role','dialog');nav.setAttribute('aria-modal','true');nav.setAttribute('aria-labelledby','teacher-more-title');}
    else{nav.removeAttribute('role');nav.removeAttribute('aria-modal');}
    document.body.style.overflow=open?'hidden':'';
    if(open){nav.querySelector('[data-action="close-menu"]').focus();$('#workspace-main').inert=true;}
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
    if(op==='classes-subject-picker'){showDialog('Choose a subject',`<div class="tw-earnings-choices">${[['all','All subjects'],...data.subjects.map(item=>[item.id,item.name])].map(([value,label])=>`<button type="button" data-action="classes-subject-choice" data-value="${esc(value)}" aria-pressed="${subjectFilter===value}">${esc(label)}${subjectFilter===value?icon('check'):''}</button>`).join('')}</div>`);return;}
    if(op==='classes-subject-choice'){subjectFilter=el.dataset.value;dialog.close();render();$('[data-action="classes-subject-picker"]')?.focus();return;}
    if(op==='dismiss-reviewer-feedback'){dismissedReviewerFeedback=ownTutor().review_feedback||'';try{localStorage.setItem('thinkright_dismissed_review_'+user.id,dismissedReviewerFeedback);}catch{}el.closest('[data-reviewer-feedback]')?.remove();return;}
    if((uploadLessonVideo.preparing||window.ThinkRightVideo?.busy())&&['save-class','submit-class','remove-lesson','move-lesson','add-lesson','withdraw-class','accept-course-price','step'].includes(op)){toast('Finish or cancel the current video upload first.');return;}
    if(op==='menu'||op==='close-menu'){menu(op==='menu');return;}if(op==='close-dialog'){if(dialog.classList.contains('tw-bank-drawer')&&busy)return;dialog.close();return;}if(op==='theme'){const isDark=document.documentElement.dataset.theme==='dark'||document.documentElement.getAttribute('data-theme')==='dark';applyTheme(!isDark);return;}
    if(op==='edit-payout-bank'){showPayoutBank();return;}
    if(op==='earnings-picker'){
      const key=el.dataset.picker,selected=key==='class'?classFilter:period;
      const choices=key==='class'?[['all','All classes'],...data.classes.map(item=>[item.id,item.title])]:[['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days']];
      showDialog(key==='class'?'Choose a class':'Choose a period',`<div class="tw-earnings-choices">${choices.map(([value,label])=>`<button type="button" data-action="earnings-choice" data-picker="${key}" data-value="${esc(value)}" aria-pressed="${value===selected}">${esc(label)}${value===selected?icon('check'):''}</button>`).join('')}</div>`);return;
    }
    if(op==='earnings-choice'){const key=el.dataset.picker;if(key==='class')classFilter=el.dataset.value;else period=el.dataset.value;dialog.close();render();$(`[data-action="earnings-picker"][data-picker="${key}"]`)?.focus();return;}
    if(op==='reset-earnings-filters'){classFilter='all';period='90';render();return;}
    if(op==='profile-tab'){profileTab=el.dataset.profileTab||'overview';render();return;}
    if(op==='open-profile-modal'){profileEditorTab=el.dataset.editorTab||'about';profileModalOpen=true;render();document.body.style.overflow='hidden';$('#editProfileModal .social-modal__close')?.focus();return;}
    if(op==='close-profile-modal'){profileModalOpen=false;document.body.style.overflow='';render();$('#openEditModalBtn')?.focus();return;}
    if(op==='profile-editor-tab'){switchProfileEditorTab(el.dataset.editorTab);return;}
    if(page==='classes'&&op==='class-status'){statusFilter=el.dataset.status;$('#filtered-content').innerHTML=classCards();return;}
    if(page==='classes'&&op==='clear-class-filters'){subjectFilter='all';statusFilter='all';search='';render();return;}
    if(busy)return;
    try{
      if(op==='logout'){if(dirty&&!confirm('Leave without saving this draft?'))return;await window.logout();location.href='login.html';return;}
      if(op==='step'){if(uploadLessonVideo.preparing||window.ThinkRightVideo.busy()){toast('Finish or cancel the upload first.');return;}captureDraft();const target=Number(el.dataset.step);const problem=target>step&&revision(draftId)?.state!=='in_review'?window.ThinkRightCourseStudio.validate(draft,teachingSubjects(),target):null;step=problem?problem.step:target;render();if(problem){toast(problem.message);if(problem.field)document.querySelector(`[data-draft="${problem.field}"]`)?.focus();}else{window.scrollTo(0,0);document.querySelector('.cs-workspace h2')?.setAttribute('tabindex','-1');document.querySelector('.cs-workspace h2')?.focus();}return;}
      if(op==='add-lesson'){captureDraft();draft.lessons.push({id:crypto.randomUUID(),title:'',syllabus_topic:'',video_url:''});dirty=true;render();return;}
      if(op==='move-lesson'){captureDraft();const i=Number(el.dataset.index),j=i+Number(el.dataset.direction);if(j>=0&&j<draft.lessons.length)[draft.lessons[i],draft.lessons[j]]=[draft.lessons[j],draft.lessons[i]];dirty=true;render();return;}
      if(op==='remove-lesson'){if(!confirm('Remove this lesson from the draft? Published content changes only after approval.'))return;captureDraft();draft.lessons.splice(Number(el.dataset.index),1);dirty=true;render();return;}
      if(op==='preview'){captureDraft();showDialog('Student preview',previewContent(draft));return;}
      if(op==='admin-tab'){adminTab=validAdminTab(el.dataset.tab);history.replaceState(null,'','#'+adminTab);render();return;}
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
      if(op==='request-course-price'){showDialog('Request a price change',`<form data-form="course-price-request" data-id="${draftId}"><input type="hidden" name="version" value="${draftVersion}">${field('Your proposed price (NGN)','price',draft.proposed_price,'number','min="100" max="1000000" step="0.01" required')}${textArea('Why would you like a different price?','reason','','minlength="10" maxlength="1000" required')}<button class="tw-button primary" type="submit">Send price request</button></form>`);return;}
      if(op==='admin-class'){const r=revision(id);showDialog('Review class',previewContent(r.body)+`<form data-form="class-review" data-id="${id}">${r.body.course_type?field('Enrollment price (NGN)','approved_price',r.suggested_price??r.body.proposed_price,'number','min="100" max="1000000" step="0.01" required')+'<p class="tw-hint">A different price requires the teacher’s acceptance before publication.</p>':''}${textArea('Feedback (required when requesting changes)','feedback')}<div class="tw-actions"><button class="tw-button" name="decision" value="changes" type="submit">Request changes</button><button class="tw-button primary" name="decision" value="approve" type="submit">Approve course</button></div></form>`);return;}
      if(op==='open-credential'){
        const t=tutor(id), path=t?.application?.credential_path;
        if(!path){toast('No document has been uploaded.');return;}
        try {
          const url=await window.ThinkRightDocuments.signedURL(path);
          showDialog('Certificate document',`<p>${esc(t.application.credential_name||'Certificate document')}</p><p><a class="tw-button primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open document ${icon('arrow')}</a></p><p class="tw-hint">This private link expires in 5 minutes.</p>`);
        }catch(error){toast(error.message);}
        return;
      }
      if(op==='admin-teacher'){
        const t=tutor(id), app=t.application||{};
        const evidence=Object.keys(app).length?`<dl class="tw-application-review">${[...applicationFields.map(([key,label])=>[key,label]),['jamb_experience','JAMB experience and results'],['teaching_plan','Sample teaching plan']].map(([key,label])=>`<dt><strong>${esc(label)}</strong></dt><dd>${key==='credential_url'&&safeURL(app[key])?`<a href="${esc(safeURL(app[key]))}" target="_blank" rel="noopener noreferrer">Open credential evidence ?</a>`:esc(app[key]||'Not provided')}</dd>`).join('')}</dl>`:'<p class="tw-hint">This teacher has not submitted the extended application. Approval requires a complete application.</p>';
        showDialog(esc(t.display_name),`<p>${esc(t.bio||'No biography yet.')}</p><p>WhatsApp: ${esc(t.whatsapp_number||'Not provided')}</p><p>${esc((t.subjects||[]).join(', '))}</p>${safeURL(t.sample_video_url)?`<p><a class="tw-button" href="${esc(safeURL(t.sample_video_url))}" target="_blank" rel="noopener noreferrer">Watch sample lesson ?</a></p>`:''}${evidence}${app.credential_path?button('View uploaded certificate','open-credential',`data-id="${esc(t.id)}"`):'<p class="tw-hint">No certificate uploaded yet.</p>'}<form data-form="teacher-review" data-id="${id}"><fieldset><legend>Approval checklist</legend>${[['credentials_checked','I checked the qualifications and supporting evidence.'],['lesson_checked','I watched the sample lesson and assessed accuracy and clarity.'],['experience_checked','I assessed JAMB knowledge, teaching approach and availability.']].map(([key,label])=>`<label class="tw-check"><input type="checkbox" name="${key}"><span>${label}</span></label>`).join('')}</fieldset><label class="tw-field"><span>Account status</span><select name="status">${options([['pending','Pending review'],['active','Approved'],['suspended','Suspended']],t.status)}</select></label>${textArea('Decision and reasons','feedback',t.review_feedback||'','required minlength="20" maxlength="4000"')}<button class="tw-button primary" type="submit">Save decision</button></form>`);return;}

      if(op==='admin-payout'){const b=data.banks.find(b=>b.tutor_id===id);showDialog('Bank details & manual payout',b?`<p><strong>${esc(tutor(id)?.display_name)}</strong></p><div class="tw-notice">${esc(b.bank)}<br>${esc(b.account_name)}<br>${esc(b.account_number)}<br>${b.reviewed?'Reviewed by ThinkRight':'Awaiting review'}</div>${b.reviewed?'':button('Mark details reviewed','bank-review',`data-id="${id}"`)}<form data-form="payout" data-id="${id}" style="margin-top:20px">${field('Amount transferred (NGN)','amount','','number','required min="0.01" step="0.01"')}${field('Payment date','paid_at',today(),'date','required')}${field('External transfer reference','reference','','text','required minlength="3"')}<p class="tw-hint">Only record a transfer already completed outside ThinkRight.</p><button class="tw-button primary" type="submit" ${b.reviewed?'':'disabled'}>Record completed payout</button></form>`:empty('No bank details submitted','Ask the teacher to add their payout account.'));return;}
      if(op==='reverse-payout'){showDialog('Correct a payout record',`<form data-form="reverse-payout" data-id="${id}">${textArea('Reason for reversing this record','reason','','required minlength="3"')}<p class="tw-hint">This restores the unpaid balance. It does not reverse a bank transfer.</p><button class="tw-button danger" type="submit">Reverse record</button></form>`);return;}
      busy=true;el.disabled=true;window.ThinkRightLoader?.ribbonStart();
      if(op==='remove-thumbnail'){captureDraft();draft.thumbnail_path='';dirty=true;render();return;}
      if(op==='save-class')await saveDraft();
      else if(op==='submit-class'){if(window.ThinkRightVideo.busy())throw new Error('Wait for the video upload to finish.');captureDraft();const problem=reviewDraftError(draft);if(problem){step=problem.step;render();if(problem.field)document.querySelector(`[data-draft="${problem.field}"]`)?.focus();throw new Error(problem.message);}if(draft.lessons.some(l=>!l.video_asset_id))throw new Error('Upload a ThinkRight video for every lesson before review.');await saveDraft();await action('submit_class',{id:draftId});toast('Submitted to ThinkRight for review');}
      else if(op==='accept-course-price'){await action('accept_course_price',{id:draftId,version:draftVersion});await refresh();loadDraft();toast('Price accepted. Your course is published.');}
      else if(op==='withdraw-class'){await action('withdraw_class',{id:draftId});toast('Submission withdrawn');}
      else if(op==='resolve')await action('resolve',{id,resolved:el.dataset.resolved==='true'});
      else if(op==='bank-review'){await action('bank_review',{id});dialog.close();toast('Bank details marked reviewed');}
      await refresh();if(page==='class')draftVersion=revision(draftId)?.version||draftVersion;render();
    }catch(error){toast(error.message);}finally{busy=false;el.disabled=false;window.ThinkRightLoader?.ribbonDone();}
  }
  async function submit(event){if(event.target.id==='class-editor'){event.preventDefault();return;}const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();if(busy)return;const fields=new FormData(form),payload=Object.fromEntries(fields),id=form.dataset.id;let op=form.dataset.form;busy=true;const submitter=event.submitter;if(submitter)submitter.disabled=true;window.ThinkRightLoader?.ribbonStart();
    const applicationSubmission=op==='profile'&&fields.has('application_legal_name');
    const submissionLoader=applicationSubmission?window.ThinkRightLoader:null;
    let loaderHeartbeat=null;
    try{
      if(op==='bank'){
        const error=form.querySelector('[data-bank-error]');if(error){error.hidden=true;error.textContent='';}
        for(const key of ['bank','account_name','account_number'])payload[key]=String(payload[key]||'').trim();
        if(!payload.bank||!payload.account_name)throw new Error('Enter the bank name and the name on your account.');
        if(!/^[0-9]{10}$/.test(payload.account_number))throw new Error('Enter a 10-digit account number.');
        if(submitter)submitter.textContent='Saving bank details...';
      }
      if(submissionLoader){
        submissionLoader.hold('teacher-application');
        submissionLoader.show('Submitting your teaching application...');
        submissionLoader.setProgress(10,'Checking your application...');
        // Keep the existing loader's safety timeout from dismissing an active upload.
        loaderHeartbeat=window.setInterval(()=>submissionLoader.hold('teacher-application'),10000);
      }
      if(op==='profile'){
        payload.subjects=fields.getAll('subjects');
        if (fields.has('application_legal_name')) {
          const ready = await window.supabase.from('teacher_applications').select('tutor_id').limit(1);
          if (ready.error) throw new Error('Teaching applications are temporarily unavailable. Please contact ThinkRight support.');
          payload.application=Object.fromEntries(applicationFields.map(([key])=>[key,String(fields.get('application_'+key)||'').trim()]));
          for (const key of ['jamb_experience','teaching_plan']) payload.application[key]=String(fields.get('application_'+key)||'').trim();
          payload.application.declaration=fields.has('application_declaration')?'true':'false';
        }

        if(!String(payload.display_name||'').trim()){switchProfileEditorTab('about');throw new Error('Enter your display name');}
        if(!String(payload.whatsapp_number||'').trim()){switchProfileEditorTab('about');throw new Error('Enter your WhatsApp number');}
        if(String(payload.bio||'').trim().length<20){switchProfileEditorTab('about');throw new Error('Please share at least 20 characters about your teaching experience');}
        if(!safeURL(payload.sample_video_url)){switchProfileEditorTab('credentials');throw new Error('Enter a valid HTTPS sample lesson video URL');}
        if(!payload.subjects.length){switchProfileEditorTab('subjects');throw new Error('Choose at least one subject');}
      }
      if(op==='profile' && payload.application){
        const file=form.querySelector('[name="application_document"]')?.files?.[0];
        const existing=ownTutor().application||{};
        if(file){
          submissionLoader?.setProgress(30,'Uploading your certificate...');
          Object.assign(payload.application,await window.ThinkRightDocuments.upload(file,user.id));
        }else if(existing.credential_path){
          payload.application.credential_path=existing.credential_path;
          payload.application.credential_name=existing.credential_name;
        }else throw new Error('Upload your certificate or qualification document.');
        delete payload.application_document;
      }
      if(op==='broadcast'){
        if(!window.ThinkRightEmail?.sendBroadcast)throw new Error('Resend email service is not loaded');
        const res=await window.ThinkRightEmail.sendBroadcast(payload);
        if(!res.ok)throw new Error(res.error||'Could not send broadcast');
        form.reset();
        toast(`Email broadcast sent to ${res.data?.recipient_count||1} recipient(s) via Resend`);
        return;
      }
      if(op==='course-price-request'){payload.id=id;op='request_course_price';}
      if(op==='price'){payload.subject_id=id;}
      if(op==='reply'||op==='reconcile'||op==='payout'||op==='reverse-payout'||op==='teacher-review'||op==='class-review')payload.id=id;
      if(op==='class-review'){payload.decision=event.submitter?.value;op='class_review';}
      if(op==='teacher-review')op='teacher_review';if(op==='reverse-payout')op='reverse_payout';
      if(op==='payout'){payload.amount_kobo=Math.round(Number(payload.amount)*100);payload.paid_at=payload.paid_at+'T00:00:00+01:00';}
      submissionLoader?.setProgress(65,'Saving your teaching application...');
      const actionResult=await action(op,payload);
      if(window.ThinkRightEmail){
        if(op==='teacher_review'){
          const t=tutor(id);
          window.ThinkRightEmail.notifyTeacherReview({recipient_user_id:id,name:t?.display_name||'Educator',status:payload.status,message:payload.feedback}).catch(()=>{});
        }else if(op==='class_review'&&!actionResult?.price_pending){
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
      submissionLoader?.setProgress(85,'Updating your teaching workspace...');
      await refresh();if(op==='request_course_price')loadDraft();if(dialog.open)dialog.close();if(op==='profile'){profileModalOpen=false;document.body.style.overflow='';}shell();render();toast(op==='bank'?'Bank details saved. Awaiting ThinkRight review.':actionResult?.price_pending?'Price suggestion sent. Awaiting teacher acceptance.':'Saved successfully');
    }catch(error){const bankError=op==='bank'?form.querySelector('[data-bank-error]'):null;if(bankError){bankError.textContent=error.message;bankError.hidden=false;bankError.focus();}else toast(error.message);}finally{
      if(loaderHeartbeat!==null)window.clearInterval(loaderHeartbeat);
      if(submissionLoader){submissionLoader.release('teacher-application');submissionLoader.done();}
      busy=false;if(submitter){submitter.disabled=false;if(op==='bank')submitter.textContent='Save bank details';}window.ThinkRightLoader?.ribbonDone();
    }
  }
  function wire(){
    dialog.addEventListener('cancel',event=>{if(dialog.classList.contains('tw-bank-drawer')&&busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{
      if(!dialog.classList.contains('tw-bank-drawer'))return;
      dialog.classList.remove('tw-bank-drawer');dialog.removeAttribute('aria-describedby');
      document.body.style.overflow=payoutDialogOverflow;
      $('[data-action="edit-payout-bank"]')?.focus();
    });
    window.addEventListener('pageshow',event=>{if(event.persisted)promptPayoutBank();});
    document.addEventListener('keydown',event=>{
      if(!profileModalOpen)return;
      if(event.key==='Escape'){$('#editProfileModal [data-action="close-profile-modal"]')?.click();return;}
      if(event.key!=='Tab')return;
      const items=[...document.querySelectorAll('#editProfileModal button, #editProfileModal input, #editProfileModal textarea, #editProfileModal select, #editProfileModal a[href]')].filter(item=>!item.disabled&&item.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
    document.addEventListener('change',uploadClassThumbnail);
    document.addEventListener('change',uploadLessonVideo);
    document.addEventListener('click',handleClick);document.addEventListener('submit',submit);
    document.addEventListener('input',event=>{if(event.target.closest('#class-editor')){dirty=true;$('#draft-status').textContent='Unsaved changes';if(event.target.dataset.draft==='proposed_price'){const gross=Math.round(Number(event.target.value||0)*100),share=Math.round(gross*.9);$('#course-teacher-share').textContent=money(share);$('#course-platform-share').textContent=money(gross-share);}}if(event.target.id==='twInputDisplayName'){const v=event.target.value.trim()||'Educator';const av=$('#editorAvatar'),nm=$('#editorPreviewName'),hd=$('#editorPreviewHandle');if(av)av.textContent=v.slice(0,1).toUpperCase();if(nm)nm.textContent=v;if(hd)hd.textContent='@'+(v.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'educator');}if(event.target.id==='twInputBio'){const cnt=$('#editorBioCount');if(cnt)cnt.textContent=`${event.target.value.length} / 4000`;}if(event.target.id==='workspace-search'){search=event.target.value;clearTimeout(wire.timer);wire.timer=setTimeout(()=>{const fn={classes:classCards,students:studentsContent,analytics:analyticsContent,discussions:discussionsContent};if(fn[page])$('#filtered-content').innerHTML=fn[page]();},150);}});
    document.addEventListener('change',async event=>{const key=event.target.dataset.filter;if(['subject_id','course_type'].includes(event.target.dataset.draft)){captureDraft();render();return;}if(!key)return;if(key==='availability'){window.ThinkRightLoader?.ribbonStart();try{await action('availability',{id:draftId,status:event.target.value});await refresh();toast('Availability updated');}catch(error){toast(error.message);render();}finally{window.ThinkRightLoader?.ribbonDone();}return;}({subject:v=>subjectFilter=v,status:v=>statusFilter=v,class:v=>classFilter=v,period:v=>period=v,from:v=>fromDate=v,to:v=>toDate=v}[key])?.(event.target.value);render();});
    document.addEventListener('keydown',event=>{const nav=$('.tw-sidebar');if(!nav?.classList.contains('open'))return;if(event.key==='Escape'){menu(false);return;}if(event.key==='Tab'){const items=[...nav.querySelectorAll('button,a[href]')].filter(e=>e.offsetParent!==null),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
    window.addEventListener('hashchange',()=>{if(page==='admin'){adminTab=validAdminTab(location.hash.slice(1));menu(false);render();}});
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
      if(page==='class')loadDraft();if(page==='admin'&&location.hash)adminTab=validAdminTab(location.hash.slice(1));
      window.ThinkRightLoader?.setProgress(90,'Rendering workspace...');
      const theme=localStorage.getItem('thinkright_theme')||localStorage.getItem('theme');
      applyTheme(theme==='dark');
      shell();render();wire();
      dismissPreloader();
      promptPayoutBank();
    }catch(error){
      dismissPreloader();
      root.innerHTML=`<main class="tw-start"><a class="tw-brand" href="index.html">ThinkRight<span>.</span></a><h1>${page==='earnings'?'Your earnings couldn’t load.':'We couldn’t open your workspace.'}</h1><p>${esc(error.message)}</p><p class="tw-hint">${page==='earnings'?'Check your connection and try again. Your balance and bank details will appear once they load.':'If the workspace has just been released, ThinkRight must finish its database setup before it can open.'}</p><button class="tw-button primary" onclick="location.reload()">Try again</button> <a class="tw-button" href="mailto:thinkright912@gmail.com">Contact support</a></main>`;
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
