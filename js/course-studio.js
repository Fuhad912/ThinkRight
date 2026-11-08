/* Course studio presentation. Saving and private uploads use the workspace services. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('en-NG', {style:'currency',currency:'NGN',maximumFractionDigits:2}).format(Number(value)||0);
  const steps = ['Setup','Lessons','Pricing','Review'];
  const input = (label,key,value,extra='') => `<label class="tw-field"><span>${label}</span><input data-draft="${key}" value="${esc(value)}" ${extra}></label>`;
  const area = (label,key,value,extra='') => `<label class="tw-field"><span>${label}</span><textarea data-draft="${key}" ${extra}>${esc(value)}</textarea></label>`;
  const edit = (label,step) => `<button type="button" class="cs-review-edit" data-action="step" data-step="${step}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>`;
  function validate(d,subjects,target=4) {
    if(target>0 && !subjects.some(s=>s.id===d.subject_id)) return {step:0,field:'subject_id',message:'Choose a subject from your teaching application.'};
    if(target>0 && !['topic','complete'].includes(d.course_type)) return {step:0,field:'course_type',message:'Choose your course type.'};
    if(target>0 && d.course_type==='topic' && !String(d.focused_topics||'').trim()) return {step:0,field:'focused_topics',message:'Type the topic or topics your course will cover.'};
    if(target>0 && !String(d.title||'').trim()) return {step:0,field:'title',message:'Enter a course title.'};
    if(target>0 && String(d.description||'').trim().length<20) return {step:0,field:'description',message:'Write at least 20 characters about what this course teaches.'};
    if(target>0 && !String(d.outcomes||'').trim()) return {step:0,field:'outcomes',message:'Write what students will learn.'};
    if(target===4 && !d.thumbnail_path) return {step:0,message:'Add a course cover before sending for review.'};
    if(target>1 && (!d.lessons.length || d.lessons.some(l=>!String(l.title||'').trim()||!String(l.syllabus_topic||'').trim()||!l.video_asset_id))) return {step:1,message:'Every lesson needs a title, topic and uploaded recording.'};
    if(target>2 && (!Number.isFinite(Number(d.proposed_price)) || Number(d.proposed_price)<100 || Number(d.proposed_price)>1000000 || Math.abs(Math.round(Number(d.proposed_price)*100)-Number(d.proposed_price)*100)>0.00001)) return {step:2,field:'proposed_price',message:'Enter a price from ₦100 to ₦1,000,000, with at most two decimal places.'};
    return null;
  }
  function render({draft:d,revision:r,course,subjects,step,dirty,coverURL,videoEditor}) {
    const locked=r?.state==='in_review', cover=coverURL(d.thumbnail_path), subject=subjects.find(s=>s.id===d.subject_id)?.name||'Subject';
    let content='';
    if(step===0) content=`<h2>What will you teach?</h2><p class="cs-intro">Define your course and what students will learn.</p><div class="cs-stack">
      <label class="tw-field"><span>Subject</span><select data-draft="subject_id"><option value="">Choose a subject</option>${subjects.map(s=>`<option value="${esc(s.id)}" ${s.id===d.subject_id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><small>Only subjects from your teaching application are available.</small></label>
      <div class="cs-type-choices" role="group" aria-label="Course type"><label class="cs-choice"><input type="radio" name="course_type" data-draft="course_type" value="topic" ${d.course_type==='topic'?'checked':''}><span><strong>Focused topic course</strong><small>Teach one topic or several related topics in depth.</small></span></label><label class="cs-choice"><input type="radio" name="course_type" data-draft="course_type" value="complete" ${d.course_type==='complete'?'checked':''}><span><strong>Complete subject course</strong><small>Cover the entire JAMB syllabus with complete recordings.</small></span></label></div>
      ${d.course_type==='topic'?area('Topic or topics','focused_topics',d.focused_topics,'maxlength="2000" placeholder="e.g. Motion, Newton’s laws, momentum"'):''}
      ${input('Course title','title',d.title,'maxlength="160" required')}${area('Course description','description',d.description,'maxlength="4000" required')}${area('What students will learn','outcomes',d.outcomes,'maxlength="4000" placeholder="Write each learning outcome on a new line" required')}
      <section class="cs-section"><div class="cs-row"><h3>Course cover <small>Required before review</small></h3><label class="tw-cover-picker">${cover?'Replace image':'Choose image'}<input id="class-thumbnail-upload" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose course cover"></label></div>${cover?`<img class="cs-cover" src="${esc(cover)}" alt="Course cover preview">`:'<p class="tw-hint">Landscape JPG, PNG or WebP, up to 3 MB. You can add it later.</p>'}</section>
      <p class="cs-note">Every course includes indefinite access to recordings and ongoing conversation with enrolled students. No scheduled support sessions are required.</p></div>`;
    if(step===1) content=`<h2>Build your lesson library</h2><p class="cs-intro">Add recordings in the order students should watch them. Each lesson needs a title, topic and video. Make your recording very clear and easy to hear.</p><div class="cs-lessons">${d.lessons.map((l,i)=>`<section class="cs-lesson"><div class="cs-row"><h3>Lesson ${i+1}</h3><div class="cs-tools"><button type="button" class="tw-icon-btn" data-action="move-lesson" data-index="${i}" data-direction="-1" aria-label="Move lesson ${i+1} up" ${i===0?'disabled':''}>↑</button><button type="button" class="tw-icon-btn" data-action="move-lesson" data-index="${i}" data-direction="1" aria-label="Move lesson ${i+1} down" ${i===d.lessons.length-1?'disabled':''}>↓</button>${d.lessons.length>1?`<button type="button" class="tw-icon-btn" data-action="remove-lesson" data-index="${i}" aria-label="Remove lesson ${i+1}">×</button>`:''}</div></div><label class="tw-field"><span>Lesson title</span><input data-lesson="${i}" name="title" value="${esc(l.title)}" maxlength="160" required></label><label class="tw-field"><span>Lesson topic</span><input data-lesson="${i}" name="syllabus_topic" value="${esc(l.syllabus_topic)}" maxlength="160" required></label>${videoEditor(l)}</section>`).join('')}</div><button type="button" class="tw-button cs-add" data-action="add-lesson"><span aria-hidden="true">+</span> Add lesson</button>`;
    if(step===2) content=`<h2>Propose your course price</h2><p class="cs-intro">Choose a price that reflects your course’s coverage and teaching.</p><div class="cs-stack">${input('One-time enrollment price · NGN','proposed_price',d.proposed_price,'type="number" min="100" max="1000000" step="0.01" required')}<div><div class="cs-money"><span>Your earnings · 90%</span><strong id="course-teacher-share">${money(Math.round(Number(d.proposed_price||0)*100*.9)/100)}</strong></div><div class="cs-money"><span>ThinkRight share · 10%</span><strong id="course-platform-share">${money((Math.round(Number(d.proposed_price||0)*100)-Math.round(Number(d.proposed_price||0)*100*.9))/100)}</strong></div></div><section class="cs-section"><h3>Included in this price</h3><ul><li>Indefinite recording access</li><li>Ongoing course conversation</li><li>All ${d.lessons.length} recorded lessons</li></ul></section><p class="cs-note">ThinkRight reviews your price before publication. If the reviewer suggests a different price, you must accept it before your course goes live.</p></div>`;
    if(step===3) content=`<div class="cs-review"><h2>Ready for review?</h2><p class="cs-intro">Check your course, recordings and price before sending.</p><div class="cs-stack">
      <section class="cs-review-overview" aria-label="Course summary">${cover?`<img class="cs-cover" src="${esc(cover)}" alt="Course cover">`:`<div class="cs-review-missing"><span>Course cover missing</span><button type="button" class="cs-text" data-action="step" data-step="0">Add cover</button></div>`}<div class="cs-review-identity"><div class="cs-row"><span class="cs-type">${esc(subject)}</span>${edit('Edit details',0)}</div><h3>${esc(d.title||'Untitled course')}</h3><p>${d.course_type==='complete'?'Complete subject course':'Focused topic course'}</p><small>${d.lessons.length} recorded ${d.lessons.length===1?'lesson':'lessons'}</small></div></section>
      <section class="cs-review-section"><div class="cs-row"><h3>Course details</h3>${edit('Edit description and outcomes',0)}</div><p class="cs-description">${esc(d.description)}</p>${d.course_type==='topic'?`<h4>Topics covered</h4><p class="cs-description">${esc(d.focused_topics)}</p>`:''}<details class="cs-review-outcomes"><summary>What students will learn</summary><ul>${String(d.outcomes||'').split('\n').filter(s=>s.trim()).map(s=>`<li>${esc(s)}</li>`).join('')}</ul></details></section>
      <section class="cs-review-section"><div class="cs-row"><h3>Lessons <span class="cs-review-total">${d.lessons.length}</span></h3>${edit('Edit lessons',1)}</div><ol class="cs-review-lessons">${d.lessons.map((l,i)=>`<li><span class="cs-review-index">${i+1}</span><div><strong>${esc(l.title||'Untitled lesson')}</strong><small>${esc(l.syllabus_topic||'Add a topic')}</small></div><span class="cs-review-recording ${l.video_asset_id?'is-ready':'is-missing'}" role="img" aria-label="${l.video_asset_id?'Recording uploaded':'Recording needed'}" title="${l.video_asset_id?'Recording uploaded':'Recording needed'}">${l.video_asset_id?'✓':'!'}</span></li>`).join('')}</ol><p class="cs-review-upload-note">${d.lessons.every(l=>l.video_asset_id)?'All recordings uploaded.':'Some lessons still need a recording.'}</p></section>
      <section class="cs-review-section"><div class="cs-row"><h3>Enrollment price</h3>${edit('Edit price',2)}</div><div class="cs-review-price"><strong>${money(d.proposed_price)}</strong><span>One-time payment per student</span></div><div class="cs-review-share"><span>Your earnings per enrollment <small>90%</small></span><strong>${money(Math.round(Number(d.proposed_price||0)*100*.9)/100)}</strong></div><p class="cs-review-included">Includes indefinite recording access and course conversation.</p></section>
      <p class="cs-review-next">ThinkRight reviews your content and price. Any suggested price change comes back to you for acceptance.</p></div></div>`;
    return `<div class="cs-studio"><header class="cs-heading"><a class="tw-icon-btn" href="tutor-classes.html" aria-label="Back to courses">&lt;</a><h1>${course?.published?'Edit your course':'Create a course'}</h1></header>${r?`<p class="cs-status">${esc(r.state.replaceAll('_',' '))}${course?.published?' · Students retain access to the approved version.':' · Not visible to students yet.'}</p>`:''}${r?.feedback?`<p class="cs-note">Reviewer feedback: ${esc(r.feedback)}</p>`:''}${locked&&r?.suggested_price!=null?`<section class="cs-agreement"><h2>Review your course price</h2><p>Your recordings are approved. Accept the suggested price to publish, or ask the reviewer to reconsider.</p><div class="cs-money"><span>You proposed</span><strong>${money(d.proposed_price)}</strong></div><div class="cs-money"><span>Suggested price</span><strong>${money(r.suggested_price)}</strong></div><div class="cs-money"><span>Your earnings · 90%</span><strong>${money(Math.round(Number(r.suggested_price)*100*.9)/100)}</strong></div><button type="button" class="tw-button" data-action="request-course-price">Request a price change</button> <button type="button" class="tw-button primary" data-action="accept-course-price">Accept ${money(r.suggested_price)} & publish</button></section>`:''}${course?.video_migration_required?'<p class="cs-note">New enrollments are paused while you replace legacy recordings. Existing students retain access.</p>':''}${course?.published?`<div class="cs-published-tools"><a class="cs-text" href="cohort.html?id=${encodeURIComponent(course.id)}">Open course conversation</a><button type="button" class="cs-text" data-action="class-tab" data-tab="students">Students</button><label class="tw-field"><span>Enrollment availability</span><select data-filter="availability">${[['open','Open for enrollment'],['in_progress','In progress'],['closed','Closed to new enrollments']].map(([value,label])=>`<option value="${value}" ${course.status===value?'selected':''}>${label}</option>`).join('')}</select></label></div>`:''}<div class="cs-layout"><nav class="cs-steps" aria-label="Course creation steps">${steps.map((s,i)=>`<button type="button" data-action="step" data-step="${i}" ${i===step?'aria-current="step"':''}><span>${i+1}</span>${s}</button>`).join('')}<p>Save your draft as you go. Submit when every recording is ready.</p></nav><div class="cs-workspace">${locked?'<p class="cs-note">Your course is in review. Withdraw your submission to edit it.</p>':''}<form id="class-editor"><fieldset ${locked?'disabled':''}>${content}</fieldset></form><footer class="cs-footer"><div class="cs-footer-meta"><span>Step ${step+1} of 4</span><span id="draft-status">${dirty?'Unsaved changes':r?'Draft saved':'Not saved yet'}</span></div><div class="cs-actions">${step?`<button type="button" class="cs-text cs-back" data-action="step" data-step="${step-1}" aria-label="Previous step">&lt;</button>`:''}${locked?'<button type="button" class="tw-button" data-action="withdraw-class">Withdraw submission</button>':'<button type="button" class="tw-button" data-action="save-class">Save draft</button>'}${step<3?`<button type="button" class="tw-button primary" data-action="step" data-step="${step+1}">Continue</button>`:locked?'':'<button type="button" class="tw-button primary" data-action="submit-class">Send for review</button>'}</div></footer></div></div></div>`;
  }
  let stepMotions=[];
  function animateStep(previous,next) {
    stepMotions.forEach(animation=>animation.cancel());
    stepMotions=[];
    if(previous===next || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const workspace=window.document.querySelector('.cs-workspace');
    if(!workspace?.animate) return;
    const direction=next>previous?1:-1;
    const fieldset=workspace.querySelector('fieldset');
    const surface=fieldset?.querySelector('.cs-review')||fieldset;
    if(!surface) return;
    // Group related content so long lesson lists do not acquire long delays.
    const groups=[...surface.children].flatMap(element=>
      element.matches('.cs-stack')?[...element.children]:[element]);
    groups.forEach((element,index)=>{
      if(!element.animate) return;
      stepMotions.push(element.animate([
        {opacity:0,transform:`translate3d(${direction*10}px,18px,0)`,filter:'blur(3px)'},
        {opacity:1,transform:'translate3d(0,0,0)',filter:'blur(0)'}
      ],{duration:480,delay:Math.min(index,5)*45,easing:'cubic-bezier(0.16, 1, 0.3, 1)',fill:'backwards'}));
    });
    const footer=workspace.querySelector('.cs-footer');
    if(footer?.animate) stepMotions.push(footer.animate([
      {opacity:0,transform:'translateY(10px)'},
      {opacity:1,transform:'translateY(0)'}
    ],{duration:400,delay:160,easing:'cubic-bezier(0.16, 1, 0.3, 1)',fill:'backwards'}));
    const active=window.document.querySelector('.cs-steps [aria-current="step"]');
    if(active?.animate) stepMotions.push(active.animate([
      {backgroundColor:'var(--surface-bg)',opacity:.65,transform:`translateX(${direction*4}px)`},
      {backgroundColor:'var(--accent-soft)',opacity:1,transform:'translateX(0)'}
    ],{duration:360,easing:'cubic-bezier(0.22, 1, 0.36, 1)'}));
  }
  const fieldDescriptions={
    'Topic or topics':'List the topics you will teach in this course.',
    'Course title':'Give the whole course a name. Students will see this name before they buy.',
    'Lesson title':'Give this video a name that tells students what they will learn.',
    'Lesson topic':'Write the topic you teach in this video.'
  };
  function renderWithDescriptions(args) {
    let markup=render(args);
    for(const [label,description] of Object.entries(fieldDescriptions)) {
      markup=markup.replaceAll(`<span>${label}</span>`,`<span class="cs-field-label">${label}<small>${description}</small></span>`);
    }
    return markup;
  }
  window.ThinkRightCourseStudio={render:renderWithDescriptions,validate,animateStep};
})();
