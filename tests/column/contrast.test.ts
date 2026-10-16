import {it,expect} from 'vitest';
import {defaultPalette} from '../../src/internal/chart/presentation.js';
function luminance(hex:string):number{const text=hex.slice(1),parts=[0,2,4].map(i=>parseInt(text.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return parts[0]!*.2126+parts[1]!*.7152+parts[2]!*.0722;}
function contrast(a:string,b:string):number{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for(const theme of ['light','dark'] as const)it('default '+theme+' text, focus and filled-series contrast',()=>{const p=defaultPalette(theme,false);expect(contrast(p.text,p.surface)).toBeGreaterThanOrEqual(4.5);expect(contrast(p.muted,p.surface)).toBeGreaterThanOrEqual(4.5);expect(contrast(p.focus,p.surface)).toBeGreaterThanOrEqual(3);expect(contrast(p.tooltipText,p.tooltipSurface)).toBeGreaterThanOrEqual(4.5);for(const series of p.series)expect(contrast(series,p.surface)).toBeGreaterThanOrEqual(3);});
