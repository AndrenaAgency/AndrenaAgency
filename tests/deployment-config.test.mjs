import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('production deployment targets the checkout API and the correct D1 database',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(config.name,'andrena-checkout');
 assert.equal(config.main,'checkout-api-entry.js');
 assert.equal(config.keep_vars,true);
 assert.equal(config.workers_dev,true);
 assert.deepEqual(config.d1_databases.map(({binding,database_name,database_id})=>({binding,database_name,database_id})),[{
  binding:'DB',
  database_name:'andrena-production-checkout',
  database_id:'19ea9388-91f8-4525-b2c4-4e15ef51a923'
 }]);
 assert.equal(config.vars,undefined,'Do not commit dashboard secrets or launch flags');
});
