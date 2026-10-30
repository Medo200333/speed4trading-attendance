import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
test('Android export hook retains a revoked CSV blob and refuses an unrecognized message port',async()=>{
 const java=readFileSync('android/app/src/main/java/com/zubayd/accesscontrol/MainActivity.java','utf8'),expression=java.match(/String script="(.*)";/)?.[1];assert.ok(expression);
 const script=JSON.parse('"'+expression.replace('"+handshake+"','test-origin-bound-nonce')+'"');
 const server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><body></body>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(script);
  await page.evaluate(()=>{window.good=[];window.bad=[];const attacker=new MessageChannel(),trusted=new MessageChannel();attacker.port1.onmessage=e=>window.bad.push(e.data);trusted.port1.onmessage=e=>window.good.push(e.data);window.postMessage('zubayd-export-port',location.origin,[attacker.port2]);window.postMessage('test-origin-bound-nonce',location.origin,[trusted.port2]);});
  await page.waitForTimeout(20);
  await page.evaluate(()=>{const url=URL.createObjectURL(new Blob(['الموظف,التاريخ\nmk,2015-01-01'],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Zubayd-attendance.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);});
  await page.waitForFunction(()=>window.good.length===1);
  const result=await page.evaluate(()=>({good:window.good,bad:window.bad}));
  assert.equal(result.bad.length,0);const file=JSON.parse(result.good[0]);assert.equal(file.name,'Zubayd-attendance.csv');assert.ok(Buffer.from(file.body,'base64').toString().includes('mk,2015-01-01'));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
