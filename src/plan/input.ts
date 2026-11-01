/** Own a bounded JSON value before passing it to existing family validators. */
export function ownPlanInput(value:unknown):unknown {
  const seen=new WeakSet<object>();let count=0,characters=0;
  const visit=(v:unknown,depth:number):unknown=>{
    if(++count>200000||depth>32)throw Error('INPUT_LIMIT');
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='string'){characters+=v.length;if(characters>1000000)throw Error('INPUT_LIMIT');return v;}
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(typeof v!=='object'||seen.has(v))throw Error('BAD_JSON');
    const array=Array.isArray(v);
    if(!array&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw Error('BAD_JSON');
    const keys=Object.keys(v);
    if(array){
      const length=Object.getOwnPropertyDescriptor(v,'length')?.value;
      // Empty slots are not nulls. Copying only enumerable keys used to drop a
      // sparse array's length and silently turn missing input into no data.
      if(!Number.isSafeInteger(length)||length>200000||keys.length!==length||keys.some((key,index)=>key!==String(index)))throw Error('BAD_ARRAY');
    }
    seen.add(v);
    if(array){
      const copy:unknown[]=[];
      for(const key of keys){
        const d=Object.getOwnPropertyDescriptor(v,key);
        if(!d||!('value' in d))throw Error('ACCESSOR');
        // Numeric prototype setters must not run while copying arrays.
        Object.defineProperty(copy,key,{value:visit(d.value,depth+1),enumerable:true,writable:true,configurable:true});
      }
      seen.delete(v);return copy;
    }
    // A null prototype makes assignment safe for __proto__, constructor and
    // inherited setters while retaining ordinary writable data properties.
    const copy:Record<string,unknown>=Object.create(null);
    for(const key of keys){
      const d=Object.getOwnPropertyDescriptor(v,key);
      if(!d||!('value' in d))throw Error('ACCESSOR');
      copy[key]=visit(d.value,depth+1);
    }
    seen.delete(v);return copy;
  };
  return visit(value,0);
}
export function freezePlan<T>(value:T):T {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freezePlan(child);
    Object.freeze(value);
  }
  return value;
}
