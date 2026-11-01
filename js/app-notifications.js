/* Account-scoped inbox. OS permission is requested only from the Enable button. */
(()=>{
 let db,userId,items=[],timer,busy=false,registration;
 const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function localURL(value){try{const url=new URL(value,location.origin);return url.origin===location.origin&&!url.username&&!url.password?url.pathname+url.search+url.hash:'/dashboard.html';}catch{return '/dashboard.html';}}
 const panel=document.createElement('dialog');panel.className='tr-notification-panel';panel.setAttribute('aria-labelledby','tr-notification-title');
 panel.innerHTML='<header><h2 id="tr-notification-title">Notifications</h2><button type="button" data-close aria-label="Close notifications">×</button></header><div class="tr-notification-settings"><p id="tr-push-status"></p><button type="button" id="tr-push-toggle">Enable device alerts</button></div><div class="tr-notification-toolbar"><span>Latest updates</span><button type="button" data-read-all>Mark all read</button></div><div id="tr-notification-list"></div><p class="tr-notification-error" role="status"></p>';
 document.body.append(panel);
 function fail(message){panel.querySelector('[role=status]').textContent=message;}
 function attachBell(){
  const header=document.querySelector('.tr-navbar__container');if(!header||!userId||header.querySelector('#tr-notification-bell'))return;
  const bell=document.createElement('button');bell.id='tr-notification-bell';bell.type='button';bell.setAttribute('aria-label','Notifications');bell.innerHTML='<i class="fa-regular fa-bell" aria-hidden="true"></i><span hidden></span>';
  bell.onclick=()=>{panel.showModal();refresh();pushStatus();};
  header.insertBefore(bell,header.querySelector('#tr-user-info,#tr-theme-toggle,.tr-profile-header-logout'));updateBadge();
 }
 function updateBadge(){const count=items.filter(n=>!n.read_at).length;const badge=document.querySelector('#tr-notification-bell span');if(badge){badge.hidden=!count;badge.textContent=count>99?'99+':count;badge.parentElement.setAttribute('aria-label',`Notifications, ${count} unread`);}}
 function draw(){
  panel.querySelector('#tr-notification-list').innerHTML=items.length?items.map(n=>`<article class="tr-notification-item ${n.read_at?'':'is-unread'}"><a href="${escape(localURL(n.url))}" data-notification="${escape(n.id)}"><strong>${escape(n.title)}</strong><p>${escape(n.body)}</p><time>${escape(new Date(n.created_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</time></a></article>`).join(''):'<p class="tr-notification-empty">You’re all caught up. Class updates and reminders will appear here.</p>';updateBadge();
 }
 async function refresh(){
  if(!userId||busy||document.hidden)return;busy=true;const owner=userId;
  try{const {data,error}=await db.from('app_notifications').select('id,title,body,url,created_at,read_at').eq('user_id',owner).order('created_at',{ascending:false}).limit(50);if(error)throw error;if(owner===userId){items=data||[];draw();fail('');}}
  catch{if(panel.open)fail('Notifications could not load. Please try again.');}finally{busy=false;}
 }
 async function pushStatus(){
  const status=panel.querySelector('#tr-push-status'),button=panel.querySelector('#tr-push-toggle');button.hidden=false;
  if(!installed()){status.textContent='Install ThinkRight on your Home Screen to enable device alerts. Your in-app updates are already on.';button.hidden=true;return;}
  if(!('Notification'in window)||!('PushManager'in window)||!('serviceWorker'in navigator)){status.textContent='Device alerts aren’t supported here. Your in-app updates are still available.';button.hidden=true;return;}
  if(Notification.permission==='denied'){status.textContent='Device alerts are blocked. Allow notifications in your device’s site settings to enable them.';button.hidden=true;return;}
  const subscription=await registration?.pushManager.getSubscription();
  status.textContent=subscription?'Device alerts are on. You’ll receive class updates and one daily reminder.':'Get class updates and one daily reminder, even when ThinkRight is closed.';
  button.textContent=subscription?'Turn off device alerts':'Enable device alerts';
 }
 async function persist(subscription){const {error}=await db.rpc('app_push_register',{p_subscription:subscription.toJSON(),p_remove:false});if(error)throw error;}
 panel.querySelector('#tr-push-toggle').onclick=async()=>{
  const button=panel.querySelector('#tr-push-toggle');button.disabled=true;fail('');
  try{
   if(!userId)throw Error('Sign in to enable alerts.');
   // Request synchronously from the click so iOS retains the user gesture.
   const permission=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission);
   if(await permission!=='granted'){await pushStatus();return;}
   registration=await navigator.serviceWorker.ready;
   let subscription=await registration.pushManager.getSubscription();
   if(subscription){const {error}=await db.rpc('app_push_register',{p_subscription:subscription.toJSON(),p_remove:true});if(error)throw error;await subscription.unsubscribe();}
   else{
    const {data,error}=await db.from('app_notification_config').select('vapid_public_key').eq('id',true).single();if(error||!data?.vapid_public_key)throw Error('Device alerts are not configured yet.');
    const raw=atob(data.vapid_public_key.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
    subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    try{await persist(subscription);}catch(error){await subscription.unsubscribe();throw error;}
   }
   await pushStatus();
  }catch(error){fail(error.message||'Could not enable alerts. Please retry.');}finally{button.disabled=false;}
 };
 panel.querySelector('[data-close]').onclick=()=>panel.close();
 panel.querySelector('[data-read-all]').onclick=async()=>{const {error}=await db.rpc('app_notification_read',{p_id:null});if(error)fail('Could not mark updates read.');else await refresh();};
 panel.addEventListener('click',async event=>{const link=event.target.closest('[data-notification]');if(!link)return;event.preventDefault();const href=link.href;await db.rpc('app_notification_read',{p_id:link.dataset.notification});location.href=href;});
 async function sessionChanged(session){
  const next=session?.user?.id||null;if(next===userId)return;
  clearInterval(timer);items=[];userId=next;panel.close();document.querySelector('#tr-notification-bell')?.remove();draw();
  if(!next){if(registration){const old=await registration.pushManager.getSubscription();if(old)await old.unsubscribe();}return;}
  attachBell();await refresh();timer=setInterval(refresh,60000);
  if('serviceWorker'in navigator){registration=await navigator.serviceWorker.ready;if(next!==userId)return;if(installed()&&'Notification'in window&&Notification.permission==='granted'){const subscription=await registration.pushManager.getSubscription();if(subscription&&next===userId)try{await persist(subscription);}catch{/* Inbox remains available. */}}}
  if(next!==userId)return;
  if(new URLSearchParams(location.search).get('notifications')==='1'){panel.showModal();pushStatus();}
 }
 async function start(){
  db=window.supabase;if(!db?.auth)return;
  db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>sessionChanged(session),0);});
  new MutationObserver(attachBell).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('appinstalled',pushStatus);
  const {data}=await db.auth.getSession();await sessionChanged(data.session);
 }
 start().catch(()=>{});
})();
