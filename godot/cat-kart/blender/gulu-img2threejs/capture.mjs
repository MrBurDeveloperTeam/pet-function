import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu-sandbox']});
const page=await browser.newPage({viewport:{width:420,height:474},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
await page.goto('http://127.0.0.1:8093/public/index.html?capture=1');
await page.waitForFunction(()=>window.__IMG2THREEJS_READY__,{timeout:120000});
await fs.mkdir('renders',{recursive:true});
for(const view of ['front','left','right','back','top','bottom','hero']){
 await page.evaluate(v=>window.__GULU__.setView(v),view);await page.waitForTimeout(250);
 await page.locator('canvas').screenshot({path:`renders/${view}.png`});
}
const geometry=await page.evaluate(()=>{const meshes=[];const root=window.__GULU__.model;root.updateMatrixWorld(true);root.traverse(o=>{if(o.isMesh&&o.visible){const p=o.geometry.attributes.position;meshes.push({name:o.name,componentId:o.userData?.componentId,positions:Array.from(p.array),indices:o.geometry.index?Array.from(o.geometry.index.array):null,matrix:Array.from(o.matrixWorld.elements)});}});return meshes;});
await fs.writeFile('meshes.json',JSON.stringify(geometry));
await fs.writeFile('capture-report.json',JSON.stringify({errors,views:['front','left','right','back','top','bottom','hero'],meshCount:geometry.length,source:'procedural Three.js factory'},null,2));
const waiting=page.waitForEvent('download');
await page.evaluate(()=>document.querySelector('#export').click());
const download=await waiting;await download.saveAs('gulu-img2threejs-r7.glb');
await browser.close();if(errors.length)process.exit(1);





