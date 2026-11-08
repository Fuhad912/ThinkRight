/* Teacher account controls. Privileged deletion runs only on the server. */
(() => {
  let currentUser, onSaved;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const status = (form, message, error=false) => {
    const target = form.querySelector('[data-settings-status]');
    target.textContent = message; target.classList.toggle('is-error', error);
  };
  window.ThinkRightTeacherSettings = {
    render(data, user, saved) {
      currentUser=user; onSaved=saved;
      const teacher=data.tutors.find(item=>item.id===user.id)||{};
      return `<div class="tw-settings-page"><header><div class="tw-settings-heading"><a class="tw-settings-back" href="tutor-onboarding.html" aria-label="Back to profile" title="Back to profile"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></a><h1>Settings</h1></div><p>Manage your teaching account and sign-in.</p></header>
        <section><div><h2>Your name</h2><p>The name shown on your teaching profile and classes.</p></div><form data-settings-form="name"><label class="tw-field"><span>Display name</span><input class="tw-input" name="display_name" value="${esc(teacher.display_name||'')}" required minlength="2" maxlength="120" autocomplete="name"></label><button class="tw-button primary" type="submit">Save name</button><p data-settings-status role="status" aria-live="polite"></p></form></section>
        <section id="subjects"><div><h2>Teaching subjects</h2><p>Select the subjects you teach. Existing classes are kept when you change this list.</p></div><form data-settings-form="subjects"><fieldset><legend>Choose at least one subject</legend><button class="tw-subjects-toggle" type="button" data-settings-action="subjects-toggle" aria-expanded="false" aria-controls="settings-subject-options"><span>${(teacher.subjects||[]).length} subjects selected</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button><div class="tw-settings-subjects" id="settings-subject-options">${data.subjects.map(item=>`<label><input type="checkbox" name="subjects" value="${esc(item.id)}" ${(teacher.subjects||[]).includes(item.id)?'checked':''}><span>${esc(item.name)}</span></label>`).join('')}</div></fieldset><button class="tw-button primary" type="submit">Save subjects</button><p data-settings-status role="status" aria-live="polite"></p></form></section>
        <section><div><h2>Password</h2><p>Choose a new password through a secure link sent to your account email. If you use Google, this can also set a password for email sign-in.</p></div><form data-settings-form="password"><p>Send a reset link to <strong>${esc(user.email||'your account email')}</strong>.</p><button class="tw-button" type="submit">Send password reset email</button><p data-settings-status role="status" aria-live="polite"></p></form></section>
        <section class="tw-settings-delete"><div><h2>Delete account</h2><p>Remove your sign-in permanently. Teaching and payment records needed for existing students and payouts are retained. This cannot be undone.</p></div><div><button class="tw-button danger" type="button" data-settings-action="delete">Delete my account</button></div></section>
      </div>`;
    }
  };
  document.addEventListener('click', event => {
    const toggle=event.target.closest('[data-settings-action="subjects-toggle"]');
    if(toggle){toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded')!=='true'));return;}
    if (!event.target.closest('[data-settings-action="delete"]')) return;
    const dialog=document.getElementById('workspace-dialog');
    dialog.innerHTML='<div class="tw-dialog-head"><h2 id="dialog-title">Delete your account?</h2><button type="button" class="tw-icon-btn" data-action="close-dialog" aria-label="Close dialog">×</button></div><p>This permanently removes your sign-in. Records needed for existing lessons and payouts are retained.</p><form data-settings-form="delete"><label class="tw-field"><span>Type DELETE to confirm</span><input class="tw-input" name="confirmation" required pattern="DELETE" autocomplete="off"></label><p data-settings-status role="status" aria-live="polite"></p><button class="tw-button danger" type="submit">Permanently delete account</button></form>';
    dialog.showModal();
  });
  document.addEventListener('change',event=>{
    if(!event.target.matches('[name="subjects"]'))return;
    const form=event.target.closest('[data-settings-form="subjects"]');if(!form)return;
    const count=form.querySelectorAll('input[name="subjects"]:checked').length;
    form.querySelector('.tw-subjects-toggle span').textContent=count+' subjects selected';
  });
  document.addEventListener('submit', async event => {
    const form=event.target.closest('[data-settings-form]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.saving==='true') return;
    const kind=form.dataset.settingsForm, fields=new FormData(form), button=form.querySelector('[type="submit"]');
    form.dataset.saving='true'; button.disabled=true; status(form,'Saving...');
    try {
      if (kind==='name'||kind==='subjects') {
        const payload=kind==='name'?{p_name:String(fields.get('display_name')||'').trim()}:{p_subjects:fields.getAll('subjects')};
        if(kind==='name'&&(payload.p_name.length<2||payload.p_name.length>120))throw Error('Enter a name between 2 and 120 characters.');
        if(kind==='subjects'&&!payload.p_subjects.length)throw Error('Select at least one subject.');
        const result=await window.supabase.rpc('teacher_settings_update',payload);
        if(result.error)throw Error(result.error.message);
        if(kind==='name')try{localStorage.setItem('thinkright_username',payload.p_name);}catch{}
        await onSaved();
        status(document.querySelector(`[data-settings-form="${kind}"]`),kind==='name'?'Name saved.':'Teaching subjects saved.');
      } else if(kind==='password') {
        const {error}=await window.supabase.auth.resetPasswordForEmail(currentUser.email,{redirectTo:'https://thinkright.com.ng/reset-password.html'});
        if(error)throw Error(error.message);
        status(form,'Password reset email sent. Check your inbox.');
      } else if(kind==='delete') {
        if(fields.get('confirmation')!=='DELETE')throw Error('Type DELETE to confirm.');
        status(form,'Deleting your account...');
        const {data,error}=await window.supabase.functions.invoke('delete-teacher-account',{body:{confirmation:'DELETE'}});
        if(error){let message='Account deletion failed. Please try again.';try{message=(await error.context.json()).message||message;}catch{}throw Error(message);}
        if(!data?.message||data.message!=='Account deleted.')throw Error('Account deletion was not confirmed. Please try again.');
        await window.supabase.auth.signOut({scope:'local'}).catch(()=>{});
        try{localStorage.removeItem('thinkright_username');localStorage.removeItem('thinkright_auth_role');}catch{}
        window.location.replace('login.html');
      }
    } catch(error) { status(form,error.message||'Could not save. Please try again.',true); }
    finally {form.dataset.saving='false';button.disabled=false;}
  });
})();
