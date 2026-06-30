import { useCallback, useRef } from 'react';
import L from 'leaflet';

function distanceXY(a, b) {
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    return Math.sqrt(dx * dx + dy * dy);
}

export default function useEraseHandler(
    eraseRadius,
    setLines,
    map,
    setCircles,
    setDroppedMarkers
) {
    const eraseCircle = useRef(null);

    const closestDist = (pt, start, end) => {
        const Cx = end.lng - start.lng;
        const Cy = end.lat - start.lat;

        const denom = Cx * Cx + Cy * Cy;

        if (denom === 0) {
            return distanceXY(pt, start);
        }

        const t =
            ((pt.lng - start.lng) * Cx + (pt.lat - start.lat) * Cy) / denom;

        const clamped = Math.max(0, Math.min(1, t));

        const xx = start.lng + clamped * Cx;
        const yy = start.lat + clamped * Cy;

        return Math.hypot(pt.lng - xx, pt.lat - yy);
    };

    const handleErase = useCallback((latlng) => {
        setLines(prev =>
            prev.filter(({ positions: [start, end] }) =>
                closestDist(latlng, start, end) > eraseRadius
            )
        );

        if (setCircles) {
            setCircles(prev =>
                prev.filter(circle => {
                    const centerLatLng = {
                        lng: circle.center.x,
                        lat: circle.center.y,
                    };

                    const d = distanceXY(latlng, centerLatLng);

                    const hitsCenter = d <= eraseRadius;
                    const hitsRing = Math.abs(d - circle.radius) <= eraseRadius;

                    return !(hitsCenter || hitsRing);
                })
            );
        }

        if (setDroppedMarkers) {
            setDroppedMarkers(prev =>
                prev.filter(marker => {
                    const markerLatLng = {
                        lng: marker.x,
                        lat: marker.y,
                    };

                    const d = distanceXY(latlng, markerLatLng);

                    return d > eraseRadius;
                })
            );
        }

        if (!map) return;

        map.eachLayer(layer => {
            const isGoto =
                (layer instanceof L.Marker || layer instanceof L.CircleMarker) &&
                layer.options?.isGoto;

            if (!isGoto) return;

            const d = map.distance(latlng, layer.getLatLng());

            if (d <= eraseRadius) {
                layer.remove();
            }
        });
    }, [
        eraseRadius,
        setLines,
        setCircles,
        setDroppedMarkers,
        map,
    ]);

    const updateCircle = useCallback((latlng) => {
        if (!map) return;

        if (!eraseCircle.current) {
            eraseCircle.current = L.circle(latlng, {
                radius: eraseRadius,
                color: 'red',
                weight: 1,
                fillOpacity: 0.1,
                interactive: false,
            }).addTo(map);
        } else {
            eraseCircle.current.setLatLng(latlng);
            eraseCircle.current.setRadius(eraseRadius);
        }
    }, [eraseRadius, map]);

    const removeCircle = useCallback(() => {
        if (!map || !eraseCircle.current) return;

        map.removeLayer(eraseCircle.current);
        eraseCircle.current = null;
    }, [map]);

    return {
        handleErase,
        updateCircle,
        removeCircle,
    };
}