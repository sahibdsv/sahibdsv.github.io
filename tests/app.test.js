const fs = require('fs');
const assert = require('assert');

// Read app.js
const appJs = fs.readFileSync('assets/js/app.js', 'utf8');

// Extract the path conversion utility functions
const path2urlMatch = appJs.match(/const path2url = [^\n]+/);
const url2pathMatch = appJs.match(/const url2path = [^\n]+/);

if (!path2urlMatch || !url2pathMatch) {
    console.error("Failed to extract path2url or url2path functions from app.js");
    process.exit(1);
}

// Convert them from const to var so they enter the local scope upon evaluation
eval(path2urlMatch[0].replace('const ', 'var '));
eval(url2pathMatch[0].replace('const ', 'var '));

// Test Suite: path2url
function testPath2Url() {
    console.log("Testing path2url...");

    // Happy paths
    assert.strictEqual(path2url("Hello World"), "Hello_World");
    assert.strictEqual(path2url("My Project Path"), "My_Project_Path");
    assert.strictEqual(path2url("Already_Good"), "Already_Good");
    assert.strictEqual(path2url("NoSpacesHere"), "NoSpacesHere");

    // Edge cases
    assert.strictEqual(path2url("  "), "__");
    assert.strictEqual(path2url(""), "");

    // Error conditions / Invalid inputs
    assert.strictEqual(path2url(null), "");
    assert.strictEqual(path2url(undefined), "");

    // Type coercion (since ? prevents error, but replace is only on string)
    // Actually, the original function is: p => p?.replace(/ /g, '_') ?? ''
    // If it's a number, p.replace doesn't exist, it throws TypeError. Let's see if we should test that.

    console.log("✓ path2url tests passed");
}

// Test Suite: url2path
function testUrl2Path() {
    console.log("Testing url2path...");

    // Happy paths
    assert.strictEqual(url2path("Hello_World"), "Hello World");
    assert.strictEqual(url2path("My_Project_Path"), "My Project Path");
    assert.strictEqual(url2path("Already Good"), "Already Good");
    assert.strictEqual(url2path("NoUnderscoresHere"), "NoUnderscoresHere");

    // Edge cases
    assert.strictEqual(url2path("__"), "  ");
    assert.strictEqual(url2path(""), "");

    // Error conditions / Invalid inputs
    assert.strictEqual(url2path(null), "");
    assert.strictEqual(url2path(undefined), "");

    console.log("✓ url2path tests passed");
}

// Run tests
try {
    testPath2Url();
    testUrl2Path();
    console.log("\nAll tests passed successfully!");
} catch (error) {
    console.error("\nTest failed:", error.message);
    process.exit(1);
}
