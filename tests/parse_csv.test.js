const assert = require('assert');

// We need parseFullCSV in global scope for parseCSV to use
const { parseFullCSV } = require('../assets/js/csv_parser.js');
global.parseFullCSV = parseFullCSV;

// Require parseCSV from app.js
// We mock out browser globals before require because app.js has top-level executions
// that rely on DOM/browser presence.
global.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    location: { hash: '' },
    getSelection: () => ({ removeAllRanges: () => {} }),
    scrollTo: () => {}
};
global.document = {
    addEventListener: () => {},
    documentElement: { getAttribute: () => null, style: { setProperty: () => {} } },
    getElementById: (id) => {
        if (id === 'nav-stack') return { appendChild: () => {}, querySelectorAll: () => [] };
        if (id === 'search-overlay') return { classList: { remove: () => {} } };
        if (id === 'search-input') return { value: '', style: {}, blur: () => {}, addEventListener: () => {} };
        if (id === 'app') return { addEventListener: () => {}, style: {}, querySelectorAll: () => [] };
        return { classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }, children: [], remove: () => {}, querySelector: () => null, querySelectorAll: () => [], scrollWidth: 0, clientWidth: 0, style: {}, scrollTo: () => {} };
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => ({
        classList: { add: () => {}, remove: () => {} },
        style: {},
        setAttribute: () => {},
        addEventListener: () => {},
        appendChild: () => {},
        children: [],
        querySelectorAll: () => []
    }),
    head: { appendChild: () => {} },
    body: { classList: { remove: () => {} } }
};
global.history = {};
global.navigator = {};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.IntersectionObserver = class { observe() {} unobserve() {} };
global.ResizeObserver = class { observe() {} unobserve() {} };
global.PhotoSwipeLightbox = class { addFilter() {} init() {} };
global.PhotoSwipe = {};
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const { parseCSV } = require('../assets/js/app.js');

function runTests() {
    console.log("Running parseCSV tests...");

    try {
        // Test 1: Empty input or too few rows
        assert.deepStrictEqual(parseCSV(''), [], 'Empty string should return empty array');
        assert.deepStrictEqual(parseCSV('Header1,Header2\n'), [], 'Only header should return empty array');

        // Test 2: Standard CSV input
        const csvData = `Name,Age,Location
Alice,30,New York
Bob,25,London`;

        const expectedData = [
            { Name: 'Alice', Age: '30', Location: 'New York' },
            { Name: 'Bob', Age: '25', Location: 'London' }
        ];
        assert.deepStrictEqual(parseCSV(csvData), expectedData, 'Standard CSV parsing failed');

        // Test 3: Missing fields (should fallback to '')
        const csvDataMissing = `A,B,C\n1,,3`;
        const expectedDataMissing = [
            { A: '1', B: '', C: '3' }
        ];
        assert.deepStrictEqual(parseCSV(csvDataMissing), expectedDataMissing, 'Missing fields should default to empty string');

        // Test 4: Completely empty rows (should be filtered out)
        const csvDataEmptyRows = `Col1,Col2\nVal1,Val2\n,\nVal3,Val4`;
        const expectedDataEmptyRows = [
            { Col1: 'Val1', Col2: 'Val2' },
            { Col1: 'Val3', Col2: 'Val4' }
        ];
        assert.deepStrictEqual(parseCSV(csvDataEmptyRows), expectedDataEmptyRows, 'Empty rows should be filtered out');

        // Test 5: Headers with extra whitespace
        const csvDataWhitespace = `  Key 1  , Key 2 \nVal 1, Val 2 `;
        assert.deepStrictEqual(parseCSV(csvDataWhitespace), [{ 'Key 1': 'Val 1', 'Key 2': 'Val 2' }], 'Headers should be trimmed');

        console.log("✅ All tests passed successfully!");
    } catch (error) {
        console.error("❌ Test failed:");
        console.error(error);
        process.exit(1);
    }
}

runTests();
