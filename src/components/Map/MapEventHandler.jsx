//src/assets/components/Map/MapEventHandler.jsx

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

import useCopyHandler from './hooks/useCopyHandler';
import useDrawHandler from './hooks/useDrawHandler';
import useEraseHandler from './hooks/useEraseHandler';
import useMapEventsHandler from './hooks/useMapEventsHandler';
import useCircleHandler from './hooks/useCircleHandler';

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

    const onMouseMove = ({ latlng }) => {
        setCoords({
            x: Math.round(latlng.lng),
            y: Math.round(latlng.lat),
        });

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

    const onMapClick = ({ latlng }) => {
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

    // Escape = cancel/deselect any active tool.
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            setActiveTool?.(null);
            setSelectedFleet(null);
            setIsMultiDraw(false);

            setDrawStart(null);
            draw.reset();

            circle.reset();
            erase.removeCircle();
        };

        // Capture phase so Leaflet and tool-specific handlers do not receive Escape first.
        window.addEventListener('keydown', onKeyDown, true);

        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [
        setActiveTool,
        setSelectedFleet,
        setIsMultiDraw,
        setDrawStart,
        draw.reset,
        circle.reset,
        erase.removeCircle,
    ]);

    // Disable Leaflet keyboard shortcuts while Circle tool is active.
    // This prevents number keys like "6" from zooming the map.
    useEffect(() => {
        if (!map.keyboard) return;

        if (activeTool === 'circle') {
            map.keyboard.disable();
        } else {
            map.keyboard.enable();
        }

        return () => {
            if (map.keyboard) {
                map.keyboard.enable();
            }
        };
    }, [activeTool, map]);

    // Touch-action gating
    useEffect(() => {
        const container = map.getContainer();

        if (activeTool === 'draw' || activeTool === 'circle') {
            container.style.touchAction = 'none';
        } else {
            container.style.touchAction = '';
        }

        return () => {
            container.style.touchAction = '';
        };
    }, [activeTool, map]);

    // Keyboard multi-draw with Ctrl
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

    // Reset line tool state when leaving Line/Draw tool.
    useEffect(() => {
        if (activeTool !== 'draw') {
            setDrawStart(null);
            draw.reset();
        }
    }, [activeTool, setDrawStart, draw.reset]);

    // Reset circle tool state when leaving Circle tool.
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