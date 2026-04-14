const fs = require('fs');
const assert = require('assert');

// The app.js file assumes a browser environment (e.g., `history.scrollRestoration`).
// We will evaluate the code inside a mocked environment.

const code = fs.readFileSync('./assets/js/app.js', 'utf8');

// Create mock browser globals
const sandbox = {
    history: {},
    window: {},
    document: {
        createElement: () => ({ style: {} }),
        querySelectorAll: () => [],
        getElementById: () => null
    },
    navigator: { userAgent: '' },
    console: { log: () => {}, error: () => {}, warn: () => {} },
    setTimeout: () => {},
    clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
    location: { href: '', search: '' },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} }
};

// Evaluate the file within a context containing our mock globals
const vm = require('vm');
vm.createContext(sandbox);

try {
    vm.runInContext(code, sandbox);
} catch (e) {
    // Ignore execution errors caused by missing DOM features deeply nested
}

// Extract the function from the sandbox
const isImageURL = sandbox.isImageURL;

if (!isImageURL) {
    console.error('Could not extract isImageURL from sandbox.');
    process.exit(1);
}

// Define test cases
const testCases = [
    // Valid cases
    { url: 'image.jpg', expected: true, desc: 'Standard JPG' },
    { url: 'image.JPEG', expected: true, desc: 'Uppercase extension' },
    { url: 'image.png?v=123', expected: true, desc: 'PNG with query params' },
    { url: 'image.webp-thumb', expected: true, desc: 'WebP with thumb suffix' },
    { url: 'image.gif-loop', expected: true, desc: 'GIF with loop suffix' },
    { url: 'image.jpg-thumb?v=1', expected: true, desc: 'JPG with suffix and query param' },
    { url: 'image.mp4-autoplay', expected: false, desc: 'MP4 with autoplay suffix (mp4 is not in image list)' },
    { url: 'https://picsum.photos/200/300', expected: true, desc: 'Picsum photos URL' },
    { url: 'https://images.unsplash.com/photo-123', expected: true, desc: 'Unsplash images URL' },
    { url: 'https://source.unsplash.com/random', expected: true, desc: 'Source Unsplash URL' },
    { url: 'http://placehold.it/300x200', expected: true, desc: 'Placehold.it URL' },
    { url: 'http://example.com/800/600', expected: true, desc: 'Dimensions pattern URL' },

    // Invalid cases
    { url: 'video.mp4', expected: false, desc: 'MP4 file' },
    { url: 'document.pdf', expected: false, desc: 'PDF file' },
    { url: 'https://youtube.com/watch?v=123', expected: false, desc: 'YouTube URL' },
    { url: 'http://example.com/not-an-image', expected: false, desc: 'Random URL' },
    { url: 'image.jpg.exe', expected: false, desc: 'Fake extension after real extension' },
    { url: 'image.jpg.mp4', expected: false, desc: 'Video extension after image extension' },
    { url: 'script.js?img=image.jpg', expected: false, desc: 'Image extension in query param' },
    { url: '', expected: false, desc: 'Empty string' },
    { url: null, expected: false, desc: 'Null value' },
    { url: undefined, expected: false, desc: 'Undefined value' },
    { url: 'https://picsum.photos.evil.com/random', expected: false, desc: 'Spoofed CDN domain' }
];

// Run tests
let passed = 0;
let failed = 0;

console.log('🧪 Testing isImageURL heuristic...');

testCases.forEach(({ url, expected, desc }) => {
    try {
        let result;
        if (url == null) {
            try {
                result = isImageURL(url) || false;
            } catch (e) {
                result = false;
            }
        } else {
            result = isImageURL(url);
            result = result === true;
        }

        assert.strictEqual(result, expected);
        console.log(`✅ PASS: ${desc} ("${url}")`);
        passed++;
    } catch (e) {
        console.error(`❌ FAIL: ${desc} ("${url}")`);
        console.error(`   Expected ${expected}, got ${!expected}`);
        failed++;
    }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed.`);

if (failed > 0) {
    process.exit(1);
}
