const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const code = fs.readFileSync('assets/js/app.js', 'utf8');

const context = {
    history: {},
    window: {
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {},
        location: { pathname: '' },
        innerHeight: 800,
        innerWidth: 600,
        scrollY: 0,
        mediaLoaded: () => {},
        mediaError: () => {}
    },
    document: {
        documentElement: { dataset: {} },
        addEventListener: () => {},
        getElementById: () => null,
        querySelectorAll: () => [],
        querySelector: () => null,
        body: { classList: { add: () => {}, remove: () => {} } },
        createElement: () => ({ classList: { add: () => {} }, style: {} })
    },
    navigator: { userAgent: '' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console: {
        log: () => {}, // silence the banner
        warn: () => {},
        error: () => {} // silence fetch error
    },
    URLSearchParams: class { get() { return null; } },
    IntersectionObserver: class { observe() {}; disconnect() {}; unobserve() {}; },
    MutationObserver: class { observe() {}; disconnect() {}; },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ json: async () => ({}), text: async () => '' }),
    PhotoSwipeLightbox: class { addFilter() {} init() {} on() {} },
    PhotoSwipe: class {},
    mapboxgl: { Map: class { on() {} }, NavigationControl: class {}, Marker: class { setLngLat() { return this; } addTo() {} } },
    parseFullCSV: () => []
};

// Include parseFullCSV so it doesn't throw later if promises resolve
const csvCode = fs.readFileSync('assets/js/csv_parser.js', 'utf8');
vm.createContext(context);
vm.runInContext(csvCode, context);
vm.runInContext(code, context);

const debounce = context.debounce;

// 2. Write tests
async function runTests() {
    let testsPassed = 0;
    let testsFailed = 0;

    function reportTest(name, passed, error) {
        if (passed) {
            console.info(`✅ ${name}`);
            testsPassed++;
        } else {
            console.error(`❌ ${name}`);
            if (error) console.error(error);
            testsFailed++;
        }
    }

    console.info('Running debounce tests...');

    // Test 1: Function is called after delay
    try {
        let called = false;
        const fn = debounce(() => { called = true; }, 10);
        fn();
        assert.strictEqual(called, false, 'Function should not be called immediately');

        await new Promise(resolve => setTimeout(resolve, 15));
        assert.strictEqual(called, true, 'Function should be called after delay');
        reportTest('Function is called after delay', true);
    } catch (e) {
        reportTest('Function is called after delay', false, e);
    }

    // Test 2: Function is called only once if triggered multiple times within delay
    try {
        let callCount = 0;
        const fn = debounce(() => { callCount++; }, 10);
        fn();
        fn();
        fn();

        await new Promise(resolve => setTimeout(resolve, 15));
        assert.strictEqual(callCount, 1, 'Function should be called exactly once');
        reportTest('Function is called only once when triggered multiple times quickly', true);
    } catch (e) {
        reportTest('Function is called only once when triggered multiple times quickly', false, e);
    }

    // Test 3: Function receives correct arguments
    try {
        let receivedArgs = null;
        const fn = debounce((...args) => { receivedArgs = args; }, 10);
        fn(1, 'test', { a: 1 });

        await new Promise(resolve => setTimeout(resolve, 15));
        assert.deepStrictEqual(receivedArgs, [1, 'test', { a: 1 }], 'Function should receive passed arguments');
        reportTest('Function receives correct arguments', true);
    } catch (e) {
        reportTest('Function receives correct arguments', false, e);
    }

    console.info(`\nResults: ${testsPassed} passed, ${testsFailed} failed.`);
    if (testsFailed > 0) process.exit(1);
}

runTests();
