const assert = require('assert');
const { parseFullCSV } = require('./csv_parser.js');

function runTests() {
    console.log("Running CSV Parser tests...");

    // Test 1: Basic CSV parsing
    assert.deepStrictEqual(
        parseFullCSV('a,b,c\n1,2,3'),
        [['a', 'b', 'c'], ['1', '2', '3']],
        'Basic CSV parsing failed'
    );

    // Test 2: Quotes and commas inside quotes
    assert.deepStrictEqual(
        parseFullCSV('a,"b,c",d\n1,"2,3",4'),
        [['a', 'b,c', 'd'], ['1', '2,3', '4']],
        'Parsing commas inside quotes failed'
    );

    // Test 3: Escaped quotes inside quotes
    assert.deepStrictEqual(
        parseFullCSV('a,"b""c",d\n1,"2""3",4'),
        [['a', 'b"c', 'd'], ['1', '2"3', '4']],
        'Parsing escaped quotes failed'
    );

    // Test 4: Newlines inside quotes
    assert.deepStrictEqual(
        parseFullCSV('a,"b\nc",d\n1,"2\r\n3",4'),
        [['a', 'b\nc', 'd'], ['1', '2\r\n3', '4']],
        'Parsing newlines inside quotes failed'
    );

    // Test 5: Trimming whitespace around unquoted fields
    assert.deepStrictEqual(
        parseFullCSV(' a , b , c \n 1 , 2 , 3 '),
        [['a', 'b', 'c'], ['1', '2', '3']],
        'Trimming whitespace failed'
    );

    // Test 6: Empty fields
    assert.deepStrictEqual(
        parseFullCSV('a,,c\n1,,3'),
        [['a', '', 'c'], ['1', '', '3']],
        'Empty fields failed'
    );

    // Test 7: Rows with <= 1 element are discarded
    assert.deepStrictEqual(
        parseFullCSV('a,b\nsingle\n1,2'),
        [['a', 'b'], ['1', '2']],
        'Filtering rows with <= 1 element failed'
    );

    // Test 8: Trailing comma behavior
    assert.deepStrictEqual(
        parseFullCSV('a,b,\n1,2,'),
        [['a', 'b', ''], ['1', '2', '']],
        'Trailing comma failed'
    );

    // Test 9: Carriage return + newline handling
    assert.deepStrictEqual(
        parseFullCSV('a,b\r\n1,2'),
        [['a', 'b'], ['1', '2']],
        'CRLF parsing failed'
    );

    console.log("All CSV Parser tests passed! 🎉");
}

runTests();
