const fs = require('fs');
const assert = require('assert');

// 1. Read and Evaluate the target file
const fileContent = fs.readFileSync('gas/website.gs', 'utf8');

// Global mock variables
global.WEBSITE_CONFIG = {
  tabName: 'Music',
  libraryTabName: 'Library',
  sourceLabel: 'YT Music - ScriptCat',
  dedupeThresholdSeconds: 60,
  headers: ['Source', 'Artist', 'Track', 'Link', 'Thumbnail'],
  sheetId: 'dummy_id'
};

// Create a function that creates a fresh SpreadsheetApp mock
function createSpreadsheetAppMock(mockSheet) {
  return {
    getActiveSpreadsheet: () => ({
      getSheetByName: (name) => {
        if (name === WEBSITE_CONFIG.tabName) {
          return mockSheet;
        }
        return null;
      }
    })
  };
}

// Evaluate the target script in the global context
eval(fileContent);

console.log("🧪 Testing getRecentMusic_()");

// Helper to run tests
function runTest(name, testFn) {
  try {
    testFn();
    console.log(`✅ [PASS] ${name}`);
  } catch (error) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(error);
    process.exit(1);
  }
}

// --- Test Cases ---

runTest('Happy Path: Returns recent music correctly mapped and in reverse order', () => {
  const dummyData = [
    ['Source1', 'Artist1', 'Track1', 'Link1', 'Thumb1'], // Row 2
    ['Source2', 'Artist2', 'Track2', 'Link2', 'Thumb2'], // Row 3
    ['Source3', 'Artist3', 'Track3', 'Link3', 'Thumb3'], // Row 4
    ['Source4', 'Artist4', 'Track4', 'Link4', 'Thumb4']  // Row 5
  ];

  const mockSheet = {
    getLastRow: () => dummyData.length + 1, // 1 header row + 4 data rows
    getRange: (startRow, col, numRows, numCols) => {
      // simulate Google Sheets 1-based index and header on row 1
      const startIndex = startRow - 2;
      const data = dummyData.slice(startIndex, startIndex + numRows);
      return {
        getValues: () => data
      };
    }
  };

  global.SpreadsheetApp = createSpreadsheetAppMock(mockSheet);

  // Get last 2
  const result = getRecentMusic_(2);

  assert.strictEqual(result.length, 2, 'Should return exactly 2 items');
  // Should be reversed, so Row 5 then Row 4
  assert.strictEqual(result[0].Artist, 'Artist4', 'First item should be the most recent (Artist4)');
  assert.strictEqual(result[1].Artist, 'Artist3', 'Second item should be Artist3');

  // Check mapping
  assert.deepStrictEqual(result[0], {
    Source: 'Source4',
    Artist: 'Artist4',
    Track: 'Track4',
    Link: 'Link4',
    Thumbnail: 'Thumb4'
  }, 'Object mapping should be correct based on Unified Spec Schedule');
});

runTest('Edge Case: Sheet is empty or only has headers (getLastRow <= 1)', () => {
  const mockSheet = {
    getLastRow: () => 1
  };
  global.SpreadsheetApp = createSpreadsheetAppMock(mockSheet);

  const result = getRecentMusic_(10);
  assert.deepStrictEqual(result, [], 'Should return an empty array when getLastRow is <= 1');
});

runTest('Edge Case: Tab not found', () => {
  global.SpreadsheetApp = createSpreadsheetAppMock(null);

  const result = getRecentMusic_(10);
  assert.deepStrictEqual(result, [], 'Should return an empty array when tab is not found');
});

runTest('Edge Case: Limit exceeds available rows', () => {
  const dummyData = [
    ['Source1', 'Artist1', 'Track1', 'Link1', 'Thumb1'], // Row 2
    ['Source2', 'Artist2', 'Track2', 'Link2', 'Thumb2'], // Row 3
  ];

  const mockSheet = {
    getLastRow: () => 3, // 1 header row + 2 data rows
    getRange: (startRow, col, numRows, numCols) => {
      assert.strictEqual(startRow, 2, 'startRow should not go below 2 (header row)');
      assert.strictEqual(numRows, 2, 'numRows should be exactly the number of available data rows');
      const startIndex = startRow - 2;
      return {
        getValues: () => dummyData.slice(startIndex, startIndex + numRows)
      };
    }
  };

  global.SpreadsheetApp = createSpreadsheetAppMock(mockSheet);

  const result = getRecentMusic_(10); // Requesting 10, but only 2 available

  assert.strictEqual(result.length, 2, 'Should return exactly 2 items');
  assert.strictEqual(result[0].Artist, 'Artist2', 'Should correctly reverse the available rows');
  assert.strictEqual(result[1].Artist, 'Artist1', 'Should correctly reverse the available rows');
});

console.log("✨ All tests passed!");
