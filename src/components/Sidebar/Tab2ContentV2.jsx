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
    const csvUrl = buildCsvExportUrl(sheetUrl);

    const response = await fetch(csvUrl);

    if (!response.ok) {
        throw new Error('Could not fetch spreadsheet CSV. Make sure the sheet is public and the Military tab URL was pasted.');
    }

    const csvText = await response.text();

    const parsed = Papa.parse(csvText, {
        skipEmptyLines: false,
    });

    if (parsed.errors?.length > 0) {
        throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
    }

    const factionId = String(parsed.data?.[1]?.[0] ?? '').trim();
    const fleetRows = parseMilitaryFleetRows(parsed.data);
    const summary = summarizeMilitaryFleetRows(fleetRows);

    return {
        fleetRows,
        validFleetRows: summary.validRows,
        invalidFleetRows: summary.invalidRows,
        factionId,
        message: summary.message,
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

            const {
                fleetRows,
                validFleetRows,
                invalidFleetRows,
                factionId,
                message,
            } = await importMilitaryFleetsFromSheet(fleetImportText);

            setFleetData(fleetRows);
            setSelectedFleet(null);

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
                    Imported Fleets
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
                                        f.validForMap
                                            ? 'hover:bg-gray-700 cursor-pointer'
                                            : 'opacity-50'
                                    }
                                    title={f.invalidReason || ''}
                                    onClick={() => {
                                        if (f.validForMap) setSelectedFleet(f);
                                    }}
                                >
                                    <td className="px-2 py-1">{f.rowNumber}</td>

                                    <td className="px-2 py-1 whitespace-nowrap">
                                        {f.hasName ? f.name : '-'}
                                    </td>

                                    <td className="px-2 py-1">
                                        {f.validForMap ? formatPoint(f.x1, f.y1) : '-'}
                                    </td>

                                    <td className="px-2 py-1">
                                        {f.validForMap && f.hasMidpoint
                                            ? formatPoint(f.x2, f.y2)
                                            : '-'}
                                    </td>

                                    <td className="px-2 py-1">
                                        {f.validForMap ? formatPoint(f.x3, f.y3) : '-'}
                                    </td>

                                    <td className="px-2 py-1">
                                        {f.validForMap ? f.range : '-'}
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