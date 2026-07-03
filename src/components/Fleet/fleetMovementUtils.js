// src/components/Fleet/fleetMovementUtils.js

export function pointFromLatLng(latlng) {
    return {
        x: latlng.lng,
        y: latlng.lat,
    };
}

export function latLngFromPoint(point) {
    return [point.y, point.x];
}

export function getFleetStartPoint(fleet) {
    if (!fleet || fleet.x1 == null || fleet.y1 == null) return null;

    return {
        x: fleet.x1,
        y: fleet.y1,
    };
}

export function getFleetMidpoint(fleet) {
    if (!fleet || fleet.x2 == null || fleet.y2 == null) return null;

    return {
        x: fleet.x2,
        y: fleet.y2,
    };
}

export function getFleetEndPoint(fleet) {
    if (!fleet || fleet.x3 == null || fleet.y3 == null) return null;

    return {
        x: fleet.x3,
        y: fleet.y3,
    };
}

export function distancePoints(a, b) {
    if (!a || !b) return 0;

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    return Math.sqrt(dx * dx + dy * dy);
}

export function samePoint(a, b, tolerance = 0.5) {
    if (!a || !b) return false;

    return distancePoints(a, b) <= tolerance;
}

export function clampPointToRange(start, target, maxRange) {
    if (!start || !target) return target;

    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) {
        return {
            x: start.x,
            y: start.y,
        };
    }

    if (distance <= maxRange) {
        return target;
    }

    const scale = maxRange / distance;

    return {
        x: start.x + dx * scale,
        y: start.y + dy * scale,
    };
}

export function getMovementLimit(fleet, rangeMultiplier) {
    const baseRange = Number(fleet?.range);

    if (!Number.isFinite(baseRange)) return 0;

    return baseRange * rangeMultiplier;
}

export function getRemainingRange(fleet, midpoint, rangeMultiplier) {
    const start = getFleetStartPoint(fleet);
    const limit = getMovementLimit(fleet, rangeMultiplier);
    const firstSegmentDistance = distancePoints(start, midpoint);

    return Math.max(0, limit - firstSegmentDistance);
}

export function hasFleetMovement(fleet) {
    const start = getFleetStartPoint(fleet);
    const end = getFleetEndPoint(fleet);

    if (!start || !end) return false;

    return !samePoint(start, end);
}

export function resetFleetMovement(fleet) {
    if (!fleet?.validForMap) return fleet;

    return {
        ...fleet,
        x2: null,
        y2: null,
        hasMidpoint: false,
        x3: fleet.x1,
        y3: fleet.y1,
    };
}

export function applyNormalFleetMove(fleet, endpoint) {
    return {
        ...fleet,
        x2: null,
        y2: null,
        hasMidpoint: false,
        x3: endpoint.x,
        y3: endpoint.y,
    };
}

export function applyTwoSegmentFleetMove(fleet, midpoint, endpoint) {
    return {
        ...fleet,
        x2: midpoint.x,
        y2: midpoint.y,
        hasMidpoint: true,
        x3: endpoint.x,
        y3: endpoint.y,
    };
}

export function applyFastMoveFleetMove(fleet, endpoint) {
    return {
        ...fleet,
        x2: endpoint.x,
        y2: endpoint.y,
        hasMidpoint: true,
        x3: endpoint.x,
        y3: endpoint.y,
    };
}

export function updateFleetByRowNumber(fleetData, rowNumber, updater) {
    return fleetData.map(fleet => {
        if (fleet.rowNumber !== rowNumber) return fleet;
        return updater(fleet);
    });
}

export function buildFleetMovementSegments(fleet) {
    if (!fleet?.validForMap) return [];

    const start = getFleetStartPoint(fleet);
    const midpoint = getFleetMidpoint(fleet);
    const end = getFleetEndPoint(fleet);

    if (!start || !end) return [];
    if (samePoint(start, end)) return [];

    // Fastmove has midpoint = endpoint. Visually draw only one line.
    if (midpoint && samePoint(midpoint, end)) {
        return [
            [latLngFromPoint(start), latLngFromPoint(end)],
        ];
    }

    if (midpoint) {
        return [
            [latLngFromPoint(start), latLngFromPoint(midpoint)],
            [latLngFromPoint(midpoint), latLngFromPoint(end)],
        ];
    }

    return [
        [latLngFromPoint(start), latLngFromPoint(end)],
    ];
}