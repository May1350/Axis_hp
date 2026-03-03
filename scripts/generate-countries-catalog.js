/**
 * generate-countries-catalog.js
 *
 * Reads BACKGROUND_PATHS from world-map.js, computes the bounding-box centroid
 * for each country's SVG path, and writes data/countries-catalog.json.
 *
 * Run once:  node scripts/generate-countries-catalog.js
 */

const fs = require('fs');
const path = require('path');

// ── Read world-map.js source ──────────────────────────────────────
const src = fs.readFileSync(
    path.join(__dirname, '..', 'world-map.js'), 'utf8'
);

// Extract the BACKGROUND_PATHS array literal from the source
const match = src.match(/const BACKGROUND_PATHS\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
    console.error('Could not find BACKGROUND_PATHS in world-map.js');
    process.exit(1);
}

// Safe eval using Function constructor (array literal only, no side-effects)
// eslint-disable-next-line no-new-func
const paths = (new Function(`return ${match[1]}`))();

// ── Compute bounding box centroid for each SVG path ───────────────
function computeCentroid(d) {
    // Match all numeric coordinate pairs in the SVG path string
    // SVG path coords appear after M, L, C, etc. as comma/space-separated floats
    const numRegex = /-?[\d]+(?:\.[\d]+)?/g;
    const nums = d.match(numRegex);
    if (!nums || nums.length < 2) return { cx: 500, cy: 325 };

    const floats = nums.map(Number);
    // Even indices = X, odd indices = Y
    const xs = floats.filter((_, i) => i % 2 === 0);
    const ys = floats.filter((_, i) => i % 2 === 1);

    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    return {
        cx: Math.round((minX + maxX) / 2),
        cy: Math.round((minY + maxY) / 2),
    };
}

const catalog = paths.map(({ id, title, d }) => {
    const { cx, cy } = computeCentroid(d);
    return {
        iso: id,
        name: title,
        markerX: cx,
        markerY: cy,
        labelY: cy + 25,
    };
});

// Sort alphabetically by country name
catalog.sort((a, b) => a.name.localeCompare(b.name));

// ── Write output ──────────────────────────────────────────────────
const outPath = path.join(__dirname, '..', 'data', 'countries-catalog.json');
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf8');

console.log(`✅  Wrote ${catalog.length} countries to ${outPath}`);
