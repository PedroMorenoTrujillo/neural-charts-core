/** Own a bounded JSON value before passing it to existing family validators. */
const immutableInputs = new WeakMap<object, Readonly<{value: unknown; nodes: number; characters: number; height: number}>>();
/** Private cache seam: shallow freezing alone does not establish ownership. */
export const isReusablePlanArray = (value: unknown): value is readonly unknown[] => Array.isArray(value) && immutableInputs.has(value);
export function ownPlanInput(value:unknown,limits:Readonly<{nodes:number;characters:number}>={nodes:200000,characters:1000000}):unknown {
  const seen=new WeakSet<object>();let count=0,characters=0,lastHeight=0,lastImmutable=true;
  const visit=(v:unknown,depth:number):unknown=>{
    const beforeCount=count,beforeCharacters=characters;lastHeight=0;lastImmutable=true;
    if(++count>limits.nodes||depth>32)throw Error('INPUT_LIMIT');
    if(v===null||typeof v==='boolean')return v;
    if(typeof v==='string'){characters+=v.length;if(characters>limits.characters)throw Error('INPUT_LIMIT');return v;}
    if(typeof v==='number'&&Number.isFinite(v))return v;
    if(typeof v!=='object'||seen.has(v))throw Error('BAD_JSON');
    const cacheable=depth===0||Array.isArray(v),cached=cacheable?immutableInputs.get(v):undefined;
    if(cached){count+=cached.nodes-1;characters+=cached.characters;lastHeight=cached.height;if(count>limits.nodes||characters>limits.characters||depth+cached.height>32)throw Error('INPUT_LIMIT');return cached.value;}
    const array=Array.isArray(v);
    if(!array&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw Error('BAD_JSON');
    const keys=Object.keys(v);
    if(array){
      const length=Object.getOwnPropertyDescriptor(v,'length')?.value;
      // Empty slots are not nulls. Copying only enumerable keys used to drop a
      // sparse array's length and silently turn missing input into no data.
      if(!Number.isSafeInteger(length)||length>limits.nodes||keys.length!==length||keys.some((key,index)=>key!==String(index)))throw Error('BAD_ARRAY');
    }
    seen.add(v);
    let immutable=Object.isFrozen(v),height=0;
    const child=(value:unknown):unknown=>{const owned=visit(value,depth+1);height=Math.max(height,lastHeight+1);immutable=immutable&&lastImmutable;return owned;};
    const finish=<T>(copy:T):T=>{seen.delete(v);lastHeight=height;lastImmutable=immutable;if(immutable){Object.freeze(copy);if(cacheable&&(depth===0||count-beforeCount>=64)){const entry={value:copy,nodes:count-beforeCount,characters:characters-beforeCharacters,height};immutableInputs.set(v,entry);immutableInputs.set(copy as object,entry);}}return copy;};
    if(array){
      // Mapping the fresh key array creates own data properties without
      // invoking inherited numeric setters or defining each index by hand.
      const copy=keys.map(key=>{
        const d=Object.getOwnPropertyDescriptor(v,key);
        if(!d||!('value' in d))throw Error('ACCESSOR');
        return child(d.value);
      });
      return finish(copy);
    }
    // A null prototype makes assignment safe for __proto__, constructor and
    // inherited setters while retaining ordinary writable data properties.
    const copy:Record<string,unknown>=Object.create(null);
    for(const key of keys){
      const d=Object.getOwnPropertyDescriptor(v,key);
      if(!d||!('value' in d))throw Error('ACCESSOR');
      copy[key]=child(d.value);
    }
    return finish(copy);
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
