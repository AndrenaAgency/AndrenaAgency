import {issueOnboardingLink} from './checkout-onboarding.js';
import {verifyAccessIdentity} from './checkout-access-auth.js';
const json=(x,status=200)=>Response.json(x,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function checkoutAdmin(request,env){
 const admin=await verifyAccessIdentity(request,env);
 if(!admin)return json({error:"Administrator authentication required"},401);
 const url=new URL(request.url),path=url.pathname;
 if(path==="/api/admin"&&request.method==="GET")return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Andrena | Payment Administration</title><style>body{font:16px system-ui;max-width:900px;margin:30px auto;padding:15px;background:#f4f4f4}main{background:white;padding:24px;border-radius:12px}article{border-top:1px solid #ccc;padding:16px 0}button,input{font:inherit;padding:9px;margin:5px}input{max-width:350px}</style><main><h1>Andrena checkout administration</h1><p>Confirm cleared funds directly in Capitec before verifying any payment. Never approve from a screenshot alone.</p><button id="refresh">Refresh orders</button><div id="orders"></div></main><script>
const root=document.getElementById('orders');
async function refresh(){root.textContent='Loading…';try{const r=await fetch('/api/admin/orders',{credentials:'same-origin'});const x=await r.json();if(!r.ok)throw Error(x.error);root.replaceChildren();for(const o of x.orders){const article=document.createElement('article');const info=document.createElement('p');info.textContent=[o.customer_name,o.customer_email,o.package_code,'R'+(o.deposit_cents/100).toFixed(2),o.status,'Reference: '+(o.reference||'none'),'Payment: '+(o.payment_status||'none')].join(' | ');article.append(info);if(o.status==='deposit_verified'||o.status==='awaiting_final_payment'){const linkButton=document.createElement('button');linkButton.textContent='Generate onboarding link';linkButton.onclick=async()=>{if(!confirm('Issue a private onboarding link for this bank-verified order?'))return;const r=await fetch('/api/admin/issue-onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:o.id})});const data=await r.json();if(!r.ok){alert(data.error);return}const box=document.createElement('textarea');box.readOnly=true;box.value=data.url;box.setAttribute('aria-label','Private onboarding link');article.append(box);linkButton.disabled=true};article.append(linkButton)}if(o.status==='deposit_verified'){const balanceButton=document.createElement('button');balanceButton.textContent='Request final balance';balanceButton.onclick=async()=>{if(!confirm('Only request the final balance after the client has approved the finished website. Continue?'))return;const r=await fetch('/api/admin/request-balance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:o.id,client_approved:true})});const data=await r.json();if(!r.ok){alert(data.error||'Unable to request balance');return}alert('Final balance request created. Amount R'+(data.amount_cents/100).toFixed(2)+'; reference '+data.reference);await refresh()};article.append(balanceButton)}if(o.payment_status==='awaiting_payment'){const input=document.createElement('input');input.placeholder='Bank transaction reference';input.setAttribute('aria-label','Bank transaction reference');const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';label.append(checkbox,document.createTextNode('I verified cleared funds in Capitec'));const button=document.createElement('button');button.textContent='Verify EFT';button.onclick=async()=>{if(!checkbox.checked||input.value.trim().length<5){alert('Bank confirmation and reference required');return}if(!confirm('Confirm cleared funds were verified in the bank?'))return;button.disabled=true;const response=await fetch('/api/admin/verify-eft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payment_request_id:o.payment_request_id,bank_confirmed:true,bank_transaction_reference:input.value.trim()})});const result=await response.json();if(!response.ok)alert(result.error);await refresh()};article.append(input,label,button)}root.append(article)}if(!x.orders.length)root.textContent='No orders yet.'}catch(e){root.textContent='Could not load orders: '+e.message}}
document.getElementById('refresh').onclick=refresh;refresh();
</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" }});
 if(path==="/api/admin/orders"&&request.method==="GET"){
  const rows=await env.DB.prepare("SELECT o.id,o.customer_name,o.customer_email,o.package_code,o.care_code,o.domain_choice,o.total_cents,o.deposit_cents,o.balance_cents,o.status,o.created_at,p.id AS payment_request_id,p.reference,p.amount_cents,p.status AS payment_status FROM orders o LEFT JOIN eft_payment_requests p ON p.order_id=o.id AND p.installment=CASE WHEN o.status='awaiting_final_payment' OR o.status='ready_to_launch' THEN 'balance' ELSE 'deposit' END ORDER BY o.created_at DESC LIMIT 100").all();
  return json({orders:rows.results});
 }
 if(path==="/api/admin/request-balance"&&request.method==="POST"){
  if(!request.headers.get("Content-Type")?.startsWith("application/json"))return json({error:"JSON required"},415);
  const b=await request.json().catch(()=>null);
  if(typeof b?.order_id!=="string"||b.order_id.length>100||b.client_approved!==true)return json({error:"Order and explicit client approval required"},400);
  const order=await env.DB.prepare("SELECT id,status,balance_cents FROM orders WHERE id=?").bind(b.order_id).first();
  if(!order||order.status!=="deposit_verified")return json({error:"Order must have verified deposit and no outstanding balance request"},409);
  const brief=await env.DB.prepare("SELECT status FROM onboarding WHERE order_id=?").bind(order.id).first();
  if(brief?.status!=="submitted")return json({error:"Onboarding brief must be submitted first"},409);
  const reference="AND-"+order.id.replaceAll("-","").slice(0,12).toUpperCase()+"-B";
  try{
   const result=await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status='awaiting_final_payment',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='deposit_verified'").bind(order.id),
    env.DB.prepare("INSERT INTO eft_payment_requests(id,order_id,installment,reference,amount_cents) VALUES(?,?,'balance',?,?)").bind(crypto.randomUUID(),order.id,reference,order.balance_cents),
    env.DB.prepare("INSERT INTO activity_log(id,order_id,event_type,actor_type,description) VALUES(?,?,'balance_requested','admin',?)").bind(crypto.randomUUID(),order.id,"Final balance requested after client approval by "+admin.email)
   ]);
   if(result[0].meta.changes!==1)throw Error("Conflict");
   return json({order_id:order.id,amount_cents:order.balance_cents,reference,status:"awaiting_final_payment"});
  }catch{return json({error:"Balance request conflict; inspect existing requests before retrying"},409)}
 }
 if(path==="/api/admin/issue-onboarding"&&request.method==="POST"){
  const b=await request.json().catch(()=>null);
  if(!b||typeof b.order_id!=="string")return json({error:"Order ID required"},400);
  const result=await issueOnboardingLink(env,b.order_id);
  return json(result,result.status||200);
 }
 if(path==="/api/admin/verify-eft"&&request.method==="POST"){
  if(!request.headers.get("Content-Type")?.startsWith("application/json"))return json({error:"JSON required"},415);
  const b=await request.json().catch(()=>null);
  if(!b||typeof b.payment_request_id!=="string"||b.bank_confirmed!==true||typeof b.bank_transaction_reference!=="string"||b.bank_transaction_reference.trim().length<5||b.bank_transaction_reference.length>120)return json({error:"Explicit bank confirmation and transaction reference required"},400);
  const p=await env.DB.prepare("SELECT id,order_id,installment,amount_cents,reference,status FROM eft_payment_requests WHERE id=?").bind(b.payment_request_id).first();
  if(!p)return json({error:"Payment request not found"},404);
  if(p.status!=="awaiting_payment")return json({error:"Already processed"},409);
  const order=await env.DB.prepare("SELECT status FROM orders WHERE id=?").bind(p.order_id).first();
  if(p.installment!=="deposit"&&p.installment!=="balance")return json({error:"Unknown payment installment"},409);
  const expected=p.installment==="deposit"?"awaiting_deposit":"awaiting_final_payment";
  if(order?.status!==expected)return json({error:"Order not in payable state"},409);
  if(p.installment==="balance"){const brief=await env.DB.prepare("SELECT status FROM onboarding WHERE order_id=?").bind(p.order_id).first();if(brief?.status!=="submitted")return json({error:"Cannot verify final balance before onboarding is submitted"},409)}
  let existing;try{existing=await env.DB.prepare("SELECT id FROM payments WHERE gateway_payment_id=?").bind(b.bank_transaction_reference.trim()).first()}catch{return json({error:"Cannot verify transaction uniqueness. Try again later."},503)}
  if(existing)return json({error:"Bank transaction already reconciled"},409);
  const next=p.installment==="deposit"?"deposit_verified":"ready_to_launch";
  const tx=b.bank_transaction_reference.trim();
  try{
   const result=await env.DB.batch([
    env.DB.prepare("UPDATE eft_payment_requests SET status='verified',verified_at=CURRENT_TIMESTAMP,verified_by=? WHERE id=? AND status='awaiting_payment'").bind(admin.email,p.id),
    env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?").bind(next,p.order_id,expected),
    env.DB.prepare("INSERT INTO payments(id,order_id,payment_kind,amount_cents,status,gateway,gateway_payment_id,merchant_reference,paid_at) VALUES(?,?,?,?,'paid','manual_eft',?,?,CURRENT_TIMESTAMP)").bind(crypto.randomUUID(),p.order_id,p.installment,p.amount_cents,tx,p.reference),
    env.DB.prepare("INSERT INTO activity_log(id,order_id,event_type,actor_type,description) VALUES(?,?,'eft_payment_verified','admin',?)").bind(crypto.randomUUID(),p.order_id,"Bank-confirmed "+p.installment+" payment by "+admin.email)
   ]);
   if(result[0].meta.changes!==1||result[1].meta.changes!==1)throw Error("Conflict");
   return json({order_id:p.order_id,order_status:next,payment_status:"verified"});
  }catch{return json({error:"Verification conflict. Inspect bank transaction and payment ledger before retrying."},409)}
 }
 return json({error:"Not found"},404);
}
