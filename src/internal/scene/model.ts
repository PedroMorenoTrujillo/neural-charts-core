import type { PathCommand } from '../geometry/path.js';
export type Layer='background'|'grid'|'reference-bands'|'marks'|'reference-lines'|'axes'|'labels'|'interaction';
export type SolidPaint=Readonly<{type:'solid';value:string}>;
export type Paint=SolidPaint|Readonly<{type:'none'}>|Readonly<{type:'token';name:string;fallback:SolidPaint}>;
export type Presentation=Readonly<{fill?:Paint;stroke?:Paint;strokeWidth?:number;opacity?:number;fillOpacity?:number;strokeOpacity?:number;dash?:readonly number[];lineCap?:'butt'|'round'|'square';lineJoin?:'miter'|'round'|'bevel'}>;
export type SemanticBinding=Readonly<{seriesId?:string;datumId?:string;targetId:string}>;
export type CommandBase=Readonly<{key:string;presentation?:Presentation;classes?:readonly string[];clipKey?:string;translate?:Readonly<{x:number;y:number}>;semantic?:SemanticBinding}>;
export type SceneCommand=CommandBase&(
  Readonly<{type:'rect';x:number;y:number;width:number;height:number;rx?:number}>|
  Readonly<{type:'path';commands:readonly PathCommand[]}>|
  Readonly<{type:'line';x1:number;y1:number;x2:number;y2:number}>|
  Readonly<{type:'circle';cx:number;cy:number;r:number}>|
  Readonly<{type:'text';x:number;y:number;text:string;anchor?:'start'|'middle'|'end';baseline?:'auto'|'middle'|'hanging'|'alphabetic';fontSize?:number;fontFamily?:'sans-serif'|'serif'|'monospace';fontWeight?:400|500|600|700}>);
export type ClipDef=Readonly<{key:string;type:'clip-rect';x:number;y:number;width:number;height:number}>;
export type SceneFrame=Readonly<{revision:number;width:number;height:number;defs:readonly ClipDef[];layers:Readonly<Record<Layer,readonly SceneCommand[]>>}>;
