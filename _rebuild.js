const fs = require('fs');

// 기존 all_paths.txt에서 추출
const raw = fs.readFileSync('all_paths.txt', 'utf8');
const regex = /<path\s+id="([^"]+)"\s+title="([^"]+)"\s+class="land-bg"\s+d="([^"]+)"\s*\/>/g;
const existing = {};
let m;
while ((m = regex.exec(raw)) !== null) {
    existing[m[1]] = { id: m[1], title: m[2], d: m[3] };
}
console.log('Existing paths: ' + Object.keys(existing).length);

// GeoJSON 변환 결과에서 누락 국가 추가
const converted = JSON.parse(fs.readFileSync('/tmp/complete_paths.json', 'utf8'));
let added = 0;
converted.forEach(c => {
    if (!existing[c.id] && c.id !== '-99' && c.id !== 'AQ') {
        existing[c.id] = c;
        added++;
        console.log('Added from GeoJSON: ' + c.id + ' (' + c.title + ')');
    }
});
console.log('Added ' + added + ' countries from GeoJSON');

const allCountries = Object.values(existing);
console.log('Total countries: ' + allCountries.length);

// Read current ACTIVE_PROJECTS
const currentJS = fs.readFileSync('world-map.js', 'utf8');
const activeMatch = currentJS.match(/const ACTIVE_PROJECTS = \[([\s\S]*?)\];/);
const activeContent = activeMatch ? activeMatch[1] : '';

// Build BACKGROUND_PATHS entries
let bgEntries = allCountries.map(p =>
    '  { id: "' + p.id + '", title: "' + p.title.replace(/"/g, '\\"') + '", d: "' + p.d + '" }'
).join(',\n');

// Build complete world-map.js
const lines = [];
lines.push('/**');
lines.push(' * AXIS World Map Component');
lines.push(' * Total background countries: ' + allCountries.length);
lines.push(' * ');
lines.push(' * USAGE:');
lines.push(' *   <div id="axis-world-map"></div>');
lines.push(' *   <script src="world-map.js"><' + '/script>');
lines.push(' * ');
lines.push(' * TO ADD A NEW PROJECT COUNTRY:');
lines.push(' *   1. Add entry to ACTIVE_PROJECTS with id, sectionId, label, markerX, markerY, labelY, d');
lines.push(' *   2. Copy d path from BACKGROUND_PATHS for the country');
lines.push(' *   3. Create matching <div id="sectionId"> in index.html');
lines.push(' */');
lines.push('');
lines.push('const ACTIVE_PROJECTS = [' + activeContent + '];');
lines.push('');
lines.push('const BACKGROUND_PATHS = [');
lines.push(bgEntries);
lines.push('];');
lines.push('');
lines.push('function renderAxisWorldMap() {');
lines.push('  const container = document.getElementById("axis-world-map");');
lines.push('  if (!container) return;');
lines.push('  const svgNS = "http://www.w3.org/2000/svg";');
lines.push('  const svg = document.createElementNS(svgNS, "svg");');
lines.push('  svg.setAttribute("class", "world-svg-detailed");');
lines.push('  svg.setAttribute("viewBox", "0 0 1008 650");');
lines.push('  svg.setAttribute("xmlns", svgNS);');
lines.push('');
lines.push('  const bgGroup = document.createElementNS(svgNS, "g");');
lines.push('  bgGroup.setAttribute("class", "map-background");');
lines.push('  const activeIds = new Set(ACTIVE_PROJECTS.map(p => p.id));');
lines.push('  BACKGROUND_PATHS.forEach(country => {');
lines.push('    if (activeIds.has(country.id)) return;');
lines.push('    const path = document.createElementNS(svgNS, "path");');
lines.push('    path.setAttribute("id", country.id);');
lines.push('    path.setAttribute("title", country.title);');
lines.push('    path.setAttribute("class", "land-bg");');
lines.push('    path.setAttribute("d", country.d);');
lines.push('    bgGroup.appendChild(path);');
lines.push('  });');
lines.push('  svg.appendChild(bgGroup);');
lines.push('');
lines.push('  ACTIVE_PROJECTS.forEach(project => {');
lines.push('    const g = document.createElementNS(svgNS, "g");');
lines.push('    g.setAttribute("class", "map-country");');
lines.push('    g.setAttribute("data-target", project.sectionId);');
lines.push('    g.style.cursor = "pointer";');
lines.push('    g.addEventListener("click", () => {');
lines.push('      const el = document.getElementById(project.sectionId);');
lines.push('      if (el) el.scrollIntoView({ behavior: "smooth" });');
lines.push('    });');
lines.push('    const shape = document.createElementNS(svgNS, "path");');
lines.push('    shape.setAttribute("id", project.id);');
lines.push('    shape.setAttribute("class", "country-shape");');
lines.push('    shape.setAttribute("d", project.d);');
lines.push('    g.appendChild(shape);');
lines.push('    const markerG = document.createElementNS(svgNS, "g");');
lines.push('    markerG.setAttribute("class", "map-marker-v2");');
lines.push('    const pulse = document.createElementNS(svgNS, "circle");');
lines.push('    pulse.setAttribute("class", "pulse");');
lines.push('    pulse.setAttribute("cx", project.markerX);');
lines.push('    pulse.setAttribute("cy", project.markerY);');
lines.push('    pulse.setAttribute("r", "8");');
lines.push('    markerG.appendChild(pulse);');
lines.push('    const core = document.createElementNS(svgNS, "circle");');
lines.push('    core.setAttribute("class", "core");');
lines.push('    core.setAttribute("cx", project.markerX);');
lines.push('    core.setAttribute("cy", project.markerY);');
lines.push('    core.setAttribute("r", "4");');
lines.push('    markerG.appendChild(core);');
lines.push('    g.appendChild(markerG);');
lines.push('    const label = document.createElementNS(svgNS, "text");');
lines.push('    label.setAttribute("x", project.markerX);');
lines.push('    label.setAttribute("y", project.labelY);');
lines.push('    label.setAttribute("class", "map-label");');
lines.push('    label.setAttribute("text-anchor", "middle");');
lines.push('    label.textContent = project.label;');
lines.push('    g.appendChild(label);');
lines.push('    svg.appendChild(g);');
lines.push('  });');
lines.push('  container.appendChild(svg);');
lines.push('}');
lines.push('');
lines.push('if (document.readyState === "loading") {');
lines.push('  document.addEventListener("DOMContentLoaded", renderAxisWorldMap);');
lines.push('} else {');
lines.push('  renderAxisWorldMap();');
lines.push('}');

const newJS = lines.join('\n');
fs.writeFileSync('world-map.js', newJS);
console.log('world-map.js rebuilt! Size: ' + (newJS.length / 1024).toFixed(1) + 'KB');
