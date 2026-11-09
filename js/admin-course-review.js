/* Dedicated admin review of the submitted revision, never the public copy. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(value)||0);
  function render({revision:r,course:c,teacher:t,subject,cover,player}) {
    const b=r.body||{}, lessons=b.lessons||[], modern=!!b.course_type;
    const price=r.suggested_price??b.proposed_price??subject?.enrollment_price;
    return `<div class="acr"><div class="acr-evidence"><div class="acr-overview">${cover?`<img src="${esc(cover)}" alt="Submitted course cover" class="acr-cover">`:'<p class="acr-missing">No course cover supplied</p>'}<div><p class="acr-subject">${esc(subject?.name||b.subject_id)}</p><h3>${esc(b.title||'Untitled class')}</h3><p>${esc(t?.display_name||'Teacher unavailable')}</p><p class="acr-muted">${b.course_type==='complete'?'Complete subject course':b.course_type==='topic'?'Focused topic course':'Earlier class format'}</p></div></div>
      <dl class="acr-facts"><div><dt>Teacher status</dt><dd>${esc(t?.status||'Unknown')}</dd></div><div><dt>Submission</dt><dd>Version ${esc(r.version)} · ${c?.published?'Update to a published class':'New class'}</dd></div><div><dt>Last updated</dt><dd>${r.updated_at?esc(new Date(r.updated_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos'})):'Not recorded'}</dd></div><div><dt>Recordings</dt><dd>${lessons.filter(l=>l.video_asset_id).length} uploaded / ${lessons.length} lessons</dd></div></dl>
      ${r.feedback?`<section class="acr-section"><h3>Previous feedback / price request</h3><p class="acr-copy">${esc(r.feedback)}</p></section>`:''}
      <section class="acr-section"><h3>About this class</h3><p class="acr-copy">${esc(b.description||'No description supplied.')}</p>${b.course_type==='topic'?`<h4>Topics covered</h4><p class="acr-copy">${esc(b.focused_topics||'No topics supplied.')}</p>`:''}<h4>What students will learn</h4><ul>${String(b.outcomes||'').split('\n').filter(s=>s.trim()).map(s=>`<li>${esc(s)}</li>`).join('')||'<li>No learning outcomes supplied.</li>'}</ul><p class="acr-muted">Includes ongoing course conversation and indefinite recording access.</p></section>
      <section class="acr-section"><h3>Watch the lessons <span>${lessons.length}</span></h3><p class="acr-muted">Check that each recording plays, is clear and teaches the stated topic.</p><div class="acr-lessons">${lessons.map((l,i)=>`<details ${i===0?'open':''}><summary><span class="acr-number">${i+1}</span><span><strong>${esc(l.title||'Untitled lesson')}</strong><small>${esc(l.syllabus_topic||'No topic supplied')}</small></span><span class="acr-recording">${l.video_asset_id?'Uploaded':'Needs replacement'}</span></summary><div class="acr-player">${l.video_asset_id?player(l.video_asset_id):'<p class="acr-missing">Ask the teacher to upload a recording for this lesson.</p>'}</div></details>`).join('')||'<p class="acr-missing">No lessons supplied.</p>'}</div></section>
      </div><form data-form="class-review" data-id="${esc(r.cohort_id)}" class="acr-section acr-decision"><h3>Your decision</h3><p class="acr-muted">${modern?'Approve the teacher’s price to publish. A different price needs the teacher’s acceptance.':'This class uses the earlier format. If approval reports missing course details, request an update from the teacher.'}</p><div class="acr-price-summary"><span>${modern?'Teacher’s proposed price':'Subject price'}</span><strong>${price==null?'Not set':money(b.proposed_price??price)}</strong></div>${r.suggested_price!=null?`<p class="acr-muted">Last suggested price: ${money(r.suggested_price)} · awaiting teacher acceptance</p>`:''}${modern?`<label class="tw-field"><span>Price to approve (NGN)</span><input name="approved_price" type="number" min="100" max="1000000" step="0.01" value="${esc(price)}" aria-describedby="acr-price-help"><small id="acr-price-help">Keep the proposed price, or enter your suggested price.</small></label>`:''}<label class="tw-field"><span>Feedback for the teacher</span><textarea name="feedback" maxlength="4000" placeholder="Explain what needs changing, or why you suggest a different price."></textarea><small>Required when requesting changes or suggesting a different price.</small></label><p class="acr-error" data-review-error role="alert" tabindex="-1" hidden></p><div class="acr-decision-foot"><p data-review-result>${modern?'Approving the proposed price makes this class available to students.':'Approve after checking the course details and recordings.'}</p><div class="acr-actions"><button type="submit" name="decision" value="changes" formnovalidate class="tw-button">Request changes</button><button type="submit" name="decision" value="approve" class="tw-button primary">Approve & publish</button></div></div></form></div>`;
  }
  function prepare(revision,payload,decision) {
    if(!['approve','changes'].includes(decision))throw new Error('Choose Approve or Request changes.');
    const feedback=String(payload.feedback||'').trim();
    if(decision==='changes'&&!feedback)throw new Error('Tell the teacher what needs to change.');
    if(decision==='approve'&&revision.body.course_type){
      const price=Number(payload.approved_price);
      if(!String(payload.approved_price||'').trim()||!Number.isFinite(price)||price<100||price>1000000||Math.abs(price*100-Math.round(price*100))>.00001)throw new Error('Enter a price from ₦100 to ₦1,000,000 with at most two decimal places.');
      if(price!==Number(revision.body.proposed_price)&&feedback.length<10)throw new Error('Explain your suggested price in at least 10 characters.');
    }
    return {...payload,feedback,decision};
  }
  function updateDecision(form,revision) {
    if(!revision?.body?.course_type)return;
    const price=Number(form.querySelector('[name="approved_price"]')?.value);
    const changed=price!==Number(revision.body.proposed_price);
    const button=form.querySelector('[value="approve"]');
    if(button)button.textContent=changed?'Approve & send price':'Approve & publish';
    const note=form.querySelector('[data-review-result]');
    if(note)note.textContent=changed?'This approves the content and sends your price to the teacher. The class publishes after the teacher accepts.':'This publishes the class at the teacher’s proposed price.';
  }
  window.ThinkRightAdminCourseReview={render,prepare,updateDecision};
})();
