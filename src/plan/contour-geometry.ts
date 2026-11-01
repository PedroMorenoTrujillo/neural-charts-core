export interface ContourField {
  readonly x: readonly number[];
  readonly y: readonly number[];
  /** Row-major original values; null breaks a cell instead of becoming zero. */
  readonly values: readonly (number | null)[];
}
export interface ContourPoint {readonly x: number; readonly y: number;}
export interface ContourSegment {
  readonly level: number;
  readonly cell: number;
  readonly start: ContourPoint;
  readonly end: ContourPoint;
}
export type ContourResult = Readonly<{status: 'ready'; segments: readonly ContourSegment[]; skippedMissingCells: number}>
  | Readonly<{status: 'budget'; requiredMoreThan: number; segments: readonly []; skippedMissingCells: number}>;
const pairs: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],6:[[0,2]],7:[[3,2]],
  8:[[2,3]],9:[[0,2]],11:[[1,2]],12:[[3,1]],13:[[0,1]],14:[[3,0]],
};
const edges = [[0,1],[1,2],[2,3],[3,0]] as const;
const emptySegments:readonly []=Object.freeze([] as const);
function immutablePoint(x:number,y:number):ContourPoint{return Object.freeze({x,y});}
function ordered(values:readonly number[]):boolean {
  if(values.length<2||values.length>64)return false;
  for(let i=0;i<values.length;i++)if(!Number.isFinite(values[i])||(i>0&&values[i]!<=values[i-1]!))return false;
  return true;
}
function between(a:number,b:number,t:number):number {
  // A convex combination stays finite even for endpoints with an overflowing span.
  if(a===b||t===0)return a;
  if(t===1)return b;
  return a*(1-t)+b*t;
}
function fraction(a:number,b:number,level:number):number {
  const span=b-a;
  if(Number.isFinite(span))return Math.max(0,Math.min(1,(level-a)/span));
  const magnitude=Math.max(Math.abs(a),Math.abs(b),Math.abs(level));
  return Math.max(0,Math.min(1,(level/magnitude-a/magnitude)/(b/magnitude-a/magnitude)));
}

/** Pure marching squares with an asymptotic saddle decider. No SVG or DOM. */
export function contourSegments(field:ContourField,levels:readonly number[],maxSegments=8192):ContourResult {
  if(!ordered(field.x)||!ordered(field.y)||field.values.length!==field.x.length*field.y.length||
    [...field.values].some(value=>value!==null&&!Number.isFinite(value))||levels.length<1||levels.length>8||
    [...levels].some((level,i)=>!Number.isFinite(level)||(i>0&&level<=levels[i-1]!))||
    !Number.isInteger(maxSegments)||maxSegments<1||maxSegments>32768)throw new RangeError('Invalid bounded contour field');
  const segments:ContourSegment[]=[],unique=new Set<string>(),missingCells=new Set<number>();
  for(let row=0;row<field.y.length-1;row++)for(let col=0;col<field.x.length-1;col++){
    const at=row*field.x.length+col;
    if([at,at+1,at+1+field.x.length,at+field.x.length].some(index=>field.values[index]===null))missingCells.add(at);
  }
  const skippedMissingCells=missingCells.size;
  const emit=(level:number,cell:number,start:ContourPoint,end:ContourPoint):boolean=>{
    // Equal-threshold vertices may produce a zero-length contact, not a line.
    if(start.x===end.x&&start.y===end.y)return true;
    const a=`${start.x},${start.y}`,b=`${end.x},${end.y}`,key=`${level}:${a<b?a+';'+b:b+';'+a}`;
    if(unique.has(key))return true;
    if(segments.length===maxSegments)return false;
    unique.add(key);segments.push(Object.freeze({level,cell,start,end}));return true;
  };
  for(let row=0;row<field.y.length-1;row++)for(let col=0;col<field.x.length-1;col++){
    const at=row*field.x.length+col;
    const values=[field.values[at],field.values[at+1],field.values[at+1+field.x.length],field.values[at+field.x.length]];
    if(missingCells.has(at))continue;
    const known=values as number[];
    const corners=[immutablePoint(field.x[col]!,field.y[row]!),immutablePoint(field.x[col+1]!,field.y[row]!),
      immutablePoint(field.x[col+1]!,field.y[row+1]!),immutablePoint(field.x[col]!,field.y[row+1]!)];
    for(const level of levels){
      const mask=known.reduce((mask,value,index)=>mask|(value>=level?1<<index:0),0);
      if(mask===0||mask===15)continue;
      const endpoints=new Map<number,ContourPoint>();
      const endpoint=(edge:number):ContourPoint=>{
        const cached=endpoints.get(edge);if(cached)return cached;
        let [a,b]:[number,number]=[...edges[edge]!];
        const indices=[at,at+1,at+1+field.x.length,at+field.x.length];
        if(indices[a]!>indices[b]!)[a,b]=[b,a];
        const t=fraction(known[a]!,known[b]!,level),from=corners[a]!,to=corners[b]!;
        const point=immutablePoint(between(from.x,to.x,t),between(from.y,to.y,t));endpoints.set(edge,point);return point;
      };
      let links=pairs[mask];
      if(mask===5||mask===10){
        const differences=known.map(value=>value-level);
        const finite=differences.every(Number.isFinite);
        const magnitude=finite?Math.max(...differences.map(Math.abs)):Math.max(...known.map(Math.abs),Math.abs(level));
        const z=finite?differences.map(value=>value/magnitude):known.map(value=>value/magnitude-level/magnitude);
        const determinant=z[0]!*z[2]!-z[1]!*z[3]!;
        if(determinant===0){
          const b=z[1]!-z[0]!,c=z[3]!-z[0]!,d=z[2]!-z[1]!-z[3]!+z[0]!;
          const u=Math.max(0,Math.min(1,-c/d)),v=Math.max(0,Math.min(1,-b/d));
          const saddle=immutablePoint(between(field.x[col]!,field.x[col+1]!,u),between(field.y[row]!,field.y[row+1]!,v));
          for(let edge=0;edge<4;edge++)if(!emit(level,at,endpoint(edge),saddle))return Object.freeze({status:'budget',requiredMoreThan:maxSegments,segments:emptySegments,skippedMissingCells});
          continue;
        }
        links=determinant>0?[[0,1],[2,3]]:[[3,0],[1,2]];
      }
      for(const [a,b] of links??[])if(!emit(level,at,endpoint(a),endpoint(b)))return Object.freeze({status:'budget',requiredMoreThan:maxSegments,segments:emptySegments,skippedMissingCells});
    }
  }
  return Object.freeze({status:'ready',segments:Object.freeze(segments),skippedMissingCells});
}
