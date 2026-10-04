import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
import type { FrameClock, SizeObserver } from './ports.js';
export function createBrowserPorts(host:HTMLElement,overrides:{clock?:FrameClock;sizeObserver?:SizeObserver}={}):Result<{clock:FrameClock;sizeObserver:SizeObserver}>{
  const win=host.ownerDocument.defaultView;
  if(!overrides.clock&&(!win||!win.requestAnimationFrame||!win.cancelAnimationFrame))return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','clock');
  const Resize=(win as (Window&{ResizeObserver?:typeof ResizeObserver})|null)?.ResizeObserver;
  if(!overrides.sizeObserver&&!Resize)return invalid('LIFECYCLE_ERROR','PLATFORM_UNAVAILABLE','sizeObserver');
  const clock=overrides.clock??{request:(callback:(timestamp:number)=>void)=>win!.requestAnimationFrame(callback),cancel:(handle:number)=>win!.cancelAnimationFrame(handle)};
  const sizeObserver=overrides.sizeObserver??{observe:(element:HTMLElement,callback:(size:{width:number;height:number})=>void)=>{
    let lastWidth=-1,lastHeight=-1;const observer=new Resize!((entries:ResizeObserverEntry[])=>{for(const entry of entries)if(entry.target===element){const {width,height}=entry.contentRect;if(width!==lastWidth||height!==lastHeight){lastWidth=width;lastHeight=height;callback({width,height});}}});
    try{observer.observe(element);}catch(error){try{observer.disconnect();}catch{/* Preserve the original acquisition failure. */}throw error;}
    return{disconnect:()=>observer.disconnect()};
  }};
  return ok({clock,sizeObserver});
}
