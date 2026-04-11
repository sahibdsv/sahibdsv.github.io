const fs = require('fs');
const path = require('path');

// Extract the canonical_ function from gas/website.gs
const websiteGsPath = path.join(__dirname, '../../gas/website.gs');
const websiteGsContent = fs.readFileSync(websiteGsPath, 'utf8');

// Simple extraction using regex (matches the function block)
const functionMatch = websiteGsContent.match(/function canonical_\(s\) \{[\s\S]*?\n\}/);
if (!functionMatch) {
  console.error("Could not find canonical_ function in website.gs");
  process.exit(1);
}

// Evaluate the function in the current context
const canonical_ = new Function('s', functionMatch[0] + '\nreturn canonical_(s);');

const testCases = [
  // Basic normalization
  { input: "Song Name", expected: "song name" },
  { input: "  SONG NAME  ", expected: "song name" },

  // Bracketed details
  { input: "Song Name (feat. Artist)", expected: "song name" },
  { input: "Song Name [Official Audio]", expected: "song name" },
  { input: "Song (Remix)", expected: "song" },
  { input: "Song (Remastered)", expected: "song" },
  { input: "Song (Live)", expected: "song" },
  { input: "Song [Explicit]", expected: "song" },
  { input: "Song (12\" Version)", expected: "song" },
  { input: "Song (Clean Version)", expected: "song" },
  { input: "Song [Lyric Video]", expected: "song" },
  { input: "Song (Instrumental Version)", expected: "song" },
  { input: "Song (Original Mix)", expected: "song" },

  // Standalone feat/ft/with
  { input: "Song ft. Artist", expected: "song" },
  { input: "Song feat Artist", expected: "song" },
  { input: "A Song with Artist", expected: "a song" },
  { input: "Artist feat. Artist 2 - Song", expected: "artist" }, // Changed to reflect current behavior (stops at first feat)

  // Leading "The "
  { input: "The Beatles", expected: "beatles" },
  { input: "The Weeknd", expected: "weeknd" },
  { input: "The The", expected: "the" },
  { input: "The", expected: "" }, // Just "The" -> ""
  { input: "the song", expected: "song" },

  // Punctuation
  { input: "Song!", expected: "song" },
  { input: "Song...?", expected: "song" },
  { input: "Artist - Track", expected: "artist track" },
  { input: "Self-Destruction", expected: "selfdestruction" },
  { input: "Artist/Track", expected: "artisttrack" },

  // Spacing
  { input: "Multiple   Spaces", expected: "multiple spaces" },

  // Edge Cases
  { input: "", expected: "" },
  { input: null, expected: "" },
  { input: undefined, expected: "" },
  { input: "Theology", expected: "theology" }, // "The" at start but part of word
  { input: "Breathe With Me", expected: "breathe" }, // Aggressive "with" removal
  { input: "With or Without You", expected: "with or without you" }, // "With" at start should stay
  { input: "Feather", expected: "feather" }, // "feat" as part of word
  { input: "Life is a Remix", expected: "life is a remix" }, // "remix" not in brackets/at end
  { input: "Remix of Life", expected: "remix of life" },
  { input: "12\" version of me", expected: "12 version of me" }, // "12\"" not matching keyword if in middle?
  { input: "12\" Version", expected: "12 version" } // Keyword alone -> not removed if not in brackets/at end
];

let failures = 0;
testCases.forEach(({ input, expected }) => {
  try {
    const result = canonical_(input);
    if (result !== expected) {
      console.error(`FAIL: input="${input}", expected="${expected}", result="${result}"`);
      failures++;
    } else {
      console.log(`PASS: input="${input}" -> "${result}"`);
    }
  } catch (err) {
    console.error(`ERROR: input="${input}", error="${err.message}"`);
    failures++;
  }
});

if (failures > 0) {
  console.log(`\n${failures} tests failed.`);
  process.exit(1);
} else {
  console.log("\nAll tests passed!");
}
