import type { SceneFrame, ClipDef } from '../scene/model.js';
import type { Plot } from '../layout/frame.js';
import type { AxesPlan } from '../axes/plan.js';
import { frame, type Layers } from '../axes/scene.js';
/** Non-Cartesian families supply physical clipping, without constructing a fake
 * axis model. Existing Cartesian frames retain their exact previous defaults. */
export function familyFrame(revision: number, width: number, height: number, layers: Layers, value: Readonly<{ axes?: AxesPlan; plot?: Plot; clips?: readonly ClipDef[] }>): SceneFrame {
  const scene = frame(revision, width, height, layers, value.axes);
  if (!value.plot && !value.clips?.length) return scene;
  const primary = value.axes ? scene.defs : value.plot && value.plot.width > 0 && value.plot.height > 0 ? [{ key: 'plot', kind: 'clip-rect' as const, ...value.plot }] : [];
  return { ...scene, defs: [...primary, ...(value.clips ?? [])] };
}
