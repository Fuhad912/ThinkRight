const {readFileSync}=require('fs');const {runInNewContext}=require('vm');const ts=require('typescript');const assert=require('node:assert/strict');
(async()=>{
 let handler,sent=[],done=[],removed=[],fail=false;
 const env={NOTIFICATIONS_CRON_SECRET:'cron-secret',VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private',VAPID_CONTACT:'mailto:hello@example.com'};
 const db={rpc:async()=>({data:[{id:'job',endpoint:'https://fcm.googleapis.com/device',subscription:{endpoint:'https://fcm.googleapis.com/device',keys:{}}}]}),from:table=>({update:()=>({eq:async(_key,id)=>done.push(id)}),delete:()=>({eq:async(_key,id)=>removed.push(id)})})};
 const source=readFileSync('supabase/functions/dispatch-notifications/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,{Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},webpush:{setVapidDetails(){},sendNotification:async(sub,payload)=>{if(fail)throw {statusCode:410};sent.push(JSON.parse(payload));}},createClient:()=>db,Response,console});
 const call=token=>handler(new Request('https://example.com/dispatch',{method:'POST',headers:{authorization:'Bearer '+token}}));
 assert.equal((await call('wrong')).status,401);assert.equal(sent.length,0);
 assert.equal((await call('cron-secret')).status,200);assert.equal(sent.length,1);assert.equal(sent[0].title,'ThinkRight');assert.deepEqual(done,['job']);
 fail=true;await call('cron-secret');assert.deepEqual(removed,['https://fcm.googleapis.com/device']);
 console.log('PASS: cron authentication, generic push delivery, completion and expired endpoint cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
