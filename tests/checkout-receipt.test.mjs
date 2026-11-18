import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('checkout receipt renders actual line breaks rather than escaped backslash-n text',()=>{
 assert.match(html,/checkoutReceipt\.textContent=\[/);
 assert.match(html,/\.join\(String\.fromCharCode\(10\)\)/);
 assert.doesNotMatch(html,/checkoutReceipt\.textContent='Order: '/);
});
test('checkout receipt has responsive styling and empty state',()=>{
 assert.match(html,/class="checkout-receipt"/);
 assert.match(html,/\.checkout-receipt:empty\{display:none\}/);
});
