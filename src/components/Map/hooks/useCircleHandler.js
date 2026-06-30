import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';

function distanceLatLng(a, b) {
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    return Math.sqrt(dx * dx + dy * dy);
}

export default function useCircleHandler({
    activeTool,
    circleStart,
    setCircleStart,
    setCircles,
    map,
}) {
    const previewCircleRef = useRef(null);
    const previewTooltipRef = useRef(null);

    const [typedRadius, setTypedRadius] = useState('');
    const [isTypingRadius, setIsTypingRadius] = useState(false);

    const clearPreview = useCallback(() => {
        if (previewCircleRef.current) {
            previewCircleRef.current.remove();
            previewCircleRef.current = null;
        }

        if (previewTooltipRef.current) {
            previewTooltipRef.current.remove();
            previewTooltipRef.current = null;
        }
    }, []);

    const reset = useCallback(() => {
        clearPreview();
        setCircleStart(null);
        setTypedRadius('');
        setIsTypingRadius(false);
    }, [clearPreview, setCircleStart]);

    const setPreview = useCallback((radius, tooltipLatLng) => {
        if (!circleStart || !map) return;

        if (!previewCircleRef.current) {
            previewCircleRef.current = L.circle(circleStart, {
                radius,
                interactive: false,
            }).addTo(map);
        } else {
            previewCircleRef.current.setRadius(radius);
        }

        const label = `R: ${Math.round(radius)}`;

        if (!previewTooltipRef.current) {
            previewTooltipRef.current = L.tooltip({
                permanent: true,
                direction: 'top',
                offset: [0, -10],
            })
                .setLatLng(tooltipLatLng)
                .setContent(label)
                .addTo(map);
        } else {
            previewTooltipRef.current
                .setLatLng(tooltipLatLng)
                .setContent(label);
        }
    }, [circleStart, map]);

    const updatePreview = useCallback((latlng) => {
        if (activeTool !== 'circle' || !circleStart || !map) return;

        // Mouse movement cancels typed-radius mode.
        if (isTypingRadius) {
            setTypedRadius('');
            setIsTypingRadius(false);
        }

        const radius = distanceLatLng(circleStart, latlng);
        setPreview(radius, latlng);
    }, [activeTool, circleStart, map, isTypingRadius, setPreview]);

    const updateTypedPreview = useCallback((radiusText) => {
        if (!circleStart || !map) return;

        const radius = Number(radiusText);
        if (!Number.isFinite(radius) || radius <= 0) return;

        const tooltipLatLng = L.latLng(
            circleStart.lat,
            circleStart.lng + radius
        );

        setPreview(radius, tooltipLatLng);
    }, [circleStart, map, setPreview]);

    const saveCircle = useCallback((radius) => {
        if (!circleStart) return;
        if (!Number.isFinite(radius) || radius <= 0) return;

        setCircles(prev => [
            ...prev,
            {
                id: crypto.randomUUID(),
                center: {
                    x: circleStart.lng,
                    y: circleStart.lat,
                },
                radius,
                label: `R: ${Math.round(radius)}`,
                source: 'user-circle',
                createdAt: Date.now(),
            },
        ]);

        reset();
    }, [circleStart, setCircles, reset]);

    const handleCircleClick = useCallback((latlng) => {
        if (activeTool !== 'circle') return false;

        // First click sets the center.
        if (!circleStart) {
            setCircleStart(latlng);
            setTypedRadius('');
            setIsTypingRadius(false);
            return true;
        }

        // Second click saves using either typed radius or mouse radius.
        const radius = isTypingRadius && typedRadius
            ? Number(typedRadius)
            : distanceLatLng(circleStart, latlng);

        saveCircle(radius);
        return true;
    }, [
        activeTool,
        circleStart,
        setCircleStart,
        typedRadius,
        isTypingRadius,
        saveCircle,
    ]);

    useEffect(() => {
        if (activeTool !== 'circle') return;

        const onKeyDown = (e) => {
            // Radius typing only works after the center is selected.
            if (!circleStart) return;

            const isCircleKey =
                /^[0-9.]$/.test(e.key) ||
                e.key === 'Backspace' ||
                e.key === 'Enter';

            if (!isCircleKey) return;

            // Capture the key before Leaflet/map shortcuts receive it.
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            if (/^[0-9.]$/.test(e.key)) {
                setIsTypingRadius(true);

                setTypedRadius(prev => {
                    // Avoid multiple decimal points.
                    if (e.key === '.' && prev.includes('.')) {
                        return prev;
                    }

                    const next = prev + e.key;
                    updateTypedPreview(next);
                    return next;
                });

                return;
            }

            if (e.key === 'Backspace') {
                setIsTypingRadius(true);

                setTypedRadius(prev => {
                    const next = prev.slice(0, -1);
                    updateTypedPreview(next);
                    return next;
                });

                return;
            }

            if (e.key === 'Enter') {
                const radius = Number(typedRadius);
                saveCircle(radius);
            }
        };

        // Capture phase is important. It stops number keys like "6" from zooming the map.
        window.addEventListener('keydown', onKeyDown, true);

        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [
        activeTool,
        circleStart,
        typedRadius,
        updateTypedPreview,
        saveCircle,
    ]);

    return {
        handleCircleClick,
        updatePreview,
        reset,
    };
}