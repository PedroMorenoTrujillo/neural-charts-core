import type {PlanCommand} from '../public/plan-types.js';

/** Close each already-clipped spline run independently; never fill across a gap. */
export function splineAreaCommands(outline:readonly PlanCommand[],baseline:number):readonly PlanCommand[]{
  const result:PlanCommand[]=[];
  let first:{x:number;y:number}|undefined,last:{x:number;y:number}|undefined,count=0;
  const close=()=>{
    if(first&&last&&count>1)result.push({type:'L',x:last.x,y:baseline},{type:'L',x:first.x,y:baseline},{type:'Z'});
    else if(first)result.pop();
    first=undefined;last=undefined;count=0;
  };
  for(const command of outline){
    if(command.type==='M'){close();first={x:command.x,y:command.y};last=first;count=1;result.push(command);}
    else if(command.type==='L'&&first){last={x:command.x,y:command.y};count++;result.push(command);}
  }
  close();return result;
}
