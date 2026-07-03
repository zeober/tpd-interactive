// src/components/Sidebar/Tab2ContentV2.jsx
import { useCallback, useMemo, useState } from 'react';

const GM_MAP_WORKER_URL = 'https://gm-map-api.tpd-map-api.workers.dev';

const FACTION_SHEET_GIDS = {
    turn: '1870318184',
    civilian: '1173478456',
    technology: '222911823',
    military: '0',
    blueprint: '660550379',
    traits: '1688184481',
};

function toNumberOrNull(value) {
    if (value == null) return null;

    const trimmed = String(value).trim();
    if (trimmed === '') return null;

    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
}

function formatPoint(x, y) {
    if (x == null || y == null) return '-';
    return `(${Math.round(x)}, ${Math.round(y)})`;
}

function roundOrBlank(value) {
    if (value == null) return '';

    const n = Number(value);
    if (!Number.isFinite(n)) return '';

    return String(Math.round(n));
}

function extractSpreadsheetId(sheetUrl) {
    const spreadsheetIdMatch = String(sheetUrl).match(/\/spreadsheets\/d\/([^/]+)/);

    if (!spreadsheetIdMatch) {
        throw new Error('Invalid Google Sheets link. Paste the full spreadsheet URL.');
    }

    return spreadsheetIdMatch[1];
}

function parseMilitaryFleetRows(rows) {
    return rows.slice(2, 22).map((row, index) => {
        const rowNumber = index + 3;

        const name = String(row[1] ?? '').trim();      // B
        const x1 = toNumberOrNull(row[8]);             // I
        const y1 = toNumberOrNull(row[9]);             // J
        const x2 = toNumberOrNull(row[10]);            // K
        const y2 = toNumberOrNull(row[11]);            // L
        const x3FromSheet = toNumberOrNull(row[12]);   // M
        const y3FromSheet = toNumberOrNull(row[13]);   // N
        const range = toNumberOrNull(row[16]);         // Q

        const hasName = name.length > 0;

        const hasStartPoint =
            hasName &&
            x1 != null &&
            y1 != null;

        const hasRange =
            hasName &&
            range != null;

        const validForMap =
            hasName &&
            hasStartPoint &&
            hasRange;

        const hasMidpoint =
            validForMap &&
            x2 != null &&
            y2 != null;

        const hasFinalPoint =
            x3FromSheet != null &&
            y3FromSheet != null;

        return {
            rowNumber,

            // active means map-controllable.
            // Invalid named rows are preserved, but ignored by the map app.
            active: validForMap,

            hasName,
            validForMap,

            invalidReason: hasName && !validForMap
                ? 'Missing start point or range. Row ignored by map app.'
                : '',

            name,
            originalRow: row,

            // Column Q: movement range in pixels.
            range: hasName ? range : null,

            // Columns I:J, read-only start/current position.
            x1: hasName ? x1 : null,
            y1: hasName ? y1 : null,

            // Columns K:L, optional midpoint.
            x2: hasName ? x2 : null,
            y2: hasName ? y2 : null,
            hasMidpoint,

            // Columns M:N, endpoint.
            // If final x/y already exist, preserve them.
            // If blank but valid for map, default endpoint to start.
            // If invalid, keep null and preserve original output later.
            x3: hasName
                ? (hasFinalPoint ? x3FromSheet : (validForMap ? x1 : null))
                : null,

            y3: hasName
                ? (hasFinalPoint ? y3FromSheet : (validForMap ? y1 : null))
                : null,
        };
    });
}

function summarizeMilitaryFleetRows(fleetRows) {
    const namedRows = fleetRows.filter(f => f.hasName);
    const validRows = fleetRows.filter(f => f.validForMap);
    const invalidRows = fleetRows.filter(f => f.hasName && !f.validForMap);

    if (namedRows.length === 0) {
        return {
            ok: true,
            message: 'No fleet names found in B3:B22. Loaded map if factionID exists.',
            validRows,
            invalidRows,
        };
    }

    return {
        ok: true,
        message: `Imported ${validRows.length} map-ready fleet(s). Ignored ${invalidRows.length} invalid row(s).`,
        validRows,
        invalidRows,
    };
}

async function importMilitaryFleetsFromSheet(sheetUrl) {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    
    const workerUrl =
        `${GM_MAP_WORKER_URL}/fleet-sheet` +
        `?spreadsheetId=${encodeURIComponent(spreadsheetId)}` +
        '&sheet=military';

    console.info('Importing fleet sheet through Cloudflare Worker:', {
        spreadsheetId,
        sheet: 'military',
        gid: FACTION_SHEET_GIDS.military,
        workerUrl,
    });

    let response;

    try {
        response = await fetch(workerUrl);
    } catch (error) {
        console.error('Cloudflare fleet sheet request failed:', {
            name: error?.name,
            message: error?.message,
            stack: error?.stack,
            workerUrl,
        });

        throw new Error(
            'Could not connect to the fleet import service. Try again, or contact an admin.'
        );
    }

    let data;

    try {
        data = await response.json();
    } catch (error) {
        console.error('Cloudflare fleet sheet response was not JSON:', {
            status: response.status,
            statusText: response.statusText,
            error,
        });

        throw new Error(
            'Fleet import service returned an invalid response.'
        );
    }

    if (!response.ok || !data.ok) {
        console.error('Cloudflare fleet sheet import failed:', data);

        const requestIdText = data?.requestId
            ? ` Request ID: ${data.requestId}`
            : '';

        throw new Error(
            `${data?.error || 'Fleet import failed.'}${requestIdText}`
        );
    }

    console.info('Cloudflare fleet sheet import success:', {
        requestId: data.requestId,
        spreadsheetId: data.spreadsheetId,
        sheet: data.sheet,
        gid: data.gid,
        sheetTitle: data.sheetTitle,
        range: data.range,
        factionId: data.factionId,
        rowCount: data.rows?.length || 0,
    });

    const fleetRows = parseMilitaryFleetRows(data.rows || []);
    const summary = summarizeMilitaryFleetRows(fleetRows);

    return {
        requestId: data.requestId,
        fleetRows,
        validFleetRows: summary.validRows,
        invalidFleetRows: summary.invalidRows,
        factionId: data.factionId,
        message: `${summary.message} Request ID: ${data.requestId}`,
    };
}

function buildMovementPasteText(fleetData) {
    return fleetData.map(f => {
        // Preserve empty spreadsheet rows.
        if (!f.hasName) {
            return '\t\t\t';
        }

        // Invalid rows are not controlled by the map app.
        // Preserve original K:N output exactly as imported.
        if (!f.validForMap) {
            const original = f.originalRow || [];

            const x2 = original[10] ?? '';
            const y2 = original[11] ?? '';
            const x3 = original[12] ?? '';
            const y3 = original[13] ?? '';

            return `${x2}\t${y2}\t${x3}\t${y3}`;
        }

        // Midpoint is optional.
        const x2 = f.hasMidpoint ? roundOrBlank(f.x2) : '';
        const y2 = f.hasMidpoint ? roundOrBlank(f.y2) : '';

        // Endpoint is required for valid map rows.
        // If no movement exists, endpoint equals x1/y1.
        const x3 = roundOrBlank(f.x3 ?? f.x1);
        const y3 = roundOrBlank(f.y3 ?? f.y1);

        return `${x2}\t${y2}\t${x3}\t${y3}`;
    }).join('\n');
}

function clearAllFleetMovements(fleetData) {
    return fleetData.map(f => {
        // Empty rows stay empty.
        if (!f.hasName) {
            return f;
        }

        // Invalid rows are not controlled by the map app.
        // Preserve original imported data.
        if (!f.validForMap) {
            return f;
        }

        // Valid rows reset movement:
        // K/L blank, M/N = start position.
        return {
            ...f,
            x2: null,
            y2: null,
            hasMidpoint: false,
            x3: f.x1,
            y3: f.y1,
        };
    });
}

export default function Tab2ContentV2({
    fleetImportText,
    setFleetImportText,
    selectedFleet,
    setSelectedFleet,
    fleetData,
    setFleetData,
    importFactionMapByFileName,
}) {
    const [importStatus, setImportStatus] = useState('');

    const movementPasteText = useMemo(() => {
        return buildMovementPasteText(fleetData);
    }, [fleetData]);

    const handleImportFromSheet = useCallback(async () => {
        try {
            setImportStatus('Importing fleet data through Cloudflare Worker...');

            const {
                requestId,
                fleetRows,
                validFleetRows,
                invalidFleetRows,
                factionId,
                message,
            } = await importMilitaryFleetsFromSheet(fleetImportText);

            setFleetData(fleetRows);
            setSelectedFleet(null);

            console.info('Fleet import request ID:', requestId);
            console.info('Valid fleet rows for map:', validFleetRows.length);
            console.info('Invalid fleet rows ignored by map:', invalidFleetRows.length);

            let statusMessage = message;

            if (factionId && importFactionMapByFileName) {
                const mapFileName = `${factionId}.png`;

                setImportStatus(`${message} Looking for faction map: ${mapFileName}...`);

                const importedMap = await importFactionMapByFileName(mapFileName);

                if (importedMap) {
                    statusMessage = `${message} Loaded faction map: ${mapFileName}`;
                } else {
                    statusMessage = `${message} No faction map found for ${mapFileName}. Using current/default map.`;
                }
            } else if (!factionId) {
                statusMessage = `${message} No factionID found in A2. Using current/default map.`;
            }

            setImportStatus(statusMessage);
        } catch (error) {
            console.error('Fleet import failed:', error);
            setImportStatus(error.message || 'Import failed.');
        }
    }, [
        fleetImportText,
        setFleetData,
        setSelectedFleet,
        importFactionMapByFileName,
    ]);

    const handleCopyResults = useCallback(() => {
        navigator.clipboard.writeText(movementPasteText).then(
            () => alert('Fleet data copied to clipboard'),
            () => alert('Failed to copy fleet data')
        );
    }, [movementPasteText]);

    const handleClearMovements = useCallback(() => {
        const confirmed = window.confirm(
            'Clear all fleet movements? This will reset all valid fleet endpoints to their start positions.'
        );

        if (!confirmed) return;

        setFleetData(prev => clearAllFleetMovements(prev));
        setSelectedFleet(null);
        setImportStatus('Cleared all valid fleet movements. Invalid rows were preserved unchanged.');
    }, [
        setFleetData,
        setSelectedFleet,
    ]);

    return (
        <>
            <label className="block font-bold mb-2 text-sm">
                Fleet Import
            </label>

            <textarea
                className="w-full min-h-10 max-h-32 border p-2 text-sm"
                value={fleetImportText}
                onChange={e => setFleetImportText(e.target.value)}
                placeholder="Paste the Google Sheets URL"
                rows={2}
            />

            <button
                className="sidebar-action-btn sidebar-action-btn--import"
                onClick={handleImportFromSheet}
            >
                Import Fleets
            </button>

            {importStatus && (
                <div className="mt-2 text-xs text-white bg-black bg-opacity-30 p-2 border border-white rounded">
                    {importStatus}
                </div>
            )}

            {selectedFleet && (
                <div className="mt-4 text-sm bg-black bg-opacity-30 text-white p-3 border border-white rounded">
                    <strong>{selectedFleet.name}</strong><br />
                    Row: {selectedFleet.rowNumber}<br />
                    Start: {formatPoint(selectedFleet.x1, selectedFleet.y1)}<br />
                    Mid: {selectedFleet.hasMidpoint ? formatPoint(selectedFleet.x2, selectedFleet.y2) : '-'}<br />
                    End: {formatPoint(selectedFleet.x3, selectedFleet.y3)}<br />
                    Range: {selectedFleet.range}<br />
                </div>
            )}

            {fleetData.length > 0 && (
                <div className="mt-4 text-sm bg-black bg-opacity-30 text-white p-3 border border-white rounded">
                    <button
                        className="sidebar-action-btn sidebar-action-btn--copy"
                        onClick={handleCopyResults}
                    >
                        Copy Movement Results
                    </button>

                    <button
                        className="sidebar-action-btn sidebar-action-btn--clear mt-2"
                        onClick={handleClearMovements}
                    >
                        Clear Movements
                    </button>
                </div>
            )}
        </>
    );
}