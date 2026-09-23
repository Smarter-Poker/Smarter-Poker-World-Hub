export const CONSOLE_WIDTH = 1000;
export const CONSOLE_TOP_HEIGHT = 348;
export const CONSOLE_PLATES_HEIGHT = 277;
export const CONSOLE_CAP_HEIGHT = 72;

export const CONSOLE_ZONES = Object.freeze({
    eyebrow: Object.freeze({ x: 100, y: 128, width: 540, height: 34 }),
    title: Object.freeze({ x: 100, y: 166, width: 540, height: 86 }),
    titleBesidePill: Object.freeze({ x: 100, y: 166, width: 470, height: 86 }),
    subtitle: Object.freeze({ x: 102, y: 262, width: 540, height: 42 }),
    pill: Object.freeze({ x: 673, y: 190, width: 197, height: 54 }),
    plateSecondary: Object.freeze({ x: 100, y: 46, width: 381, height: 129 }),
    platePrimary: Object.freeze({ x: 520, y: 46, width: 381, height: 129 }),
});

export function zonePct(zone, canvasWidth, canvasHeight) {
    return {
        left: `${(zone.x / canvasWidth) * 100}%`,
        top: `${(zone.y / canvasHeight) * 100}%`,
        width: `${(zone.width / canvasWidth) * 100}%`,
        height: `${(zone.height / canvasHeight) * 100}%`,
    };
}

export function isConsolePlateAction(action) {
    return Boolean(
        action
        && typeof action.label === 'string'
        && action.label.trim()
        && (typeof action.onClick === 'function' || action.type === 'submit')
    );
}

export function resolveConsoleFoot(foot, plates) {
    const hasPlatePair = isConsolePlateAction(plates?.secondary)
        && isConsolePlateAction(plates?.primary);

    if (foot === 'plates') {
        return hasPlatePair ? 'plates' : 'cap';
    }

    if (foot === 'cap' || foot === 'foot') {
        return 'cap';
    }

    return hasPlatePair ? 'plates' : 'cap';
}
