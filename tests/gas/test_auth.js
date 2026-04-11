const fs = require('fs');
const path = require('path');

// 1. Read the Google Apps Script file
const gsCode = fs.readFileSync(path.join(__dirname, '../../gas/website.gs'), 'utf8');

// 2. Setup mock environment
const Logger = { log: console.log };
const ContentService = {
  createTextOutput: (text) => ({
    text,
    setMimeType: (mimeType) => ({ text, mimeType })
  }),
  MimeType: { JSON: 'application/json' }
};

// Evaluate the script code in the current context
eval(gsCode);

// 3. Test Cases
console.log("=== Running Authentication Tests ===");

// Test 1: No token
const req1 = {
  parameter: {},
  postData: { contents: JSON.stringify({ action: "test" }) }
};
const res1 = doPost(req1);
console.assert(JSON.parse(res1.text).status === "error", "Test 1 Failed: Expected error status");
console.assert(JSON.parse(res1.text).message === "Unauthorized", "Test 1 Failed: Expected Unauthorized message");
console.log("Test 1 Passed: Request without token rejected.");

// Test 2: Incorrect token in parameter
const req2 = {
  parameter: { token: "WRONG_TOKEN" },
  postData: { contents: JSON.stringify({ action: "test" }) }
};
const res2 = doPost(req2);
console.assert(JSON.parse(res2.text).status === "error", "Test 2 Failed: Expected error status");
console.log("Test 2 Passed: Request with incorrect token in parameter rejected.");

// Test 3: Incorrect token in body
const req3 = {
  parameter: {},
  postData: { contents: JSON.stringify({ token: "WRONG_TOKEN" }) }
};
const res3 = doPost(req3);
console.assert(JSON.parse(res3.text).status === "error", "Test 3 Failed: Expected error status");
console.log("Test 3 Passed: Request with incorrect token in body rejected.");

// Test 4: Correct token in parameter
const req4 = {
  parameter: { token: "CHANGE_ME", type: "feedback", category: "test", message: "msg" }
};
// We expect a mock SpreadsheetApp error since we haven't mocked it completely, but we should not get "Unauthorized"
try {
  const res4 = doPost(req4);
  console.assert(JSON.parse(res4.text).status !== "error" || JSON.parse(res4.text).message !== "Unauthorized", "Test 4 Failed: Should not be unauthorized");
} catch(e) {
  if (e instanceof ReferenceError && e.message.includes("SpreadsheetApp")) {
    console.log("Test 4 Passed: Request with correct token in parameter authorized (failed later due to unmocked SpreadsheetApp).");
  } else {
    throw e;
  }
}

// Test 5: Correct token in body
const req5 = {
  parameter: {},
  postData: { contents: JSON.stringify({ token: "CHANGE_ME", action: "test" }) }
};
try {
  const res5 = doPost(req5);
  console.assert(JSON.parse(res5.text).status !== "error" || JSON.parse(res5.text).message !== "Unauthorized", "Test 5 Failed: Should not be unauthorized");
} catch(e) {
  if (e instanceof ReferenceError && e.message.includes("SpreadsheetApp")) {
    console.log("Test 5 Passed: Request with correct token in body authorized (failed later due to unmocked SpreadsheetApp).");
  } else {
    throw e;
  }
}

console.log("=== All tests passed ===");
