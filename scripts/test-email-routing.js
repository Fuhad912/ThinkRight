const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('supabase/functions/send-email/index.ts', 'utf8').replace(/^import .*;\r?\n/, '');
let handler;
const users = [{id:'s',email:'student@test.com'}, {id:'t',email:'teacher@test.com',user_metadata:{role:'student'}}, {id:'a',email:'admin@test.com'}];
const context = {
  serve: fn => { handler = fn; }, Request, Response, AbortSignal, console,
  Deno: {env: {get: () => 'test'}},
  fetch: async url => new Response(JSON.stringify(
    url.includes('workspace_roles') ? [{user_id:'t',role:'teacher'}, {user_id:'a',role:'admin'}] :
    url.includes('/admin/users') ? {users} : []
  ))
};
vm.createContext(context);
vm.runInContext(ts.transpile(source, {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}), context);
(async () => {
  for (const [audience, expected] of [['all',3], ['students',1], ['teachers',1], ['admins',1]]) {
    const result = await context.resolveBroadcastRecipients('https://test', 'key', audience, 'extra@test.com');
    assert.equal(result.length, expected);
    if (audience !== 'all') assert.ok(result[0].startsWith({students:'student',teachers:'teacher',admins:'admin'}[audience]));
  }
  const denied = await handler(new Request('https://test', {method:'POST',body:JSON.stringify({action:'broadcast',title:'test',body:'test'})}));
  assert.equal(denied.status,403);
  console.log('Email routing: all users, database roles, custom address isolation and admin authorization passed.');
})().catch(error => { console.error(error); process.exitCode=1; });
