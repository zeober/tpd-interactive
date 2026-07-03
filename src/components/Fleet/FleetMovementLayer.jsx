// src/components/Fleet/FleetMovementLayer.jsx

import L from 'leaflet';
import { Circle, Marker, Polyline, Popup, Tooltip } from 'react-leaflet';
import markerIcons from '../../markerIcons';

import {
    buildFleetMovementSegments,
    clampPointToRange,
    distancePoints,
    getFleetStartPoint,
    getMovementLimit,
    getRemainingRange,
    latLngFromPoint,
} from './fleetMovementUtils';

const STACK_DISTANCE = 100;

function stopMapClick(e) {
    e.originalEvent?.stopPropagation?.();
    e.originalEvent?.preventDefault?.();
}

function stopButtonClick(e) {
    e.stopPropagation?.();
    e.preventDefault?.();
}

function getFleetPoint(fleet) {
    return {
        x: fleet.x1,
        y: fleet.y1,
    };
}

function isWithinStackDistance(fleet, group) {
    const fleetPoint = getFleetPoint(fleet);

    return group.fleets.some(existingFleet => {
        const existingPoint = getFleetPoint(existingFleet);
        return distancePoints(fleetPoint, existingPoint) <= STACK_DISTANCE;
    });
}

function getGroupCenter(group) {
    const total = group.fleets.reduce(
        (acc, fleet) => ({
            x: acc.x + fleet.x1,
            y: acc.y + fleet.y1,
        }),
        { x: 0, y: 0 }
    );

    return {
        x: total.x / group.fleets.length,
        y: total.y / group.fleets.length,
    };
}

function groupFleetsByNearbyStart(fleetData) {
    const validFleets = fleetData.filter(fleet =>
        fleet.validForMap &&
        fleet.x1 != null &&
        fleet.y1 != null
    );

    const groups = [];

    validFleets.forEach(fleet => {
        const existingGroup = groups.find(group =>
            isWithinStackDistance(fleet, group)
        );

        if (existingGroup) {
            existingGroup.fleets.push(fleet);
            existingGroup.center = getGroupCenter(existingGroup);
        } else {
            groups.push({
                key: `fleet-stack-${fleet.rowNumber}`,
                fleets: [fleet],
                center: {
                    x: fleet.x1,
                    y: fleet.y1,
                },
            });
        }
    });

    return groups;
}

function createFleetClusterIcon(count) {
    return L.divIcon({
        className: 'fleet-cluster-icon',
        html: `
            <div style="
                width: 34px;
                height: 34px;
                border-radius: 50%;
                background: rgba(20, 40, 80, 0.95);
                color: white;
                border: 2px solid white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
                box-shadow: 0 1px 6px rgba(0,0,0,0.45);
            ">
                ${count}
            </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -17],
        tooltipAnchor: [17, 0],
    });
}

export default function FleetMovementLayer({
    fleetData,
    selectedFleetForMovement,
    fleetMovementStep,
    fleetMovementMidpoint,
    fleetMovementPreviewPoint,
    rangeMultiplier,
    onFleetMarkerClick,
}) {
    const fleetGroups = groupFleetsByNearbyStart(fleetData);
    const selectedStart = getFleetStartPoint(selectedFleetForMovement);

    let previewCenter = null;
    let previewRadius = 0;
    let previewStart = null;
    let previewEnd = null;

    const shouldShowFirstSegmentPreview =
        selectedFleetForMovement &&
        fleetMovementStep === 'choosingSecondPoint' &&
        selectedStart &&
        fleetMovementMidpoint;

    if (
        selectedFleetForMovement &&
        fleetMovementStep === 'choosingFirstPoint' &&
        selectedStart
    ) {
        previewCenter = selectedStart;
        previewStart = selectedStart;
        previewRadius = getMovementLimit(selectedFleetForMovement, rangeMultiplier);

        if (fleetMovementPreviewPoint) {
            previewEnd = clampPointToRange(
                previewStart,
                fleetMovementPreviewPoint,
                previewRadius
            );
        }
    }

    if (
        selectedFleetForMovement &&
        fleetMovementStep === 'choosingSecondPoint' &&
        fleetMovementMidpoint
    ) {
        previewCenter = fleetMovementMidpoint;
        previewStart = fleetMovementMidpoint;
        previewRadius = getRemainingRange(
            selectedFleetForMovement,
            fleetMovementMidpoint,
            rangeMultiplier
        );

        if (fleetMovementPreviewPoint) {
            previewEnd = clampPointToRange(
                previewStart,
                fleetMovementPreviewPoint,
                previewRadius
            );
        }
    }

    return (
        <>
            {fleetGroups.map(group => {
                const isCluster = group.fleets.length > 1;
                const onlyFleet = group.fleets[0];

                if (!isCluster) {
                    return (
                        <Marker
                            key={`fleet-marker-${onlyFleet.rowNumber}`}
                            position={[onlyFleet.y1, onlyFleet.x1]}
                            icon={markerIcons.fleet}
                            interactive={true}
                            bubblingMouseEvents={false}
                            riseOnHover={true}
                            zIndexOffset={
                                selectedFleetForMovement?.rowNumber === onlyFleet.rowNumber
                                    ? 2000
                                    : 1000
                            }
                            eventHandlers={{
                                click: (e) => {
                                    onFleetMarkerClick?.(onlyFleet);
                                    stopMapClick(e);
                                },
                                mousedown: stopMapClick,
                                dblclick: stopMapClick,
                            }}
                        >
                            <Tooltip>
                                {onlyFleet.name}
                            </Tooltip>
                        </Marker>
                    );
                }

                return (
                    <Marker
                        key={group.key}
                        position={[group.center.y, group.center.x]}
                        icon={createFleetClusterIcon(group.fleets.length)}
                        interactive={true}
                        bubblingMouseEvents={false}
                        riseOnHover={true}
                        zIndexOffset={1500}
                        eventHandlers={{
                            click: stopMapClick,
                            mousedown: stopMapClick,
                            dblclick: stopMapClick,
                        }}
                    >
                        <Popup>
                            <div style={{ minWidth: '180px' }}>
                                <strong>
                                    {group.fleets.length} fleets nearby
                                </strong>

                                <div style={{ marginTop: '8px' }}>
                                    {group.fleets.map(fleet => (
                                        <button
                                            key={`fleet-choice-${fleet.rowNumber}`}
                                            type="button"
                                            onClick={(e) => {
                                                stopButtonClick(e);
                                                e.currentTarget
                                                    .closest('.leaflet-popup')
                                                    ?.querySelector('.leaflet-popup-close-button')
                                                    ?.click();

                                                onFleetMarkerClick?.(fleet);
                                            }}
                                            style={{
                                                display: 'block',
                                                width: '100%',
                                                textAlign: 'left',
                                                marginBottom: '4px',
                                                padding: '4px 6px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {fleet.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </Popup>

                        <Tooltip>
                            {group.fleets.length} fleets nearby
                        </Tooltip>
                    </Marker>
                );
            })}

            {fleetData
                .filter(fleet => fleet.validForMap)
                .flatMap(fleet =>
                    buildFleetMovementSegments(fleet).map((positions, index) => {
                        const [startLatLng, endLatLng] = positions;

                        const startPoint = {
                            x: startLatLng[1],
                            y: startLatLng[0],
                        };

                        const endPoint = {
                            x: endLatLng[1],
                            y: endLatLng[0],
                        };

                        const segmentLength = distancePoints(startPoint, endPoint);

                        return (
                            <Polyline
                                key={`fleet-move-${fleet.rowNumber}-${index}`}
                                positions={positions}
                                interactive={false}
                                bubblingMouseEvents={false}
                            >
                                <Tooltip permanent direction="center" offset={[0, -10]}>
                                    {fleet.name}: {Math.round(segmentLength)}
                                </Tooltip>
                            </Polyline>
                        );
                    })
                )}

            {shouldShowFirstSegmentPreview && (
                <Polyline
                    positions={[
                        latLngFromPoint(selectedStart),
                        latLngFromPoint(fleetMovementMidpoint),
                    ]}
                    interactive={false}
                    bubblingMouseEvents={false}
                >
                    <Tooltip permanent direction="center" offset={[0, -10]}>
                        {Math.round(distancePoints(selectedStart, fleetMovementMidpoint))}
                    </Tooltip>
                </Polyline>
            )}

            {previewCenter && previewRadius > 0 && (
                <Circle
                    center={latLngFromPoint(previewCenter)}
                    radius={previewRadius}
                    interactive={false}
                    bubblingMouseEvents={false}
                >
                    <Tooltip permanent direction="top">
                        Range: {Math.round(previewRadius)}
                    </Tooltip>
                </Circle>
            )}

            {previewStart && previewEnd && (
                <Polyline
                    positions={[
                        latLngFromPoint(previewStart),
                        latLngFromPoint(previewEnd),
                    ]}
                    interactive={false}
                    bubblingMouseEvents={false}
                >
                    <Tooltip permanent direction="center" offset={[0, -10]}>
                        {Math.round(distancePoints(previewStart, previewEnd))}
                    </Tooltip>
                </Polyline>
            )}
        </>
    );
}