const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

// Read source files
const appCode = fs.readFileSync('assets/js/app.js', 'utf8');
const csvCode = fs.readFileSync('assets/js/csv_parser.js', 'utf8');

// Set up a mock browser environment context
const context = {
    window: {
        location: { href: '' },
        addEventListener: () => {},
        navigator: { userAgent: '' },
        history: { replaceState: () => {} },
        matchMedia: () => ({ matches: false, addEventListener: () => {} }),
        devicePixelRatio: 1
    },
    document: {
        getElementById: () => ({ addEventListener: () => {}, style: {} }),
        querySelector: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} }, addEventListener: () => {} }),
        querySelectorAll: () => [],
        documentElement: { style: {}, setAttribute: () => {} },
        addEventListener: () => {},
        createElement: () => ({ style: {}, classList: { add: ()=>{}, remove: ()=>{} } }),
        title: ""
    },
    CONFIG: { mapbox_token: '' },
    history: { replaceState: () => {} },
    location: { hash: '', search: '', pathname: '' },
    URLSearchParams: class { get() { return null; } },
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { clipboard: { writeText: () => Promise.resolve() }, userAgent: '' },
    DOMParser: class { parseFromString() { return { querySelector: () => ({ getAttribute: () => null }) }; } },
    PhotoSwipeLightbox: class { init() {} on() {} addFilter() {} },
    PhotoSwipe: class {},
    mapboxgl: { supported: () => false },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    Fuse: class { search() { return []; } },
    fetch: () => Promise.resolve({ text: () => Promise.resolve('') }),
    console: { log: () => {}, error: () => {}, warn: () => {} }, // Suppress logs
    module: { exports: {} }
};

vm.createContext(context);

// Load dependencies
vm.runInContext(csvCode, context);
if (context.module.exports.parseFullCSV) {
    context.parseFullCSV = context.module.exports.parseFullCSV;
}

// Load main app code
vm.runInContext(appCode, context);

const getDateRange = context.getDateRange;

// Run tests
console.log('Running tests for getDateRange...');

try {
    // ---- Happy Paths ----

    // 1. Full Year Range
    let res = getDateRange('2020-2021');
    assert.strictEqual(res.start.getFullYear(), 2020);
    assert.strictEqual(res.start.getMonth(), 0); // Jan
    assert.strictEqual(res.end.getFullYear(), 2021);
    assert.strictEqual(res.end.getMonth(), 11); // Dec

    // 2. Month and Year
    res = getDateRange('JAN 2022');
    assert.strictEqual(res.start.getFullYear(), 2022);
    assert.strictEqual(res.start.getMonth(), 0);
    assert.strictEqual(res.end.getFullYear(), 2022);
    assert.strictEqual(res.end.getMonth(), 0);

    // 3. Seasons
    res = getDateRange('FALL 25 - SPR 2026');
    assert.strictEqual(res.start.getFullYear(), 2025);
    assert.strictEqual(res.start.getMonth(), 8); // Fall starts Sep (index 8)
    assert.strictEqual(res.end.getFullYear(), 2026);
    assert.strictEqual(res.end.getMonth(), 4); // Spr ends May (index 4)

    // 4. ISO Date
    res = getDateRange('2026-01-03');
    assert.strictEqual(res.start.getFullYear(), 2026);
    assert.strictEqual(res.start.getMonth(), 0);
    assert.strictEqual(res.start.getDate(), 3);
    assert.strictEqual(res.end.getFullYear(), 2026);
    assert.strictEqual(res.end.getMonth(), 0);
    assert.strictEqual(res.end.getDate(), 3);

    // 5. Month Name Only
    res = getDateRange('DEC 2025');
    assert.strictEqual(res.start.getFullYear(), 2025);
    assert.strictEqual(res.start.getMonth(), 11);
    assert.strictEqual(res.end.getFullYear(), 2025);
    assert.strictEqual(res.end.getMonth(), 11);

    // ---- Error / Edge Paths ----

    // 6. Non-Date Strings
    assert.strictEqual(getDateRange('Fusion'), null);
    assert.strictEqual(getDateRange('SolidWorks'), null);
    assert.strictEqual(getDateRange('Random Tag'), null);
    assert.strictEqual(getDateRange('Hello World'), null);

    // 7. Empty/Falsy Inputs
    res = getDateRange('');
    assert.strictEqual(res.start.getTime(), new Date(0).getTime());
    assert.strictEqual(res.end.getTime(), new Date(8640000000000000).getTime());

    res = getDateRange(null);
    assert.strictEqual(res.start.getTime(), new Date(0).getTime());
    assert.strictEqual(res.end.getTime(), new Date(8640000000000000).getTime());

    res = getDateRange(undefined);
    assert.strictEqual(res.start.getTime(), new Date(0).getTime());
    assert.strictEqual(res.end.getTime(), new Date(8640000000000000).getTime());

    console.log('✅ All getDateRange tests passed successfully.');
} catch (e) {
    console.error('❌ Test failed:', e);
    process.exit(1);
}
