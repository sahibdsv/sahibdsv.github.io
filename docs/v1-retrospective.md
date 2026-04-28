# V1 Retrospective

This branch preserves the first full version of sahibvirdee.com before the clean-slate rebuild.

The goal of this document is to capture what the version did, what worked, what became fragile,
and what should be treated carefully when building the next version.

## What V1 Was

V1 was a static GitHub Pages portfolio backed by external content services.

The visible site lived mostly in:

- `index.html`
- `assets/css/style.css`
- `assets/js/app.js`
- `assets/js/three-viewer.js`
- `assets/js/csv_parser.js`

The content model depended on Google Sheets CSV exports and a Google Apps Script endpoint in
`gas/website.gs`. The site rendered as a client-side single-page app with hash routing.

## Core Experience

The site presented a personal portfolio for Sahib Virdee with:

- dark and light themes
- animated navigation and route transitions
- search across portfolio content
- spreadsheet-driven pages and cards
- resume content from a separate spreadsheet tab
- quote cards
- music-related cards and recent listening sections
- rich media blocks for images, videos, embeds, galleries, and links
- GPS art rendered through Mapbox
- GLB CAD/model previews rendered through Three.js
- feedback submission through the Apps Script backend

The overall appearance was strongest when it felt like a compact, high-polish portfolio system:
dark/light contrast, strong typography, media-first project cards, tactile navigation, and CAD
models that felt interactive instead of static.

## External Dependencies

V1 depended on several hosted services and CDN libraries:

- GitHub Pages for hosting
- Custom domain via `CNAME`: `sahibvirdee.com`
- Google Sheets published CSVs for main and resume data
- Google Apps Script for quotes and feedback
- Mapbox GL JS for GPS art
- Three.js from jsDelivr for GLB model rendering
- PhotoSwipe from jsDelivr for gallery/lightbox behavior
- Fuse.js for search
- Day.js for date handling
- Umami Analytics

These services made the site powerful without a build system, but they also pushed too much
application behavior into runtime glue.

## What Worked

- The portfolio could be updated through spreadsheet data instead of editing HTML.
- The single static deploy model kept hosting simple.
- The visual identity had a useful foundation: minimal, technical, dark-mode friendly, and media-rich.
- The GLB viewer made mechanical/CAD work feel alive and differentiated the site from a plain resume.
- The hash-router approach made deep links possible without server configuration.
- Local caching made repeat visits feel faster.
- The site accumulated a lot of domain-specific rendering support for projects, resume items, music,
  quotes, maps, videos, and embedded media.

## What Became Fragile

- Too much of the product lived in one very large `app.js`.
- Rendering, routing, parsing, data fetching, caching, media detection, and UI behavior were tightly coupled.
- The spreadsheet schema became an implicit CMS without a clear contract.
- Content parsing mixed markdown-like syntax, media detection, special cases, and display logic.
- The Apps Script backend and frontend drifted; for example, feedback auth expectations were unclear.
- SEO automation added a lot of churn and was later removed.
- Several optimizations were added reactively, especially around media and 3D performance.
- The 3D viewer became sophisticated but hard to reason about because performance, rendering, loading,
  cache management, and interaction were all intertwined.
- Debugging required remembering the history of patches instead of reading a clean architecture.

## Specific Technical Notes

### Frontend

`index.html` was mostly a shell. It loaded the CSS, runtime dependencies, `app.js`, and
`three-viewer.js`. The actual interface was created dynamically.

`assets/js/app.js` handled most of the site:

- application state
- Google Sheets fetches
- localStorage cache recovery
- route handling
- navigation rendering
- search overlay
- card rendering
- content block parsing
- media extraction
- image/video/embed/gallery rendering
- Mapbox initialization
- feedback submission
- resume rendering
- music and quotes rendering

This made the app easy to mutate quickly, but difficult to safely change later.

### 3D Viewer

`assets/js/three-viewer.js` implemented a custom shared-renderer Three.js pipeline.

It included:

- GLB loading through `GLTFLoader`
- Draco support
- global GLB cache
- concurrency limits
- shared WebGL renderer
- per-card canvas blitting
- mobile throttling
- hover-based rotation
- fullscreen handling
- visibility-based hibernation
- cleanup for stale viewers

This was one of the most technically interesting parts of V1, but it should be isolated behind a
small API in the rebuild.

### Backend

`gas/website.gs` handled:

- quote discovery through a `type=quotes` GET request
- feedback POSTs into a Google Sheet tab named `Variables`

The file also contained an `apiToken: 'CHANGE_ME'` placeholder. The frontend feedback submission
did not visibly append a token, so the deployed behavior should be verified before reusing this path.

## Rebuild Principles

For the next version:

- Keep the visual identity, not the old architecture.
- Start with static pages/components before rebuilding dynamic systems.
- Define a real content schema before choosing storage.
- Keep routing, data loading, content rendering, media rendering, and search as separate modules.
- Treat 3D as a standalone component with a small public interface.
- Avoid putting every feature into one global script.
- Avoid generated SEO commits and hidden automation unless the flow is documented and testable.
- Prefer fewer external services at first.
- Make feedback/contact behavior explicit and secure from the beginning.
- Keep deployment boring.

## Good V2 Starting Point

Start with:

- `CNAME`
- a minimal `index.html`
- a small stylesheet
- one or two hand-authored portfolio sections
- a simple project data file if dynamic rendering is actually needed
- no Apps Script until a backend is truly required
- no Google Sheets until the content schema is stable
- no Mapbox or Three.js until the base site feels good without them

The old version is useful as a reference library, not as a foundation.
