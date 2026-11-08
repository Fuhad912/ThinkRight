/* Design preview: reads applied teaching subjects; course edits stay in this browser. */
(() => {
    'use strict';
    const app = document.querySelector('#app');
    const scene = document.querySelector('#scene');
    const topics = ['Motion', 'Newton’s laws', 'Work, energy and power', 'Momentum'];
    const steps = ['Setup', 'Lessons', 'Pricing', 'Review'];
    const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let step = 0;
    let saved = false;
    let teacherSubjects = [];
    let subjectsLoading = true;
    let subjectsError = '';
    const subjectName = () => teacherSubjects.find(subject => subject.id === state.subject_id)?.name || 'Choose a subject';
    let state = {
        type: 'topic',
        title: 'JAMB Physics — Mechanics',
        description: 'Understand motion, forces and energy through clear explanations and worked JAMB questions.',
        outcomes: 'Calculate speed and acceleration\nApply Newton’s laws to exam questions\nSolve work, energy and momentum problems',
        price: 3000,
        topics: [...topics],
        lessons: [{ id: crypto.randomUUID(), title: '', topic: '', ready: false, sample: false }]
    };
    const urls = new Map();
    let messages = [
        { name: 'Mr. Adewale', initials: 'AA', teacher: true, text: 'Welcome, everyone. Use this space to discuss the lessons and ask questions as you work through the course.', time: '09:12' },
        { name: 'Zainab', initials: 'ZA', text: 'In lesson 2, why do we use the resultant force instead of the applied force?', time: '09:18' },
        { name: 'Mr. Adewale', initials: 'AA', teacher: true, text: 'Good question. Acceleration depends on the net force. If friction opposes the applied force, subtract friction first, then use F = ma.', time: '09:26' }
    ];
    function toast(text) { const el = document.querySelector('#toast'); el.textContent = text; clearTimeout(toast.timer); toast.timer = setTimeout(() => el.textContent = '', 4000); }
    function button(label, action, primary = false) { return `<button type="button" class="button ${primary ? 'primary' : ''}" data-action="${action}">${label}</button>`; }
    function capture() { app.querySelectorAll('[data-field]').forEach(input => state[input.dataset.field] = input.value); }
    function field(label, name, value, extra = '') { return `<label class="field"><span>${label}</span><input data-field="${name}" value="${esc(value)}" ${extra}></label>`; }
    function textField(label, name, value) { return `<label class="field"><span>${label}</span><textarea data-field="${name}">${esc(value)}</textarea></label>`; }
    function setup() {
        return `<div class="section-intro"><h2>What will you teach?</h2><p>Define your course and what students will learn.</p></div><div class="stack">
      <label class="field"><span>Subject</span><select data-field="subject_id" aria-label="Subject" ${subjectsLoading || !teacherSubjects.length ? 'disabled' : ''}><option value="">${subjectsLoading ? 'Loading your subjects…' : 'Choose a subject'}</option>${teacherSubjects.map(subject => `<option value="${esc(subject.id)}" ${state.subject_id === subject.id ? 'selected' : ''}>${esc(subject.name)}</option>`).join('')}</select><small>Only subjects from your teaching application are available.</small></label>${subjectsError ? `<div class="error" role="alert">${esc(subjectsError)} <button type="button" class="text-button" data-action="reload-subjects">Try again</button></div>` : ''}
      <div class="stack" style="gap:12px"><label class="choice"><input type="radio" name="type" value="topic" ${state.type === 'topic' ? 'checked' : ''}><div><strong>Focused topic course</strong><p>Teach a selected part of the subject in depth.</p></div></label><label class="choice"><input type="radio" name="type" value="complete" ${state.type === 'complete' ? 'checked' : ''}><div><strong>Complete subject course</strong><p>Teach the complete JAMB syllabus for your subject.</p></div></label></div>
      ${state.type === 'topic' ? `<label class="field"><span>Topic or topics</span><textarea data-field="focused_topics" required maxlength="2000" aria-describedby="topic-help" placeholder="e.g. Motion, Newton’s laws, momentum">${esc(state.focused_topics || '')}</textarea><small id="topic-help">Type the topics this course covers. You can list one or several.</small></label>` : ''}
      ${field('Course title', 'title', state.title, 'maxlength="160"')}${textField('Course description', 'description', state.description)}${textField('What students will learn', 'outcomes', state.outcomes)}
      <div class="section"><div class="section-title"><h3>Course cover <span class="muted small">Required</span></h3><label class="button file-picker">${state.cover_data ? 'Replace image' : 'Choose image'}<input type="file" data-cover accept="image/jpeg,image/png,image/webp" aria-label="Choose required course cover"></label></div>${state.cover_data ? `<img src="${esc(state.cover_data)}" alt="Selected course cover" style="width:100%;max-width:320px;aspect-ratio:16/9;object-fit:cover;border-radius:6px">` : '<p class="muted small">Use a landscape image. JPG, PNG or WebP, up to 3 MB.</p>'}</div>
      <p class="notice">Every course includes ongoing chat with enrolled students and indefinite access to its recordings.</p></div>`;
    }
    function lessons() {
        return `<div class="section-intro">
            <h2>Build your lesson library</h2>
            <p>Add your recordings in the order students should watch them.</p>
        </div>
        <p class="muted small">Each lesson needs a title, topic and recording before review.</p>
        <div class="lesson-list">
            ${state.lessons.map((lesson, i) => `<section class="lesson">
                <div class="lesson-head">
                    <h3>Lesson ${i + 1}</h3>
                    <div class="lesson-tools">
                        <button type="button" class="icon-button" data-move="${i}" data-direction="-1" aria-label="Move lesson ${i + 1} up" ${i === 0 ? 'disabled' : ''}>↑</button>
                        <button type="button" class="icon-button" data-move="${i}" data-direction="1" aria-label="Move lesson ${i + 1} down" ${i === state.lessons.length - 1 ? 'disabled' : ''}>↓</button>
                        ${state.lessons.length > 1 ? `<button type="button" class="icon-button" data-remove="${i}" aria-label="Remove lesson ${i + 1}">×</button>` : ''}
                    </div>
                </div>
                <label class="field">Lesson title<input data-lesson="${i}" data-key="title" value="${esc(lesson.title)}" maxlength="160" required placeholder="e.g. Understanding motion"></label>
                <label class="field">Lesson topic<input data-lesson="${i}" data-key="topic" value="${esc(lesson.topic)}" maxlength="160" required placeholder="e.g. Acceleration"></label>
                ${urls.has(lesson.id) ? `<div class="tw-inline-video"><video-player><video-skin><video src="${urls.get(lesson.id)}" controls playsinline preload="metadata" aria-label="Lesson ${i + 1} recording preview"></video></video-skin></video-player></div>` : ''}
                <div class="lesson-head">
                    <span class="${urls.has(lesson.id) ? 'ready' : 'muted small'}">${urls.has(lesson.id) ? '✓ Recording selected' : 'Add your lesson recording'}</span>
                    <label class="button file-picker">${urls.has(lesson.id) ? 'Replace video' : 'Choose video'}<input type="file" accept="video/*" data-video="${i}" aria-label="${urls.has(lesson.id) ? 'Replace' : 'Choose'} lesson ${i + 1} video"></label>
                </div>
                ${lesson.filename ? `<small class="muted">${esc(lesson.filename)}</small>` : ''}
            </section>`).join('')}
        </div>
        <button type="button" class="button add-lesson" data-action="add"><span aria-hidden="true">+</span> Add lesson</button>`;
    }
    function pricing() { return `<div class="section-intro"><h2>Propose your course price</h2><p>Choose a price that reflects your course’s coverage and teaching.</p></div><div class="stack"><label class="field"><span>One-time enrollment price · NGN</span><input class="price-input" type="number" min="100" max="1000000" step="1" data-field="price" value="${esc(state.price)}"><small>This is your proposed price. ThinkRight reviews it before publication.</small></label><div><div class="money-row"><span>Your earnings · 90%</span><strong id="teacher-share">${money(Number(state.price) * .9)}</strong></div><div class="money-row"><span>ThinkRight share · 10%</span><strong id="platform-share">${money(Number(state.price) * .1)}</strong></div></div><section class="section"><h3>Included in this price</h3><p class="check-row">✓ Indefinite access to course recordings</p><p class="check-row">✓ Ongoing course chat</p><p class="check-row">✓ All ${state.lessons.length} course lessons</p></section><p class="notice">If ThinkRight suggests a different price, you’ll review and accept it before your course goes live.</p></div>`; }
    function review() { return `<div class="section-intro"><h2>Review your course</h2><p>Make sure this is what you want students to buy.</p></div><div class="stack"><section><div class="section-title"><span class="muted small">Course details</span><button type="button" class="text-button" data-step="0">Edit details</button></div><span class="small" style="color:var(--accent-primary)">${esc(subjectName())} · ${state.type === 'topic' ? 'Focused topic course' : 'Complete subject course'}</span><h3 class="summary-title">${esc(state.title)}</h3>${state.cover_data ? `<img src="${esc(state.cover_data)}" alt="Course cover" style="width:100%;max-width:320px;aspect-ratio:16/9;object-fit:cover;border-radius:6px;margin-bottom:16px">` : ''}${state.type === 'topic' ? `<p class="small muted" style="white-space:pre-wrap;margin-bottom:16px">Topics: ${esc(state.focused_topics)}</p>` : ''}<p class="muted">${esc(state.description)}</p><p class="small muted" style="margin-top:16px">${state.lessons.length} recordings</p></section><section class="section"><h3>Learning outcomes</h3><ul>${state.outcomes.split('\n').filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section><section class="section"><div class="section-title"><h3>Lesson order</h3><button type="button" class="text-button" data-step="1">Edit lessons</button></div><ol class="review-lessons">${state.lessons.map((l, i) => `<li><span class="muted small">${i + 1}</span><div><p>${esc(l.title)}</p><small>${esc(l.topic)}</small><span class="ready">✓ Recording ready</span></div></li>`).join('')}</ol></section><section class="section"><div class="section-title"><h3>Proposed price</h3><button type="button" class="text-button" data-step="2">Edit price</button></div><div class="money-row"><span>Student pays once</span><strong>${money(Number(state.price))}</strong></div><div class="money-row"><span>You earn per enrollment</span><strong>${money(Number(state.price) * .9)}</strong></div></section><p class="notice">ThinkRight will review your recordings, syllabus coverage and proposed price. Your course becomes available after approval and any price changes you need to accept.</p></div>`; }
    function errors(target = 4) {
        if (target > 0 && (subjectsLoading || !teacherSubjects.some(subject => subject.id === state.subject_id)))
            return { step: 0, text: subjectsLoading ? 'Wait for your applied subjects to load.' : 'Choose a subject from your teaching application.' };
        if (target === 4 && !state.cover_data)
            return { step: 0, text: 'Add a course cover before sending your course for review.' };
        if (target > 0 && state.type === 'topic' && !String(state.focused_topics || '').trim())
            return { step: 0, text: 'Type the topic or topics your focused course will teach.' };
        if (target > 0 && (state.title.trim().length < 3 || state.description.trim().length < 20 || !state.outcomes.trim()))
            return { step: 0, text: 'Add your title, description and learning outcomes.' };
        if (target > 1 && (!state.lessons.length || state.lessons.some(l => !l.title.trim() || !String(l.topic || '').trim() || !l.ready)))
            return { step: 1, text: 'Add a title, topic and ready recording for every lesson.' };
        if (target > 2 && (!Number.isFinite(Number(state.price)) || Number(state.price) < 100 || Number(state.price) > 1000000))
            return { step: 2, text: 'Enter a proposed price between ₦100 and ₦1,000,000 for this preview.' };
        return null;
    }
    function navigate(target) { capture(); const error = target > step ? errors(target) : null; step = error ? error.step : target; render(); if (error) {
        document.querySelector('#form-error').textContent = error.text;
        document.querySelector('#form-error').focus();
    }
    else
        window.scrollTo(0, 0); }
    function render() {
        if (scene.value === 'agreement')
            return agreement();
        if (scene.value === 'chat')
            return chat();
        if (scene.value === 'student')
            return student();
        app.innerHTML = `<div class="page-heading"><a class="icon-button" href="../tutor-classes.html" aria-label="Back to my courses">&lt;</a><h1>Create a course</h1></div><div class="studio"><nav class="steps" aria-label="Course creation steps">${steps.map((s, i) => `<button type="button" data-step="${i}" ${i === step ? 'aria-current="step"' : ''}><span class="step-number">${i + 1}</span>${s}</button>`).join('')}<p>Your draft is yours to refine. Submit when every recording is ready.</p></nav><div class="workspace"><form id="course-form">${[setup, lessons, pricing, review][step]()}<p id="form-error" class="error" role="alert" tabindex="-1" style="margin-top:16px"></p><footer class="footer"><div class="footer-meta"><span>Step ${step + 1} of 4</span><span>${saved ? 'Saved on this device' : 'Draft preview'}</span></div><div class="actions ${step === 3 ? 'review-actions' : ''}">${step ? `<button type="button" class="text-button back" data-step="${step - 1}" aria-label="Previous step">${step === 3 ? 'Back to pricing' : '&lt;'}</button>` : ''}${step < 3 ? button('Save draft', 'save') : ''}${button(step === 3 ? 'Send for review' : `Continue to ${steps[step + 1].toLowerCase()}`, step === 3 ? 'submit' : 'next', true)}</div></footer></form></div></div>`;
    }
    function submitted() { app.innerHTML = `<div class="status-view"><div class="success-mark">✓</div><h1>Sent for review</h1><p class="muted">${esc(state.title)} is ready for the ThinkRight team to review.</p><ol class="timeline"><li><span class="ready">✓</span><div><strong>Course submitted</strong><small>Your recordings and details are ready to review.</small></div></li><li><span>2</span><div><strong>Content and price review</strong><small>We’ll check your coverage, recordings and proposed price.</small></div></li><li><span>3</span><div><strong>Publication</strong><small>If the price changes, you’ll accept it first.</small></div></li></ol><p class="notice">Preview state only. No course was sent to ThinkRight.</p><div class="actions">${button('Return to draft', 'edit', true)}${button('Preview a price change', 'agreement')}</div></div>`; }
    function agreement() { const revised = Math.round(Number(state.price) * .8); app.innerHTML = `<div class="status-view"><div class="page-heading"><button class="icon-button" data-action="edit" aria-label="Back to draft">&lt;</button><h1>Review your course price</h1></div><p class="muted">Your content has been approved. ThinkRight has suggested a new enrollment price.</p><h3>${esc(state.title)}</h3><div class="money-row"><span>You proposed</span><strong>${money(Number(state.price))}</strong></div><div class="money-row"><span>Suggested price</span><strong>${money(revised)}</strong></div><div class="money-row"><span>Your earnings · 90%</span><strong>${money(revised * .9)}</strong></div><section class="section" style="margin-top:24px"><h3>Reviewer’s note</h3><p class="muted" style="margin-top:12px">This price better reflects the scope of a focused mechanics course. Your lesson explanations and worked examples are approved.</p></section><p class="notice" style="margin-top:24px">Accepting this price allows the approved course to be published. You can also ask the reviewer to reconsider.</p><div class="actions">${button('Request a price change', 'counter')}${button(`Accept ${money(revised)} & publish`, 'accept', true)}</div><div id="counter-form"></div></div>`; }
    function student() { app.innerHTML = `<div class="status-view"><div class="page-heading"><button class="icon-button" data-action="edit" aria-label="Back to draft">&lt;</button><h1>${esc(state.title)}</h1></div><p class="small" style="color:var(--accent-primary)">${esc(subjectName())} · ${state.type === 'topic' ? 'Focused topic course' : 'Complete subject course'}</p><p class="muted" style="margin-top:16px">${esc(state.description)}</p><div class="money-row"><span>One-time enrollment</span><strong>${money(Number(state.price))}</strong></div><p class="check-row">✓ Indefinite recording access</p><p class="check-row">✓ Enrolled-student course chat</p><section class="section"><h3>What you’ll learn</h3><ul>${state.outcomes.split('\n').filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section><section class="section"><h3>${state.lessons.length} recorded lessons</h3><ol class="review-lessons">${state.lessons.map((l, i) => `<li><span>${i + 1}</span><div><p>${esc(l.title)}</p><small>${esc(l.topic)}</small></div></li>`).join('')}</ol></section><div class="actions">${button('Preview enrolled course chat', 'chat', true)}</div><p class="muted small" style="margin-top:16px">Design preview. The amount shown is sample pricing.</p></div>`; }
    function chat() { app.innerHTML = `<div class="chat"><div class="page-heading"><button class="icon-button" data-action="student" aria-label="Back to course">&lt;</button><h1>${esc(state.title)}</h1></div><p class="muted small">Course conversation · Enrolled students and teacher</p><nav class="chat-tabs" aria-label="Course sections"><button data-action="student">Lessons</button><button aria-current="page">Chat</button></nav><aside class="pinned"><small>Pinned by your teacher</small><p>Keep questions related to the course. Mention the lesson and timestamp when asking about a recording.</p></aside><div class="messages" role="log" aria-label="Course messages">${messages.map((m, i) => `<article class="message ${m.teacher ? 'teacher' : ''}"><span class="avatar" aria-hidden="true">${esc(m.initials)}</span><div><div class="message-meta"><strong>${esc(m.name)}</strong>${m.teacher ? '<span>Teacher</span>' : ''}<time>${esc(m.time)}</time></div><p>${esc(m.text)}</p>${m.name !== 'You' ? `<button class="text-button" data-report="${i}">Report</button>` : ''}</div></article>`).join('')}</div><form id="chat-form" class="composer"><textarea id="message" aria-label="Message the course" placeholder="Ask a question or join in…" maxlength="2000" required></textarea><button class="button primary" aria-label="Send message">↑</button></form><p class="small muted" style="margin-top:12px">Messages in this preview stay in this tab.</p></div>`; }
    function setScene(value) { capture(); scene.value = value; render(); window.scrollTo(0, 0); }
    scene.addEventListener('change', render);
    app.addEventListener('input', event => { const input = event.target; if (input.dataset.field) {
        state[input.dataset.field] = input.value;
        saved = false;
        if (input.dataset.field === 'price') {
            document.querySelector('#teacher-share').textContent = money(Number(input.value || 0) * .9);
            document.querySelector('#platform-share').textContent = money(Number(input.value || 0) * .1);
        }
    } if (input.dataset.lesson !== undefined) {
        state.lessons[Number(input.dataset.lesson)][input.dataset.key] = input.value;
        saved = false;
    } });
    app.addEventListener('change', event => { const input = event.target; capture(); if (input.name === 'type') {
        state.type = input.value;
        render();
    } if (input.matches('[data-cover],[data-video]')) {
        const file = input.files?.[0];
        if (!file)
            return;
        const cover = input.hasAttribute('data-cover');
        if (cover ? (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) : (!file.type.startsWith('video/') || file.size > 500 * 1024 * 1024)) {
            toast(cover ? 'Choose a JPG, PNG or WebP image up to 3 MB.' : 'Choose a video up to 500 MB.');
            return;
        }
        if (cover) {
            const reader = new FileReader();
            reader.onload = () => {
                state.cover_data = reader.result;
                saved = false;
                render();
                toast('Course cover added.');
            };
            reader.onerror = () => toast('The image could not be read. Choose it again.');
            reader.readAsDataURL(file);
            return;
        }
        const lesson = state.lessons[Number(input.dataset.video)];
        const key = cover ? 'cover' : lesson.id;
        if (urls.has(key))
            URL.revokeObjectURL(urls.get(key));
        urls.set(key, URL.createObjectURL(file));
        if (lesson)
            Object.assign(lesson, { ready: true, sample: false, filename: file.name });
        render();
        toast('Selected locally for preview.');
    } });
    app.addEventListener('click', event => { const control = event.target.closest('button'); if (!control)
        return; if (control.dataset.step !== undefined)
        return navigate(Number(control.dataset.step)); capture(); if (control.dataset.move !== undefined) {
        const i = Number(control.dataset.move), j = i + Number(control.dataset.direction);
        [state.lessons[i], state.lessons[j]] = [state.lessons[j], state.lessons[i]];
        render();
        return;
    } if (control.dataset.remove !== undefined) {
        const [removed] = state.lessons.splice(Number(control.dataset.remove), 1);
        if (urls.has(removed.id)) {
            URL.revokeObjectURL(urls.get(removed.id));
            urls.delete(removed.id);
        }
        render();
        return;
    } if (control.dataset.report !== undefined) {
        toast('Report interaction preview. No report was sent.');
        return;
    } switch (control.dataset.action) {
        case 'reload-subjects':
            loadTeacherSubjects();
            break;
        case 'next':
            navigate(step + 1);
            break;
        case 'add':
            state.lessons.push({ id: crypto.randomUUID(), title: '', topic: '', ready: false, sample: false });
            saved = false;
            render();
            app.querySelector(`[data-lesson="${state.lessons.length - 1}"][data-key="title"]`).focus();
            break;
        case 'save':
            try {
                localStorage.setItem('thinkright-course-design-preview', JSON.stringify(state));
                saved = true;
                render();
                toast('Draft saved on this device. Local video files must be reselected after reloading.');
            }
            catch {
                toast('Your browser could not save this preview.');
            }
            break;
        case 'submit': {
            const error = errors();
            if (error) {
                step = error.step;
                render();
                document.querySelector('#form-error').textContent = error.text;
            }
            else
                submitted();
            break;
        }
        case 'edit':
            setScene('create');
            break;
        case 'agreement':
            setScene('agreement');
            break;
        case 'chat':
            setScene('chat');
            break;
        case 'student':
            setScene('student');
            break;
        case 'accept':
            toast('Price accepted in preview. No live course was published.');
            control.disabled = true;
            control.textContent = 'Price accepted';
            break;
        case 'counter':
            document.querySelector('#counter-form').innerHTML = '<form id="price-request" class="stack section" style="margin-top:24px"><label class="field">Why would you like a different price?<textarea required minlength="10" maxlength="1000" placeholder="Explain your suggested price to the reviewer."></textarea></label><button class="button primary">Send price request</button></form>';
            document.querySelector('#price-request textarea').focus();
            break;
    } });
    app.addEventListener('submit', event => { event.preventDefault(); if (event.target.id === 'chat-form') {
        const input = document.querySelector('#message');
        const text = input.value.trim();
        if (!text)
            return;
        messages.push({ name: 'You', initials: 'YO', text, time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) });
        chat();
        document.querySelector('#message').focus();
    } if (event.target.id === 'price-request') {
        toast('Price-change request preview recorded in this tab.');
        document.querySelector('#counter-form').innerHTML = '<p class="notice">Price change requested. Awaiting the reviewer’s response.</p>';
    } });
    try {
        const draft = JSON.parse(localStorage.getItem('thinkright-course-design-preview') || 'null');
        if (draft && Array.isArray(draft.lessons) && Array.isArray(draft.topics) && typeof draft.title === 'string' && typeof draft.description === 'string' && typeof draft.outcomes === 'string') {
            state = draft;
            state.lessons.forEach(l => { if (!l.sample)
                l.ready = false; });
            saved = true;
        }
    }
    catch { }
    // Retire the four untouched sample recordings from older preview drafts.
    const sampleTitles = ['Understanding motion', 'Newton’s laws explained', 'Work, energy and power', 'Conservation of momentum'];
    if (!state.lessons.length || (state.lessons.length === 4 && state.lessons.every((lesson, index) =>
        lesson.sample && lesson.title === sampleTitles[index] && lesson.topic === topics[index]))) {
        state.lessons = [{ id: crypto.randomUUID(), title: '', topic: '', ready: false, sample: false }];
    }
    state.lessons.forEach(lesson => { lesson.ready = false; lesson.sample = false; });
    state.focused_topics = state.focused_topics ?? state.topics.join('\n');
    async function loadTeacherSubjects() {
        subjectsLoading = true;
        subjectsError = '';
        render();
        try {
            if (!window.ThinkRightAuth) throw new Error('Sign in to your teacher account, then reload this preview.');
            await window.ThinkRightAuth.initSupabase();
            const session = await window.ThinkRightAuth.getSession();
            if (!session?.user) throw new Error('Sign in to your teacher account, then reload this preview.');
            const [profile, catalog] = await Promise.all([
                window.supabase.from('tutors').select('subjects').eq('id', session.user.id).single(),
                window.supabase.from('subjects').select('id,name').order('name')
            ]);
            if (profile.error || catalog.error) throw new Error('Your applied subjects could not be loaded. Try again.');
            const applied = profile.data?.subjects || [];
            teacherSubjects = (catalog.data || []).filter(subject => applied.includes(subject.id));
            if (!teacherSubjects.some(subject => subject.id === state.subject_id)) state.subject_id = '';
            if (!teacherSubjects.length) subjectsError = 'Your application has no teaching subjects. Update your teaching profile first.';
        } catch (error) {
            teacherSubjects = [];
            subjectsError = error.message;
        } finally {
            subjectsLoading = false;
            render();
        }
    }
    loadTeacherSubjects();
    window.addEventListener('beforeunload', () => urls.forEach(url => URL.revokeObjectURL(url)));
    render();
})();
