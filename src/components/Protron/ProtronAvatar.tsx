/* Protron's face with its stylesheet. The component lives in ProtronFace.tsx,
   which imports no CSS so node tests can load what names it. */
import './protron.css';

export { default, ProtronMark } from './ProtronFace';
export type { AvatarState, IconLike } from './ProtronFace';
