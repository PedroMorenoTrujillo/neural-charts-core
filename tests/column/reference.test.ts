import {it,expect} from 'vitest';
import {emptyLayers} from '../../src/internal/axes/scene.js';
import {defaultPalette} from '../../src/internal/chart/presentation.js';
import {columnReferenceCaption} from '../../src/column/scene.js';
for(const direction of ['ltr','rtl'] as const)it('reference caption uses a separate footer and keeps '+direction+' identity',()=>{const layers=emptyLayers(),palette=defaultPalette('light',false),font={family:'sans-serif' as const,size:12,weight:400 as const};columnReferenceCaption(layers,'Reference: mean 12',palette,font,direction,320,200);expect(layers.labels).toEqual([{type:'text',key:'references-caption',x:direction==='rtl'?308:12,y:189,text:'Reference: mean 12',anchor:'start',baseline:'middle',fontFamily:'sans-serif',fontSize:12,fontWeight:400,presentation:{fill:{type:'solid',value:palette.reference}}}]);expect(layers.marks).toEqual([]);});
it('missing or elided caption creates no false annotation',()=>{const layers=emptyLayers();columnReferenceCaption(layers,null,defaultPalette('dark',false),{family:'sans-serif',size:12,weight:400},'ltr',10,10);expect(layers.labels).toEqual([]);});

import {columnDockBody} from '../../src/column/geometry.js';
const body={x:0,y:0,width:296,height:200};
it('compact horizontal dock selects safe side space and preserves other bar tap targets',()=>{expect(columnDockBody(body,{x:66,y:24,width:42,height:4},true,'ltr')).toEqual({x:152,y:0,width:144,height:200});expect(columnDockBody(body,{x:210,y:24,width:10,height:4},true,'rtl')).toEqual({x:0,y:0,width:144,height:200});});
it('compact dock falls back for full bars, vertical charts and larger viewports',()=>{expect(columnDockBody(body,{x:66,y:24,width:200,height:4},true,'ltr')).toBe(body);expect(columnDockBody(body,{x:66,y:24,width:42,height:4},false,'ltr')).toBe(body);const desktop={...body,width:768};expect(columnDockBody(desktop,{x:66,y:24,width:42,height:4},true,'ltr')).toBe(desktop);});
