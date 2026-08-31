export default function ComboPopup({
    comboName,
    multiplier = 1,
}) {
    return (
        <div className="preflop-combo-popup" role="status" aria-live="polite">
            <div>{comboName}</div>
            <span>{multiplier}× Multiplier</span>
        </div>
    );
}
