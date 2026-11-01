/* Privileged reports are calculated by admin-only RPCs, never by public queries. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value || 0).toLocaleString('en-NG');
  const money = value => new Intl.NumberFormat('en-NG', {style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(value || 0)/100);
  const date = value => value ? new Date(value).toLocaleString('en-NG', {timeZone:'Africa/Lagos',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'No recorded activity';
  const day = value => value.toLocaleDateString('en-CA', {timeZone:'Africa/Lagos'});
  let kind = 'student', page = 0, search = '', report, filters, request = 0, personRequest = 0, authorized = false;
  async function rpc(name, args) {
    const {data,error} = await window.supabase.rpc(name,args);
    if (error) throw new Error(error.message);
    return data;
  }
  function preset() {
    if ($('period').value === 'custom') return;
    const today = day(new Date());
    const first = new Date(today + 'T12:00:00Z');
    first.setUTCDate(first.getUTCDate() - Number($('period').value) + 1);
    $('from').value = day(first); $('to').value = today;
  }
  function readFilters() {
    const from = $('from').value, to = $('to').value;
    if (!from || !to || to < from || (Date.parse(to)-Date.parse(from))/86400000 > 365) throw new Error('Choose a valid date range of at most 366 days.');
    return {p_from:from,p_to:to,p_subject:$('subject').value};
  }
  function chart(daily) {
    const max = Math.max(1,...daily.map(d => Number(d.tests)+Number(d.lessons)));
    const step = 640 / Math.max(1,daily.length), width = Math.max(1,step*.65);
    const bars = daily.map((d,i) => {
      const tests = Number(d.tests)*155/max, lessons = Number(d.lessons)*155/max;
      return `<g><title>${esc(d.day)}: ${number(d.tests)} tests, ${number(d.lessons)} lessons</title><rect x="${40+i*step}" y="${180-tests}" width="${width}" height="${tests}" fill="#497bea"/><rect x="${40+i*step}" y="${180-tests-lessons}" width="${width}" height="${lessons}" fill="#14a390"/></g>`;
    }).join('');
    $('chart').innerHTML = `<svg viewBox="0 0 720 220" role="img" aria-label="Daily completed tests and lessons. Exact figures are in the daily figures table."><text x="4" y="25">${max}</text><text x="14" y="183">0</text><line x1="38" y1="180" x2="690" y2="180" stroke="#cbd5e1"/>${bars}<text x="40" y="209">${esc(daily[0]?.day || '')}</text><text x="680" y="209" text-anchor="end">${esc(daily.at(-1)?.day || '')}</text></svg>`;
    $('daily').innerHTML = daily.map(d=>`<tr><td>${esc(d.day)}</td><td>${number(d.tests)}</td><td>${number(d.lessons)}</td></tr>`).join('');
  }
  function draw() {
    const c = report.current, previous = report.previous;
    const cards = [['New students','new_students'],['Active learners','active_learners'],['Tests completed','tests'],['Lessons completed','lessons'],['Average practice score','average_score'],['Course enrollments','enrollments'],['Verified revenue','revenue_kobo']];
    $('metrics').innerHTML = cards.map(([label,key]) => {
      const v = c[key], old = previous[key];
      const value = key==='revenue_kobo' ? money(v) : v===null ? '—' : number(v)+(key==='average_score'?'%':'');
      const delta = v===null || old===null ? 'No comparison available' : old===0 ? (v===0?'No change':'No previous baseline') : `${v>old?'+':''}${Math.round((v-old)/old*100)}% vs previous period`;
      return `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${delta}</small></article>`;
    }).join('');
    chart(report.daily);
    const attention = report.attention;
    $('attention').innerHTML = [['Teacher applications','pending_teachers','teachers'],['Classes awaiting review','pending_classes','reviews'],['Active teachers without published classes','teachers_without_classes','teachers']].map(([label,key,tab]) => `<a href="admin.html#${tab}"><span>${label}</span><strong>${number(attention[key])}</strong></a>`).join('') + `<div class="attention-note"><span>Previously practising students with no test in 7 days</span><strong>${number(attention.stopped_practising)}</strong></div>`;
    const teacher = kind==='teacher';
    document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
    $('people-note').textContent = teacher ? 'Classes and lessons are current published totals. Enrollments and earnings use the selected dates. Last action is the latest recorded workspace action.' : 'Tests, average scores, completed lessons and new course enrollments use the selected dates. Last learning activity covers all dates and subjects.';
    $('people-head').innerHTML = `<tr>${(teacher?['Teacher','Status','Published classes','Published lessons','New enrollments','Earnings','Last action','Report']:['Student','Tests','Average score','Lessons completed','New enrollments','Last learning activity','Report']).map(s=>`<th scope="col">${s}</th>`).join('')}</tr>`;
    $('people').innerHTML = report.people.map(p=>`<tr><td>${esc(p.name)}</td>${teacher?`<td>${esc(p.status)}</td><td>${number(p.classes)}</td><td>${number(p.lessons)}</td><td>${number(p.enrollments)}</td><td>${money(p.earnings_kobo)}</td>`:`<td>${number(p.tests)}</td><td>${p.average_score===null?'—':number(p.average_score)+'%'}</td><td>${number(p.lessons)}</td><td>${number(p.enrollments)}</td>`}<td>${esc(date(p.last_activity))}</td><td><button type="button" data-person="${esc(p.id)}" aria-label="View report for ${esc(p.name)}">View report</button></td></tr>`).join('') || `<tr><td colspan="8">No ${teacher?'teachers':'students'} match these filters.</td></tr>`;
    $('previous').disabled = page===0; $('next').disabled = (page+1)*25>=report.people_count;
    $('page').textContent = `Page ${page+1} · ${number(report.people_count)} people`;
    const selected = $('subject').value;
    $('subject').innerHTML = '<option value="">All subjects</option>' + report.subjects.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    $('subject').value = selected;
  }
  async function load() {
    if (!authorized) return;
    const version = ++request;
    $('status').dataset.error = 'false'; $('status').textContent = 'Loading analytics…';
    $('report').hidden = true;
    try {
      const data = await rpc('admin_analytics_report',{...filters,p_kind:kind,p_page:page,p_search:search});
      if (version!==request) return;
      report=data; draw(); $('report').hidden=false;
      $('status').textContent = `Showing ${filters.p_from} to ${filters.p_to} · Updated ${date(report.generated_at)}`;
    } catch(error) {
      if (version!==request) return;
      $('status').dataset.error='true';
      $('status').textContent = /admin_analytics|does not exist|schema cache/i.test(error.message) ? 'Analytics setup is required. Apply supabase/admin_analytics.sql, then select Refresh data.' : `Analytics unavailable: ${error.message}. Select Refresh data to retry.`;
    }
  }
  async function person(id) {
    const p = report.people.find(p=>p.id===id); if (!p) return;
    const version = ++personRequest;
    $('person-title').textContent=p.name; $('person-body').textContent='Loading activity…'; $('person').showModal();
    try {
      const details=await rpc('admin_analytics_person',{p_user:id,p_from:filters.p_from,p_to:filters.p_to});
      if (version!==personRequest || !$('person').open) return;
      $('person-body').innerHTML=details.events.map(e=>`<article class="event"><small>${esc(e.kind)} · ${esc(date(e.occurred_at))}</small><strong>${esc(e.title)}</strong>${e.score===null?'':`<span>Practice score: ${number(e.score)}%</span>`}</article>`).join('') || '<p>No recorded activity during this period.</p>';
    } catch(error) { if(version===personRequest) $('person-body').textContent=`Activity unavailable: ${error.message}`; }
  }
  document.addEventListener('DOMContentLoaded', async () => {
    preset(); filters=readFilters();
    $('period').onchange=preset;
    for(const id of ['from','to']) $(id).onchange=()=>{ $('period').value='custom'; };
    $('filters').onsubmit=event=>{event.preventDefault();try{filters=readFilters();page=0;load();}catch(e){$('status').textContent=e.message;$('status').dataset.error='true';}};
    $('refresh').onclick=()=>load();
    $('search-form').onsubmit=event=>{event.preventDefault();search=$('search').value.trim();page=0;load();};
    $('previous').onclick=()=>{page=Math.max(0,page-1);load();};
    $('next').onclick=()=>{page++;load();};
    document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;page=0;load();});
    $('people').onclick=event=>{const b=event.target.closest('[data-person]');if(b) person(b.dataset.person);};
    $('close-person').onclick=()=>{$('person').close();};
    $('person').addEventListener('close',()=>{personRequest++;});
    $('logout').onclick=async()=>{try{await window.logout();location.replace('login.html');}catch(e){$('status').textContent=e.message;}};
    try {
      const identity=await window.resolveWorkspaceIdentity();
      if (!identity.user) {location.replace('login.html?next=admin-analytics.html');return;}
      if(identity.role!=='admin'){ $('status').textContent='Admin access is required to view platform analytics.';return; }
      authorized=true; await load();
    } catch(error) { $('status').textContent=`Unable to check access: ${error.message}. Refresh the page to retry.`; }
  });
})();
