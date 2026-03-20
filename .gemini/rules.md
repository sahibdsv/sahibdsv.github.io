# Antigravity User Rules — Sahib's Portfolio

## 🛑 Rule #1: Technical Source of Truth
- **Ignore Knowledge Items (KIs)**: Never rely on historical "Knowledge Items" or "KIs" stored in the application's global cache (`.gemini/antigravity/knowledge`). These are often outdated snapshots and must NOT be used as technical source-of-truth.
- **No `!important` in CSS**: Always address styling issues at their root cause (specific selectors/hierarchy). Never use `!important` to override.
- **Read the Code**: Always perform fresh research by reading the actual current codebase (`index.html`, `assets/js/app.js`, `assets/js/three-viewer.js`, etc.) to understand the current mission, architecture, and feature set.
- **Truth over Memory**: The files in the active workspace represent the ONLY valid state of the project.

## 🏗️ Feature & Content Patterns
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

---
> [!IMPORTANT]
> This rule ensures the agent reflects the high-fidelity state of the code as it exists *now*, rather than how it existed in past versions.
