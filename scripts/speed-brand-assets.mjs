import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
// A temporary application initial, not a representation of the official company logo.
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();
 for(const size of [192,512]) {
  const base64=await page.evaluate(size=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#123462';ctx.fillRect(0,0,size,size);
   ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${size*.56}px Arial`;ctx.fillText('S',size/2,size/2+size*.025);
   return canvas.toDataURL('image/png').split(',')[1];
  },size);
  writeFileSync(size===192?'public/app-icon.png':'public/app-icon-512.png',Buffer.from(base64,'base64'));
 }
} finally { await browser.close(); }
console.log('Temporary application icons generated; no official logo was fabricated.');
