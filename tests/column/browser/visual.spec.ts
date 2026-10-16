import {expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {test,setup,mount,frame} from './helpers.js';
type Case=Readonly<{name:string;width:number;height:number;orientation:'vertical'|'horizontal';theme:'light'|'dark';direction?:'rtl';interaction?:'first'|'last';forcedColors?:boolean}>;
const sizes=[[320,300],[375,320],[430,320],[768,400],[1280,600]] as const,cases:Case[]=[];
for(const orientation of ['vertical','horizontal'] as const)for(const theme of ['light','dark'] as const){
  for(const name of ['basic','grouped','negative','gaps','duplicates','long-labels'])for(const[width,height]of sizes)cases.push({name,width,height,orientation,theme});
  for(const name of ['empty','loading','error'])for(const[width,height]of [sizes[0],sizes[3]])cases.push({name,width,height,orientation,theme});
  for(const name of ['grouped','long-labels'])for(const[width,height]of [sizes[0],sizes[3]])cases.push({name,width,height,orientation,theme,direction:'rtl'});
  for(const interaction of ['first','last'] as const)for(const[width,height]of [sizes[0],sizes[3]])cases.push({name:'grouped',width,height,orientation,theme,interaction});
  cases.push({name:'dense',width:768,height:400,orientation,theme});
  for(const name of ['single','average'])for(const[width,height]of [sizes[0],sizes[3]])cases.push({name,width,height,orientation,theme});
  for(const name of ['zero','thirty','custom'])cases.push({name,width:768,height:400,orientation,theme});
  cases.push({name:'hidden',width:320,height:300,orientation,theme});
}
for(const orientation of ['vertical','horizontal'] as const)cases.push({name:'grouped',width:768,height:400,orientation,theme:'light',forcedColors:true});
for(const c of cases){const id=[c.orientation==='horizontal'?'bar':'column',c.name,`${c.width}x${c.height}`,c.theme,c.direction,c.interaction,c.forcedColors?'forced-colors':null].filter(Boolean).join('-');
  test('@visual '+id,async({page},info)=>{
    await page.setViewportSize({width:c.width,height:c.height+40});if(c.forcedColors)await page.emulateMedia({forcedColors:'active'});await setup(page,c.width,c.height);if(c.interaction)await page.evaluate(()=>{document.body.style.transform='translateZ(0)';});
    await mount(page,c.name,{orientation:c.orientation,theme:c.theme,...(c.direction?{direction:c.direction}:{})});await page.evaluate(()=>document.fonts.ready);await frame(page);
    if(c.interaction){const grid=page.locator('[data-nc-grid]');await grid.focus();await grid.press(c.interaction==='last'?'End':'Home');await expect(page.locator('[data-nc-detail]')).toBeVisible();await expect(page.locator('[data-nc-detail]')).toHaveAttribute('data-nc-point-id',c.interaction==='last'?'p0-9':'p0-0');await frame(page);}
    const root=page.locator('[data-nc-root]'),box=await root.boundingBox();expect(box?.width).toBe(c.width);expect(box?.height).toBe(c.height);
    expect(await root.locator('svg').evaluateAll(elements=>elements.some(e=>/NaN|Infinity/.test(e.outerHTML)))).toBe(false);
    const escaped=await root.locator('[data-nc-layer="labels"] text').evaluateAll(elements=>elements.filter(e=>{const b=e.getBoundingClientRect(),s=(e as SVGTextElement).ownerSVGElement!.getBoundingClientRect();return b.left<s.left-1||b.top<s.top-1||b.right>s.right+1||b.bottom>s.bottom+1;}).map(e=>e.textContent));expect(escaped).toEqual([]);
    const directory=path.resolve('artifacts/nc-01c/visual-review/captures');fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,id+'.png'),first=await root.screenshot({path:file,animations:'disabled'}),repeat=await root.screenshot({animations:'disabled'});expect(repeat.equals(first)).toBe(true);
    const record={file:'captures/'+id+'.png',case:c.name,...c,browser:info.project.name,dimensions:[first.readUInt32BE(16),first.readUInt32BE(20)],sha256:crypto.createHash('sha256').update(first).digest('hex'),baseline:null,repeatCapture:'PASS',result:'VISUAL AUTOMATED PASS',humanApproval:'PENDING'};
    fs.writeFileSync(path.join(directory,id+'.json'),JSON.stringify(record,null,2)+'\n');await page.evaluate(()=>window.column!.destroy());
  });
}
