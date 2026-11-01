import {expect,test} from 'vitest';
import {circleCrossings,circleIntersectionArea,overlapDistance,fitVennCircles,vennMembership,vennAnchors,type VennCircle} from '../../src/plan/venn-math.js';
const c=(cx=0,cy=0,radius=1):VennCircle=>({cx,cy,radius});
test('analytic area preserves disks, containment, coincidence, tangency and disjointness',()=>{
  expect(circleIntersectionArea([c()])).toBeCloseTo(Math.PI,12);
  expect(circleIntersectionArea([c(),c(),c()])).toBeCloseTo(Math.PI,12);
  expect(circleIntersectionArea([c(0,0,2),c(0,0,.5)])).toBeCloseTo(Math.PI/4,12);
  expect(circleIntersectionArea([c(),c(2)])).toBe(0);
  expect(circleIntersectionArea([c(),c(3)])).toBe(0);
  expect(circleIntersectionArea([c(),c(0,0,0)])).toBe(0);
});
test('two unit circles match the closed-form lens area',()=>{
  for(const d of [.001,.1,.5,1,1.5,1.999]){
    const expected=2*Math.acos(d/2)-d*Math.sqrt(4-d*d)/2;
    expect(circleIntersectionArea([c(),c(d)])).toBeCloseTo(expected,10);
    expect(circleIntersectionArea([c(0,0),c(0,d)])).toBeCloseTo(expected,10);
  }
});
test('three unit circles at an equilateral distance one form a Reuleaux triangle',()=>{
  const circles=[c(),c(1),c(.5,Math.sqrt(3)/2)];
  expect(circleIntersectionArea(circles)).toBeCloseTo((Math.PI-Math.sqrt(3))/2,10);
  expect(circleIntersectionArea([...circles].reverse())).toBeCloseTo(circleIntersectionArea(circles),12);
});
test('area is translation invariant and scales quadratically',()=>{
  const circles=[c(),c(.6,.2,.9),c(.1,.8,.8)],area=circleIntersectionArea(circles);
  for(const scale of [.01,3,20])expect(circleIntersectionArea(circles.map(p=>c(p.cx*scale+5,p.cy*scale-7,p.radius*scale)))).toBeCloseTo(area*scale*scale,8);
});
test('triple area agrees with an independent bounded numerical integration',()=>{
  const circles=[c(-.2,.1,1),c(.7,.4,.85),c(.1,-.5,.7)],steps=20000,lo=-1.2,hi=1.4,delta=(hi-lo)/steps;
  let estimated=0;
  for(let i=0;i<steps;i++){
    const y=lo+(i+.5)*delta;let left=-Infinity,right=Infinity;
    for(const p of circles){const inside=p.radius*p.radius-(y-p.cy)**2;if(inside<0){right=-Infinity;break;}const dx=Math.sqrt(inside);left=Math.max(left,p.cx-dx);right=Math.min(right,p.cx+dx);}
    if(right>left)estimated+=(right-left)*delta;
  }
  expect(circleIntersectionArea(circles)).toBeCloseTo(estimated,5);
});
test('inverse overlap recovers source areas across contained and disjoint circles',()=>{
  for(const a of [.2,.5,1])for(const b of [.2,.7,1])for(const fraction of [0,.001,.1,.5,.9,1]){
    const area=Math.PI*Math.min(a,b)**2*fraction,d=overlapDistance(a,b,area);
    expect(circleIntersectionArea([c(0,0,a),c(d,0,b)])).toBeCloseTo(area,10);
  }
});
test('the two-set fit is exact and deterministic',()=>{
  const args=[[1,.7],[{mask:3,area:.25}]] as const;
  const fit=fitVennCircles(...args);
  expect(fit.maxError).toBeLessThan(1e-10);expect(fit.objectiveEvaluations).toBe(1);expect(fit).toEqual(fitVennCircles(...args));
});
test('a representable three-set fit preserves radii and bounded residuals',()=>{
  const originals=[c(0,0,.5),c(.55,0,.5),c(.275,.55,.5)];
  const targets=[3,5,6,7].map(mask=>({mask,area:circleIntersectionArea(originals.filter((_,i)=>(mask&(1<<i))!==0))}));
  const areas=originals.map(p=>Math.PI*p.radius*p.radius),fit=fitVennCircles(areas,targets);
  expect(fit.maxError).toBeLessThan(1e-7);expect(fit.objectiveEvaluations).toBeLessThanOrEqual(577);expect(fit.circles.map(p=>p.radius)).toEqual(originals.map(p=>p.radius));
});
test('a general three-set fit reports the actual residual rather than changing target counts',()=>{
  const targets=[{mask:3,area:.4},{mask:5,area:.4},{mask:6,area:.4},{mask:7,area:0}];
  const fit=fitVennCircles([1,1,1],targets);
  expect(fit.objectiveEvaluations).toBeLessThanOrEqual(577);expect(fit.maxError).toBeGreaterThan(.001);
  for(const error of fit.errors){expect(error.expected).toBe(targets.find(t=>t.mask===error.mask)!.area);expect(error.actual).toBeCloseTo(circleIntersectionArea(fit.circles.filter((_,i)=>(error.mask&(1<<i))!==0)),12);}
});
test('anchors belong to their exact region and stay clear of every circle boundary',()=>{
  const circles=[c(),c(1),c(.5,.85)],anchors=vennAnchors(circles);
  expect(anchors.size).toBe(7);
  for(const [mask,p]of anchors){expect(vennMembership(circles,p.x,p.y)).toBe(mask);expect(p.clearance).toBeGreaterThan(0);}
  expect(vennAnchors([c(0,0,0)])).toEqual(new Map());
});
test('zero target intersections leave a real visible gap',()=>{
  const fit=fitVennCircles([1,1,1],[{mask:3,area:0},{mask:5,area:0},{mask:6,area:0},{mask:7,area:0}]);
  expect(fit.maxError).toBe(0);expect(circleCrossings(fit.circles[0]!,fit.circles[1]!)).toEqual([]);
});
test('arc-based anchors retain narrow crescents between almost coincident circles',()=>{
  const circles=[c(),c(.000001)],anchors=vennAnchors(circles);
  expect([...anchors.keys()].sort()).toEqual([1,2,3]);
  for(const [mask,p]of anchors)expect(vennMembership(circles,p.x,p.y)).toBe(mask);
});
test('invalid unbounded geometry is rejected',()=>{
  expect(()=>circleIntersectionArea([])).toThrow();expect(()=>circleIntersectionArea([c(0,0,NaN)])).toThrow();
  expect(()=>overlapDistance(1,1,4)).toThrow();expect(()=>fitVennCircles([2],[])).toThrow();
});
