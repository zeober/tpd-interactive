// src/components/Sidebar/Tab2ContentV2.jsx
import { useCallback, useMemo, useState } from 'react';
import Papa from 'papaparse';

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

function extractGoogleSheetInfo(url) {
    const spreadsheetIdMatch = String(url).match(/\/spreadsheets\/d\/([^/]+)/);
    const gidMatch = String(url).match(/[?&#]gid=(\d+)/);

    if (!spreadsheetIdMatch) {
        throw new Error('Invalid Google Sheets link. Paste the full URL from the Military tab.');
    }

    if (!gidMatch) {
        throw new Error('Missing gid. Open the Military tab first, then copy the URL.');
    }

    return {
        spreadsheetId: spreadsheetIdMatch[1],
        gid: gidMatch[1],
    };
}

function buildCsvExportUrl(sheetUrl) {
    const { spreadsheetId, gid } = extractGoogleSheetInfo(sheetUrl);

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

function parseMilitaryFleetRows(rows) {
    // Rows 3–22 become indexes 2–21.
    // Preserve exactly 20 rows so output aligns with K3:N22.
    return rows.slice(2, 22).map((row, index) => {
        const rowNumber = index + 3;

        // B = name
        // I = x now / x1
        // J = y now / y1
        // K = x mid / x2
        // L = y mid / y2
        // M = end x / x3
        // N = end y / y3
        // Q = range in pixels
        const name = String(row[1] ?? '').trim();      // B
        const x1 = toNumberOrNull(row[8]);             // I
        const y1 = toNumberOrNull(row[9]);             // J
        const x2 = toNumberOrNull(row[10]);            // K
        const y2 = toNumberOrNull(row[11]);            // L
        const x3FromSheet = toNumberOrNull(row[12]);   // M
        const y3FromSheet = toNumberOrNull(row[13]);   // N
        const range = toNumberOrNull(row[16]);         // Q

        const active = name.length > 0;
        const hasMidpoint = active && x2 != null && y2 != null;

        return {
            rowNumber,
            active,
            name,

            // Column Q: movement range in pixels.
            range: active ? range : null,

            // Columns I:J, read-only start/current position.
            x1: active ? x1 : null,
            y1: active ? y1 : null,

            // Columns K:L, optional midpoint.
            x2: active ? x2 : null,
            y2: active ? y2 : null,
            hasMidpoint,

            // Columns M:N, endpoint.
            // If blank, active fleet defaults endpoint to start position.
            x3: active ? (x3FromSheet ?? x1) : null,
            y3: active ? (y3FromSheet ?? y1) : null,
        };
    });
}

function validateMilitaryFleetRows(fleetRows) {
    const activeRows = fleetRows.filter(f => f.active);

    if (activeRows.length === 0) {
        return {
            ok: false,
            message: 'No fleet names found in B3:B22. Make sure the pasted link is for the Military tab.',
        };
    }

    const invalidRows = activeRows.filter(f =>
        f.x1 == null ||
        f.y1 == null ||
        f.range == null
    );

    if (invalidRows.length > 0) {
        return {
            ok: false,
            message: `Spreadsheet Data invalid. Check row(s): ${invalidRows.map(f => f.rowNumber).join(', ')}. `
            //message: `Some active fleet rows are missing x now, y now, or range data. Check rows: ${invalidRows.map(f => f.rowNumber).join(', ')}.`,
        };
    }

    return {
        ok: true,
        message: `Imported ${activeRows.length} fleets.`,
    };
}

async function importMilitaryFleetsFromSheet(sheetUrl) {
    const csvUrl = buildCsvExportUrl(sheetUrl);

    const response = await fetch(csvUrl);

    if (!response.ok) {
        throw new Error('Could not fetch spreadsheet CSV. Make sure the sheet is public and the Military tab URL was pasted.');
    }

    const csvText = await response.text();

    const parsed = Papa.parse(csvText, {
        skipEmptyLines: false,
    });

    const factionId = String(parsed.data?.[1]?.[0] ?? '').trim();
    //grab faction ID from A2

    if (parsed.errors?.length > 0) {
        throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
    }

    const fleetRows = parseMilitaryFleetRows(parsed.data);
    const validation = validateMilitaryFleetRows(fleetRows);

    if (!validation.ok) {
        throw new Error(validation.message);
    }

    return {
        fleetRows,
        factionId,
        message: validation.message,
    };
}

function buildMovementPasteText(fleetData) {
    return fleetData.map(f => {
        // Preserve empty spreadsheet rows.
        if (!f.active) {
            return '\t\t\t';
        }

        // Midpoint is optional.
        // Blank x2/y2 means no midpoint, not 0,0.
        const x2 = f.hasMidpoint ? roundOrBlank(f.x2) : '';
        const y2 = f.hasMidpoint ? roundOrBlank(f.y2) : '';

        // Endpoint is required for active fleets.
        // If no movement exists, endpoint equals x1/y1.
        const x3 = roundOrBlank(f.x3 ?? f.x1);
        const y3 = roundOrBlank(f.y3 ?? f.y1);

        return `${x2}\t${y2}\t${x3}\t${y3}`;
    }).join('\n');
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
            setImportStatus('Importing fleet data from sheet...');

            const { fleetRows, factionId, message } =
                await importMilitaryFleetsFromSheet(fleetImportText);

            setFleetData(fleetRows);
            setSelectedFleet(null);

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

    return (
        <>
            <label className="block font-bold mb-2 text-sm">
                Fleet Import
            </label>

            <textarea
                className="w-full h-24 border p-2 text-sm"
                value={fleetImportText}
                onChange={e => setFleetImportText(e.target.value)}
                placeholder="Open the Military tab in Google Sheets, copy the URL, and paste it here"
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

            <div className="mt-4 text-sm bg-black bg-opacity-30 text-white p-3 border border-white rounded">
                <label className="block font-bold mb-2">
                    
                </label>

                <div
                    style={{
                        maxHeight: '240px',
                        overflowY: 'auto',
                        border: '1px solid white',
                        borderRadius: '4px',
                    }}
                >
                    <table className="min-w-full text-xs">
                        <thead className="bg-gray-800 text-white">
                            <tr>
                                <th className="px-2 py-1 text-left">Row</th>
                                <th className="px-2 py-1 text-left">Name</th>
                                <th className="px-2 py-1 text-left">Start</th>
                                <th className="px-2 py-1 text-left">Mid</th>
                                <th className="px-2 py-1 text-left">End</th>
                                <th className="px-2 py-1 text-left">Range</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-700">
                            {fleetData.map(f => (
                                <tr
                                    key={f.rowNumber}
                                    className={
                                        f.active
                                            ? 'hover:bg-gray-700 cursor-pointer'
                                            : 'opacity-50'
                                    }
                                    onClick={() => {
                                        if (f.active) setSelectedFleet(f);
                                    }}
                                >
                                    <td className="px-2 py-1">{f.rowNumber}</td>
                                    <td className="px-2 py-1 whitespace-nowrap">
                                        {f.active ? f.name : '-'}
                                    </td>
                                    <td className="px-2 py-1">
                                        {f.active ? formatPoint(f.x1, f.y1) : '-'}
                                    </td>
                                    <td className="px-2 py-1">
                                        {f.active && f.hasMidpoint
                                            ? formatPoint(f.x2, f.y2)
                                            : '-'}
                                    </td>
                                    <td className="px-2 py-1">
                                        {f.active ? formatPoint(f.x3, f.y3) : '-'}
                                    </td>
                                    <td className="px-2 py-1">
                                        {f.active ? f.range : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-4 text-sm bg-black bg-opacity-30 text-white p-3 border border-white rounded">
                <label className="block font-bold mb-2">
                    Results for Military!K3:N22
                </label>
                {/*
                <div className="text-xs mb-2">
                    Paste copied results into <strong>Military!K3:N22</strong>.
                    Columns copied: x mid, y mid, end x, end y.
                    Blank midpoint means no midpoint. Fleets that do not move output their start position as their end position.
                </div>
                */}
                <textarea
                    className="w-full h-40 border p-2 text-xs text-black"
                    value={movementPasteText}
                    readOnly
                />

                <button
                    className="sidebar-action-btn sidebar-action-btn--copy"
                    onClick={handleCopyResults}
                >
                    Copy Fleet Movement Results
                </button>
            </div>
        </>
    );
}