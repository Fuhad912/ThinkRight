(function(){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=value=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(Number(value||0)/100);
 const https=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
 async function rpc(name,args){const r=await window.supabase.rpc(name,args);if(r.error)throw r.error;return r.data;}
 async function mount(root,tab,workspace){
  let snapshot, page=0, editing=null, saving=false;
  const note=document.createElement('p');note.className='ac-status';note.setAttribute('role','status');
  async function load(){
   root.innerHTML='<p class="ac-status">Loading platform records…</p>';
   try{const results=await Promise.all([rpc('admin_console_snapshot',{p_page:page}),tab==='overview'?rpc('workspace_snapshot'):Promise.resolve(workspace)]);snapshot=results[0];workspace=results[1];if(!root.isConnected)return;draw();}
   catch(error){if(!root.isConnected)return;root.innerHTML='<div class="tw-admin-card"><h2>Admin records unavailable</h2><p>Apply the admin console database migration, then refresh. If setup is complete, check your connection.</p><button type="button" class="tw-button" data-ac="refresh">Try again</button></div>';root.append(note);note.textContent=error.message;}
  }
  function draw(){
   const toolbar='<div class="ac-toolbar"><div><span class="ac-eyebrow">PLATFORM OPERATIONS</span><h2>'+({overview:'Overview',payments:'Class payments',textbooks:'Textbook library'}[tab])+'</h2></div><button class="tw-button" type="button" data-ac="refresh"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Refresh</button></div>';
   let body='';
   if(tab==='overview'){
    const pending=workspace.tutors.filter(t=>t.status==='pending').length;
    const reviews=workspace.revisions.filter(r=>r.state==='in_review').length;
    const taskLink=(id,content)=>`<a class="ac-task" href="#${id}" data-action="admin-tab" data-tab="${id}">${content}</a>`;
    body=`<div class="ac-financials">${[['Verified class revenue',money(snapshot.gross_kobo),'fa-naira-sign'],['Completed payments',snapshot.paid_count,'fa-circle-check'],['Pending checkouts',snapshot.pending_count,'fa-clock'],['Published textbooks',snapshot.books.filter(b=>b.published).length,'fa-book-open']].map(([label,value,icon])=>`<div class="ac-stat"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="ac-columns"><section class="tw-admin-card"><h2>Needs your attention</h2>${[['teachers','Teacher applications',pending],['reviews','Class submissions',reviews],['pricing','Subjects without a price',workspace.subjects.filter(s=>s.enrollment_price==null).length],['payouts','Bank details to review',workspace.banks.filter(b=>!b.reviewed).length]].map(([id,label,count])=>taskLink(id,`<span>${label}</span><strong>${count}</strong><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>`)).join('')}</section><section class="tw-admin-card"><h2>Manage your content</h2><p>Keep students informed and their study shelf current.</p>${taskLink('textbooks','Manage textbooks <i class="fa-solid fa-book" aria-hidden="true"></i>')}${taskLink('news','Publish news <i class="fa-solid fa-newspaper" aria-hidden="true"></i>')}${taskLink('audit','View activity <i class="fa-solid fa-list" aria-hidden="true"></i>')}</section></div>`;
   }else if(tab==='payments'){
    body=`<section class="tw-admin-card"><p>Verified payments grant course access through the checkout backend. Pending records can include abandoned checkouts.</p><label class="tw-field"><span>Search references on this page</span><input class="tw-input" id="ac-order-search" placeholder="TR-…"></label><div class="ac-table-wrap"><table class="ac-table"><thead><tr><th>Reference / student</th><th>Subject</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead><tbody>${snapshot.orders.map(o=>`<tr data-reference="${escape(o.reference.toLowerCase())}"><td><code>${escape(o.reference)}</code><small>${escape(o.user_id)}</small></td><td>${escape(workspace.subjects.find(s=>s.id===o.subject_id)?.name||o.subject_id)}</td><td>${money(o.amount_kobo)}</td><td><span class="tw-tag">${escape(o.status==='pending'&&new Date(o.expires_at)<new Date()?'expired':o.status)}</span></td><td>${escape(new Date(o.created_at).toLocaleDateString())}</td></tr>`).join('')||'<tr><td colspan="5">No payment orders yet.</td></tr>'}</tbody></table></div><div class="ac-pagination"><button type="button" class="tw-button" data-ac="previous" ${page===0?'disabled':''}>Previous</button><span>Page ${page+1} · ${snapshot.order_count} orders</span><button type="button" class="tw-button" data-ac="next" ${(page+1)*50>=snapshot.order_count?'disabled':''}>Next</button></div></section>`;
   }else{
    const b=editing||{};
    body=`<div class="ac-columns"><section class="tw-admin-card"><h2>${editing?'Edit textbook':'Add a textbook'}</h2><form id="ac-book-form"><label class="tw-field"><span>Book title</span><input class="tw-input" name="title" required minlength="2" maxlength="160" value="${escape(b.title)}"></label><label class="tw-field"><span>Subject</span><select name="subject_id" required>${workspace.subjects.map(s=>`<option value="${escape(s.id)}" ${s.id===b.subject_id?'selected':''}>${escape(s.name)}</option>`).join('')}</select></label><label class="tw-field"><span>PDF path in textbooks bucket</span><input class="tw-input" name="file_path" value="${escape(b.file_path)}" placeholder="New_School_Physics.pdf"></label><label class="tw-field"><span>Or upload a PDF (maximum 50 MB)</span><input type="file" name="pdf" accept="application/pdf,.pdf"></label><label class="tw-field"><span>Cover image URL</span><input class="tw-input" name="image_url" type="url" placeholder="https://…" value="${escape(b.image_url)}"></label><label class="ac-check"><input type="checkbox" name="published" ${b.published?'checked':''}> Visible to students</label><div class="tw-actions"><button class="tw-button primary" type="submit">Save textbook</button>${editing?'<button class="tw-button" type="button" data-ac="cancel">Cancel edit</button>':''}</div></form></section><section class="tw-admin-card"><h2>Library catalog <span class="ac-count">${snapshot.books.length}</span></h2><p>Uncheck visibility and save to withdraw a book without deleting its file.</p>${snapshot.books.map(book=>`<div class="ac-book-row">${https(book.image_url)?`<img src="${escape(https(book.image_url))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<i class="fa-solid fa-book" aria-hidden="true"></i>'}<div><strong>${escape(book.title)}</strong><small>${escape(workspace.subjects.find(s=>s.id===book.subject_id)?.name||book.subject_id)} · ${book.published?'Published':'Hidden'}</small></div><button class="tw-button" type="button" data-ac="edit" data-id="${escape(book.id)}">Edit</button></div>`).join('')||'<p>No textbooks yet.</p>'}</section></div>`;
   }
   root.innerHTML=toolbar+body;root.append(note);note.textContent='';
  }
  root.addEventListener('input',event=>{if(event.target.id==='ac-order-search'){const term=event.target.value.toLowerCase();root.querySelectorAll('[data-reference]').forEach(row=>{row.hidden=!row.dataset.reference.includes(term);});}});
  root.addEventListener('click',event=>{
   const button=event.target.closest('[data-ac]');if(!button||saving)return;
   const action=button.dataset.ac;
   if(action==='edit'){editing=snapshot.books.find(b=>b.id===button.dataset.id);draw();root.querySelector('[name=title]').focus();}
   if(action==='cancel'){editing=null;draw();}
   if(action==='previous'){page=Math.max(0,page-1);load();}
   if(action==='next'){page++;load();}
   if(action==='refresh')load();
  });
  root.addEventListener('submit',async event=>{
   if(event.target.id!=='ac-book-form')return;event.preventDefault();event.stopPropagation();if(saving)return;saving=true;
   const form=event.target,button=form.querySelector('[type=submit]'),values=new FormData(form);button.disabled=true;note.textContent='Saving textbook…';
   try{
    let path=String(values.get('file_path')||'').trim();const file=values.get('pdf');
    if(file?.size){
     if(file.size>50*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))throw new Error('Choose a PDF smaller than 50 MB.');
     const header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());if(header!=='%PDF-')throw new Error('This file is not a valid PDF.');
     path='library/'+crypto.randomUUID()+'.pdf';
     const upload=await window.supabase.storage.from('textbooks').upload(path,file,{contentType:'application/pdf',upsert:false});if(upload.error)throw upload.error;
     form.elements.file_path.value=path;form.elements.pdf.value='';
    }
    await rpc('admin_textbook_save',{p_book:{id:editing?.id,updated_at:editing?.updated_at,title:values.get('title'),subject_id:values.get('subject_id'),file_path:path,image_url:values.get('image_url'),published:values.get('published')==='on'}});
    editing=null;await load();note.textContent='Textbook saved. Student visibility has been updated.';
   }catch(error){note.textContent=error.message;}finally{saving=false;button.disabled=false;}
  });
  await load();
 }
 window.ThinkRightAdminConsole={mount};
})();
