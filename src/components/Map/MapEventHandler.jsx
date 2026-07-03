// src/components/Map/MapEventHandler.jsx

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

import useCopyHandler from './hooks/useCopyHandler';
import useDrawHandler from './hooks/useDrawHandler';
import useEraseHandler from './hooks/useEraseHandler';
import useMapEventsHandler from './hooks/useMapEventsHandler';
import useCircleHandler from './hooks/useCircleHandler';

import {
    applyFastMoveFleetMove,
    applyNormalFleetMove,
    applyTwoSegmentFleetMove,
    clampPointToRange,
    distancePoints,
    getFleetStartPoint,
    getMovementLimit,
    getRemainingRange,
    pointFromLatLng,
    updateFleetByRowNumber,
} from '../Fleet/fleetMovementUtils';

export default function MapEventHandler(props) {
    const map = useMap();

    const {
        activeTool,
        setActiveTool,
        coords,
        setToastMsg,
        setCoords,
        drawStart,
        setDrawStart,
        setLines,
        eraseRadius,
        isMultiDraw,
        setIsMultiDraw,
        setSelectedFleet,
        setDroppedMarkers,
        setCircles,
        circleStart,
        setCircleStart,

        selectedFleetForMovement,
        setFleetData,
        rangeMultiplier,
        fastMoveEnabled,
        fleetMovementStep,
        setFleetMovementStep,
        fleetMovementMidpoint,
        setFleetMovementMidpoint,
        setFleetMovementPreviewPoint,
        cancelFleetMovement,
        finishFleetMovement,
    } = props;

    const copy = useCopyHandler(coords, setToastMsg);
    const draw = useDrawHandler(drawStart, setDrawStart, setLines, isMultiDraw, map);

    const erase = useEraseHandler(
        eraseRadius,
        setLines,
        map,
        setCircles,
        setDroppedMarkers
    );

    const circle = useCircleHandler({
        activeTool,
        circleStart,
        setCircleStart,
        setCircles,
        map,
    });

    const handleFleetMovementClick = ({ latlng, originalEvent }) => {
        if (!selectedFleetForMovement) return false;

        const clickedPoint = pointFromLatLng(latlng);
        const start = getFleetStartPoint(selectedFleetForMovement);

        if (!start) return true;

        if (fleetMovementStep === 'choosingSecondPoint' && fleetMovementMidpoint) {
            const remainingRange = getRemainingRange(
                selectedFleetForMovement,
                fleetMovementMidpoint,
                rangeMultiplier
            );

            const endpoint = clampPointToRange(
                fleetMovementMidpoint,
                clickedPoint,
                remainingRange
            );

            setFleetData(prev =>
                updateFleetByRowNumber(
                    prev,
                    selectedFleetForMovement.rowNumber,
                    fleet => applyTwoSegmentFleetMove(fleet, fleetMovementMidpoint, endpoint)
                )
            );

            finishFleetMovement?.();
            return true;
        }

        const movementLimit = getMovementLimit(selectedFleetForMovement, rangeMultiplier);

        const firstPoint = clampPointToRange(
            start,
            clickedPoint,
            movementLimit
        );

        if (fastMoveEnabled) {
            setFleetData(prev =>
                updateFleetByRowNumber(
                    prev,
                    selectedFleetForMovement.rowNumber,
                    fleet => applyFastMoveFleetMove(fleet, firstPoint)
                )
            );

            finishFleetMovement?.();
            return true;
        }

        const wantsSecondSegment = originalEvent?.ctrlKey;

        if (wantsSecondSegment) {
            const firstSegmentDistance = distancePoints(start, firstPoint);
            const remainingRange = Math.max(0, movementLimit - firstSegmentDistance);

            if (remainingRange <= 0.5) {
                setFleetData(prev =>
                    updateFleetByRowNumber(
                        prev,
                        selectedFleetForMovement.rowNumber,
                        fleet => applyTwoSegmentFleetMove(fleet, firstPoint, firstPoint)
                    )
                );

                finishFleetMovement?.();
                return true;
            }

            setFleetMovementMidpoint(firstPoint);
            setFleetMovementStep('choosingSecondPoint');
            setFleetMovementPreviewPoint(null);
            return true;
        }

        setFleetData(prev =>
            updateFleetByRowNumber(
                prev,
                selectedFleetForMovement.rowNumber,
                fleet => applyNormalFleetMove(fleet, firstPoint)
            )
        );

        finishFleetMovement?.();
        return true;
    };

    const onMouseMove = ({ latlng }) => {
        setCoords({
            x: Math.round(latlng.lng),
            y: Math.round(latlng.lat),
        });

        if (selectedFleetForMovement) {
            setFleetMovementPreviewPoint(pointFromLatLng(latlng));
            draw.cleanupPreview();
            erase.removeCircle();
            return;
        }

        if (activeTool === 'draw') {
            draw.updatePreview(latlng);
        } else {
            draw.cleanupPreview();
        }

        if (activeTool === 'circle') {
            circle.updatePreview(latlng);
        }

        if (activeTool === 'erase') {
            erase.updateCircle(latlng);
        } else {
            erase.removeCircle();
        }
    };

    const onMapClick = (event) => {
        const { latlng } = event;

        if (selectedFleetForMovement) {
            handleFleetMovementClick(event);
            return;
        }

        setSelectedFleet(null);

        if (activeTool === 'dropMarker') {
            if (!setDroppedMarkers) return;

            setDroppedMarkers(prev => [
                ...prev,
                {
                    id: crypto.randomUUID(),
                    x: latlng.lng,
                    y: latlng.lat,
                    createdAt: Date.now(),
                },
            ]);

            return;
        }

        if (activeTool === 'circle') {
            circle.handleCircleClick(latlng);
            return;
        }

        if (activeTool === 'copy') {
            copy();
            return;
        }

        if (activeTool === 'draw') {
            draw.handleDraw(latlng);
            return;
        }

        if (activeTool === 'erase') {
            erase.handleErase(latlng);
        }
    };

    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            cancelFleetMovement?.();

            setActiveTool?.(null);
            setSelectedFleet(null);
            setIsMultiDraw(false);

            setDrawStart(null);
            draw.reset();

            circle.reset();
            erase.removeCircle();
        };

        window.addEventListener('keydown', onKeyDown, true);

        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [
        cancelFleetMovement,
        setActiveTool,
        setSelectedFleet,
        setIsMultiDraw,
        setDrawStart,
        draw.reset,
        circle.reset,
        erase.removeCircle,
    ]);

    useEffect(() => {
        if (!map.keyboard) return;

        if (activeTool === 'circle' || selectedFleetForMovement) {
            map.keyboard.disable();
        } else {
            map.keyboard.enable();
        }

        return () => {
            if (map.keyboard) {
                map.keyboard.enable();
            }
        };
    }, [activeTool, selectedFleetForMovement, map]);

    useEffect(() => {
        const container = map.getContainer();

        if (
            activeTool === 'draw' ||
            activeTool === 'circle' ||
            selectedFleetForMovement
        ) {
            container.style.touchAction = 'none';
        } else {
            container.style.touchAction = '';
        }

        return () => {
            container.style.touchAction = '';
        };
    }, [activeTool, selectedFleetForMovement, map]);

    useEffect(() => {
        const down = e => {
            if (e.key === 'Control') {
                setIsMultiDraw(true);
            }
        };

        const up = e => {
            if (e.key === 'Control') {
                setIsMultiDraw(false);
            }
        };

        const blur = () => {
            setIsMultiDraw(false);
        };

        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);

        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
        };
    }, [setIsMultiDraw]);

    useEffect(() => {
        if (activeTool !== 'draw') {
            setDrawStart(null);
            draw.reset();
        }
    }, [activeTool, setDrawStart, draw.reset]);

    useEffect(() => {
        if (activeTool !== 'circle') {
            circle.reset();
        }
    }, [activeTool, circle.reset]);

    useMapEventsHandler({
        onClick: onMapClick,
        onMouseMove,
    });

    return null;
}