import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const admin=readFileSync(new URL('../checkout-admin.js',import.meta.url),'utf8');
test('admin EFT verification requires a safe positive integer amount in cents',()=>{
 assert.match(admin,/Number\.isSafeInteger\(b\.bank_amount_cents\)/);
 assert.match(admin,/b\.bank_amount_cents!==p\.amount_cents/);
});
test('admin dashboard requires cleared amount input and sends it in cents',()=>{
 assert.match(admin,/amountInput\.type='number'/);
 assert.match(admin,/bank_amount_cents:Math\.round\(Number\(amountInput\.value\)\*100\)/);
});
