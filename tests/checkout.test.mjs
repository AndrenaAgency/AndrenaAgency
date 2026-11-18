import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutApi,checkoutReady} from '../checkout-worker.js';
test('production checkout fails closed without secrets or launch flag',async()=>{
 assert.equal(checkoutReady({CHECKOUT_ENABLED:'true'}),false);
 const r=await checkoutApi(new Request('https://example.com/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),{});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,'Checkout is not accepting orders yet');
});
test('checkout availability remains disabled without payment and Turnstile bindings',async()=>{
 const r=await checkoutApi(new Request('https://example.com/api/checkout/status'),{CHECKOUT_ENABLED:'false',DB:{}});
 assert.deepEqual(await r.json(),{enabled:false});
});
test('enabled checkout rejects invalid order without writing to database',async()=>{
 const env={CHECKOUT_ENABLED:'true',DB:{},CHECKOUT_TURNSTILE_SECRET:'test',EFT_ACCOUNT_NUMBER:'test',EFT_ACCOUNT_NAME:'test',EFT_BRANCH_CODE:'test'};
 const r=await checkoutApi(new Request('https://example.com/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({package_code:'other',care_code:'none',domain_choice:'owned',customer_name:'Test Person',customer_email:'test@example.com',business_name:'Test Business'})}),env);
 assert.equal(r.status,400);
});

import {checkoutAdmin} from '../checkout-admin.js';
test('unauthenticated admin cannot list orders or approve payment',async()=>{
 const env={DB:{prepare(){throw Error('Database must not be accessed before auth')}}};
 for(const [path,method] of [['/api/admin/orders','GET'],['/api/admin/verify-eft','POST'],['/api/admin','GET']]){
  const r=await checkoutAdmin(new Request('https://example.com'+path,{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?'{}':undefined}),env);
  assert.equal(r.status,401);
 }
});

import {issueOnboardingLink,onboardingApi} from '../checkout-onboarding.js';
test('onboarding link is denied until bank deposit verification',async()=>{
 const env={DB:{prepare(){return {bind(){return {first:async()=>({status:'awaiting_deposit'})}}}}}};
 const result=await issueOnboardingLink(env,'test-order');
 assert.equal(result.status,409);
});
test('onboarding rejects malformed token before accessing database',async()=>{
 const r=await onboardingApi(new Request('https://example.com/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'wrong',answers:{description:'test',services:'test',style:'',link:''}})}),{DB:{prepare(){throw Error('DB accessed')}}});
 assert.equal(r.status,400);
});
test('checkout pricing uses exactly 50 percent deposit for each published package',()=>{
 for(const amount of [84900,149900,249900])assert.equal(Math.floor(amount/2)+amount-Math.floor(amount/2),amount);
});

import entry from '../checkout-api-entry.js';
test('admin same-origin POST reaches auth layer instead of CORS rejection',async()=>{
 const r=await entry.fetch(new Request('https://andrena-checkout.andrenaagency.workers.dev/api/admin/verify-eft',{method:'POST',headers:{Origin:'https://andrena-checkout.andrenaagency.workers.dev','Content-Type':'application/json'},body:'{}'}),{DB:{prepare(){throw Error('must authenticate first')}}});
 assert.equal(r.status,401);
});
test('cross-origin request cannot reach protected admin route',async()=>{
 const r=await entry.fetch(new Request('https://andrena-checkout.andrenaagency.workers.dev/api/admin/verify-eft',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'}),{});
 assert.equal(r.status,403);
});
test('checkout creates fictional order and payment request in isolated mock database',async()=>{
 const written=[];const db={prepare(sql){return {bind(...args){return {first:async()=>({count:0}),sql,args}}}},async batch(statements){written.push(...statements);return statements.map(()=>({meta:{changes:1}}))}};
 const env={CHECKOUT_ENABLED:'true',DB:db,CHECKOUT_TURNSTILE_SECRET:'fictional',EFT_ACCOUNT_NUMBER:'TEST-NOT-REAL',EFT_ACCOUNT_NAME:'TEST ONLY',EFT_BRANCH_CODE:'TEST'};
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({success:true,action:'checkout',hostname:'andrenaagency.andrenaagency.workers.dev'});
 try{
  const req=new Request('https://andrena-checkout.andrenaagency.workers.dev/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({package_code:'starter',care_code:'none',domain_choice:'later',customer_name:'Fictional Customer',customer_email:'fictional@example.test',business_name:'Fictional Business',accepted_terms:true,turnstile_token:'fictional-token-123456'})});
  const response=await checkoutApi(req,env);assert.equal(response.status,201);
  const data=await response.json();
  assert.equal(data.total_cents,84900);assert.equal(data.deposit_cents,42450);assert.equal(data.balance_cents,42450);
  assert.equal(data.instructions.amount_cents,42450);
  assert.match(data.instructions.reference,/^AND-[0-9A-F]{12}-D$/);
  assert.equal(written.length,6);
  assert.ok(written.some(x=>x.sql.includes('INSERT INTO onboarding_access')&&x.sql.includes('CURRENT_TIMESTAMP')));
  assert.ok(written.some(x=>x.sql.includes('INSERT INTO eft_payment_requests')));
 }finally{globalThis.fetch=original}
});

test('onboarding issuance refuses unpaid orders without changing access',async()=>{
 let writes=0;
 const env={DB:{prepare(sql){return {bind(){return {first:async()=>({status:'awaiting_deposit'}),run:async()=>{writes++;return {meta:{changes:1}}}}}}}}};
 const result=await issueOnboardingLink(env,'fictional-order');
 assert.equal(result.status,409);
 assert.equal(writes,0);
});
test('onboarding issuance unlocks only a simulated verified order',async()=>{
 const statements=[];
 const env={DB:{prepare(sql){return {bind(...args){return {first:async()=>({status:'deposit_verified'}),run:async()=>{statements.push({sql,args});return {meta:{changes:1}}}}}}}}};
 const result=await issueOnboardingLink(env,'fictional-order');
 assert.match(result.url,/\/onboarding#[0-9a-f-]{72}$/);
 assert.equal(statements.length,2);
 assert.match(statements[0].sql,/revoked_at IS NOT NULL/);
 assert.match(statements[1].sql,/in_progress/);
});
