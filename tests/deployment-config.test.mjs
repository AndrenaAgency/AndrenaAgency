import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const config=(path)=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
test('public site deploys its HTML entrypoint, not the checkout API',()=>{const c=config('wrangler.jsonc');assert.equal(c.name,'andrenaagency');assert.equal(c.main,'site-worker.js');assert.ok(c.rules.some(r=>r.type==='Text'&&r.globs.includes('**/*.html')));});
test('checkout API retains independent deployment configuration and production D1',()=>{const c=config('wrangler.checkout.jsonc');assert.equal(c.name,'andrena-checkout');assert.equal(c.main,'checkout-api-entry.js');assert.equal(c.keep_vars,true);assert.equal(c.workers_dev,true);assert.deepEqual(c.d1_databases.map(({binding,database_name,database_id})=>({binding,database_name,database_id})),[{binding:'DB',database_name:'andrena-production-checkout',database_id:'19ea9388-91f8-4525-b2c4-4e15ef51a923'}]);assert.equal(c.vars,undefined);});
