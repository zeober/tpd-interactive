// src/markerIcons.js
import L from 'leaflet';

import clickmarkerPng from './assets/markers/clickmarker.png';
import fleetMarkerPng from './assets/markers/fleet_marker.png';

const clickmarker = new L.Icon({
    iconUrl: clickmarkerPng,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    tooltipAnchor: [14, 0],
});

const fleet = new L.Icon({
    iconUrl: fleetMarkerPng,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    tooltipAnchor: [14, 0],
});

const markerIcons = {
    clickmarker,
    fleet,
};

export default markerIcons;