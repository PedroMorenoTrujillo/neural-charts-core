/** Renderer-independent circle geometry. Source weights are normalized by the
 * planning owner before fitting; no displayed value is reconstructed from ink. */
export interface VennCircle {readonly cx:number;readonly cy:number;readonly radius:number;}
export interface VennAreaTarget {readonly mask:number;readonly area:number;}
export interface VennFit {
  readonly circles:readonly VennCircle[];
  readonly errors:readonly Readonly<{mask:number;expected:number;actual:number}>[];
  readonly maxError:number;
  readonly objectiveEvaluations:number;
  readonly budgetExhausted:boolean;
}
const finite=(v:number)=>Number.isFinite(v);
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const distance=(a:VennCircle,b:VennCircle)=>Math.hypot(a.cx-b.cx,a.cy-b.cy);

export function circleCrossings(a:VennCircle,b:VennCircle):readonly Readonly<{x:number;y:number}>[]{
  const d=distance(a,b),sum=a.radius+b.radius,difference=Math.abs(a.radius-b.radius);
  if(d===0||d>sum||d<difference||a.radius===0||b.radius===0)return [];
  const along=((a.radius-b.radius)*(a.radius+b.radius)+d*d)/(2*d);
  const height=Math.sqrt(Math.max(0,a.radius*a.radius-along*along)),dx=(b.cx-a.cx)/d,dy=(b.cy-a.cy)/d;
  const x=a.cx+along*dx,y=a.cy+along*dy;
  return height===0?[{x,y}]:[{x:x-dy*height,y:y+dx*height},{x:x+dy*height,y:y-dx*height}];
}
function primitive(circle:VennCircle,y:number):number{
  const u=clamp(y-circle.cy,-circle.radius,circle.radius),r=circle.radius;
  return .5*(u*Math.sqrt(Math.max(0,r*r-u*u))+r*r*Math.asin(clamp(u/r,-1,1)));
}
/** Exact arc integration between every boundary switch, including containment,
 * tangencies and coincident circles. No raster/grid approximation of area. */
export function circleIntersectionArea(circles:readonly VennCircle[]):number{
  if(circles.length<1||circles.length>3)throw Error('One to three circles required');
  if(circles.some(c=>![c.cx,c.cy,c.radius].every(finite)||Math.abs(c.cx)>1e9||Math.abs(c.cy)>1e9||c.radius<0||c.radius>1e6))throw Error('Invalid bounded circle');
  if(circles.some(c=>c.radius===0))return 0;
  const lower=Math.max(...circles.map(c=>c.cy-c.radius)),upper=Math.min(...circles.map(c=>c.cy+c.radius));
  if(lower>=upper)return 0;
  const cuts=[lower,upper];
  for(let i=0;i<circles.length;i++){
    cuts.push(circles[i]!.cy);
    for(let j=i+1;j<circles.length;j++)for(const p of circleCrossings(circles[i]!,circles[j]!))cuts.push(p.y);
  }
  const sorted=[...new Set(cuts.filter(y=>y>=lower&&y<=upper))].sort((a,b)=>a-b);
  let area=0,correction=0;
  for(let i=1;i<sorted.length;i++){
    const lo=sorted[i-1]!,hi=sorted[i]!,mid=lo+(hi-lo)/2;
    let left=-Infinity,right=Infinity,l=circles[0]!,r=circles[0]!;
    for(const c of circles){
      const half=Math.sqrt(Math.max(0,c.radius*c.radius-(mid-c.cy)**2));
      if(c.cx-half>left){left=c.cx-half;l=c;}
      if(c.cx+half<right){right=c.cx+half;r=c;}
    }
    if(right<=left)continue;
    const piece=(r.cx-l.cx)*(hi-lo)+(primitive(r,hi)-primitive(r,lo))+(primitive(l,hi)-primitive(l,lo));
    const adjusted=piece-correction,next=area+adjusted;correction=(next-area)-adjusted;area=next;
  }
  return clamp(area,0,Math.PI*Math.min(...circles.map(c=>c.radius))**2);
}
export function overlapDistance(radiusA:number,radiusB:number,area:number):number{
  if(![radiusA,radiusB,area].every(finite)||radiusA<0||radiusB<0||area<0||area>Math.PI*Math.min(radiusA,radiusB)**2+1e-12)throw Error('Invalid overlap target');
  if(area===0)return (radiusA+radiusB)*1.08;
  const maximum=Math.PI*Math.min(radiusA,radiusB)**2;
  if(area>=maximum-Number.EPSILON*8*maximum)return Math.abs(radiusA-radiusB);
  let low=Math.abs(radiusA-radiusB),high=radiusA+radiusB;
  for(let i=0;i<64;i++){
    const mid=low+(high-low)/2,actual=circleIntersectionArea([{cx:0,cy:0,radius:radiusA},{cx:mid,cy:0,radius:radiusB}]);
    if(actual>area)low=mid;else high=mid;
  }
  return low+(high-low)/2;
}
export function vennMembership(circles:readonly VennCircle[],x:number,y:number):number{
  let mask=0;for(let i=0;i<circles.length;i++){const c=circles[i]!;if(c.radius>0&&Math.hypot(x-c.cx,y-c.cy)<=c.radius)mask|=1<<i;}return mask;
}
/** At most577 objective evaluations. Three-circle fits report their residual;
 * valid set measures are not necessarily exactly representable by circles. */
export function fitVennCircles(areas:readonly number[],targets:readonly VennAreaTarget[]):VennFit{
  if(areas.length<1||areas.length>3||areas.some(a=>!finite(a)||a<0||a>1)||targets.length>4||targets.some(t=>!Number.isInteger(t.mask)||t.mask<1||t.mask>=(1<<areas.length)||!finite(t.area)||t.area<0||t.area>1))throw Error('Invalid normalized Venn input');
  const radii=areas.map(area=>Math.sqrt(area/Math.PI)),wanted=new Map(targets.map(t=>[t.mask,t.area]));
  const circles:VennCircle[]=radii.map(radius=>({cx:0,cy:0,radius}));
  const ab=areas.length>1?overlapDistance(radii[0]!,radii[1]!,wanted.get(3)??0):0;
  if(areas.length>1)circles[1]={cx:ab,cy:0,radius:radii[1]!};
  if(areas.length>2){
    const ac=overlapDistance(radii[0]!,radii[2]!,wanted.get(5)??0),bc=overlapDistance(radii[1]!,radii[2]!,wanted.get(6)??0);
    const cx=ab===0?0:clamp((ab*ab+ac*ac-bc*bc)/(2*ab),-ac,ac);
    circles[2]={cx,cy:Math.sqrt(Math.max(0,ac*ac-cx*cx)),radius:radii[2]!};
  }
  let evaluations=0;
  const evaluate=(candidate:readonly VennCircle[])=>{
    evaluations++;const errors=targets.map(t=>({mask:t.mask,expected:t.area,actual:circleIntersectionArea(candidate.filter((_,index)=>(t.mask&(1<<index))!==0))}));
    return {errors,loss:errors.reduce((sum,e)=>sum+(e.actual-e.expected)**2,0)};
  };
  let best=circles,score=evaluate(best),step=Math.max(...radii)/3,passes=0;
  if(areas.length===3)for(;passes<96&&step>1e-8&&score.loss>1e-16;passes++){
    let improved=false;
    for(const coordinate of [0,1,2]){
      let chosen=best,chosenScore=score;
      for(const direction of [-1,1]){
        const next=best.map(c=>({...c}));
        if(coordinate===0)next[1]={...next[1]!,cx:clamp(next[1]!.cx+direction*step,0,4)};
        else if(coordinate===1)next[2]={...next[2]!,cx:clamp(next[2]!.cx+direction*step,-4,4)};
        else next[2]={...next[2]!,cy:clamp(next[2]!.cy+direction*step,0,4)};
        const candidate=evaluate(next);
        if(candidate.loss<chosenScore.loss-1e-18){chosen=next;chosenScore=candidate;}
      }
      if(chosen!==best){best=chosen;score=chosenScore;improved=true;}
    }
    if(!improved)step*=.5;
  }
  return {circles:best,errors:score.errors,maxError:Math.max(0,...score.errors.map(e=>Math.abs(e.actual-e.expected))),objectiveEvaluations:evaluations,budgetExhausted:areas.length===3&&passes===96&&score.loss>1e-16};
}
/** Interior anchor discovery is bounded and independent of area integration.
 * Tiny exclusive regions can legitimately have no readable label anchor. */
export function vennAnchors(circles:readonly VennCircle[]):ReadonlyMap<number,Readonly<{x:number;y:number;clearance:number}>>{
  const result=new Map<number,{x:number;y:number;clearance:number}>();
  if(!circles.some(c=>c.radius>0))return result;
  const left=Math.min(...circles.map(c=>c.cx-c.radius)),right=Math.max(...circles.map(c=>c.cx+c.radius)),top=Math.min(...circles.map(c=>c.cy-c.radius)),bottom=Math.max(...circles.map(c=>c.cy+c.radius));
  const consider=(x:number,y:number)=>{
    const mask=vennMembership(circles,x,y);if(!mask)return;
    let clearance=Infinity;
    for(let i=0;i<circles.length;i++){const c=circles[i]!;if(c.radius===0)continue;const signed=c.radius-Math.hypot(x-c.cx,y-c.cy);clearance=Math.min(clearance,(mask&(1<<i))?signed:-signed);}
    if(clearance>0&&clearance>(result.get(mask)?.clearance??-Infinity))result.set(mask,{x,y,clearance});
  };
  for(const c of circles)consider(c.cx,c.cy);
  for(let row=0;row<64;row++)for(let column=0;column<64;column++)consider(left+(column+.5)/64*(right-left),top+(row+.5)/64*(bottom-top));
  // Every nonempty arrangement face touches an open boundary arc. Sample both
  // sides of each arc midpoint using a margin below every other boundary's
  // distance. This retains narrow crescents that a fixed label grid can miss.
  const turn=Math.PI*2;
  for(let i=0;i<circles.length;i++){
    const circle=circles[i]!;if(circle.radius===0)continue;
    const angles=[0];
    for(let j=0;j<circles.length;j++)if(j!==i)for(const p of circleCrossings(circle,circles[j]!))angles.push((Math.atan2(p.y-circle.cy,p.x-circle.cx)+turn)%turn);
    const sorted=[...new Set(angles)].sort((a,b)=>a-b);
    for(let j=0;j<sorted.length;j++){
      const angle=(sorted[j]!+(j+1<sorted.length?sorted[j+1]!:sorted[0]!+turn))/2,dx=Math.cos(angle),dy=Math.sin(angle);
      const x=circle.cx+dx*circle.radius,y=circle.cy+dy*circle.radius;let margin=circle.radius*.01;
      for(let k=0;k<circles.length;k++){
        const other=circles[k]!;if(k===i||other.radius===0||other.cx===circle.cx&&other.cy===circle.cy&&other.radius===circle.radius)continue;
        margin=Math.min(margin,Math.abs(Math.hypot(x-other.cx,y-other.cy)-other.radius)/4);
      }
      if(margin>0){consider(x-dx*margin,y-dy*margin);consider(x+dx*margin,y+dy*margin);}
    }
  }
  return result;
}
