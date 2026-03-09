/* ═══════════════════════════════════════════════════════════════════════════
   PROACTIVE HELP — DISABLED (User requested no popups)
   ═══════════════════════════════════════════════════════════════════════════ */


interface ProactiveHelpProps {
    onAccept: (suggestion: string) => void;
    onDismiss: () => void;
}

// Completely disabled - user finds popups annoying
export function ProactiveHelp(_props: ProactiveHelpProps) {
    return null;
}
