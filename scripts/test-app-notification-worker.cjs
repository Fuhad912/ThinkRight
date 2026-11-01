const {readFileSync}=require('fs');const {runInNewContext}=require('vm');const assert=require('node:assert/strict');
(async()=>{
 const source=readFileSync('sw.js','utf8');assert.equal(source,readFileSync('public/sw.js','utf8'),'Both deployed worker copies match');
 const listeners={};let shown,opened,focused=false,navigated;
 const self={location:{origin:'https://thinkright.example'},addEventListener:(key,fn)=>listeners[key]=fn,
 registration:{showNotification:async(title,options)=>{shown={title,...options};}},
 clients:{matchAll:async()=>[],openWindow:async url=>opened=url}};
 runInNewContext(source,{self,URL,console});
 async function fire(key,extra){let pending;listeners[key]({...extra,waitUntil:p=>pending=p});await pending;}
 await fire('push',{data:{json:()=>({title:'Class update',body:'Ready',url:'https://evil.example/phishing'})}});
 assert.equal(shown.data.url,'/dashboard.html?notifications=1');assert.equal(shown.body,'Ready');
 await fire('push',{data:{json:()=>{throw Error('invalid JSON');}}});assert.equal(shown.title,'ThinkRight');
 await fire('notificationclick',{notification:{close(){},data:{url:'https://evil.example'}}});assert.equal(opened,'https://thinkright.example/dashboard.html?notifications=1');
 self.clients.matchAll=async()=>[{url:'https://thinkright.example/classes.html',navigate:async url=>navigated=url,focus:async()=>focused=true}];
 await fire('notificationclick',{notification:{close(){},data:{url:'/dashboard.html?notifications=1'}}});
 assert.equal(navigated,'https://thinkright.example/dashboard.html?notifications=1');assert.equal(focused,true);
 console.log('PASS: push display, malformed fallback, safe click URLs, existing window focus and matching service workers.');
})().catch(e=>{console.error(e);process.exitCode=1;});
