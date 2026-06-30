import { useCallback, useRef, useMemo } from 'react';
import L from 'leaflet';
import throttle from 'lodash.throttle';

export default function useDrawHandler(drawStart, setDrawStart, setLines, isMultiDraw, map) {
    const previewLine = useRef(null);
    const drawPoints = useRef([]);

    const cleanupPreview = useCallback(() => {
        if (previewLine.current && map) {
            map.removeLayer(previewLine.current);
            previewLine.current = null;
        }
    }, [map]);

    const handleDraw = useCallback((latlng) => {
        drawPoints.current.push(latlng);

        if (!drawStart) {
            setDrawStart(latlng);
            return;
        }

        const dist = Math.hypot(
            latlng.lng - drawStart.lng,
            latlng.lat - drawStart.lat
        );

        setLines(prev => [
            ...prev,
            {
                id: crypto.randomUUID(),
                positions: [drawStart, latlng],
                dist,
            },
        ]);

        cleanupPreview();

        if (isMultiDraw) {
            setDrawStart(latlng);
        } else {
            setDrawStart(null);

            const text = drawPoints.current
                .map(p => `${Math.round(p.lng)}\t${Math.round(p.lat)}`)
                .join('\n');

            navigator.clipboard.writeText(text);
            drawPoints.current = [];
        }
    }, [
        drawStart,
        setDrawStart,
        setLines,
        isMultiDraw,
        cleanupPreview,
    ]);

    const updatePreview = useCallback((latlng) => {
        if (!drawStart || !map) return;

        if (!previewLine.current) {
            previewLine.current = L.polyline([drawStart, latlng], {
                interactive: false,
            }).addTo(map);
        } else {
            previewLine.current.setLatLngs([drawStart, latlng]);
        }
    }, [drawStart, map]);

    const reset = useCallback(() => {
        drawPoints.current = [];
        cleanupPreview();
    }, [cleanupPreview]);

    const throttledUpdate = useMemo(
        () => throttle(updatePreview, 16, { leading: true, trailing: true }),
        [updatePreview]
    );

    return {
        handleDraw,
        updatePreview: throttledUpdate,
        cleanupPreview,
        reset,
    };
}