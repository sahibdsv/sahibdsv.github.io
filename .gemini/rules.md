# Antigravity User Rules — Sahib's Portfolio

## Rule #1: Technical Source of Truth
- **Professional Communication**: Never use emojis in communication with the user, in console logs, or in documentation. Maintain an authoritative, professional, and technical tone at all times.
- **Ignore Knowledge Items (KIs)**: Never rely on historical "Knowledge Items" or "KIs" stored in the application's global cache (.gemini/antigravity/knowledge). These are often outdated snapshots and must NOT be used as technical source-of-truth.
- **No `!important` in CSS**: Always address styling issues at their root cause (specific selectors/hierarchy). Never use `!important` to override.
- **Read the Code**: Always perform fresh research by reading the actual current codebase (`index.html`, `assets/js/app.js`, `assets/js/three-viewer.js`, etc.) to understand the current mission, architecture, and feature set.
- **Truth over Memory**: The files in the active workspace represent the ONLY valid state of the project.

## Feature & Content Patterns
- **Extension-Based Hardware Detection**: This site avoids explicit type tags. It detects feature triggers based on file extensions:
  - `.glb` → Renders in the Three.js 3D Viewer.
  - `.geojson` (and suffixes like `-NW`) → Renders in the Mapbox Viewer.
  - `.mp4`, `.webm`, etc. → Renders as a Lazy-Loaded Video.
- **No Colon Tags**: Tags in the form `[Tag]: value` (e.g., `[GLB Model]:` or `[Map]:`) are **deprecated/removed**. Do not generate content using this syntax.
- **Curly Brace Dynamic Blocks**: These specific tags trigger dynamic API-driven components:
  - `{Top Artists}`: Renders a 3-item grid of most-played artists.
  - `{Top Songs}`: Renders a 3-item grid of all-time most-played tracks.
  - `{Fresh Favorites}`: Renders a 3-item grid of tracks currently in a "replay loop."
  - `{Recently Played}` or `{Recent Music}`: (Standard/Legacy) Renders the 3 most recently logged tracks.
  - `{Random Quote}`: Injects a randomized quote discovery card from the Quote API.
- **Path Resolution**: The system automatically maps extensions to folders (e.g., `.geojson` files are looked for in `assets/GPX/`).

## Music Hub High-Fidelity Standards
- **Aesthetic Branding**: All SVG logos (e.g., `Youtube_Music_icon.svg`) used as thumbnails must be **50% centered ghosts**.
  - Style: `width: 50%`, `object-fit: contain`, `opacity: 0.18`, and `grayscale(100%) brightness(0.7)`.
  - Hierarchy: Use high-res thumbnails when possible; fallback to ghosts only if no match.
- **Metadata Parity (The "Flip")**:
  - **Top Artists**: Main Title (**track**) = Artist Name. Subtitle (**artistVal**) = Top Song Title.
  - **Top Songs / Favorites**: Main Title (**track**) = Song Title. Subtitle (**artistVal**) = Artist Name.
  - **No Prefixes**: Never use prefixes like `Top: ` or `Top Artist`. Metadata should be clean and authoritative.
- **Quantified Self Integrity**:
  - **Stat Chips**: Only show play-count chips if the data is real and verified. **Never** show a "1 PLAY" placeholder for indie/manual links.
  - **Alignment**: Stat chips must be vertically centered relative to the artist name text.
- **Data Resilience**:
  - **Staggered Fetch**: Always use a **150ms stagger** when fetching from third-party services like NoEmbed to prevent 503 errors.
  - **Deduplication**: Never show the same song title twice in a single grid (especially in `{Top Artists}` where songs are "stolen" from history).
- **Unified Templates**: Always use `renderMusicCardHTML` as the single source of truth for music card layout.

## Cloud Backend Standards
- **Sheet ID Hard-Coding**: Avoid using `openById()` in Google Apps Script. Always use `SpreadsheetApp.getActiveSpreadsheet()` to ensure the script is "Bound" and resilient to URL/ID changes.
- **Handshake Feedback**: All API calls should return a consistent JSON structure (`{rows: []}` or `{items: []}`). If an error occurs, the backend should return an `{error: "..."}` object to allow the frontend to display helpful diagnostics.
- **Service Type Routing**: Use a single backend script for multiple features (Quotes, Music, etc.) by routing based on a query parameter (e.g., `?type=quotes`).

---

> [!IMPORTANT]
> This rule ensures the agent reflects the high-fidelity state of the code as it exists now, rather than how it existed in past versions.
