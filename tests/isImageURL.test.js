const assert = require('assert');

// Full mocks required for app.js
global.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    location: { search: '' },
    mapboxgl: {},
    innerWidth: 1024,
    innerHeight: 768
};
global.document = {
    addEventListener: () => {},
    documentElement: { dataset: {} },
    querySelector: () => ({ addEventListener: () => {}, style: {}, classList: { add: () => {}, remove: () => {} } }),
    querySelectorAll: () => [],
    getElementById: () => ({ addEventListener: () => {}, style: {}, classList: { add: () => {}, remove: () => {} } }),
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
    location: { href: '' }
};
global.history = { scrollRestoration: 'auto', pushState: () => {}, replaceState: () => {} };
global.location = { search: '', pathname: '/' };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.fetch = () => Promise.resolve({ json: () => Promise.resolve({}), text: () => Promise.resolve('') });
global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

// Mock global classes used in app.js
global.PhotoSwipeLightbox = class { init() {} on() {} addFilter() {} };
global.PhotoSwipeVideoPlugin = class {};
global.PhotoSwipe = class {};
// Add dummy for missing function
global.parseFullCSV = () => [];

const { isImageURL } = require('../assets/js/app.js');

function runTests() {
    let passed = 0;
    let failed = 0;

    const validImages = [
        // Extensions
        'image.jpg',
        'image.jpeg',
        'image.png',
        'image.gif',
        'image.webp',
        'image.svg',
        'IMAGE.JPG', // Case insensitivity
        'path/to/image.png',
        'https://example.com/image.jpg',

        // Allowed modifiers
        'image.jpg?v=123',
        'image.jpg#hash',
        'image.jpg-thumb',
        'image.jpg-autoplay',
        'image.png-loop',
        'image.webp-nocontrols',

        // Allowed modifiers AND query string
        'image.jpg-thumb?v=123',

        // CDNs (ones explicitly matched in app.js regex)
        'https://picsum.photos/200/300',
        'http://images.unsplash.com/photo-123',
        'https://source.unsplash.com/random',
        'https://placehold.it/300x300',
        'https://placeholder.com/150',
        'https://via.placeholder.com/150',

        // Dimension patterns
        'https://example.com/200/300'
    ];

    const invalidImages = [
        'document.pdf',
        'script.js',
        'style.css',
        'page.html',
        'https://example.com/page.html',
        'https://example.com/',
        'https://example.com/image.jpg.exe', // The bug we fixed
        'not-an-image.txt',
        'https://youtube.com/watch?v=123',
        'image.jpg-invalidmodifier' // An invalid modifier
    ];

    console.log("Running valid image tests...");
    validImages.forEach(url => {
        try {
            assert.strictEqual(!!isImageURL(url), true, `Expected truthy for ${url}`);
            passed++;
        } catch (e) {
            console.error(`❌ FAILED: ${url} (Expected truthy, got falsy)`);
            failed++;
        }
    });

    console.log("\nRunning invalid image tests...");
    invalidImages.forEach(url => {
        try {
            assert.strictEqual(!!isImageURL(url), false, `Expected falsy for ${url}`);
            passed++;
        } catch (e) {
            console.error(`❌ FAILED: ${url} (Expected falsy, got truthy)`);
            failed++;
        }
    });

    console.log(`\nTest Summary: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
