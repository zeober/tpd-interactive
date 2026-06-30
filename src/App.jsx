// src/App.jsx
import { useCallback, useEffect, useState } from 'react';
import {
    MapContainer,
    ImageOverlay,
    Marker,
    Popup,
    Polyline,
    Circle,
    Tooltip,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Assets
import mapClaim from './assets/map/nationmap.png';
import mapBiome from './assets/map/biomemap.png';
import mapFarm from './assets/map/farmmap.png';
import mapPop from './assets/map/popmap.png';
import mapRes from './assets/map/resmap.png';
import mapReg from './assets/map/namedmap.png';
import markerIcons from './markerIcons';
import resourceLegend from './assets/map/Resource_legend.png';

// Components
import Sidebar from './components/Sidebar/Sidebar';
import CursorManager from './components/Map/CursorManager';
import FleetMapApp from './components/Fleet/FleetManager';
import MapEventHandler from './components/Map/MapEventHandler';
import Toolbar from './components/UI/Toolbar';
import Toast from './components/UI/Toast';
import CoordinateDisplay from './components/Map/CoordinateDisplay';
import NationSummary from './components/Nation/NationSummary';
import NationSummaryPanel from './components/Nation/NationSummaryPanel';
import NationSidebar from './components/NationSidebar/NationSidebar';
import LegendPanel from './components/LegendPanel/LegendPanel';
import MarkerToggle from './components/MarkerToggle/MarkerToggle';
import CoordinateFinder from './components/Map/CoordinateFinder';

// Constants
const bounds = [[0, 0], [9216, 9216]];
const center = [4608, 4608];
const markersData = [];

// Cloudflare Worker private map API.
const GM_MAP_WORKER_URL = 'https://gm-map-api.tpd-map-api.workers.dev';

// Default/common map file in the private Drive folder used by the Cloudflare Worker.
// Set this to the PNG file name you want loaded automatically on startup.
const CLOUDFLARE_DEFAULT_MAP_FILE_NAME = '1234676937167868026.png';

// Google Drive API map pull config.
// Disabled for now. Empty unless you intend to return to the direct Drive API method.
const DRIVE_MAP_FOLDER_ID = ''; // Google Drive folder ID
const DRIVE_COMMON_FILE_NAME = ''; // Public/default map file name
const DRIVE_API_KEY = ''; // Restricted Google API key

function buildCloudflareMapUrl(fileName) {
    return `${GM_MAP_WORKER_URL}/faction-map?fileName=${encodeURIComponent(fileName)}`;
}

function escapeDriveQueryString(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findDriveImageUrlByName({ folderId, fileName, apiKey }) {
    if (!folderId || !fileName || !apiKey) {
        return null;
    }

    const safeFileName = escapeDriveQueryString(fileName);

    const query = [
        `'${folderId}' in parents`,
        `name = '${safeFileName}'`,
        `mimeType = 'image/png'`,
        `trashed = false`,
    ].join(' and ');

    const listUrl =
        'https://www.googleapis.com/drive/v3/files' +
        `?q=${encodeURIComponent(query)}` +
        '&fields=files(id,name,mimeType)' +
        '&pageSize=1' +
        '&supportsAllDrives=true' +
        `&key=${encodeURIComponent(apiKey)}`;

    const listResponse = await fetch(listUrl);

    if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.info('Drive API error response:', errorText);
        throw new Error('Drive file lookup failed.');
    }

    const listData = await listResponse.json();
    const file = listData.files?.[0];

    if (!file?.id) {
        return null;
    }

    return `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${encodeURIComponent(apiKey)}`;
}

const TopLeftCRS = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1, 0, 1, 0),
});

const turnCtx = require.context('./assets/map/turnmap', false, /\.png$/);
const TURN_MAPS = turnCtx.keys().sort().reduce((acc, file) => {
    const name = file.replace('./', '').replace('.png', '');
    acc[name] = turnCtx(file);
    return acc;
}, {});

const MAPS = {
    Claims: mapClaim,
    Biome: mapBiome,
    Arability: mapFarm,
    Population: mapPop,
    Resources: mapRes,
    Region: mapReg,
    ...TURN_MAPS,
};

const mapKeys = Object
    .keys(TURN_MAPS)
    .filter(k => /^map\d+$/.test(k));

const sorted = mapKeys
    .map(k => ({ key: k, num: parseInt(k.replace('map', ''), 10) }))
    .sort((a, b) => b.num - a.num);

const latestMapKey = sorted[0]?.key;

const App = () => {
    // UI toggles
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [activeSidebarTab, setActiveSidebarTab] = useState('tab1');
    const [legendOpen, setLegendOpen] = useState(false);
    const [nationSidebarOpen, setNationSidebarOpen] = useState(false);

    // Active selections
    const [activeTool, setActiveTool] = useState(null);
    const [activeNation, setActiveNation] = useState(null);

    // Coordinates
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const [gotoValue, setGotoValue] = useState('');

    // Drawing
    const [lines, setLines] = useState([]);
    const [drawStart, setDrawStart] = useState(null);
    const [eraseRadius, setEraseRadius] = useState(50);
    const [isMultiDraw, setIsMultiDraw] = useState(false);

    const [droppedMarkers, setDroppedMarkers] = useState([]);
    const [circles, setCircles] = useState([]);
    const [circleStart, setCircleStart] = useState(null);

    // Fleet import/data
    const [fleetImportText, setFleetImportText] = useState('');
    const [fleetImportTrigger, setFleetImportTrigger] = useState('');
    const [selectedFleet, setSelectedFleet] = useState(null);
    const [fleetData, setFleetData] = useState([]);

    // Maps
    const [importedMaps, setImportedMaps] = useState([]);
    const [driveDefaultTurnMapUrl, setDriveDefaultTurnMapUrl] = useState(null);
    const [selectedMap, setSelectedMap] = useState(
        latestMapKey || 'Claims'
    );
    const [showCapitals, setShowCapitals] = useState(false);

    // Toast
    const [toastMsg, setToastMsg] = useState('');

    // Load default/common map once on startup using the Cloudflare Worker.
    useEffect(() => {
        let cancelled = false;

        async function loadCloudflareDefaultMap() {
            if (
                !CLOUDFLARE_DEFAULT_MAP_FILE_NAME
                || CLOUDFLARE_DEFAULT_MAP_FILE_NAME === 'PUT_DEFAULT_MAP_FILE_NAME_HERE.png'
            ) {
                console.info('Cloudflare default map file name is not configured. Using local fallback.');
                return;
            }

            try {
                const url = buildCloudflareMapUrl(CLOUDFLARE_DEFAULT_MAP_FILE_NAME);
                const check = await fetch(url);

                if (!check.ok) {
                    console.info(`No Cloudflare default map found. Status: ${check.status}. Using local fallback.`);
                    return;
                }

                if (!cancelled) {
                    const mapName = 'Public Map';

                    const map = {
                        name: mapName,
                        url,
                        source: 'cloudflare-worker-default-map',
                        fileName: CLOUDFLARE_DEFAULT_MAP_FILE_NAME,
                    };

                    setDriveDefaultTurnMapUrl(url);

                    setImportedMaps(prev => [
                        ...prev.filter(m => m.name !== mapName),
                        map,
                    ]);

                    setSelectedMap(mapName);

                    console.info('Cloudflare default map loaded and added to imported maps.');
                }
            } catch (error) {
                console.info('Using bundled latest turn map. Cloudflare default map failed:', error);
            }
        }

        loadCloudflareDefaultMap();

        return () => {
            cancelled = true;
        };
    }, []);

    // Direct Google Drive default map loading is disabled.
    // Kept here as fallback/reference for future public map loading.
    /*
    useEffect(() => {
        let cancelled = false;

        console.info('Attempting to load Drive default turn map...');

        async function loadDriveDefaultTurnMap() {
            try {
                const url = await findDriveImageUrlByName({
                    folderId: DRIVE_MAP_FOLDER_ID,
                    fileName: DRIVE_COMMON_FILE_NAME,
                    apiKey: DRIVE_API_KEY,
                });

                if (!cancelled && url) {
                    const mapName = 'Public Map';

                    const map = {
                        name: mapName,
                        url,
                        source: 'drive-default',
                        fileName: DRIVE_COMMON_FILE_NAME,
                    };

                    setDriveDefaultTurnMapUrl(url);

                    setImportedMaps(prev => [
                        ...prev.filter(m => m.name !== mapName),
                        map,
                    ]);

                    setSelectedMap(mapName);

                    console.info('Drive default turn map loaded and added to imported maps.');
                } else {
                    console.info('No Drive default turn map found. Using local fallback.');
                }
            } catch (error) {
                console.info('Using bundled latest turn map. Drive default turn map failed:', error);
            }
        }

        loadDriveDefaultTurnMap();

        return () => {
            cancelled = true;
        };
    }, []);
    */

    // Used by Tab2ContentV2 after reading factionID from A2.
    // It imports factionID.png into the existing importedMaps list,
    // then switches selectedMap to that imported map.
    
    //Disabled in favour of Cloudflare API method. Uncomment to reenable

    /*
    const importFactionMapByFileName = useCallback(async (fileName) => {
        const url = await findDriveImageUrlByName({
            folderId: DRIVE_MAP_FOLDER_ID,
            fileName,
            apiKey: DRIVE_API_KEY,
        });

        if (!url) {
            return null;
        }

        const mapName = `Internal Turn Map`; //the displayed list name of the automatically loaded FactionID Map

        const map = {
            name: mapName,
            url,
            source: 'drive-faction',
            fileName,
        };

        setImportedMaps(prev => [
            ...prev.filter(m => m.name !== mapName),
            map,
        ]);

        setSelectedMap(mapName);

        return map;
    }, []);
    */

    // Alternative Cloudflare API retrieval method.
    const importFactionMapByFileName = useCallback(async (fileName) => {
        const url = buildCloudflareMapUrl(fileName);

        const check = await fetch(url);

        if (!check.ok) {
            console.info(`Internal map not found or not allowed. Status: ${check.status}`);
            // 403 Forbidden: bad origin
            // 404 Not Found: bad/missing map file
            // 500 Server Error: key/service account/API/token/secret/download/Worker failure
            // In CloudflareWorker, run: npx wrangler tail
            return null;
        }

        const mapName = 'Internal Map';

        const map = {
            name: mapName,
            url,
            source: 'cloudflare-worker-gm-drive',
            fileName,
        };

        setImportedMaps(prev => [
            ...prev.filter(m => m.name !== mapName),
            map,
        ]);

        setSelectedMap(mapName);

        return map;
    }, []);





    const toggleSidebar = () => setSidebarOpen(open => !open);

    const mapClasses = [
        'leaflet-container',
        activeTool === 'copy' && 'copy-cursor',
        activeTool === 'erase' && 'erase-cursor',
    ].filter(Boolean).join(' ');

    const activeMapUrl =
        importedMaps.find(m => m.name === selectedMap)?.url
        || (
            selectedMap === latestMapKey
                ? driveDefaultTurnMapUrl
                : null
        )
        || MAPS[selectedMap];

    return (
        <div className={`App ${sidebarOpen ? 'sidebar-open' : ''} …`}>
            <Sidebar
                sidebarOpen={sidebarOpen}
                toggleSidebar={toggleSidebar}
                activeSidebarTab={activeSidebarTab}
                setActiveSidebarTab={setActiveSidebarTab}

                selectedMap={selectedMap}
                setSelectedMap={setSelectedMap}
                MAPS={MAPS}
                TURN_MAPS={TURN_MAPS}
                importedMaps={importedMaps}
                setImportedMaps={setImportedMaps}

                fleetImportText={fleetImportText}
                setFleetImportText={setFleetImportText}
                setFleetImportTrigger={setFleetImportTrigger}

                selectedFleet={selectedFleet}
                setSelectedFleet={setSelectedFleet}
                fleetData={fleetData}
                setFleetData={setFleetData}

                importFactionMapByFileName={importFactionMapByFileName}
            />

            <Toolbar
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                eraseRadius={eraseRadius}
                setEraseRadius={setEraseRadius}
                onGotoSubmit={(raw) => setGotoValue(raw)}
            />

            <Toast message={toastMsg} />

            <MapContainer
                center={center}
                zoom={-2}
                minZoom={-5}
                maxZoom={5}
                crs={TopLeftCRS}
                className={mapClasses}
                style={{ height: '100vh', width: '100%' }}
                dragging={true}
                trackResize={true}
                zoomControl={true}
                tap={true}
                tapTolerance={25}
                touchZoom={true}
                bounceAtZoomLimits={false}
            >
                <ImageOverlay
                    key={activeMapUrl}
                    url={activeMapUrl}
                    bounds={bounds}
                />

                {showCapitals && (
                    <NationSummary
                        onSelectNation={(name) => {
                            setActiveNation(name);
                            setNationSidebarOpen(true);
                        }}
                    />
                )}

                {markersData.map((m, i) => (
                    <Marker key={i} position={m.position} icon={markerIcons.clickmarker}>
                        <Popup>{m.title}</Popup>
                    </Marker>
                ))}

                {droppedMarkers.map(marker => (
                    <Marker
                        key={marker.id}
                        position={[marker.y, marker.x]}
                        icon={markerIcons.clickmarker}
                        eventHandlers={{
                            click: (e) => {
                                e.originalEvent?.stopPropagation();
                                e.originalEvent?.preventDefault?.();
                            },
                            mousedown: (e) => {
                                e.originalEvent?.stopPropagation();
                            },
                        }}
                    >
                        <Popup>
                            <b>Marker</b><br />
                            X: {Math.round(marker.x)}<br />
                            Y: {Math.round(marker.y)}
                        </Popup>

                        <Tooltip>
                            ({Math.round(marker.x)}, {Math.round(marker.y)})
                        </Tooltip>
                    </Marker>
                ))}

                {lines.map((line) => (
                    <Polyline key={line.id} positions={line.positions}>
                        <Tooltip permanent direction="center" offset={[0, -10]}>
                            {line.dist.toFixed(0)} units
                        </Tooltip>
                    </Polyline>
                ))}

                {circles.map(circle => (
                    <Circle
                        key={circle.id}
                        center={[circle.center.y, circle.center.x]}
                        radius={circle.radius}
                    >
                        <Tooltip permanent direction="center">
                            {circle.label || `R: ${Math.round(circle.radius)}`}
                        </Tooltip>
                    </Circle>
                ))}

                <FleetMapApp
                    importText={fleetImportTrigger}
                    selectedFleet={selectedFleet}
                    setSelectedFleet={setSelectedFleet}
                    activeTool={activeTool}
                    onFleetUpdate={setFleetData}
                />

                <MapEventHandler
                    coords={coords}
                    setToastMsg={setToastMsg}
                    activeTool={activeTool}
                    setActiveTool={setActiveTool}
                    setCoords={setCoords}
                    drawStart={drawStart}
                    setDrawStart={setDrawStart}
                    setLines={setLines}
                    eraseRadius={eraseRadius}
                    isMultiDraw={isMultiDraw}
                    setIsMultiDraw={setIsMultiDraw}
                    setSelectedFleet={setSelectedFleet}

                    droppedMarkers={droppedMarkers}
                    setDroppedMarkers={setDroppedMarkers}
                    circles={circles}
                    setCircles={setCircles}
                    circleStart={circleStart}
                    setCircleStart={setCircleStart}
                />

                <CoordinateFinder
                    gotoValue={gotoValue}
                    toast={setToastMsg}
                    onResult={() => { }}
                />

                <CursorManager activeTool={activeTool} />
                <CoordinateDisplay coords={coords} />
            </MapContainer>

            <NationSidebar
                open={nationSidebarOpen}
                onToggle={() => setNationSidebarOpen(o => !o)}
                activeNation={activeNation}
                onClose={() => {
                    setNationSidebarOpen(false);
                    setActiveNation(null);
                }}
            >
                <NationSummaryPanel nationName={activeNation} />
            </NationSidebar>

            <LegendPanel
                open={legendOpen}
                nationOpen={nationSidebarOpen}
                onToggle={() => setLegendOpen(o => !o)}
                src={resourceLegend}
                alt="Resource Legend"
            />

            <MarkerToggle
                nationOpen={nationSidebarOpen}
                show={showCapitals}
                onToggle={() => setShowCapitals(v => !v)}
            />
        </div>
    );
};

export default App;