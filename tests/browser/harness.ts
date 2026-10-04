import {createSvgWriter}from'../../src/internal/scene/svg-writer.js';
import {reserveInstance,clipId}from'../../src/internal/platform/id.js';
import {mountFoundation}from'../../src/internal/lifecycle/controller.js';
import {createBrowserPorts}from'../../src/internal/platform/browser.js';
import {ok,invalid}from'../../src/internal/diagnostics.js';
import {FakeClock}from'../lifecycle/fake-clock.js';
import {createLinearScale}from'../../src/internal/math/linear.js';
import {selectNumericTicks}from'../../src/internal/math/numeric-ticks.js';
export function frame(revision=1,marks:any[]=[],defs:any[]=[]):any{return{revision,width:100,height:100,defs,layers:{background:[],grid:[],'reference-bands':[],marks,'reference-lines':[],axes:[],labels:[],interaction:[]}};}
Object.assign(globalThis,{NC:{createSvgWriter,reserveInstance,clipId,mountFoundation,createBrowserPorts,ok,invalid,FakeClock,frame,createLinearScale,selectNumericTicks}});
