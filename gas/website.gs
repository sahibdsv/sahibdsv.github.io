const WEBSITE_CONFIG = {
  tabName: 'Music',
  libraryTabName: 'Library',
  sourceLabel: 'YT Music - ScriptCat',
  dedupeThresholdSeconds: 60,
  headers: ['Source', 'Artist', 'Track', 'Link', 'Thumbnail'],
  sheetId: '1DD2Ax-XDGYBKuoe_ajqhIMUDBH0-pC2P4iHS_OpUDoQ'
};

/**
 * Handles incoming POST requests from ScriptCat/Tasker.
 */
function doPost(e) {
  Logger.log("doPost received: " + JSON.stringify(e));
  try {
    // --- Intercept Feedback Commands from Website ---
    if (e.parameter && (e.parameter.type === 'feedback' || e.parameter.category)) {
      Logger.log("Processing feedback: " + JSON.stringify(e.parameter));
      const category = e.parameter.category || "";
      const message = e.parameter.message || "";
      const path = e.parameter.path || "";
      
      const ss = SpreadsheetApp.openById(WEBSITE_CONFIG.sheetId);
      if (!ss) throw new Error("Could not open spreadsheet with ID: " + WEBSITE_CONFIG.sheetId);
      
      // Ensure the exact tab exists with the 4 demanded columns
      const sheet = ensureTab_(ss, "Variables", ["Timestamp", "Category", "Message", "Path"]);
      if (!sheet) throw new Error("Could not access or create 'Variables' sheet.");
      
      const timestamp = e.parameter.timestamp || new Date();
      sheet.appendRow([timestamp, category, message, path]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(WEBSITE_CONFIG.sheetId);
    let sheet = ensureTab_(ss, WEBSITE_CONFIG.tabName, WEBSITE_CONFIG.headers);
    
    // Normalization helper
    const norm = (s) => String(s || "").toLowerCase().trim();

    const artist = (data.artist || "").trim() || "Unknown Artist";
    const track = (data.track || "").trim() || "Unknown Track";
    let link = (data.link || "").trim();
    let thumbnail = (data.thumbnail || "").trim();
    const source = (data.source || "").trim() || WEBSITE_CONFIG.sourceLabel;
    
    // Tasker variable sanitization
    if (link === "null" || link === "undefined" || link.startsWith("%")) link = "";
    if (thumbnail === "null" || thumbnail === "undefined" || thumbnail.startsWith("%")) thumbnail = "";
    
    // --- METADATA ENRICHMENT & LIBRARY UPDATE ---
    const libSheet = ensureTab_(ss, WEBSITE_CONFIG.libraryTabName, ['Artist', 'Track', 'Link', 'Thumbnail']);
    const library = getLibraryMap_(libSheet);

    const libKey = `${fuzzyNorm_(artist)}|${fuzzyNorm_(track)}`;
    const known = library[libKey];

    if (!link || !thumbnail) {
      // Missing info? Use library if we have a match
      if (known) {
        if (!link) link = known.link;
        if (!thumbnail) thumbnail = known.thumb;
      }
    } else {
      // We HAVE info? Update the library if it's new or better
      // Use fuzzy check to see if we already know about this song
      if (!known || !known.link || !known.thumb) {
        updateLibraryEntry_(libSheet, artist, track, link, thumbnail);
      }
    }

    // --- HARD CONSECUTIVE DEDUPLICATION ---
    const finalLastRow = sheet.getLastRow();
    if (finalLastRow > 1 && !data.isReplay) {
      const lastRowVals = sheet.getRange(finalLastRow, 1, 1, 3).getValues()[0];
      // Indices for ['Source', 'Artist', 'Track']: 0: Source, 1: Artist, 2: Track
      if (fuzzyNorm_(lastRowVals[1]) === fuzzyNorm_(artist) && fuzzyNorm_(lastRowVals[2]) === fuzzyNorm_(track)) {
        return ContentService.createTextOutput(JSON.stringify({ status: "ignored", message: "Consecutive fuzzy duplicate." }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // --- DEDUPLICATION (Cache-based) ---
    const cache = CacheService.getScriptCache();
    // Cache on fuzzy identifier to prevent near-immediate re-logging of metadata variations
    const fArtist = fuzzyNorm_(artist);
    const fTrack = fuzzyNorm_(track);
    const cacheKey = `web_${fArtist.substring(0, 20)}_${fTrack.substring(0, 20)}`.replace(/\s/g, '_');
    
    if (cache.get(cacheKey) && !data.isReplay) {
        return ContentService.createTextOutput(JSON.stringify({ status: "ignored", message: "Fuzzy duplicate within cache threshold." }))
          .setMimeType(ContentService.MimeType.JSON);
    }
    cache.put(cacheKey, "true", WEBSITE_CONFIG.dedupeThresholdSeconds);

    // Final Append
    sheet.appendRow([source, artist, track, link, thumbnail]);
    
    // Refresh the public-facing cache immediately
    updateWebsiteCache_(ss);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", logged: `${artist} - ${track}`, enriched: !!known }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Serves Rewind data for the personal website.
 */
/**
 * Serves Music data for the personal website via a secure JSON endpoint.
 * Supports: ?action=rewind, ?action=recent, or default (both).
 */
function doGet(e) {
  try {
    // 1. QUOTES DISCOVERY (Unified Spec)
    if (e.parameter.type === 'quotes') {
      return handleQuotesRequest_();
    }

    // 2. WEBSITE HUB (Unified Spec)
    const props = PropertiesService.getScriptProperties();
    let cachedJson = props.getProperty('WEBSITE_DATA_CACHE');
    let shouldUpdate = !cachedJson || e.parameter.cacheBust === 'true' || e.parameter.type === 'recent';

    // Enforcement: 60-second TTL
    if (cachedJson && !shouldUpdate) {
      const parsed = JSON.parse(cachedJson);
      if (!parsed.updated) {
        shouldUpdate = true;
      } else {
        const ageSec = (Date.now() - new Date(parsed.updated).getTime()) / 1000;
        if (ageSec > 60) shouldUpdate = true;
      }
    }

    if (shouldUpdate) {
      cachedJson = JSON.stringify(updateWebsiteCache_());
    }

    return ContentService.createTextOutput(cachedJson)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles secure quotes discovery with server-side randomization.
 */
function handleQuotesRequest_() {
  const QUOTES_GID = '540861260';
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets().find(s => s.getSheetId().toString() === QUOTES_GID);
    if (!sheet) return JSON_ERROR_("The 'Quotes' sheet was not found in this spreadsheet.");
    
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    
    // Find column indices for Quote, Author, Source (resilient mapping)
    const find = (list) => {
      const lowerH = headers.map(h => String(h || "").toLowerCase());
      for (let k of list) {
        let idx = lowerH.indexOf(k.toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idx = {
      quote: find(['Quote', 'quote']),
      author: find(['Author', 'author']),
      source: find(['Source', 'source'])
    };

    // Convert to JSON objects with explicit Unified Schema keys
    const allQuotes = data.filter(r => r[idx.quote]).map(r => ({
      Quote: r[idx.quote],
      Author: r[idx.author] || "Unknown",
      Source: r[idx.source] || ""
    }));
    
    // Server-Side Randomization (Fisher-Yates)
    for (let i = allQuotes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuotes[i], allQuotes[j]] = [allQuotes[j], allQuotes[i]];
    }
    
    // Return discovery subset (Unified Spec Key: quotes)
    return ContentService.createTextOutput(JSON.stringify({
      quotes: allQuotes.slice(0, 50)
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function JSON_ERROR_(msg) {
  return ContentService.createTextOutput(JSON.stringify({ status: "error", error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Triggered on manual spreadsheet edits.
 */
function onEdit(e) {
  const sheetName = e.range.getSheet().getName();
  if (sheetName === WEBSITE_CONFIG.tabName) {
    updateWebsiteCache_();
  }
}

/**
 * Pre-calculates site data and stores it in Script Properties for sub-100ms API response.
 */
function updateWebsiteCache_() {
  const ss = SpreadsheetApp.openById(WEBSITE_CONFIG.sheetId);
  const logSheet = ss.getSheetByName(WEBSITE_CONFIG.tabName);
  if (!logSheet) return null;

  const allData = logSheet.getDataRange().getValues();
  if (allData.length <= 1) return { recent: [], rewind: {}, updated: new Date().toISOString() };

  const headers = allData[0];
  const rows = allData.slice(1);

  // 1. Calculate Global Stats & Playcounts once
  const rewind = getRewindDataFromRows_(rows, headers);

  // 2. Generate Recent List with embedded counts
  const recent = getRecentMusicFiltered_(rows, 30, rewind.allSongCounts);

  const data = {
    recent: recent,
    rewind: rewind,
    updated: new Date().toISOString()
  };
  
  const payload = JSON.stringify(data);
  PropertiesService.getScriptProperties().setProperty('WEBSITE_DATA_CACHE', payload);
  return data;
}

/**
 * Filtered version of recent music that includes play counts from a provided map.
 */
function getRecentMusicFiltered_(rows, limit, countMap) {
  // Grab the last X rows
  const subset = rows.slice(-limit).reverse();
  
  return subset.map(row => {
    const artist = row[1];
    const track = row[2];
    const key = `${canonical_(artist)}|${canonical_(track)}`;
    return {
      Source: row[0],
      Artist: artist,
      Track: track,
      Link: row[3],
      Thumbnail: row[4],
      PlayCount: countMap[key] || 1
    };
  });
}

/**
 * Fetches the most recently played tracks for cross-referencing and "Recently Played" display.
 */
function getRecentMusic_(limit = 30) {
  const activeSS = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = activeSS.getSheetByName(WEBSITE_CONFIG.tabName);
  if (!logSheet) return [];

  const lastRow = logSheet.getLastRow();
  if (lastRow <= 1) return [];

  const startRow = Math.max(2, lastRow - limit + 1);
  const numRows = lastRow - startRow + 1;
  const data = logSheet.getRange(startRow, 1, numRows, 5).getValues();
  
  // Unified Spec Schedule (Artist, Track, Thumbnail, Link, Source)
  return data.reverse().map(row => ({
    Source: row[0],
    Artist: row[1],
    Track: row[2],
    Link: row[3],
    Thumbnail: row[4]
  }));
}

/**
 * Calculates Rewind Statistics.
 */
function getRewindData(recentLimit = 500) {
  const ss = SpreadsheetApp.openById(WEBSITE_CONFIG.sheetId);
  const logSheet = ss.getSheetByName(WEBSITE_CONFIG.tabName);
  const data = logSheet.getDataRange().getValues();
  return getRewindDataFromRows_(data.slice(1), data[0], recentLimit);
}

function getRewindDataFromRows_(rows, headers, recentLimit = 500) {
  const col = {
    artist: findCol_(headers, ['Artist', 'artist']),
    track: findCol_(headers, ['Track', 'track', 'Song', 'song']),
    thumbnail: findCol_(headers, ['Thumbnail', 'thumbnail']),
    link: findCol_(headers, ['Link', 'link', 'URL', 'url'])
  };

  // FAILSENSOR: If crucial columns are missing, return early
  if (col.artist === -1 || col.track === -1) {
    return { error: `Missing music columns: Artist(${col.artist}), Track(${col.track})`, headers };
  }

  const artistStats = {};
  const songStats = {};
  const freshFavorites = {};
  
  // "Recent" boundary for Fresh Favorites
  const recentBoundary = Math.max(0, rows.length - recentLimit);
  
  rows.forEach((row, index) => {
    const rawThumb = col.thumbnail !== -1 ? String(row[col.thumbnail] || "").trim() : "";
    


    const rawArtist = String(row[col.artist] || "Unknown");
    const rawTrack = String(row[col.track] || "Unknown");
    
    // Use canonical versions for grouping/counting plays
    const canTrack = canonical_(rawTrack);
    const canArtist = canonical_(rawArtist);
    
    // 1. Primary Artist Aggregation
    if (canArtist) {
      if (!artistStats[canArtist]) {
        artistStats[canArtist] = { name: rawArtist, count: 0, thumbnail: "", songs: {} };
      }
      artistStats[canArtist].count++;
      if (rawThumb) artistStats[canArtist].thumbnail = rawThumb; // Use the most recent (last seen)
      
      // Preserve the "best" (most detailed) name for the artist
      if (rawArtist.length > artistStats[canArtist].name.length) {
        artistStats[canArtist].name = rawArtist;
      }
      
      // Track top song names for this artist specifically
      if (!artistStats[canArtist].songs[canTrack]) {
        artistStats[canArtist].songs[canTrack] = { name: rawTrack, count: 0, link: "", thumbnail: "" };
      }
      artistStats[canArtist].songs[canTrack].count++;
      const rawLink = col.link !== -1 ? String(row[col.link] || "") : "";
      if (rawLink) artistStats[canArtist].songs[canTrack].link = rawLink;
      if (rawThumb) artistStats[canArtist].songs[canTrack].thumbnail = rawThumb;
      
      // If we encounter a more detailed name for the same canonical song, use it
      if (rawTrack.length > artistStats[canArtist].songs[canTrack].name.length) {
        artistStats[canArtist].songs[canTrack].name = rawTrack;
      }
    }

    // Track counts per song (grouped by Artist + Title)
    const songKey = `${canArtist}|${canTrack}`;
    if (!songStats[songKey]) {
      songStats[songKey] = { artist: rawArtist, track: rawTrack, count: 0, thumbnail: "", link: "" };
    }
    songStats[songKey].count++;
    if (rawThumb) songStats[songKey].thumbnail = rawThumb;
    const rawLink = col.link !== -1 ? String(row[col.link] || "") : "";
    if (rawLink) songStats[songKey].link = rawLink;
    
    // Use most detailed names for the song stats
    if (rawArtist.length > songStats[songKey].artist.length) songStats[songKey].artist = rawArtist;
    if (rawTrack.length > songStats[songKey].track.length) songStats[songKey].track = rawTrack;

    // Fresh Favorites (only count in recent window)
    if (index >= recentBoundary) {
      if (!freshFavorites[songKey]) {
        freshFavorites[songKey] = { artist: rawArtist, track: rawTrack, count: 0, thumbnail: "", link: "" };
      }
      freshFavorites[songKey].count++;
      if (rawThumb) freshFavorites[songKey].thumbnail = rawThumb;
      if (rawLink) freshFavorites[songKey].link = rawLink;
      
      if (rawArtist.length > freshFavorites[songKey].artist.length) freshFavorites[songKey].artist = rawArtist;
      if (rawTrack.length > freshFavorites[songKey].track.length) freshFavorites[songKey].track = rawTrack;
    }
  });

  // Sort and Slice
  // Sort and Enrich Artists
  const topArtists = Object.values(artistStats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 50)
    .map(a => {
      const topSongByArtist = Object.values(a.songs).sort((s1, s2) => s2.count - s1.count)[0];
      return {
        Artist: a.name,
        PlayCount: a.count,
        Thumbnail: topSongByArtist ? topSongByArtist.thumbnail : a.thumbnail,
        Track: topSongByArtist ? topSongByArtist.name : null,
        Link: topSongByArtist ? topSongByArtist.link : null
      };
    });

  const topSongs = Object.values(songStats)
    .sort((a, b) => b.count - a.count)
    .map(s => ({
      Artist: s.artist,
      Track: s.track,
      PlayCount: s.count,
      Thumbnail: s.thumbnail,
      Link: s.link
    }))
    .slice(0, 50);

  const bestRecent = Object.values(freshFavorites)
    .sort((a, b) => b.count - a.count)
    .map(s => ({
      Artist: s.artist,
      Track: s.track,
      PlayCount: s.count,
      Thumbnail: s.thumbnail,
      Link: s.link
    }))
    .slice(0, 10);

  return {
    topArtists: topArtists.slice(0, 5),
    topSongs: topSongs.slice(0, 5),
    freshFavorites: bestRecent.slice(0, 5),
    totalPlays: rows.length,
    allSongCounts: Object.fromEntries(Object.entries(songStats).map(([k, v]) => [k, v.count])),
    generatedAt: new Date().toISOString()
  };
}

/**
 * Splits artist names with collaborators into individual names.
 */


/**
 * Retroactive Enrichment / AutoSheets Handler.
 */
function enrichRetroactively() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WEBSITE_CONFIG.tabName);
  const libSheet = ss.getSheetByName(WEBSITE_CONFIG.libraryTabName);
  if (!sheet || !libSheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;

  const targetRange = sheet.getRange(lastRow, 1, 1, 5);
  const targetRow = targetRange.getValues()[0];
  
  const artist = String(targetRow[1] || "").trim();
  const track = String(targetRow[2] || "").trim();
  let link = String(targetRow[3] || "").trim();
  let thumbnail = String(targetRow[4] || "").trim();
  
  if (link === "null" || link === "undefined" || link.startsWith("%")) link = "";
  if (thumbnail === "null" || thumbnail === "undefined" || thumbnail.startsWith("%")) thumbnail = "";

  const library = getLibraryMap_(libSheet);
  const libKey = `${fuzzyNorm_(artist)}|${fuzzyNorm_(track)}`;
  const known = library[libKey];

  // 1. Deduplicate AutoSheets double-entry (fuzzy)
  if (lastRow > 2) {
    const prevRow = sheet.getRange(lastRow - 1, 1, 1, 3).getValues()[0];
    const prevSource = prevRow[0];
    const prevArtist = prevRow[1];
    const prevTrack = prevRow[2];

    // Only deduplicate if the sources are DIFFERENT but the song is the SAME. 
    // This preserves loops from a single source while killing double-entry from multiple trackers.
    if (prevSource !== targetRow[0] && fuzzyNorm_(prevArtist) === fuzzyNorm_(artist) && fuzzyNorm_(prevTrack) === fuzzyNorm_(track)) {
      sheet.deleteRow(lastRow);
      return;
    }
  }

  // 2. Enrich or Update Library
  if ((!link || !thumbnail) && known) {
    link = known.link;
    thumbnail = known.thumb;
    targetRange.setValues([[targetRow[0], artist, track, link, thumbnail]]);
  } else if (link && thumbnail && (!known || !known.link)) {
    updateLibraryEntry_(libSheet, artist, track, link, thumbnail);
  }
}

/**
 * Full Repair: Rebuilds library from log and patches all log gaps.
 */
function repairWebsiteAPI() {
  const ss = SpreadsheetApp.openById(WEBSITE_CONFIG.sheetId);
  const logSheet = ss.getSheetByName(WEBSITE_CONFIG.tabName);
  const libSheet = ensureTab_(ss, WEBSITE_CONFIG.libraryTabName, ['Artist', 'Track', 'Link', 'Thumbnail']);
  
  const logData = logSheet.getDataRange().getValues();
  
  // Step 1: Scan whole log for BEST metadata versions (fuzzy keys)
  const masterLib = {};
  for (let i = 1; i < logData.length; i++) {
    const a = logData[i][1], t = logData[i][2], l = logData[i][3], th = logData[i][4];
    const key = `${fuzzyNorm_(a)}|${fuzzyNorm_(t)}`;
    const isValid = l && !String(l).startsWith("%") && String(l) !== "null";
    if (isValid && (!masterLib[key] || !masterLib[key].l)) {
       masterLib[key] = { a, t, l, th };
    }
  }

  // Step 2: Wipe and rewrite Library tab
  libSheet.clear();
  libSheet.appendRow(['Artist', 'Track', 'Link', 'Thumbnail']);
  libSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  const libRows = Object.values(masterLib).map(o => [o.a, o.t, o.l, o.th]);
  if (libRows.length) libSheet.getRange(2, 1, libRows.length, 4).setValues(libRows);

  // Step 3: Patch Logs
  const finalLog = logData.slice(1).map(row => {
    const key = `${fuzzyNorm_(row[1])}|${fuzzyNorm_(row[2])}`;
    if ((!row[3] || String(row[3]).startsWith("%")) && masterLib[key]) {
      return [row[0], row[1], row[2], masterLib[key].l, masterLib[key].th];
    }
    return row;
  });
  if (finalLog.length) logSheet.getRange(2, 1, finalLog.length, 5).setValues(finalLog);
  
  Logger.log(`Repair Complete. Library rebuilt with ${libRows.length} songs.`);
}

// --- HELPERS ---

function fuzzyNorm_(s) {
  if (!s) return "";
  // Just lowercase and trim to preserve original titles (including brackets) 
  // while still allowing for basic case-insensitive matching/deduplication.
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ensureTab_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getLibraryMap_(libSheet) {
  const data = libSheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const key = `${fuzzyNorm_(data[i][0])}|${fuzzyNorm_(data[i][1])}`;
    map[key] = { link: data[i][2], thumb: data[i][3] };
  }
  return map;
}

function canonical_(s) {
  if (!s) return "";
  let clean = String(s).toLowerCase();
  
  // 1. Remove bracketed details: "(feat. X)", "[Official Audio]", etc.
  const detailKeywords = [
    'feat', 'ft', 'with', 'remix', 'remastered', 'version', 'edit', 
    'mix', 'audio', 'lyric', 'video', 'explicit', 'clean', 
    'original', 'live', 'slowed', 'reverb', '12\"', 'instrumental'
  ];
  const detailRegex = new RegExp(`\\s*[\\(\\[].*?(?:${detailKeywords.join('|')}).*?[\\)\\]]`, 'gi');
  clean = clean.replace(detailRegex, "");

  // 2. Remove standalone "feat. X"
  clean = clean.replace(/\s+(?:feat|ft|with)\.?\s+.*$/gi, "");
  
  // 3. Remove "The " at the start
  if (clean.startsWith("the ")) clean = clean.substring(4);

  // 4. Remove punctuation
  clean = clean.replace(/[^\w\s]/gi, "");
  
  // 5. Normalise spacing
  return clean.replace(/\s+/g, " ").trim();
}

function updateLibraryEntry_(libSheet, artist, track, link, thumb) {
  const data = libSheet.getDataRange().getValues();
  const nArtist = fuzzyNorm_(artist);
  const nTrack = fuzzyNorm_(track);
  
  for (let i = 1; i < data.length; i++) {
    if (fuzzyNorm_(data[i][0]) === nArtist && fuzzyNorm_(data[i][1]) === nTrack) {
      libSheet.getRange(i + 1, 3, 1, 2).setValues([[link, thumb]]);
      return;
    }
  }
  libSheet.appendRow([artist, track, link, thumb]);
}

function findCol_(headers, list) {
  const lowerH = headers.map(h => String(h || "").toLowerCase());
  for (let k of list) {
    let idx = lowerH.indexOf(k.toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}
