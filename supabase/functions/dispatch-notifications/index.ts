import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.43.4';

// Called by a server-side schedule, never by browsers. No user access tokens accepted.
Deno.serve(async request => {
 const secret=Deno.env.get('NOTIFICATIONS_CRON_SECRET');
 if(request.method!=='POST'||!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return new Response('Unauthorized',{status:401});
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),contact=Deno.env.get('VAPID_CONTACT');
 if(!publicKey||!privateKey||!contact)return new Response('Push keys not configured',{status:503});
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 webpush.setVapidDetails(contact,publicKey,privateKey);
 const {data:jobs,error}=await db.rpc('app_push_claim');
 if(error)return new Response('Queue unavailable',{status:500});
 let sent=0;
 await Promise.all((jobs||[]).map(async(job: {id:string;endpoint:string;subscription:{endpoint:string;keys:{auth:string;p256dh:string}}})=>{
  // Recheck the endpoint allowlist before making an outbound request.
  if(!/^https:\/\/(fcm.googleapis.com|updates.push.services.mozilla.com|[a-z0-9.-]+\.push.apple.com|[a-z0-9.-]+\.notify.windows.com)\//.test(job.endpoint))return;
  try{
   // Keep private account/class details off a shared device's lock screen.
   await webpush.sendNotification(job.subscription,JSON.stringify({title:'ThinkRight',body:'You have a new update. Open ThinkRight to view your notifications.',url:'/dashboard.html?notifications=1',tag:`thinkright-${job.id}`}),{TTL:3600,timeout:10000});
   await db.from('app_push_jobs').update({done:true}).eq('id',job.id);sent++;
  }catch(error){
   const status=error&&typeof error==='object'&&'statusCode' in error?Number(error.statusCode):0;
   if([404,410].includes(status))await db.from('app_push_subscriptions').delete().eq('endpoint',job.endpoint);
   // Other failures retry after the claim lease expires, up to five attempts.
  }
 }));
 return Response.json({sent,claimed:jobs?.length||0});
});
