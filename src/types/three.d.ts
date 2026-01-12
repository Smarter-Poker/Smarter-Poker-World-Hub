/* ═══════════════════════════════════════════════════════════════════════════
   R3F Type Declarations for Next.js
   ═══════════════════════════════════════════════════════════════════════════ */

import { ThreeElements } from '@react-three/fiber';

declare global {
    namespace JSX {
        interface IntrinsicElements extends ThreeElements { }
    }
}
