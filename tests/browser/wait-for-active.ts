import {expect,type Page} from '@playwright/test';
export async function waitForActive(page:Page,timeout=5000):Promise<void>{
  await expect.poll(()=>page.evaluate(()=>{
    const state=(globalThis as any).nativeController.getSnapshot();
    return state.phase==='active'&&state.committedRevision>0;
  }),{timeout,intervals:[10,20,50,100]}).toBe(true);
}
