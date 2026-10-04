export type Size=Readonly<{width:number;height:number}>;
export interface FrameClock {request(callback:(timestamp:number)=>void):number;cancel(handle:number):void;}
export interface SizeObserver {observe(host:HTMLElement,onSize:(size:Size)=>void):{disconnect():void};}
