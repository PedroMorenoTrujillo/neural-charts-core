// Copied from current Neural Native polygon ownership for an isolated contract probe.
// Only family allowlist and34-vertex budget are changed. Not an installed Native acceptance.
type Polygon={kind:'polygon';vertices:readonly {x:number;y:number}[]};
type NativeScene={family:string;width:number;height:number};
type Vertex=Polygon['vertices'][number];
const cross=(a:Vertex,b:Vertex,c:Vertex)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const orientation=(a:Vertex,b:Vertex,c:Vertex)=>{
  const product1=(b.x-a.x)*(c.y-a.y),product2=(b.y-a.y)*(c.x-a.x),det=product1-product2,error=Number.EPSILON*8*(Math.abs(product1)+Math.abs(product2));
  return det>error?1:det< -error?-1:0;
};
const onSegment=(a:Vertex,b:Vertex,p:Vertex)=>orientation(a,b,p)===0&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
function intersects(a:Vertex,b:Vertex,c:Vertex,d:Vertex):boolean{
  const x=orientation(a,b,c),y=orientation(a,b,d),z=orientation(c,d,a),w=orientation(c,d,b);
  return (x*y<0&&z*w<0)||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);
}
/** Bounded ownership/validation. Neck-crossing funnel polygons may be concave. */
export function ownPolygon(hit:Polygon,scene:Pick<NativeScene,'family'|'width'|'height'>):Polygon{
  if(!['dependencywheel','arcdiagram','chord','sankey','organization','treegraph','funnel','pyramid','lollipop','dumbbell','columnpyramid','boxplot','errorbar','columnrange'].includes(scene.family)||!Array.isArray(hit.vertices)||hit.vertices.length<3||hit.vertices.length>34)throw Error('Invalid polygon hit region');
  const vertices=hit.vertices.map(p=>{if(!p||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>scene.width||p.y<0||p.y>scene.height)throw Error('Invalid polygon vertex');return {x:p.x,y:p.y};});
  const origin=vertices[0]!;let area=0;for(let i=0;i<vertices.length;i++){const a=vertices[i]!,b=vertices[(i+1)%vertices.length]!;if(a.x===b.x&&a.y===b.y)throw Error('Collapsed polygon edge');area+=cross(origin,a,b);}
  if(!Number.isFinite(area)||area===0)throw Error('Degenerate polygon hit region');
  for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++){if(j===i+1||i===0&&j===vertices.length-1)continue;if(intersects(vertices[i]!,vertices[(i+1)%vertices.length]!,vertices[j]!,vertices[(j+1)%vertices.length]!))throw Error('Self-intersecting polygon hit region');}
  return {kind:'polygon',vertices};
}
