// src/components/Fleet/FleetMovementPanel.jsx
import './FleetMovementPanel.css';

function formatPoint(x, y) {
    if (x == null || y == null) return '-';
    return `(${Math.round(x)}, ${Math.round(y)})`;
}

export default function FleetMovementPanel({
    fleet,
    rangeMultiplier,
    setRangeMultiplier,
    fastMoveEnabled,
    setFastMoveEnabled,
    fleetMovementStep,
    fleetMovementMidpoint,
    onCancel,
}) {
    if (!fleet) return null;

    const baseRange = Number(fleet.range) || 0;
    const activeLimit = baseRange * rangeMultiplier;

    const toggleRangeMultiplier = () => {
        setRangeMultiplier(current => current === 1 ? 2 : 1);
    };

    return (
        <div className="fleet-movement-panel">
            <div className="fleet-movement-panel__section">
                <div className="fleet-movement-panel__title">
                    {fleet.name}
                </div>

                <div className="fleet-movement-panel__row">
                    <span className="fleet-movement-panel__label">Start</span>
                    <span>{formatPoint(fleet.x1, fleet.y1)}</span>
                </div>

                <div className="fleet-movement-panel__row">
                    <span className="fleet-movement-panel__label">Base Range</span>
                    <span>{Math.round(baseRange)}</span>
                </div>

                <div className="fleet-movement-panel__row">
                    <span className="fleet-movement-panel__label">Active Limit</span>
                    <span>
                        {Math.round(activeLimit)} ({rangeMultiplier === 1 ? '100%' : '200%'})
                    </span>
                </div>

                {fleetMovementStep === 'choosingSecondPoint' && fleetMovementMidpoint && (
                    <div className="fleet-movement-panel__row">
                        <span className="fleet-movement-panel__label">Midpoint</span>
                        <span>
                            {formatPoint(fleetMovementMidpoint.x, fleetMovementMidpoint.y)}
                        </span>
                    </div>
                )}
            </div>

            <div className="fleet-movement-panel__controls">
                <button
                    type="button"
                    className={`fleet-movement-panel__toggle ${rangeMultiplier === 2 ? 'is-on' : ''}`}
                    onClick={toggleRangeMultiplier}
                >
                    Range: {rangeMultiplier === 1 ? '100%' : '200%'}
                </button>

                <button
                    type="button"
                    className={`fleet-movement-panel__toggle ${fastMoveEnabled ? 'is-on' : ''}`}
                    onClick={() => setFastMoveEnabled(v => !v)}
                >
                    Fastmove: {fastMoveEnabled ? 'On' : 'Off'}
                </button>

                <button
                    type="button"
                    className="fleet-movement-panel__cancel"
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </div>

            <div className="fleet-movement-panel__hint">
                {fastMoveEnabled
                    ? 'Click a destination. Midpoint and endpoint will match.'
                    : 'Click a destination, or Ctrl-click first point for two-segment movement.'}
            </div>
        </div>
    );
}