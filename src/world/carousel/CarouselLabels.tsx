/* ═══════════════════════════════════════════════════════════════════════════
   HUB VANGUARD — CAROUSEL LABELS
   Text labels for carousel orbs with fade effects
   ═══════════════════════════════════════════════════════════════════════════ */

import { Text } from '@react-three/drei';

interface OrbLabelProps {
    label: string;
    opacity: number;
    active: boolean;
}

export function OrbLabel({ label, opacity, active }: OrbLabelProps) {
    return (
        <Text
            position={[0, -5.5, 0]}
            fontSize={active ? 1.4 : 0.9}
            color={active ? '#ffffff' : '#888888'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
            fillOpacity={Math.max(0.3, opacity)}
        >
            {label}
        </Text>
    );
}
