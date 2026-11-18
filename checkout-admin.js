import {verifyAccessIdentity} from './checkout-access-auth.js';
const json=(x,status=200)=>Response.json(x,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function checkoutAdmin(request,env){
 const admin=await verifyAccessIdentity(request,env);
 if(!admin)return json({error:"Administrator authentication required"},401);
 const url=new URL(request.url),path=url.pathname;
 if(path==="/api/admin/orders"&&request.method==="GET"){
  const rows=await env.DB.prepare("SELECT o.id,o.customer_name,o.customer_email,o.package_code,o.care_code,o.domain_choice,o.total_cents,o.deposit_cents,o.balance_cents,o.status,o.created_at,p.id AS payment_request_id,p.reference,p.amount_cents,p.status AS payment_status FROM orders o LEFT JOIN eft_payment_requests p ON p.order_id=o.id AND p.installment='deposit' ORDER BY o.created_at DESC LIMIT 100").all();
  return json({orders:rows.results});
 }
 if(path==="/api/admin/verify-eft"&&request.method==="POST"){
  if(!request.headers.get("Content-Type")?.startsWith("application/json"))return json({error:"JSON required"},415);
  const b=await request.json().catch(()=>null);
  if(!b||typeof b.payment_request_id!=="string"||b.bank_confirmed!==true||typeof b.bank_transaction_reference!=="string"||b.bank_transaction_reference.trim().length<5||b.bank_transaction_reference.length>120)return json({error:"Explicit bank confirmation and transaction reference required"},400);
  const p=await env.DB.prepare("SELECT id,order_id,installment,amount_cents,reference,status FROM eft_payment_requests WHERE id=?").bind(b.payment_request_id).first();
  if(!p)return json({error:"Payment request not found"},404);
  if(p.status!=="awaiting_payment")return json({error:"Already processed"},409);
  const order=await env.DB.prepare("SELECT status FROM orders WHERE id=?").bind(p.order_id).first();
  const expected=p.installment==="deposit"?"awaiting_deposit":"awaiting_final_payment";
  if(order?.status!==expected)return json({error:"Order not in payable state"},409);
  const existing=await env.DB.prepare("SELECT id FROM payments WHERE gateway_payment_id=?").bind(b.bank_transaction_reference.trim()).first().catch(()=>null);
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
