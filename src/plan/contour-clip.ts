import type {ContourPoint,ContourSegment} from './contour-geometry.js';
import type {Domain} from '../internal/math/domain.js';

function between(a:number,b:number,t:number):number{
  if(a===b||t===0)return a;if(t===1)return b;
  const value=a*(1-t)+b*t;
  return Number.isFinite(value)?value:a+t*(b-a);
}
function fraction(a:number,b:number,value:number):number{
  const span=b-a,offset=value-a;
  if(Number.isFinite(span)&&Number.isFinite(offset))return offset/span;
  const magnitude=Math.max(Math.abs(a),Math.abs(b),Math.abs(value));
  return (value/magnitude-a/magnitude)/(b/magnitude-a/magnitude);
}
/** Clip in source coordinates before mapping: extreme off-window values must
 * not overflow a pixel scale or become a clamped, fabricated diagonal. */
export function clipContourSegment(segment:ContourSegment,x:Domain,y:Domain):readonly [ContourPoint,ContourPoint]|null{
  const code=(p:ContourPoint)=>(p.x<x[0]?1:p.x>x[1]?2:0)|(p.y<y[0]?4:p.y>y[1]?8:0);
  let a=segment.start,b=segment.end;
  for(let attempt=0;attempt<8;attempt++){
    const ca=code(a),cb=code(b);
    if(!(ca|cb))return a.x===b.x&&a.y===b.y?null:[a,b];
    if(ca&cb)return null;
    const outside=ca||cb;let point:ContourPoint;
    if(outside&8){const t=fraction(a.y,b.y,y[1]);point={x:between(a.x,b.x,t),y:y[1]};}
    else if(outside&4){const t=fraction(a.y,b.y,y[0]);point={x:between(a.x,b.x,t),y:y[0]};}
    else if(outside&2){const t=fraction(a.x,b.x,x[1]);point={x:x[1],y:between(a.y,b.y,t)};}
    else{const t=fraction(a.x,b.x,x[0]);point={x:x[0],y:between(a.y,b.y,t)};}
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('UNREPRESENTABLE_CONTOUR_CLIP');
    if(ca)a=point;else b=point;
  }
  throw Error('UNREPRESENTABLE_CONTOUR_CLIP');
}
