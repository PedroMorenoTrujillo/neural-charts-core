import {polar,type RadialFrame} from '../internal/geometry/radial-sector.js';
type Bounds=Readonly<{x:number;y:number;width:number;height:number}>;
/** Constant-size arc bounds, including any cardinal extrema in a wrapped sweep. */
export function circularBounds(frame:RadialFrame,start:number,end:number,padding:number,side:number,extras:readonly Readonly<{x:number;y:number}>[]=[]):Bounds{
  const angles=[start,end],quarter=Math.PI/2;
  for(let k=Math.ceil(start/quarter);k*quarter<end;k++)angles.push(k*quarter);
  const points=[...extras];
  if(frame.innerRadius===0)points.push({x:frame.cx,y:frame.cy});
  for(const angle of angles){points.push(polar(frame,frame.radius,angle));if(frame.innerRadius>0)points.push(polar(frame,frame.innerRadius,angle));}
  const left=Math.max(0,Math.min(...points.map(p=>p.x))-padding),top=Math.max(0,Math.min(...points.map(p=>p.y))-padding),right=Math.min(side,Math.max(...points.map(p=>p.x))+padding),bottom=Math.min(side,Math.max(...points.map(p=>p.y))+padding);
  return {x:left,y:top,width:right-left,height:bottom-top};
}
