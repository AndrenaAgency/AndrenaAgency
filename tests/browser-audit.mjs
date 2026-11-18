import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const url='https://andrenaagency.andrenaagency.workers.dev/';
const browser=await chromium.launch({headless:true});
let failed=false;
try{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(response.status(),200);
  assert.match(await page.title(),/Andrena Agency/);
  await page.locator('#checkoutSubmit').waitFor();
  await page.waitForFunction(()=>document.getElementById('checkoutMessage').textContent!=='Checking checkout availability…',{timeout:20000});
  const status=await page.locator('#checkoutMessage').innerText();
  assert.match(status,/Checkout is available/);
  assert.equal(await page.locator('#checkoutReceipt').isVisible(),false);
  await page.locator('#website').selectOption('premium');
  assert.equal((await page.locator('#checkoutTotal').innerText()).replace(/[^0-9]/g,''),'2499');
  assert.match(await page.locator('#checkoutDeposit').innerText(),/1,249\.50/);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  assert.ok(overflow<=2,'Horizontal overflow '+overflow+'px at width '+viewport.width);
  assert.deepEqual(errors,[],'Browser errors at width '+viewport.width);
  console.log('PASS viewport '+viewport.width+'x'+viewport.height+'; '+status);
  await page.close();
 }
}finally{await browser.close()}
