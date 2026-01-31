let db = [], quotesDb = [], resumeDb = [], isSearchActive = false;

const CACHE_KEY = 'sahib_v1_cache';
const CACHE_EXPIRY = 3600000;


const CONFIG = {
    main_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv",
    quotes_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=540861260&single=true&output=csv",
    resume_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=1812444133&single=true&output=csv",
    custom_resume_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=1529790368&single=true&output=csv"
};

const init = () => {
    // HIDDEN RESUME GENERATOR LOGIC
    // If hash is #Professional/ResumeC, we SWAP the resume sheet source to the 'Superset' sheet
    // and Disable Caching to force fresh load
    if (window.location.hash.toLowerCase() === '#professional/resumec') {
        console.log("Entering Custom Resume Builder Mode");
        CONFIG.resume_sheet = CONFIG.custom_resume_sheet;
        localStorage.removeItem(CACHE_KEY); // Force reload
    }
    if (window.location.hash.toLowerCase() === '#demo' || window.location.hash.toLowerCase() === '#test') {
        console.log("Entering Demo Mode");
        loadDemoData();
        return;
    }

    // Safety: Unlock animations immediately if load fails
    setTimeout(() => document.body.classList.remove('no-transition'), 1000);

    loadFromCache().then(cached => {
        const isDraftMode = localStorage.getItem('preview_drafts') === 'true' || window.location.hostname === 'localhost';
        if (cached) {
            db = cached.main; quotesDb = cached.quotes; resumeDb = cached.resume || [];
            if (!isDraftMode) {
                db = db.filter(r => !r.Tags || !r.Tags.includes('Draft'));
                quotesDb = quotesDb.filter(r => !r.Tags || !r.Tags.includes('Draft'));
                // note: resume usually doesn't need draft filtering but consistency is good
            }
            startApp();
            // SWR: Fetch new data in background
            fetchDataAndCache().then(() => {
                if (!isDraftMode) {
                    db = db.filter(r => !r.Tags || !r.Tags.includes('Draft'));
                    quotesDb = quotesDb.filter(r => !r.Tags || !r.Tags.includes('Draft'));
                }
            });
        } else {
            fetchDataAndCache().then(() => {
                if (!isDraftMode) {
                    db = db.filter(r => !r.Tags || !r.Tags.includes('Draft'));
                    quotesDb = quotesDb.filter(r => !r.Tags || !r.Tags.includes('Draft'));
                }
                startApp();
            });
        }
    });
};

function startApp() {
    if (window.location.search) history.replaceState(null, null, window.location.pathname + window.location.hash);

    initApp();
    updateSEO(); // Inject Structured Data
    renderFooter();
    fetchGitHubStats();
    initImageZoomers();
    init3DActivityMonitor();



    requestAnimationFrame(() => {
        setTimeout(() => {
            document.body.classList.remove('no-transition');
            document.getElementById('main-header').classList.remove('no-transition');
            updatePadding();
        }, 50);
    });
}

async function loadFromCache() {
    try {
        const c = localStorage.getItem(CACHE_KEY);
        if (!c) return null;
        const parsed = JSON.parse(c);
        if (Date.now() - parsed.ts > CACHE_EXPIRY) return null;
        return parsed.data;
    } catch (e) { return null; }
}

async function fetchDataAndCache() {
    try {
        const [main, quotes, resume] = await Promise.all([
            fetchCSV(CONFIG.main_sheet),
            fetchCSV(CONFIG.quotes_sheet).catch(() => []),
            fetchCSV(CONFIG.resume_sheet).catch(() => [])
        ]);
        const cleanMain = main.filter(r => r.Title || r.Content || r.Page === 'Professional/Resume');

        // UNIFY: Merge Resume Data into Main DB with corrected Page
        // REVERTED to Separate Sheet per user request

        // Fallback: Virtual Row if no data found (Legacy)
        if (!cleanMain.find(r => r.Page === 'Professional/Resume')) {
            const resumeRow = {
                Title: "Resume",
                Page: "Professional/Resume",
                SectionType: "Virtual",
                Timestamp: ""
            };
            cleanMain.push(resumeRow);
        }

        db = cleanMain; quotesDb = quotes; resumeDb = resume; // Restore separate DB

        localStorage.setItem(CACHE_KEY, JSON.stringify({
            ts: Date.now(),
            data: { main: cleanMain, quotes: quotes, resume: resume }
        }));
        return [cleanMain, quotes, resume];
    } catch (e) {
        console.error("Fetch failed", e);
    }
}

function fetchCSV(u) {
    return new Promise((res, rej) => {
        if (typeof Papa === 'undefined') return rej(new Error("PapaParse library not loaded. Check your internet connection."));
        Papa.parse(u, {
            download: true, header: true, skipEmptyLines: true,
            complete: (r) => res(r.data),
            error: (e) => rej(new Error("CSV Error: " + e.message))
        });
    });
}

function safeHTML(html) {
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ADD_TAGS: ['iframe', 'blockquote'],
            ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height', 'target', 'referrerpolicy']
        });
    }
    return html;
}

/* --- ANALYTICS ENGINE --- */
const Analytics = {
    trackView: (path, title) => {
        // IGNORE LOCAL DEV OR MANUALLY IGNORED USERS
        if (location.hostname === 'localhost' || localStorage.getItem('analytics_ignore') === 'true') {
            console.log('Analytics Ignored (Dev/Local)');
            return;
        }

        // 1. GoatCounter
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({
                path: path,
                title: title,
                event: false,
            });
        }
        // 2. Umami
        if (window.umami && window.umami.track) {
            window.umami.track(props => ({ ...props, url: path, title: title }));
        }
    },
    trackEvent: (name, data = {}) => {
        if (location.hostname === 'localhost' || localStorage.getItem('analytics_ignore') === 'true') return;

        // Umami Events
        if (window.umami && window.umami.track) {
            window.umami.track(name, data);
        }
    }
};

function initApp() {
    handleRouting();
    window.addEventListener('hashchange', handleRouting);

    window.addEventListener('hashchange', function (e) {
        Analytics.trackView(
            location.pathname + location.search + location.hash,
            location.hash.substring(1) || 'Home'
        );
    });

    window.addEventListener('scroll', () => {
        const h = document.getElementById('main-header');
        const isScrolled = window.scrollY > 10;
        h.classList.toggle('scrolled', isScrolled);
    });

    window.addEventListener('touchmove', () => {
        document.getElementById('main-header').classList.add('scrolling');
    });

    document.addEventListener('click', (e) => {
        const overlay = document.getElementById('search-overlay');
        const controls = document.getElementById('search-controls');
        if (overlay.classList.contains('active') && !overlay.contains(e.target) && !controls.contains(e.target)) {
            closeSearch();
        }
    });

    document.getElementById('app').addEventListener('click', (e) => {
        if (e.target.closest('.refresh-btn')) {
            const quoteContainer = e.target.closest('.layout-quote');
            if (quoteContainer && !quoteContainer.classList.contains('loading')) {
                // Height Locking to prevent jump
                const currentHeight = quoteContainer.clientHeight;
                quoteContainer.style.height = currentHeight + 'px';

                quoteContainer.classList.add('loading');
                // Use CSS class for size, remove hardcoded inline height
                quoteContainer.innerHTML = `<div class="sk-box quote" style="height: 100% !important;"></div>`;

                setTimeout(() => {
                    renderQuoteCard(quoteContainer);
                    quoteContainer.classList.remove('loading');
                    quoteContainer.style.height = 'auto'; // Release lock
                }, 600);
            }
            e.stopPropagation(); return;
        }

        if (e.target.classList.contains('chip')) {
            e.stopPropagation();
            if (isSearchActive) closeSearch();
            const tag = e.target.getAttribute('data-tag');
            const date = e.target.getAttribute('data-date');
            if (date) window.location.hash = 'Filter:' + date;
            else if (tag) window.location.hash = 'Filter:' + tag;
            return;
        }

        if (e.target.closest('.stl-btn')) {
            e.stopPropagation();
            return;
        }

        const wrapper = e.target.closest('.embed-wrapper.stl');
        // Double Click to Fullscreen logic
        if (wrapper && e.detail === 2) {
            const btn = wrapper.querySelector('#btn-full');
            if (btn) btn.click();
        }



        const block = e.target.closest('.clickable-block');
        if (block && !e.target.classList.contains('chip')) {
            const link = block.getAttribute('data-link'), target = block.getAttribute('data-target');
            if (link) {
                if (target === '_blank') window.open(link, '_blank');
                else {
                    window.location.href = link;
                    if (isSearchActive) closeSearch();
                }
            }
        }
    });

    // GLOBAL CLICK LISTENER to untrap zoom
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.zoom-frame, .row-media.article-mode')) {
            const allZoomed = document.querySelectorAll('.zoomed');
            allZoomed.forEach(el => el.classList.remove('zoomed'));
        }
    });

    document.addEventListener('keydown', (e) => {
        const activeId = document.activeElement ? document.activeElement.id : '';
        const isSearchInput = activeId === 'search-input';

        // SEARCH SHORTCUTS (When Search Input is Active)
        if (isSearchInput) {
            if (e.key === 'Backspace' && document.getElementById('search-input').value === '') {
                closeSearch();
                return;
            }
            if (e.key === '/' || e.key === 'Escape') {
                e.preventDefault(); // Prevent '/' from being typed if closing
                closeSearch();
                return;
            }
        }

        // GLOBAL SHORTCUTS
        if ((e.key === '/' || (e.metaKey && e.key === 'k') || (e.ctrlKey && e.key === 'k')) && !isSearchActive && !isSearchInput) {
            e.preventDefault();
            toggleSearch();
        }
        if (e.key === 'Escape') {
            if (isSearchActive || document.getElementById('search-overlay').classList.contains('active')) {
                closeSearch();
            } else if (window.location.hash && window.location.hash !== '#Home') {
                resetToHome();
            }
        }
    });
}

function initImageZoomers() {
    // STATE for Pan Logic
    let activeContainer = null;
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;
    let initialX = 0, initialY = 0;
    let hasTouched = false; // Flag to ignore phantom mouse events on mobile

    // HELPER: Reset to specific mode
    const resetZoomState = (img, mode) => {
        if (mode === 'lens') {
            img.style.transform = 'scale(1.75)';
            img.style.transformOrigin = 'center center';
        } else {
            currentX = 0; currentY = 0;
            img.style.transformOrigin = 'center center';
            img.style.transform = `scale(1.75) translate(0px, 0px)`;
        }
    };

    // --- MOUSE LENS LOGIC ---
    const handleMouseLens = (e) => {
        const container = e.target.closest('.zoomed');
        if (!container || activeContainer || hasTouched) return;
        const img = container.querySelector('img');
        const rect = container.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        img.style.transformOrigin = `${x}% ${y}%`;
        img.style.transform = 'scale(1.75)';
    };

    const updateTransform = (img) => {
        img.style.transform = `scale(1.75) translate(${currentX}px, ${currentY}px)`;
    };

    const startDrag = (e, container) => {
        const img = container.querySelector('img');
        if (!img) return;

        hasTouched = true; // Disable mouse lens logic
        activeContainer = container;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        startX = clientX;
        startY = clientY;
        initialX = currentX; // Continue from previous position if re-grabbing
        initialY = currentY;

        // Lock origin for panning
        img.style.transition = 'none'; // DISABLE TRANSITION FOR DIRECT CONTROL
        img.style.transformOrigin = 'center center';
        updateTransform(img);
    };

    const doDrag = (e) => {
        if (!activeContainer) return;
        e.preventDefault();

        const img = activeContainer.querySelector('img');
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const dx = clientX - startX;
        const dy = clientY - startY;

        // Scale speed down slightly for control
        currentX = initialX + (dx / 1.75);
        currentY = initialY + (dy / 1.75);

        // CLAMPING (Keep image somewhat in view)
        // Limit to +/- (Container Size / 2) roughly
        const limitX = activeContainer.clientWidth * 0.4;
        const limitY = activeContainer.clientHeight * 0.4;

        currentX = Math.max(-limitX, Math.min(currentX, limitX));
        currentY = Math.max(-limitY, Math.min(currentY, limitY));

        updateTransform(img);
    };

    const endDrag = () => {
        if (activeContainer) {
            const img = activeContainer.querySelector('img');
            if (img) img.style.transition = ''; // RESTORE TRANSITION
        }
        activeContainer = null;
    };

    // GLOBAL LISTENERS
    document.addEventListener('mousemove', handleMouseLens);
    document.addEventListener('touchmove', doDrag, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    // CLICK HANDLER to Toggle Zoom & Reset Pan
    // We consolidate logic here to prevent conflicts
    document.addEventListener('click', (e) => {
        const container = e.target.closest('.zoom-frame, .row-media.article-mode');
        if (!container || e.target.closest('.stl-controls')) return;

        // IGNORE 3D Viewers
        if (container.querySelector('.embed-wrapper.stl')) return;

        // TOGGLE ZOOM DIRECTLY
        container.classList.toggle('zoomed');

        if (container.classList.contains('zoomed')) {
            // OPENED: Default to Lens state
            const img = container.querySelector('img');
            if (img) resetZoomState(img, 'lens');
            // Attach touch start for Hybrid Pan
            container.ontouchstart = (ev) => startDrag(ev, container);
        } else {
            // CLOSED: Cleanup
            container.ontouchstart = null;
            const img = container.querySelector('img');
            if (img) img.style.transform = '';
        }
    });
}

// --- 3D ACTIVITY MONITOR (Fixed) ---
function init3DActivityMonitor() {
    let activityTimer;
    const activate = (e) => {
        // Find closest 3D wrapper
        const wrapper = e.target.closest('.embed-wrapper.stl');

        // Only show controls if in article mode (not grid)
        if (wrapper && wrapper.closest('.article-mode')) {
            const controls = wrapper.querySelector('.stl-controls');
            if (controls) {
                controls.classList.add('visible');
                wrapper.classList.add('visible');

                clearTimeout(activityTimer);
                activityTimer = setTimeout(() => {
                    controls.classList.remove('visible');
                    wrapper.classList.remove('visible');
                }, 2500);
            }
        }
    };

    const app = document.getElementById('app');
    app.addEventListener('mousemove', activate);
    app.addEventListener('touchstart', activate);
    app.addEventListener('click', activate);
}

function renderNavigation(currentPath) {
    const container = document.getElementById('nav-stack');
    const h = document.getElementById('main-header');

    const parts = currentPath && currentPath !== 'Home' ? currentPath.split('/') : [];

    if (parts.length >= 3) h.classList.add('deep-nav');
    else h.classList.remove('deep-nav');

    const maxLevel = parts.length + 1;
    const activeRowIds = [];

    for (let level = 1; level <= maxLevel; level++) {
        const parentPath = level === 1 ? null : parts.slice(0, level - 1).join('/');
        const activeItem = parts.length >= level ? parts[level - 1] : null;

        let items = [];
        if (level === 1) {
            items = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer' && r.Page !== 'Home').map(r => r.Page.split('/')[0]).filter(x => x))].sort();
        } else {
            items = [...new Set(db.filter(r => r.Page && r.Page.startsWith(parentPath + '/')).map(r => r.Page.split('/')[level - 1]).filter(x => x))].sort();
        }

        if (items.length === 0) break;

        const rowId = `nav-row-${level}`;
        activeRowIds.push(rowId);

        let row = document.getElementById(rowId);
        const isNew = !row;

        if (isNew) {
            row = document.createElement('nav');
            row.id = rowId;
            row.className = `nav-row level-${level > 1 ? 'n' : '1'}`;
            if (!activeItem) row.scrollLeft = 50;
            container.appendChild(row);
        }

        let html = '';
        const basePath = parentPath ? parentPath + '/' : '';

        items.forEach(item => {
            const fullPath = basePath + item;
            const isActive = (item === activeItem);
            const linkClass = level === 1 ? 'nav-link' : 'sub-link';
            html += `<a href="#${fullPath}" class="${linkClass} fill-anim ${isActive ? 'active' : ''}" onclick="closeSearch()">${safeHTML(item)}</a>`;
        });

        if (row.innerHTML !== html) row.innerHTML = html;
        centerNavRow(row, isNew && !activeItem);
    }

    const currentRows = container.querySelectorAll('.nav-row');
    currentRows.forEach(r => {
        if (!activeRowIds.includes(r.id)) r.remove();
    });

    updatePadding();
}

function centerNavRow(row, triggerBounce) {
    if (!row) return;
    if (row.scrollWidth <= row.clientWidth + 5) return;

    const activeLink = row.querySelector('.active');

    if (activeLink) {
        const scrollTarget = activeLink.offsetLeft + (activeLink.offsetWidth / 2) - (row.clientWidth / 2);
        row.scrollTo({ left: scrollTarget, behavior: 'smooth' });
    } else if (triggerBounce) {
        requestAnimationFrame(() => {
            const middle = (row.scrollWidth - row.clientWidth) / 2;
            row.scrollTo({ left: middle, behavior: 'smooth' });
        });
    } else {
        const middle = (row.scrollWidth - row.clientWidth) / 2;
        row.scrollTo({ left: middle, behavior: 'smooth' });
    }
}

// RESIZE LISTENER: Re-center nav on orientation change/window resize
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        document.querySelectorAll('.nav-row').forEach(row => centerNavRow(row, false));
        updatePadding();
    }, 100);
});

function updatePadding() {
    const brandH = 36;
    const gap = 1;
    const rows = document.getElementById('nav-stack').querySelectorAll('.nav-row');

    let totalH = brandH + gap;
    rows.forEach(r => {
        const h = r.classList.contains('level-1') ? 26 : 24;
        totalH += h + gap;
    });
    document.body.style.paddingTop = (totalH + 10) + 'px';
}

function resetToHome() { closeSearch(); window.location.hash = ''; }
function closeSearch() {
    document.getElementById('search-overlay').classList.remove('active');
    document.body.classList.remove('search-active');
    const input = document.getElementById('search-input');
    const wasTyping = input.value !== '';
    input.value = '';
    input.blur();
    if (isSearchActive && wasTyping) {
        isSearchActive = false;
        handleRouting();
    }
    isSearchActive = false;
}

function toggleSearch() {
    const a = document.getElementById('search-overlay').classList.toggle('active');
    document.body.classList.toggle('search-active');
    if (a) setTimeout(() => document.getElementById('search-input').focus(), 100);
    else closeSearch();
}

function handleSearch(q) {
    if (!document.getElementById('search-overlay').classList.contains('active')) return;

    if (!q) {
        // RESTORE PAGE CONTENT INSTEAD OF SHOWING PLACEHOLDER
        isSearchActive = false;
        handleRouting(); // Rerender current page
        return;
    }
    isSearchActive = true;
    const t = q.toLowerCase();
    // SEARCH BOTH MAIN DB AND RESUME DB
    const allItems = db; // Start with Main DB

    // Search Main Content
    let res = allItems.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t)));

    // Search Resume DB (Deduped)
    const resumeMatch = resumeDb.some(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t)));

    if (resumeMatch) {
        // If match found in Resume content, look for the "Professional/Resume" entry in Main DB
        // This allows the user to control the Card appearance via CMS (Title, Content, Tags)
        const resumeCard = db.find(r => r.Page === 'Professional/Resume');

        // Only add if user has defined it in the Main Sheet AND it wasn't already found by the main search
        if (resumeCard && !res.includes(resumeCard)) {
            res.push(resumeCard);
        }
    }

    renderRows(res, `Search results for "${safeHTML(q)}"`, false, true, false, true);
}

function handleRouting() {
    if (isSearchActive) return;

    cleanup3DResources();

    const h = document.getElementById('main-header');
    if (h) h.classList.remove('scrolled');
    window.scrollTo(0, 0);

    let hash = window.location.hash.substring(1) || 'Home';

    if (hash === 'Index') { renderIndex(); return; }
    if (hash === 'Professional/Resume') { renderResume(); return; }

    // Custom Resume Routing with Hot-Swap
    if (hash.toLowerCase() === 'professional/resumec') {
        if (CONFIG.resume_sheet !== CONFIG.custom_resume_sheet) {
            CONFIG.resume_sheet = CONFIG.custom_resume_sheet;
            // Show loading indicator?
            document.getElementById('app').innerHTML = '<div class="sk-container"><div class="sk-box hero"></div></div>';
            fetchDataAndCache().then(() => renderResume());
            return;
        }
        renderResume();
        return;
    }

    renderNavigation(hash === 'Home' ? null : hash);

    if (hash.startsWith('Filter:')) { renderFiltered(decodeURIComponent(hash.split(':')[1])); }
    else { renderPage(hash); }
}

function renderFiltered(t) {
    // MATCH: YYYY-MM-DD or YYYY-MM
    const dateMatch = t.match(/^(\d{4})-(\d{2})(-\d{2})?$/);
    // MATCH: YYYYMM... (Raw)
    const rawMatch = t.match(/^(\d{4})(\d{2})/);

    let displayTitle = t;

    if (dateMatch) {
        const d = new Date(dateMatch[1], parseInt(dateMatch[2]) - 1, 1);
        const mo = d.toLocaleString('default', { month: 'short' }).toUpperCase();
        displayTitle = `${mo} ${dateMatch[1]}`;
    } else if (rawMatch) {
        const d = new Date(rawMatch[1], parseInt(rawMatch[2]) - 1, 1);
        const mo = d.toLocaleString('default', { month: 'short' }).toUpperCase();
        displayTitle = `${mo} ${rawMatch[1]}`;
    }

    const res = db.filter(r => {
        const dateStr = r.Timestamp || '';
        return (dateStr.startsWith(t)) || (r.Tags && r.Tags.includes(t));
    });
    renderRows(res, `Posts from ${safeHTML(displayTitle)}`, false, true, false, true);
}

function renderPage(p) {
    if (p === 'Home') { renderHome(); return; }
    const ex = db.filter(r => r.Page === p);
    const app = document.getElementById('app'); app.innerHTML = '';
    const isMainPage = !p.includes('/');

    if (ex.length > 0) { renderRows(ex, null, true, false, !isMainPage); }
    else if (childrenPagesCheck(p)) { }
    else {
        app.innerHTML = `<div class="layout-404"><h1>404</h1><h2>Data Not Found</h2><p>This page doesn't exist in the database yet.</p><a href="#" class="btn-primary" onclick="resetToHome()">Go Home</a></div>`;
        return;
    }
    if (isMainPage) {
        const childrenPages = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
        if (childrenPages.length > 0) {
            const overviewRows = childrenPages.map(childPage => db.find(r => r.Page === childPage)).filter(r => r);
            renderRows(overviewRows, null, true, true);
        }
    }
}

function childrenPagesCheck(p) {
    const childrenPages = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
    return childrenPages.length > 0;
}

function renderIndex() {
    renderNavigation(null);
    const app = document.getElementById('app');
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Index</h1></div><div class="section index-list"></div>';

    const list = app.querySelector('.index-list');
    const pages = [...new Set(db.map(r => r.Page).filter(p => p && p !== 'Home' && p !== 'Footer'))].sort();

    const groups = {};
    pages.forEach(p => {
        const cat = p.split('/')[0];
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
    });

    for (const [cat, items] of Object.entries(groups)) {
        let catClass = '';
        const cLower = cat.toLowerCase();
        if (cLower === 'projects') catClass = 'cat-projects';
        else if (cLower === 'professional') catClass = 'cat-professional';
        else if (cLower === 'personal') catClass = 'cat-personal';

        let html = `<div class="index-group ${catClass}"><h3>${cat}</h3>`;
        items.forEach(p => {
            const row = db.find(r => r.Page === p);
            const title = row ? row.Title : p.split('/').pop();
            const depth = p.split('/').length;
            const depthClass = depth > 1 ? `depth-${depth}` : '';

            html += `<a href="#${p}" class="index-link fill-anim ${depthClass}">
                                ${title} 
                             </a>`;
        });
        html += `</div>`;
        list.innerHTML += html;
    }
}

function renderHome() {
    const hr = db.filter(r => r.Page === 'Home');
    const app = document.getElementById('app'); app.innerHTML = '';
    renderRows(hr, null, true);

    // RECENTS: Deduplicate by Page to avoid multiple cards for one article
    // 1. Filter out Home/Footer
    const rawRecents = db.filter(r => r.Page && r.Page !== 'Home' && r.Page !== 'Footer');

    // 2. Group by Page and pick BEST representative (e.g. one with Tags/Media)
    const uniquePages = {};
    rawRecents.forEach(r => {
        if (!uniquePages[r.Page]) {
            uniquePages[r.Page] = r;
        } else {
            // If we already have one, should we swap?
            // Prefer rows that look like Cards (have Title + Content + Tags?)
            // Current heuristic: First found is usually fine, but sorting by timestamp puts newest row first.
            // If "Header" is a separate row, we might want the Card row.
            // Let's rely on the first one found being decent, or maybe prefer one with tags?
            const existing = uniquePages[r.Page];
            // If existing is just a 'Header' or 'Hero' and new one is 'Card', maybe swap?
            // For simplicity, let's trust the sort order or just distinct Page.
        }
    });

    // 3. Convert back to array
    const recents = Object.values(uniquePages)
        .sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0))
        .slice(0, 6);

    if (recents.length > 0) { renderRows(recents, "Recent Activity", true, true, false, true); }
}

// --- RESUME RENDERER ---
function processText(t, hiddenUrls) {
    if (!t) return '';

    const rawLines = t.split(/\n|<br>/);
    let output = [];

    let inCallout = false;
    let calloutData = { type: '', title: '', collapse: null, lines: [] };

    let inCodeBlock = false;
    let codeLang = '';

    let codeLines = [];

    let inMathBlock = false;
    let mathLines = [];

    let inListBlock = false;
    let listLines = [];


    const flushCallout = () => {
        if (!inCallout) return;

        const type = calloutData.type;
        const rawContent = calloutData.lines.join('\n');
        const lines = calloutData.lines.map(l => l.trim()).filter(l => l);

        // NEW: BUTTON
        if (type.startsWith('button') || type.startsWith('btn')) {
            const url = lines[0] || '#';
            const suffix = type.replace(/^(button|btn)[-:]?/, '').toLowerCase();
            const extraClass = suffix ? ' ' + suffix : '';
            output.push(`<a href="${url}" class="btn-pill${extraClass}" target="_blank">${safeHTML(calloutData.title)}</a>`);
            inCallout = false; calloutData = { type: '', title: '', collapse: null, lines: [] }; return;
        }
        // NEW: MODEL
        if (type === 'model' || type === '3d' || type === 'stl') {
            const url = lines[0];
            const color = lines[1] ? `data-color="${lines[1]}"` : '';
            if (url) output.push(`<div class="embed-wrapper stl" data-src="${url}" ${color}></div>`);
            inCallout = false; calloutData = { type: '', title: '', collapse: null, lines: [] }; return;
        }
        // NEW: STAT
        if (type === 'stat' || type === 'statistic') {
            const val = calloutData.title;
            const label = lines.join(' ');
            output.push(`<div class="stat-block"><div class="stat-number">${processSingleLine(val)}</div><div class="stat-label">${processSingleLine(label)}</div></div>`);
            inCallout = false; calloutData = { type: '', title: '', collapse: null, lines: [] }; return;
        }

        // 1. SMART BLOCK: COMPARE
        if (type === 'compare' || type === 'comparison') {
            const imgRegex = /!\[.*?\]\((.*?)\)|(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp))/gi;
            const matches = [...rawContent.matchAll(imgRegex)];
            let urls = matches.map(m => m[1] || m[2]).filter(u => u);

            if (urls.length < 2 && lines.length >= 2) {
                urls = [lines[0], lines[1]];
            }

            if (urls.length >= 2) {
                output.push(`
                            <div class="compare-container">
                                <img src="${urls[1].trim()}" class="compare-img compare-after">
                                <img src="${urls[0].trim()}" class="compare-img">
                                <div class="compare-handle"></div>
                                <input type="range" min="0" max="100" value="50" class="compare-slider" oninput="this.parentElement.style.setProperty('--pos', this.value + '%')">
                            </div>`);
                inCallout = false;
                calloutData = { type: '', title: '', collapse: null, lines: [] };
                return;
            }
        }

        // 2. SMART BLOCK: GALLERY
        if (type === 'gallery' || type === 'grid') {
            const imgRegex = /!\[.*?\]\((.*?)\)|(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp))/gi;
            const matches = [...rawContent.matchAll(imgRegex)];
            const urls = matches.map(m => m[1] || m[2]).filter(u => u);

            if (urls.length > 0) {
                const imgs = urls.map(u => `<div class="zoom-frame"><img src="${u}" loading="lazy" alt="Gallery"></div>`).join('');
                output.push(`<div class="inline-gallery">${imgs}</div>`);
                inCallout = false;
                calloutData = { type: '', title: '', collapse: null, lines: [] };
                return;
            }
        }

        // 3. SMART BLOCK: TIMELINE
        // 3. SMART BLOCK: TIMELINE
        if (type === 'timeline') {
            let timelineItems = '';
            let lastDate = '';
            let lastContent = '';

            const flushItem = () => {
                if (lastDate || lastContent) {
                    timelineItems += `<div class="timeline-item"><div class="timeline-date">${lastDate}</div><div class="timeline-content">${processText(lastContent, hiddenUrls)}</div></div>`;
                }
            };

            calloutData.lines.forEach(line => {
                const clean = line.replace(/^[->\s*]+/, '').trim();
                if (!clean) return;

                // Check for New Item (Hyphen separated)
                const parts = clean.split(/ - | � /);
                if (parts.length >= 2) {
                    // New Item found - flush previous
                    flushItem();
                    lastDate = parts[0].trim();
                    lastContent = parts.slice(1).join(' - ').trim();
                } else {
                    // Continuation of previous
                    if (lastContent) lastContent += '<br>' + clean;
                    else if (lastDate) lastContent = clean; // Found content for date without hyphen? content first?
                    else lastContent = clean; // Orphan text
                }
            });
            flushItem(); // Final flush

            if (timelineItems) {
                output.push(`<div class="timeline-block">${timelineItems}</div>`);
            }
            // Prevent fallback to standard callout even if empty
            inCallout = false;
            calloutData = { type: '', title: '', collapse: null, lines: [] };
            return;
        }

        // 4. SMART BLOCK: TOC
        if (type === 'toc' || type === 'tableofcontents') {
            output.push(`<div class="toc-placeholder"></div>`);
            inCallout = false;
            calloutData = { type: '', title: '', collapse: null, lines: [] };
            return;
        }

        // 5. SMART BLOCK: CHART
        if (type === 'chart') {
            let chartType = 'bar';
            let labels = '';
            let values = '';
            let title = calloutData.title || '';

            rawContent.split('\n').forEach(line => {
                const l = line.trim();
                if (l.toLowerCase().startsWith('type:')) chartType = l.substring(5).trim();
                else if (l.toLowerCase().startsWith('labels:')) labels = l.substring(7).trim();
                else if (l.toLowerCase().startsWith('data:') || l.toLowerCase().startsWith('values:')) values = l.substring(l.indexOf(':') + 1).trim();
                else if (l.toLowerCase().startsWith('title:')) title = l.substring(6).trim();
            });

            labels = labels.replace(/,\s*/g, '||');
            values = values.replace(/,\s*/g, '||');

            if (values) {
                const id = `chart-${Math.random().toString(36).substr(2, 9)}`;
                output.push(`
                            <div class="chart-wrapper" style="position:relative; height:300px; width:100%; max-width:600px; margin:20px auto;">
                                <canvas id="${id}" class="smart-chart" 
                                    data-type="${chartType}" 
                                    data-labels="${labels}" 
                                    data-values="${values}" 
                                    data-title="${title}">
                                </canvas>
                            </div>
                        `);
                inCallout = false;
                calloutData = { type: '', title: '', collapse: null, lines: [] };
                return;
            }
        }

        // 6. STANDARD CALLOUT
        const iconSvg = getCalloutIcon(calloutData.type);
        const contentText = calloutData.lines.join('\n');
        let content = processLineArray(calloutData.lines, hiddenUrls);

        const titleTag = calloutData.type === 'note' || calloutData.type === 'tip' ? 'h4' : 'h5';
        const displayTitle = calloutData.title ? `<span class="callout-title-text">${safeHTML(calloutData.title)}</span>` : `<span class="callout-title-text">${calloutData.type.toUpperCase()}</span>`;

        const tag = 'div';
        const collapseAttr = calloutData.collapse ? `onclick="this.classList.toggle('collapsed')"` : '';
        const collapseClass = calloutData.collapse === '-' ? 'collapsed' : '';

        output.push(`
                    <${tag} class="callout ${calloutData.type} ${collapseClass}" ${collapseAttr} data-callout="${calloutData.type}">
                        <${titleTag} class="callout-title">
                            <div class="callout-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg></div>
                            <div class="callout-title-inner">${displayTitle}</div>
                        </${titleTag}>
                        <div class="callout-content">${content}</div>
                    </${tag}>
                `);
        inCallout = false;
        calloutData = { type: '', title: '', collapse: null, lines: [] };
    };

    const flushCode = () => {
        if (!inCodeBlock) return;
        const codeContent = codeLines.join('\n').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (codeLang === 'mermaid') {
            output.push(`<div class="mermaid">${codeContent}</div>`);
        } else {
            output.push(`<pre><code class="${codeLang}">${codeContent}</code></pre>`);
        }

        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
    };

    const flushMath = () => {
        if (!inMathBlock) return;
        const mathContent = mathLines.join('\n');
        // Wrap in $$ to ensure MathJax finds it as a block, prevent MD parsing internally
        output.push(`$$ \n${mathContent}\n $$`);
        inMathBlock = false;
        mathLines = [];
    };

    const flushList = () => {
        if (!inListBlock) return;

        let html = '';
        let stack = []; // Stores indentation levels

        listLines.forEach(line => {
            const match = line.match(/^(\s*)-\s+(.*)/);
            if (!match) return;

            const indent = match[1].length;
            const content = processSingleLine(match[2].trim(), hiddenUrls);

            // Push/Pop logic
            if (stack.length === 0) {
                html += '<ul>';
                stack.push(indent);
            } else {
                const lastIndent = stack[stack.length - 1];
                if (indent > lastIndent) {
                    html += '<ul>';
                    stack.push(indent);
                } else if (indent < lastIndent) {
                    while (stack.length > 0 && stack[stack.length - 1] > indent) {
                        html += '</ul>';
                        stack.pop();
                    }
                }
            }
            html += `<li>${content}</li>`;
        });

        while (stack.length > 0) {
            html += '</ul>';
            stack.pop();
        }

        output.push(html);
        inListBlock = false;
        listLines = [];
    };

    for (let i = 0; i < rawLines.length; i++) {
        let line = rawLines[i].trimEnd();

        // MATH BLOCK
        if (line.trim() === '$$') {
            if (inMathBlock) { flushMath(); }
            else {
                if (inCallout) flushCallout();
                inMathBlock = true;
            }
            continue;
        }
        if (inMathBlock) {
            mathLines.push(line);
            continue;
        }

        // CODE BLOCK
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) { flushCode(); }
            else {
                if (inCallout) flushCallout();
                inCodeBlock = true;
                codeLang = line.trim().substring(3).trim().toLowerCase();
            }
            continue;
        }
        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        // SHORTCODE: CHART [chart:type:labels:values:title]
        if (line.trim().startsWith('[chart:')) {
            const content = line.trim().substring(7, line.trim().length - 1);
            const parts = content.split(':');
            if (parts.length >= 3) {
                const type = parts[0];
                const labels = parts[1].replace(/,/g, '||');
                const values = parts[2].replace(/,/g, '||');
                const title = parts[3] || '';
                const id = `chart-${Math.random().toString(36).substr(2, 9)}`;

                output.push(`
                            <div class="chart-wrapper" style="position:relative; height:300px; width:100%; max-width:600px; margin:20px auto;">
                                <canvas id="${id}" class="smart-chart" 
                                    data-type="${type}" 
                                    data-labels="${labels}" 
                                    data-values="${values}" 
                                    data-title="${title}">
                                </canvas>
                            </div>
                        `);
                continue;
            }
        }

        // SHORTCODE: COMPARE [compare:url1:url2]
        if (line.trim().startsWith('[compare:')) {
            const content = line.trim().substring(9, line.trim().length - 1);
            const urls = content.split(/:(?=http)/); // Split by colon lookahead http
            if (urls.length >= 2) {
                output.push(`
                            <div class="compare-container" style="--pos:50%">
                                <img src="${urls[1].trim()}" class="compare-img compare-after">
                                <img src="${urls[0].trim()}" class="compare-img">
                                <div class="compare-handle"></div>
                                <input type="range" min="0" max="100" value="50" class="compare-slider" oninput="this.parentElement.style.setProperty('--pos', this.value + '%')">
                            </div>`);
                continue;
            }
        }

        // TABLES
        if (line.trim().startsWith('|') && i + 1 < rawLines.length) {
            const nextLine = rawLines[i + 1].trim();
            if (nextLine.match(/^\|?[\s-:\\|]+\|?$/)) {
                if (inCallout) flushCallout();

                let tableLines = [];
                while (i < rawLines.length && rawLines[i].trim().startsWith('|')) {
                    tableLines.push(rawLines[i].trim());
                    i++;
                }
                i--; // Backtrack

                let html = '<div class="table-wrapper"><div class="copy-table-btn" onclick="copyTable(this)">Copy CSV</div><table>';
                // Header
                const hParts = tableLines[0].split('|').filter(x => x.trim() !== '');
                html += `<thead><tr>${hParts.map(h => `<th>${h.trim()}</th>`).join('')}</tr></thead><tbody>`;

                // Rows (Skip separator)
                for (let j = 2; j < tableLines.length; j++) {
                    const cells = tableLines[j].split('|');
                    // Handle leading/trailing empty if pipe style used
                    let cleanCells = [];
                    // Basic heuristic: if match count implies wrapping pipes
                    if (tableLines[j].trim().startsWith('|')) cells.shift();
                    if (tableLines[j].trim().endsWith('|')) cells.pop();

                    html += `<tr>${cells.map(c => `<td>${processSingleLine(c.trim(), hiddenUrls)}</td>`).join('')}</tr>`;
                }
                html += '</tbody></table></div>';
                output.push(html);
                continue;
            }
        }

        // HEADERS (Basic)
        const headerMatch = line.trim().match(/^(#{1,6})\s+(.*)$/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const text = headerMatch[2];
            output.push(`<h${level} class="fill-anim">${processSingleLine(text, hiddenUrls)}</h${level}>`);
            continue;
        }

        // LIST BLOCK (Redesigned)
        if (line.match(/^(\s*)-\s+(.*)/) && !line.trim().startsWith('- [')) {
            if (inCallout) flushCallout();
            if (inCodeBlock) flushCode();
            if (inMathBlock) flushMath();

            inListBlock = true;
            listLines.push(line);
            continue;
        }

        if (inListBlock) {
            // Continue list if line matches list pattern OR is just indented text (continuation)
            // For simplicity, strict list pattern for now or indented non-empty
            if (line.match(/^(\s*)-\s+(.*)/) || (line.trim() !== '' && line.match(/^\s+/))) {
                listLines.push(line);
                continue;
            } else {
                flushList();
            }
        }

        // HR
        if (line.trim() === '---') {
            output.push('<hr>');
            continue;
        }

        // CALLOUT START: > [!type]+ Title
        const calloutMatch = line.trim().match(/^>\s*\[!([\w-:]+)\]([-+]?)\s*(.*)$/);

        if (calloutMatch) {
            flushCallout();
            inCallout = true;
            calloutData.type = calloutMatch[1].toLowerCase();
            calloutData.collapse = calloutMatch[2] || null;
            calloutData.title = calloutMatch[3].trim();
            continue;
        }

        // INSIDE CALLOUT
        if (inCallout && line.trim().startsWith('>')) {
            calloutData.lines.push(line.trim().replace(/^>\s?/, ''));
            continue;
        }

        if (inCallout) {
            // LAZY BUTTON FIX: Allow link on next line without '>'
            if ((calloutData.type.startsWith('btn') || calloutData.type.startsWith('button')) && calloutData.lines.length === 0 && line.trim()) {
                calloutData.lines.push(line.trim());
                continue;
            }
            flushCallout();
        }

        output.push(processSingleLine(line.trim(), hiddenUrls));
    }

    if (inCallout) flushCallout();
    if (inCodeBlock) flushCode();
    if (inCallout) flushCallout();
    if (inCodeBlock) flushCode();
    if (inMathBlock) flushMath();
    if (inListBlock) flushList();

    return output.join('<br>').replace(/<\/li><br><li/g, '</li><li'); // Fix list spacing
}

function processLineArray(lines, hiddenUrls) {
    return lines.map(l => processSingleLine(l, hiddenUrls)).join('<br>');
}

function processSingleLine(trimmed, hiddenUrls) {
    if (!trimmed) return '';

    // PROTECT MATH (LATEX)
    // We temporarily strip inline math to prevent Markdown (underscores, asterisks) from mangling it.
    let mathBlocks = [];
    trimmed = trimmed.replace(/(\$\$[\s\S]*?\$\$)|(\\\([\s\S]*?\\\))|(\$[^$\n]+\$)/g, (match) => {
        mathBlocks.push(match);
        return `__MATH_${mathBlocks.length - 1}__`;
    });

    if (hiddenUrls) {
        hiddenUrls.forEach(u => { if (u) trimmed = trimmed.replace(u, ''); });
    }

    // AUTO-GRID
    if (trimmed.match(/^\[(.*?)\]$/) || trimmed.match(/^https?:\/\/.*,.*https?:\/\//)) {
        // Support [url, url] OR raw url,url
        const content = trimmed.startsWith('[') ? trimmed.substring(1, trimmed.length - 1) : trimmed;
        // Don't mistake [Label](url) for grid
        if (!content.includes('](')) {
            const items = content.split(',').map(s => s.trim());
            if (items.every(i => i.startsWith('http') || i.startsWith('{{'))) {
                const slides = items.map(url => detectEmbed(url)).join('');
                return `<div class="auto-grid">${slides}</div>`;
            }
        }
    }

    // EMBEDS & IMAGES
    if (trimmed.match(/^https?:\/\/\S+$/)) {
        // ... existing detection logic checks ...
        if (
            trimmed.includes('youtube') || trimmed.includes('youtu.be') ||
            trimmed.includes('twitter') || trimmed.includes('x.com') ||
            trimmed.includes('google.com/maps') || trimmed.includes('docs.google.com') ||
            trimmed.includes('desmos.com/calculator') ||
            trimmed.match(/\.(pdf|stl|glb|gltf)$/i)
        ) {
            return detectEmbed(trimmed);
        }
        if (trimmed.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i)) {
            return `<div class="zoom-frame"><img src="${trimmed}" loading="lazy" alt="Image"></div>`;
        }
    }

    let clean = safeHTML(trimmed);

    // MD IMAGES with CAPTIONS
    clean = clean.replace(/!\[(.*?)\]\((.*?) "(.*?)"\)/g, (match, alt, url, caption) => {
        // Caption Logic
        if (url.match(/\.(mp4|webm)$/i)) {
            return `<div class="zoom-frame"><video src="${url}" controls preload="metadata"></video><div class="caption">${caption}</div></div>`;
        }
        return `<div class="zoom-frame"><img src="${url}" loading="lazy" alt="${alt}"><div class="caption">${caption}</div></div>`;
    });

    clean = clean.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
        if (url.match(/\.(mp4|webm)$/i)) {
            return `<div class="zoom-frame"><video src="${url}" controls preload="metadata"></video></div>`;
        }
        return `<div class="zoom-frame"><img src="${url}" loading="lazy" alt="${alt}"></div>`;
    });

    // MD LINKS
    clean = clean.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

    // BASIC MARKDOWN (Bold, Italic, Code)
    clean = clean.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>'); // Bold Italic
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
    clean = clean.replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic
    clean = clean.replace(/`(.*?)`/g, '<code>$1</code>'); // Inline Code
    clean = clean.replace(/~~(.*?)~~/g, '<del>$1</del>'); // Strikethrough
    clean = clean.replace(/\^(.*?)\^/g, '<sup>$1</sup>'); // Superscript
    clean = clean.replace(/~(.*?)~/g, '<sub>$1</sub>'); // Subscript

    // HIGHLIGHTS
    clean = clean.replace(/==(.*?)==/g, '<mark>$1</mark>');

    // CHECKBOXES
    clean = clean.replace(/^- \[ \] (.*)/, '<label class="task-item"><input type="checkbox" disabled> $1</label>');
    clean = clean.replace(/^- \[x\] (.*)/, '<label class="task-item checked"><input type="checkbox" checked disabled> $1</label>');

    // CUSTOM TAGS & BUTTONS (Fixing Whitespace resilience)



    // GALLERY
    clean = clean.replace(/\[\s*(https?:\/\/[^\]]+)\s*\]/gi, (match, content) => {
        const urls = content.split(',').map(u => u.trim());
        if (urls.every(u => u.toLowerCase().startsWith('http'))) {
            const imgs = urls.map(u => `<div class="zoom-frame"><img src="${u}" loading="lazy" alt="Gallery"></div>`).join('');
            return `<div class="inline-gallery">${imgs}</div>`;
        }
        return match;
    });







    // TIMELINE
    clean = clean.replace(/\{\{TIMELINE:\s*(.*?)\}\}/gi, (match, content) => {
        const items = content.split('|').map(s => {
            const parts = s.split('-');
            return `<div class="timeline-item"><div class="timeline-date">${parts[0] ? parts[0].trim() : ''}</div><div class="timeline-content">${parts.slice(1).join('-').trim()}</div></div>`;
        }).join('');
        return `<div class="timeline-block">${items}</div>`;
    });

    // EMBEDS
    clean = clean.replace(/\{\{YOUTUBE:\s*(.*?)\}\}/g, '<div class="embed-wrapper video"><iframe src="$1" allowfullscreen></iframe></div>');
    clean = clean.replace(/\{\{EMBED:\s*(.*?)\}\}/g, '<div class="embed-wrapper"><iframe src="$1"></iframe></div>');

    // ROW
    clean = clean.replace(/\{\{ROW:\s*(.*?)\}\}/gi, (match, content) => {
        const parts = content.split('|').map(p => processSingleLine(p.trim(), []));
        return `<div class="btn-container" style="justify-content: flex-start; margin: 10px 0;">${parts.join('')}</div>`;
    });

    // LINKS
    clean = clean.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    clean = clean.replace(/(?<!href="|src="|">)(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="fill-anim">$1</a>');
    clean = clean.replace(/\[\[(.*?)\]\]/g, '<a href="#$1" class="wiki-link fill-anim">$1</a>');
    clean = clean.replace(/<a /g, '<a class="fill-anim" ');

    // RESTORE MATH
    mathBlocks.forEach((block, i) => {
        clean = clean.replace(`__MATH_${i}__`, block);
    });

    return clean;
}

// UPDATED: Header Markdown Support
function formatTitle(raw, defaultTag) {
    if (!raw) return '';
    const match = raw.match(/^(#{1,6})\s+(.*)$/);
    let tag = defaultTag;
    let content = raw;

    if (match) {
        tag = 'h' + match[1].length;
        content = match[2];
    }

    return `<${tag} class="fill-anim">${processSingleLine(content)}</${tag}>`;
}

// UPDATED: Added forceDateSort parameter to allow Sheet Order on Main Pages
function renderRows(rows, title, append, forceGrid, isArticleMode = false, forceDateSort = false) {
    const app = document.getElementById('app'); if (!app) return;

    if (forceDateSort) {
        // DEFAULT: Sort by Date (Newest First)
        rows.sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0));

        // HOMEPAGE: Prioritize 'Featured' items if it's the Recent Activity block
        if (title === 'Recent Activity') {
            rows.sort((a, b) => {
                const aFeat = (a.Tags && a.Tags.toLowerCase().includes('featured')) ? 1 : 0;
                const bFeat = (b.Tags && b.Tags.toLowerCase().includes('featured')) ? 1 : 0;
                return bFeat - aFeat; // Featured comes first
            });
        }
    }
    // ELSE: Respect Sheet Row Order (No Sort)

    if (!append) {
        app.innerHTML = title ? `<h2 class="fill-anim" style="display:block; text-align:center; margin-bottom:20px; font-weight:600; font-size:24px; --text-base:#888; --text-hover:#fff;">${title}</h2>` : '';
    } else if (title) {
        app.innerHTML += `<h2 class="fill-anim" style="display:block; text-align:center; margin-bottom:20px; font-weight:600; font-size:24px; --text-base:#888; --text-hover:#fff;">${title}</h2>`;
    }

    if (rows.length === 0 && !append) {
        app.innerHTML += `<div class="layout-404"><h2>Nothing Found</h2><p>No entries match your query.</p></div>`;
        return;
    }

    let gc = app.querySelector('.grid-container');
    if (append) {
        gc = document.createElement('div'); gc.className = 'grid-container section'; app.appendChild(gc);
    } else {
        const hasGridItems = forceGrid || (rows.some(r => !r.SectionType || (r.SectionType !== 'quote' && r.SectionType !== 'hero' && r.SectionType !== 'text')) && !isArticleMode);
        if (hasGridItems && !gc) {
            gc = document.createElement('div'); gc.className = 'grid-container section'; app.appendChild(gc);
        }
    }

    rows.forEach((r, index) => {
        if (!r.Page || r.Page === 'Footer') return;

        // HELPER: PROCESS TAGS (Standard vs Location vs Link)
        const processTag = (t) => {
            // Check for [Label](URL) pattern
            const match = t.match(/^\[(.*?)\]\((.*?)\)$/);
            if (match) {
                const label = match[1];
                const url = match[2];

                // Check if it's a Google Maps link
                const isMap = /maps\.app\.goo\.gl|google\.com\/maps/i.test(url);

                if (isMap) {
                    const icon = `<svg class="chip-icon" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
                    return `<a href="${url}" target="_blank" class="chip location" onclick="event.stopPropagation()">${icon}${safeHTML(label)}</a>`;
                } else {
                    // Generic External Link
                    const icon = `<svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
                    return `<a href="${url}" target="_blank" class="chip location link" onclick="event.stopPropagation()">${icon}${safeHTML(label)}</a>`;
                }
            }
            // Standard Tag
            return `<span class="chip" data-tag="${t}">${safeHTML(t)}</span>`;
        };

        let mediaSrc = r.Media;
        let cleanContent = r.Content || '';
        let mediaHtml = '';
        let hoistedUrl = [];
        let displayTitle = safeHTML(r.Title); // Raw for now, processed later or by formatTitle
        let hideTitle = false;

        const titleUrlMatch = r.Title ? r.Title.match(/https?:\/\/\S+/) : null;
        if (titleUrlMatch) {
            hoistedUrl.push(titleUrlMatch[0]);
            if (r.Title.trim() === titleUrlMatch[0]) {
                hideTitle = true;
                if (!mediaSrc) {
                    const extracted = extractMediaFromContent(r.Title);
                    if (extracted) {
                        if (extracted.type === 'img') mediaHtml = `<div class="row-media"><img src="${extracted.url}" loading="lazy"></div>`;
                        else if (extracted.type === 'yt') mediaHtml = `<div class="embed-wrapper video"><iframe src="https://www.youtube-nocookie.com/embed/${extracted.id}?modestbranding=1&rel=0&origin=${window.location.origin}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
                        else if (extracted.type === 'stl') mediaHtml = `<div class="row-media"><div class="embed-wrapper stl" data-src="${extracted.url}"></div></div>`;
                        mediaSrc = 'title-embed';
                    }
                }
            } else {
                displayTitle = r.Title.replace(titleUrlMatch[0], ''); // Keep raw for markdown parsing
            }
        }

        const modelMatch = cleanContent.match(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/i);

        if (modelMatch && !mediaHtml) {
            const url = modelMatch[1].trim();
            const color = modelMatch[2] ? `data-color="${modelMatch[2].trim()}"` : '';
            mediaHtml = `<div class="row-media"><div class="embed-wrapper stl" data-src="${url}" ${color}></div></div>`;
            cleanContent = cleanContent.replace(modelMatch[0], '');
        }
        else if (!mediaSrc && !mediaHtml) {
            const extracted = extractMediaFromContent(cleanContent);
            if (extracted) {
                hoistedUrl.push(extracted.url);
                if (extracted.type === 'img') {
                    mediaHtml = `<div class="row-media"><img src="${extracted.url}" loading="lazy"></div>`;
                } else if (extracted.type === 'yt') {
                    if (!isArticleMode || forceGrid) {
                        mediaHtml = `<div class="row-media"><img src="https://img.youtube.com/vi/${extracted.id}/mqdefault.jpg" loading="lazy"></div>`;
                    } else {
                        mediaHtml = `<div class="embed-wrapper video"><iframe src="https://www.youtube-nocookie.com/embed/${extracted.id}?modestbranding=1&rel=0&origin=${window.location.origin}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
                    }
                } else if (extracted.type === 'stl') {
                    mediaHtml = `<div class="row-media"><div class="embed-wrapper stl" data-src="${extracted.url}"></div></div>`;
                }
            } else {
                mediaHtml = `<div class="row-media placeholder"><span>${processSingleLine(displayTitle)}</span></div>`;
            }
        } else if (!mediaHtml && mediaSrc !== 'title-embed') {
            const thumb = getThumbnail(mediaSrc);
            if (thumb) mediaHtml = `<div class="row-media"><img src="${thumb}" loading="lazy"></div>`;
        }

        let contentHtml = processText(cleanContent, hoistedUrl);

        // CLAMP CONTENT IN GRID VIEW (Remove heavy elements)
        // CLAMP CONTENT IN GRID VIEW (Remove heavy elements)
        if (!isArticleMode || forceGrid) {
            const temp = document.createElement('div');
            temp.innerHTML = contentHtml;

            // Remove heavy/rich elements robustly
            const removeSelectors = [
                '.callout', '.table-wrapper', 'table', '.mermaid', 'pre',
                '.chart-wrapper', 'canvas', '.smart-chart-wrapper',
                'video', '.inline-gallery', '.btn-container', 'hr',
                '.embed-wrapper', '.row-media'
            ];
            temp.querySelectorAll(removeSelectors.join(',')).forEach(el => el.remove());

            contentHtml = temp.innerHTML;

            // CSS Clamping Wrapper
            contentHtml = `<div class="grid-text-preview">${contentHtml}</div>`;
        }
        let hasPlaceholder = !mediaSrc && !modelMatch && mediaHtml.includes('placeholder');

        let catClass = '';
        const pLower = r.Page.toLowerCase();
        if (pLower.startsWith('projects')) catClass = 'cat-projects';
        else if (pLower.startsWith('professional')) catClass = 'cat-professional';
        else if (pLower.startsWith('personal')) catClass = 'cat-personal';

        const type = (r.SectionType || 'card').toLowerCase();

        if (!forceGrid && isArticleMode && type !== 'quote' && type !== 'hero') {
            const d = document.createElement('div'); d.className = 'section layout-text';

            // FIXED: FORCE ARTICLE MODE CLASS FOR ALL EMBEDS
            if (mediaHtml.includes('embed-wrapper') || mediaHtml.includes('<img')) {
                mediaHtml = mediaHtml.replace('row-media', 'row-media article-mode');
            } else {
                mediaHtml = '';
            }

            let metaHtml = '';
            if (index === 0) {
                metaHtml = '<div class="article-meta-row"><a href="#Personal/About" class="author-link fill-anim">SAHIB VIRDEE</a>';
                if (r.LinkURL) {
                    metaHtml += `<a href="${r.LinkURL}" target="_blank" class="article-link-btn"><svg viewBox="0 0 24 24" style="width:12px;height:12px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
                }
                metaHtml += '<div class="article-tags">';
                if (r.Timestamp) {
                    const dateVal = formatDate(r.Timestamp);
                    const filterVal = r.Timestamp.substring(0, 7);
                    metaHtml += `<span class="chip date" data-date="${filterVal}" data-val="${dateVal}">${dateVal}</span>`;
                }
                if (r.Tags) {
                    const tags = r.Tags.split(',').map(x => x.trim());
                    tags.forEach(t => metaHtml += processTag(t));
                }

                // READ TIME
                const wordCount = (r.Content || '').trim().split(/\s+/).length;
                const readTime = Math.ceil(wordCount / 200);
                if (readTime > 0) {
                    metaHtml += `<span class="chip" style="opacity:0.6; cursor:default;">${readTime} min read</span>`;
                }



                metaHtml += '</div></div>';
            }

            const titleHtml = (!hideTitle && displayTitle) ?
                (index === 0 ? formatTitle(displayTitle, 'h1') : formatTitle(displayTitle, 'h2'))
                : '';

            d.innerHTML = `${mediaHtml}${titleHtml}${metaHtml}<div class="article-body">${contentHtml}</div>`;
            app.appendChild(d);
            return;
        }

        if (!forceGrid) {
            if (type === 'quote') {
                const d = document.createElement('div'); d.className = 'layout-quote section';
                d.setAttribute('data-title', r.Title || '');
                if ((r.Title || '').toLowerCase() !== 'random quote') {
                    d.setAttribute('data-static-quote', r.Content || r.Quote || '');
                    d.setAttribute('data-static-author', r.Author || 'Sahib Virdee');
                }
                renderQuoteCard(d); app.appendChild(d); return;
            }
            if (type === 'chart') {
                const d = document.createElement('div'); d.className = 'section layout-chart';
                let chartType = (r.Tags || 'bar').toLowerCase();
                // Normalize types
                if (chartType.includes('pie')) chartType = 'pie';
                else if (chartType.includes('doughnut')) chartType = 'doughnut';
                else if (chartType.includes('line')) chartType = 'line';

                const lines = (r.Content || '').split('\n');
                const labels = [], values = [];

                lines.forEach(l => {
                    const clean = l.trim();
                    if (!clean) return;
                    const parts = clean.split(/:(.+)/);
                    if (parts.length >= 2) {
                        labels.push(parts[0].trim());
                        values.push(parts[1].trim());
                    }
                });

                const id = `chart-${Math.random().toString(36).substr(2, 9)}`;
                d.innerHTML = `
                            ${safeHTML(r.Title) ? `<h2 class="fill-anim" style="text-align:center">${processSingleLine(r.Title)}</h2>` : ''}
                            <div class="chart-wrapper" style="position:relative; height:400px; width:100%; max-width:800px; margin:20px auto;">
                                <canvas id="${id}" class="smart-chart" data-type="${chartType}" data-labels="${labels.join('||')}" data-values="${values.join('||')}" data-title="${r.Title}"></canvas>
                            </div>
                        `;
                app.appendChild(d); return;
            }
            if (type === 'hero') {
                const d = document.createElement('div');
                d.className = 'section layout-hero';

                // Logic to make Hero clickable
                const link = r.LinkURL || (r.Page ? '#' + r.Page : '');
                // Only make clickable if it's NOT the current page (avoid self-loop on main hero)
                // But for "Featured Project", it's usually on a different page or category.
                // Safe check: If link == current hash, maybe don't click?
                // User request: "Featured post card is pinned... unclickable"
                // So we shoud enable it.
                if (link) {
                    d.classList.add('clickable-block');
                    d.classList.add('hero-link'); // Cursor style
                    d.setAttribute('data-link', link);
                    d.setAttribute('data-target', link.startsWith('#') ? '' : '_blank');
                }

                let metaContent = '';
                // Date
                if (r.Timestamp) {
                    let dateVal = formatDate(r.Timestamp);
                    let filterVal = r.Timestamp.substring(0, 7);
                    metaContent += `<span class="chip date" data-val="${dateVal}" onclick="event.stopPropagation(); window.location.hash='Filter:${filterVal}'">${dateVal}</span>`;
                }
                // Tags
                if (r.Tags) {
                    const tags = r.Tags.split(',').map(x => x.trim());
                    tags.forEach(t => metaContent += processTag(t));
                }

                const metaHtml = metaContent ? `<div class="hero-meta">${metaContent}</div>` : '';
                d.innerHTML = `${formatTitle(r.Title, 'h1')}${metaHtml}<p>${processText(r.Content)}</p>`;
                app.appendChild(d); return;
            }
            if (type === 'text') {
                const d = document.createElement('div'); d.className = 'section layout-text';
                d.innerHTML = `${safeHTML(r.Title) ? formatTitle(r.Title, 'h2') : ''}<p>${processText(r.Content)}</p>`;
                app.appendChild(d); return;
            }
        }

        const link = r.LinkURL || '';
        const tags = r.Tags ? r.Tags.split(',').map(x => x.trim()) : [];
        let l = link; if (!l) l = `#${r.Page}`;
        const internal = l.startsWith('#'), target = internal ? '' : '_blank';

        let mh = '';
        if (r.Timestamp || tags.length > 0) {
            mh = `<div class="meta-row">`;
            if (r.Timestamp) {
                let dateVal = formatDate(r.Timestamp);
                if (!dateVal) dateVal = r.Timestamp; // Safety Fallback
                let filterVal = r.Timestamp.substring(0, 7);
                mh += `<span class="chip date" data-date="${filterVal}" data-val="${dateVal}">${dateVal}</span>`;
            }



            tags.forEach(t => mh += processTag(t));
            mh += `</div>`;
        }

        const d = document.createElement('div');
        d.className = `layout-grid clickable-block ${catClass} ${hasPlaceholder ? 'has-placeholder' : ''}`;
        d.setAttribute('data-link', l); d.setAttribute('data-target', target);

        let gridTitle = displayTitle;
        if (hideTitle) gridTitle = "";
        let gridTitleHtml = formatTitle(gridTitle, 'h3');
        if (hideTitle) gridTitleHtml = '';

        d.innerHTML = `${mediaHtml}${gridTitleHtml}<p>${contentHtml}</p>${mh}`;

        if (gc) gc.appendChild(d);
    });

    if (window.MathJax && window.MathJax.typeset) {
        window.MathJax.typeset();
    }

    if (window.twttr && window.twttr.widgets) window.twttr.widgets.load();
    setTimeout(init3DViewers, 420);
    // MERMAID TRIGGER
    setTimeout(runMermaid, 50);

    // SYNTAX & TOC & COPY & CHARTS
    setTimeout(() => {
        if (window.Prism) window.Prism.highlightAll();
        if (typeof generateTOC === 'function') generateTOC();
        if (typeof addCopyButtons === 'function') addCopyButtons();
        if (typeof initCharts === 'function') initCharts();

        // Also check for hidden "Family" hash to auto-unlock?
        // No, rely on localStorage.
    }, 60);
}

function renderQuoteCard(c) {
    const title = c.getAttribute('data-title');
    let r;
    let showDice = false;

    if ((title || '').toLowerCase() === 'random quote') {
        if (quotesDb.length === 0) { c.innerHTML = "Quote sheet empty."; return; }
        r = quotesDb[Math.floor(Math.random() * quotesDb.length)];
        showDice = true;
    } else {
        r = {
            Quote: c.getAttribute('data-static-quote') || "No content.",
            Author: c.getAttribute('data-static-author') || "Unknown",
            Source: null
        };
    }

    let auth = r.Author || 'Unknown';
    if (r.Source && r.Source.startsWith('http')) auth = `<a href="${r.Source}" target="_blank" class="fill-anim">${safeHTML(auth)}</a>`;
    else if (r.Source) auth += ` � ${safeHTML(r.Source)}`;

    const text = safeHTML((r.Quote || '').trim().replace(/^"|"$/g, ''));
    const len = text.length;
    let sizeClass = 'short';
    if (len > 230) sizeClass = 'xxl';
    else if (len > 150) sizeClass = 'xl';
    else if (len > 100) sizeClass = 'long';
    else if (len > 50) sizeClass = 'medium';

    let iconHtml = '';
    if (showDice) {
        iconHtml = `<svg class="dice-icon refresh-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" data-tooltip="Roll">
                    <rect x="4" y="4" width="16" height="16" rx="3" ry="3" fill="none" stroke="currentColor"></rect>
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"></circle>
                    <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"></circle>
                    <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"></circle>
                    <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"></circle>
                    <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"></circle>
                 </svg>`;
    }

    c.innerHTML = `<blockquote class="${sizeClass}">"${text}"</blockquote>
                        <div class="quote-footer"><span class="author"> &mdash; ${auth}</span>${iconHtml}</div>`;
}

function renderFooter() {
    const fd = document.getElementById('footer-links');
    // 1. FILTER & SORT ALPHABETICALLY
    const fr = db.filter(r => r.Page === 'Footer' || r.Title === 'LinkedIn' || r.Title === 'Contact')
        .sort((a, b) => a.Title.localeCompare(b.Title));

    fd.innerHTML = '';

    // 2. RENDER LINKS
    fd.innerHTML += `<a href="https://cloud.umami.is/share/HK1oWrZklaWWH67d" target="_blank" class="fill-anim">Analytics</a>`;
    fr.forEach(r => {
        let link = r.LinkURL;
        if (r.Title === 'Contact') {
            link = 'mailto:sahibdsv+site@gmail.com';
        }
        if (link) fd.innerHTML += `<a href="${link}" target="_blank" class="fill-anim">${safeHTML(r.Title)}</a>`;
    });
    fd.innerHTML += `<a href="#Index" class="fill-anim" onclick="closeSearch()">Index</a>`;

    // 3. MOVE VERSION TAG & VAULT ICON TO META CONTAINER
    let meta = document.getElementById('footer-meta');
    if (!meta) {
        meta = document.createElement('div');
        meta.id = 'footer-meta';
        document.querySelector('footer').appendChild(meta);
    }

    // Ensure version-tag exists inside meta
    let vTag = document.getElementById('version-tag');
    if (!vTag) {
        vTag = document.createElement('div');
        vTag.id = 'version-tag';
    }
    if (vTag.parentNode !== meta) {
        meta.appendChild(vTag);
    }


}

function generateTOC() {
    const placeholders = document.querySelectorAll('.toc-placeholder');
    placeholders.forEach(ph => {
        const container = ph.closest('.section, .layout-text, .layout-grid');
        if (!container) return;

        const headers = container.querySelectorAll('h1, h2, h3');
        if (headers.length === 0) { ph.remove(); return; }

        let html = '<div class="toc-container"><div class="toc-header">Table of Contents</div><ul class="toc-list">';
        headers.forEach(h => {
            if (h.classList.contains('article-title') || h.closest('.article-meta-row')) return; // Skip main title/meta

            const id = h.id || `toc-${Math.random().toString(36).substr(2, 9)}`;
            h.id = id;
            const tag = h.tagName.toLowerCase();
            const depth = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3;
            html += `<li class="toc-item toc-depth-${depth}"><a href="#${id}" class="toc-link" onclick="event.preventDefault(); document.getElementById('${id}').scrollIntoView({behavior:'smooth'})">${h.textContent}</a></li>`;
        });
        html += '</ul></div>';
        ph.outerHTML = html;
    });
}

function addCopyButtons() {
    document.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.copy-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = 'Copy';
        // Inline styles for simplicity
        btn.style.cssText = 'position:absolute; top:8px; right:8px; padding:4px 10px; font-size:11px; background:rgba(255,255,255,0.1); color:#ccc; border:1px solid rgba(255,255,255,0.2); border-radius:4px; cursor:pointer; opacity:0; transition:0.2s; backdrop-filter:blur(4px);';

        pre.style.position = 'relative';
        pre.onmouseenter = () => btn.style.opacity = '1';
        pre.onmouseleave = () => btn.style.opacity = '0';

        btn.onclick = () => {
            const code = pre.querySelector('code')?.innerText || pre.innerText;
            navigator.clipboard.writeText(code).then(() => {
                btn.textContent = 'Copied!';
                btn.style.color = '#4caf50';
                btn.style.borderColor = '#4caf50';
                setTimeout(() => {
                    btn.textContent = 'Copy';
                    btn.style.color = '#ccc';
                    btn.style.borderColor = 'rgba(255,255,255,0.2)';
                }, 2000);
            });
        };
        pre.appendChild(btn);
    });
}

function initCharts() {
    if (typeof Chart === 'undefined') return;
    document.querySelectorAll('.smart-chart:not([data-initialized])').forEach(canvas => {
        canvas.setAttribute('data-initialized', 'true');
        const ctx = canvas.getContext('2d');
        const type = canvas.getAttribute('data-type');
        const labels = canvas.getAttribute('data-labels').split('||');
        const values = canvas.getAttribute('data-values').split('||').map(Number);
        const title = canvas.getAttribute('data-title');

        new Chart(ctx, {
            type: type,
            data: {
                labels: labels,
                datasets: [{
                    label: 'Data',
                    data: values,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)', 'rgba(54, 162, 235, 0.8)', 'rgba(255, 206, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)', 'rgba(153, 102, 255, 0.8)', 'rgba(255, 159, 64, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#ccc' } },
                    title: { display: !!title, text: title, color: '#fff', font: { size: 14 } }
                },
                scales: (type === 'pie' || type === 'doughnut') ? {} : ((type === 'bar' || type === 'line') ? {
                    y: { ticks: { color: '#888' }, grid: { color: '#333' }, beginAtZero: true },
                    x: { ticks: { color: '#888' }, grid: { color: 'transparent' } }
                } : {
                    r: { grid: { color: '#333' }, ticks: { display: false } }
                })
            }
        });
    });
}



function fetchGitHubStats() {
    const r = "sahibdsv/sahibdsv.github.io";
    fetch(`https://api.github.com/repos/${r}`)
        .then(res => {
            if (res.status === 403 || res.status === 429) throw new Error('Rate Limit');
            if (!res.ok) throw new Error('GitHub API Error');
            return res.json();
        })
        .then(d => {
            if (d.pushed_at) {
                const date = new Date(d.pushed_at);
                const timeAgo = (d) => {
                    const s = Math.floor((new Date() - d) / 1000);
                    let i = s / 31536000;
                    if (i > 1) return Math.floor(i) + " years ago";
                    i = s / 2592000;
                    if (i > 1) return Math.floor(i) + " months ago";
                    i = s / 86400;
                    if (i > 1) return Math.floor(i) + " days ago";
                    i = s / 3600;
                    if (i > 1) return Math.floor(i) + " hours ago";
                    i = s / 60;
                    if (i > 1) return Math.floor(i) + " mins ago";
                    return "a few mins ago";
                };
                const relTime = timeAgo(date);
                const vTag = document.getElementById('version-tag');
                if (vTag) vTag.innerHTML = `<a href="https://github.com/${r}/commits" target="_blank" class="fill-anim">Last Commit: ${relTime}</a>`;
            }
        }).catch((e) => {
            // console.log('GitHub API suppressed:', e);
        });
}

function getThumbnail(u) { if (!u) return null; if (u.includes('youtube.com') || u.includes('youtu.be')) { let v = u.split('v=')[1]; if (v && v.includes('&')) v = v.split('&')[0]; if (!v && u.includes('youtu.be')) v = u.split('/').pop(); return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; } if (u.endsWith('.mp4')) return null; return u; }

function formatDate(s) {
    if (!s) return '';

    // 0. Handle Date Objects directly (Local Time)
    if (s instanceof Date) {
        const day = s.getDate(); // Local day
        const mo = s.toLocaleString('default', { month: 'short' }).toUpperCase();
        const yr = s.getFullYear();
        return `${day} ${mo} ${yr}`;
    }

    s = String(s).trim(); // Ensure string

    // 1. Handle YYYYMMDD (Legacy)
    if (s.length === 8 && !isNaN(s)) {
        const y = s.substring(0, 4);
        const m = s.substring(4, 6);
        const d = s.substring(6, 8);
        const dateObj = new Date(y, m - 1, d, 12, 0, 0); // Noon Local
        return `${dateObj.getDate()} ${dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()} ${y}`;
    }

    // 2. Handle YYYY-MM-DD (Standard) - Loose Match
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const y = parseInt(match[1]);
        const m = parseInt(match[2]);
        const d = parseInt(match[3]);
        // Construct Date Object manually in LOCAL TIME (noon safe)
        const dateObj = new Date(y, m - 1, d, 12, 0, 0);
        const mo = dateObj.toLocaleString('default', { month: 'short' }).toUpperCase();
        return `${d} ${mo} ${y}`;
    }

    // 3. Fallback for text (e.g. "Present")
    if (s.toLowerCase().includes('present') || isNaN(Date.parse(s))) {
        return s;
    }

    // 4. Last Resort: Parse ISO/Other
    // This is the danger zone for "31 Jan" -> "30 Jan" if it's treated as UTC Midnight.
    // If we are here, regex failed.
    // Use UTC methods to read it? No, standard Date() uses Local.
    // If the string is "Jan 31 2026", Date() works fine.
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;

    // If the input was ISO-like (contains T or Z), and we are here, it means regex failed (maybe time included?)
    // If time is included, usually it's correct.
    // Just return local date.
    const day = d.getDate();
    const mo = d.toLocaleString('default', { month: 'short' }).toUpperCase();
    const yr = d.getFullYear();
    return `${day} ${mo} ${yr}`;
}

function runMermaid() {
    if (window.mermaid) {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            gantt: {
                barHeight: 30, fontSize: 14, sectionFontSize: 14,
                padding: 15, topPadding: 60
            }
        });
        document.querySelectorAll('.mermaid').forEach(el => mermaid.init(undefined, el));
    }
}

function copyTable(btn) {
    const table = btn.parentElement.querySelector('table');
    let csv = [];
    table.querySelectorAll('tr').forEach(row => {
        const rowData = [];
        row.querySelectorAll('td, th').forEach(col => rowData.push('"' + col.innerText + '"'));
        csv.push(rowData.join(','));
    });
    navigator.clipboard.writeText(csv.join('\n'));
    const og = btn.innerText;
    btn.innerText = "COPIED";
    setTimeout(() => btn.innerText = og, 2000);
}



// --- MERMAID SUPPORT ---
let mermaidAPI = null;
function initMermaid() {
    if (mermaidAPI) return;
    // Lazy load only if needed (checked in runMermaid or if global init called)
    import('https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs')
        .then(m => {
            mermaidAPI = m.default;
            mermaidAPI.initialize({ startOnLoad: false, theme: 'dark' });
            // Re-run if pending
            document.querySelectorAll('.mermaid').forEach(el => mermaidAPI.init(undefined, el));
        });
}

/* --- SEO: JSON-LD INJECTION --- */
function updateSEO() {
    // Remove existing JSON-LD
    const existing = document.getElementById('json-ld-script');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = 'json-ld-script';
    script.type = 'application/ld+json';

    const items = db.map(r => {
        if (!r.Title || !r.Content) return null;
        const type = r.Page.toLowerCase().includes('project') ? 'SoftwareSourceCode' : 'CreativeWork';
        return {
            "@type": type,
            "name": r.Title,
            "description": r.Content.substring(0, 150) + '...',
            "url": `https://sahibvirdee.com/#${r.Page}`
        };
    }).filter(x => x);

    const schema = {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "mainEntity": {
            "@type": "Person",
            "name": "Sahib Virdee",
            "jobTitle": "Mechanical Engineering Graduate",
            "description": "Specializing in Design and Manufacturing.",
            "url": "https://sahibvirdee.com/",
            "sameAs": [
                "https://github.com/sahibdsv",
                "https://www.linkedin.com/in/sahibdsv/"
            ]
        },
        "hasPart": items
    };

    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
    // console.log('SEO Updated: JSON-LD Injected');
}


function runMermaid() {
    const nodes = document.querySelectorAll('.mermaid:not([data-processed])');
    if (nodes.length === 0) return;

    if (!mermaidAPI) {
        initMermaid();
        return;
    }

    // Mermaid run is a promise but we don't strictly need to await it here
    mermaidAPI.run({ nodes: [...nodes] }).catch(console.error);
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof Papa === 'undefined') {
        window.addEventListener('load', init);
    } else {
        init();
    }
});
function renderResume() {
    renderNavigation('Professional/Resume');
    const app = document.getElementById('app');
    app.innerHTML = '<div id="resume-view" class="resume-container"></div>';
    const container = document.getElementById('resume-view');

    generateResumeJSONLD(); // SEO

    // Source from RESUME DB (Separate Sheet)
    const resumeData = resumeDb;

    // 1. HEADER
    // 1. HEADER
    const headers = resumeData.filter(r => r.SectionType && r.SectionType.toLowerCase() === 'header');
    if (headers.length > 0) {
        const h = headers[0];
        const parts = h.Title.split('|');
        const name = parts[0].trim();
        const role = parts[1] ? parts[1].trim() : '';

        container.innerHTML += `
                    <div class="resume-header section" style="position:relative;">
                        <button class="btn-pill" onclick="window.print()" style="position:absolute; right:0; top:0; margin:0; font-size:12px; padding:6px 12px; cursor:pointer;">
                            Download PDF
                        </button>
                        <h1 class="fill-anim" style="margin-top:0;">${name}</h1>
                        <div class="resume-sub fill-anim" style="animation-delay:0.1s">${role}</div>
                        <div class="resume-contact" style="gap:0 !important; row-gap:4px !important;">
                            ${(() => {
                // Split content by pipe, render as individual items with separators
                const items = (h.Content || '').split('|').map(x => `<span style="white-space:nowrap;">${processText(x.trim())}</span>`);
                return items.join('<span class="contact-sep" style="margin:0 12px; color:#bbb; user-select:none;">|</span>');
            })()}
                        </div>
                    </div>`;
    }

    // 2. LAYOUT GRID
    container.innerHTML += `<div class="resume-grid section">
                <div class="resume-left"></div>
                <div class="resume-right"></div>
            </div>`;

    const left = container.querySelector('.resume-left');
    const right = container.querySelector('.resume-right');

    const groups = {};
    resumeData.forEach(r => {
        if (!r.SectionType) return;
        // Normalize to Title Case (e.g. "experience" -> "Experience")
        const raw = r.SectionType.trim().toLowerCase();
        const key = raw.charAt(0).toUpperCase() + raw.slice(1);

        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    // Helper to render section
    const addSection = (target, title, data, renderer) => {
        if (data && data.length > 0) {
            target.innerHTML += `<div class="resume-section">
                        ${formatTitle(title, 'h3')}
                        ${data.map(renderer).join('')}
                    </div>`;
        }
    };

    // LEFT COL
    addSection(left, 'Education', groups['Education'], RenderResumeEntry);
    addSection(left, 'Skills', groups['Skills'], RenderResumeSkill);

    // RIGHT COL
    addSection(right, 'Professional Experience', groups['Experience'], RenderResumeEntry);
    addSection(right, 'Engineering Projects', groups['Project'], RenderResumeEntry);
}

function RenderResumeEntry(r) {
    // Title logic: "Role | Company"
    let role = r.Title || '';
    let company = '';
    if (role.includes('|')) {
        const p = role.split('|');
        role = p[0].trim();
        company = p[1].trim();
    }

    const link = r.LinkURL ? `<a href="${r.LinkURL}" target="_blank" class="resume-link"><svg viewBox="0 0 24 24" style="width:12px;height:12px;display:inline-block;vertical-align:middle;opacity:0.7;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : '';

    // USE processText for Content to support Markdown
    let c = r.Content || '';

    // STANDARD LOGIC (Applies to both Custom and Main)
    if (c.includes('|')) {
        c = '- ' + c.replace(/\|/g, '\n- ');
    }
    // Auto-Bold Feature: "- Term: Def" -> "- **Term:** Def"
    c = c.replace(/(\n|^)-\s*([^:\n]+?):/g, '$1- **$2:**');

    const content = processText(c);

    // PROCESS TAGS (Chips) - Split for Structure
    let dateHtml = '';
    let otherTagsHtml = '';

    if (r.Tags) {
        const processTag = (t) => {
            t = t.trim();
            // Date Logic -> Plain Text
            if (t.match(/[A-Za-z]{3,}\s+\d{4}/) || t.toLowerCase().includes('present')) {
                return { type: 'date', html: safeHTML(t) };
            }

            // Location/Link Logic -> Plain Link or Text
            const match = t.match(/^\[(.*?)\]\((.*?)\)$/);
            if (match) {
                const label = match[1];
                const url = match[2];
                const isMap = /maps\.app\.goo\.gl|google\.com\/maps/i.test(url); // Detect map
                const icon = isMap
                    ? `<svg class="chip-icon" viewBox="0 0 24 24" style="width:12px; height:12px; margin-right:4px; vertical-align:middle; display:inline-block;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`
                    : `<svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; margin-right:4px; vertical-align:middle; display:inline-block;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

                return { type: 'loc', html: `<a href="${url}" target="_blank" style="text-decoration:none; color:inherit; display:flex; align-items:center;">${icon}${safeHTML(label)}</a>` };
            }
            // Default Logic -> Plain Text
            return { type: 'other', html: safeHTML(t) };
        };

        // Semicolon Heuristic: If semicolon is present, use it as primary delimiter to allow commas in text.
        const hasSemicolon = r.Tags.includes(';');
        const splitRegex = hasSemicolon ? /(?:;|\u2022)\s*/ : /(?:;|,|\u2022)\s*/;

        const rawTags = r.Tags.split(splitRegex).filter(t => t.trim());

        // Collect non-date tags to join them with separators later
        const otherTags = [];

        rawTags.forEach(t => {
            const res = processTag(t);
            if (res.type === 'date' && !dateHtml) {
                dateHtml = res.html;
            } else {
                otherTags.push(res.html);
            }
        });

        // Join other tags with ", " to prevent "AllistonON"
        if (otherTags.length > 0) {
            otherTagsHtml = otherTags.join(', ');
        }
    }

    // Screen View: Stack normally? Or use grid?
    // To keep Screen view consistent with previous "Chips row" look but allow Print split,
    // we will render TWO views? Or use CSS to move them?
    // CSS manipulation is cleanest.
    // Screen: .resume-row-main { display: block } .resume-date-slot { float? or just inside }
    // Actually, let's just make Screen view look good with this structure too.
    // Row 1: Role [Space] Date
    // Row 2: Company [Space] Location

    return `
            <div class="resume-entry" id="res-${r.ID || Math.random().toString(36).substr(2, 9)}">
                <div class="resume-entry-header">
                    <div class="resume-row-main" style="display:flex; justify-content:space-between; align-items:baseline;">
                        <div class="resume-role">${role} ${link}</div>
                        <div class="resume-date-slot">${dateHtml}</div>
                    </div>
                    <div class="resume-row-sub" style="display:flex; justify-content:space-between; align-items:baseline;">
                        ${company ? `<div class="resume-company">${company}</div>` : '<div></div>'}
                        <div class="resume-loc-slot">${otherTagsHtml}</div>
                    </div>
                </div>
                <div class="resume-list text-content">${content}</div>
            </div>`;
}

function RenderResumeSkill(r) {
    // Parse: "Category: Item, Item | Category: Item"
    const parts = (r.Content || '').split('|').map(x => x.trim()).filter(x => x);

    let html = '';
    parts.forEach(part => {
        const splitIdx = part.indexOf(':');
        if (splitIdx > -1) {
            const cat = part.substring(0, splitIdx).trim();
            const val = part.substring(splitIdx + 1).trim();
            html += `<div class="resume-skill-row">
                        <span class="resume-skill-cat">${cat}:</span> 
                        <span class="resume-skill-list">${val}</span>
                    </div>`;
        } else {
            html += `<div class="resume-skill-row"><span class="resume-skill-list">${part}</span></div>`;
        }
    });

    return `
            <div class="resume-skill-block">
                ${r.Title && r.Title !== 'Technical Skills' ? `<div class="resume-skill-title">${r.Title}</div>` : ''}
                ${html}
            </div>`;
}

function generateResumeJSONLD() {
    const existing = document.getElementById('json-ld-resume');
    if (existing) existing.remove();

    const resumeRows = resumeDb;
    const headers = resumeRows.filter(r => r.SectionType === 'Header');
    if (headers.length === 0) return;

    const h = headers[0];
    const name = h.Title.split('|')[0].trim();
    const role = h.Title.split('|')[1] ? h.Title.split('|')[1].trim() : "Engineer";

    const schema = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": name,
        "jobTitle": role,
        "url": "https://sahibvirdee.com/resume",
        "description": `Resume of ${name}, ${role}.`,
        "knowsAbout": resumeRows.filter(r => r.SectionType === 'Skills').map(r => r.Content).join(', ')
    };

    const script = document.createElement('script');
    script.id = 'json-ld-resume';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
}

function detectEmbed(url) {
    url = url.trim();
    // UPDATED: Privacy Enhanced Domain
    const yt = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
    if (yt) return `<div class="embed-wrapper video"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?modestbranding=1&rel=0&origin=${window.location.origin}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;

    if (url.includes('google.com/maps/embed') || url.includes('maps.google.com')) {
        return `<div class="embed-wrapper map"><iframe src="${url}"></iframe></div>`;
    }
    if (url.includes('google.com/maps/place')) {
        return `<div class="embed-wrapper map"><iframe src="${url.replace('/place/', '/embed?pb=')}"></iframe></div>`;
    }

    // DESMOS
    if (url.includes('desmos.com/calculator')) {
        return `<div class="embed-wrapper doc" style="height:500px"><iframe src="${url}?embed" style="width:100%; height:100%; border:0"></iframe></div>`;
    }

    // GOOGLE DRIVE (GENERIC): Convert View -> Preview
    if (url.includes('drive.google.com')) {
        // If it's a file link ending in /view, swap to /preview for embed
        if (url.includes('/view')) url = url.replace('/view', '/preview');
        // If it's pure /open?id=, we might need a different approach, but most sharing links are file/d/.../view
        // Sheets/Docs often use /edit, convert to /preview or /htmlview
        if (url.includes('/edit')) url = url.replace('/edit', '/preview');

        return `<div class="embed-wrapper doc"><iframe src="${url}"></iframe></div>`;
    }

    if (url.includes('docs.google.com') && (url.includes('/spreadsheets/') || url.includes('/document/'))) {
        // Ensure we use preview mode mostly
        if (url.includes('/edit')) url = url.replace('/edit', '/preview');
        return `<div class="embed-wrapper doc"><iframe src="${url}"></iframe></div>`;
    }

    if (url.toLowerCase().endsWith('.pdf')) {
        return `<div class="embed-wrapper doc"><iframe src="${url}"></iframe></div>`;
    }

    // AUDIO
    if (url.match(/\.(mp3|wav|ogg)$/i)) {
        return `<div class="embed-wrapper audio" style="padding:10px;"><audio controls src="${url}" style="width:100%;"></audio></div>`;
    }

    // VIDEO
    if (url.match(/\.(mp4|webm|mov)$/i)) {
        return `<div class="embed-wrapper video"><video controls src="${url}" style="width:100%; height:auto;"></video></div>`;
    }

    if (url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/)) {
        return `<blockquote class="twitter-tweet" data-theme="dark"><a href="${url}"></a></blockquote>`;
    }

    if (url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i)) {
        return `<img src="${url}" class="inline-img zoomable" loading="lazy">`;
    }

    if (url.match(/\.(stl|glb|gltf)$/i)) {
        return `<div class="embed-wrapper stl" data-src="${url}"></div>`;
    }

    return `<a href="${url}" target="_blank">${url}</a>`;
}

function extractMediaFromContent(text) {
    if (!text) return null;
    const imgMatch = text.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)/i);
    if (imgMatch) return { type: 'img', url: imgMatch[0] };

    const ytMatch = text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
    if (ytMatch) return { type: 'yt', url: ytMatch[0], id: ytMatch[1] };

    const stlMatch = text.match(/https?:\/\/\S+\.(?:stl|glb|gltf)/i);
    if (stlMatch) return { type: 'stl', url: stlMatch[0] };

    return null;
}

function getCalloutIcon(type) {
    const icons = {
        note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        todo: '<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>',
        tip: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
        question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        warning: '<path d="M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z"/>',
        failure: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
        danger: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
        bug: '<rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/>',
        example: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
        quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>'
    };
    // ALIASES
    const map = {
        abstract: 'note', summary: 'note', tldr: 'note',
        hint: 'tip', important: 'tip',
        check: 'success', done: 'success',
        help: 'question', faq: 'question',
        caution: 'warning', attention: 'warning',
        fail: 'failure', missing: 'failure',
        error: 'danger', cite: 'quote'
    };
    const mapped = map[type] || type;
    return icons[mapped] || icons.note;
}

let active3DContainers = [];

function cleanup3DResources() {
    active3DContainers.forEach(container => {
        container.innerHTML = '';
        container.classList.remove('loaded', 'ready');
    });
    active3DContainers = [];
}

function init3DViewers() {
    const containers = document.querySelectorAll('.embed-wrapper.stl:not(.loaded)');
    if (containers.length === 0) return;

    Promise.all([
        import('three'),
        import('three/addons/loaders/STLLoader.js'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js')
    ]).then(([THREE, { STLLoader }, { GLTFLoader }, { OrbitControls }]) => {

        const visibilityObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const container = entry.target;
                if (entry.isIntersecting) container.setAttribute('data-visible', 'true');
                else container.setAttribute('data-visible', 'false');
            });
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadModel(entry.target, THREE, STLLoader, GLTFLoader, OrbitControls);
                    observer.unobserve(entry.target);
                    visibilityObserver.observe(entry.target);
                }
            });
        }, { rootMargin: "200px" });

        containers.forEach(c => {
            observer.observe(c);
            active3DContainers.push(c);
        });
    });
}

function loadModel(container, THREE, STLLoader, GLTFLoader, OrbitControls) {
    if (container.classList.contains('loaded')) return;
    container.classList.add('loaded');

    const url = container.getAttribute('data-src');
    const customColor = container.getAttribute('data-color');
    const ext = url.split('.').pop().toLowerCase();

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.physicallyCorrectLights = true;

    container.appendChild(renderer.domElement);

    // FIX: STRICTLY CONDITIONALLY RENDER BUTTONS ONLY FOR ARTICLES
    if (container.closest('.article-mode')) {
        const ui = document.createElement('div');
        ui.className = 'stl-controls';
        ui.innerHTML = `
                    <div class="stl-btn" id="btn-full"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></div>
                `;
        container.appendChild(ui);

        setTimeout(() => {
            ui.classList.add('visible');
            setTimeout(() => ui.classList.remove('visible'), 2000);
        }, 1000);

        const updateFullscreenIcon = () => {
            const isFull = !!document.fullscreenElement;
            const path = isFull
                ? '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-14v3h3v2h-5V5h2z"/>'
                : '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
            ui.querySelector('#btn-full svg').innerHTML = path;
        };

        ui.querySelector('#btn-full').onclick = () => {
            if (!document.fullscreenElement) {
                container.requestFullscreen().then(() => {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(e => console.log('Orientation lock failed', e));
                    }
                }).catch(err => {
                    console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                });
            } else {
                document.exitFullscreen();
            }
        };

        document.addEventListener('fullscreenchange', () => {
            updateFullscreenIcon();
            setTimeout(resizeHandler, 100);
            // FIXED: Enable zoom only in fullscreen
            controls.enableZoom = !!document.fullscreenElement;
        });
    }

    // --- IMPROVED LIGHTING SETUP ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Increased base brightness
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); // Soft overhead fill
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2); // Main strong light
    keyLight.position.set(5, 10, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8); // Softer fill from opposite side
    fillLight.position.set(-5, 0, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5); // Back/Rim light for edge definition
    rimLight.position.set(0, 5, -10);
    scene.add(rimLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    // GRID-LOCKED: Disable damping for 1:1 grab feel
    controls.enableDamping = false;
    controls.rotateSpeed = 0.8;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;
    // FIXED: Disable scroll zoom to prevent trap
    controls.enableZoom = false;

    let restartTimer;

    controls.addEventListener('start', () => {
        clearTimeout(restartTimer);
        controls.autoRotate = false;
    });
    controls.addEventListener('end', () => {
        restartTimer = setTimeout(() => {
            controls.autoRotate = true;
        }, 5000);
    });

    const onLoad = (object) => {
        container.classList.add('ready');

        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);
        object.position.sub(center);
        scene.add(object);

        if (customColor) {
            object.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshPhongMaterial({
                        color: customColor,
                        specular: 0x111111,
                        shininess: 100
                    });
                }
            });
        }

        const size = box.getSize(new THREE.Vector3()).length();
        const dist = size / (2 * Math.tan(Math.PI * 30 / 360)) * 0.5;

        camera.position.set(dist, dist * 0.4, dist * 0.8);
        camera.lookAt(0, 0, 0);
        controls.minDistance = size * 0.2;
        controls.maxDistance = size * 5;

        function animate() {
            if (!container.isConnected) {
                renderer.dispose();
                return;
            }
            requestAnimationFrame(animate);
            if (container.getAttribute('data-visible') === 'false') return;
            controls.update();
            renderer.render(scene, camera);
        }
        animate();
    };

    const onError = (e) => {
        console.error(e);
        container.innerHTML = '<div style="color:#666; display:flex; justify-content:center; align-items:center; height:100%; font-size:12px;">Failed to load 3D Model</div>';
    };

    if (ext === 'glb' || ext === 'gltf') {
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => onLoad(gltf.scene), undefined, onError);
    } else {
        const loader = new STLLoader();
        loader.load(url, (geometry) => {
            const mat = new THREE.MeshPhongMaterial({
                color: customColor || 0xaaaaaa,
                specular: 0x111111,
                shininess: 200
            });
            const mesh = new THREE.Mesh(geometry, mat);
            onLoad(mesh);
        }, undefined, onError);
    }

    const resizeHandler = () => {
        if (!container.isConnected) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', resizeHandler);
}


// --- UTIL FUNCTIONS (Global) ---



function initComparisons() {
    // Logic mostly handled by inline oninput, but we can add enhancements here if needed
    document.querySelectorAll('.compare-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            e.target.parentElement.style.setProperty('--pos', e.target.value + '%');
        });
    });
}

function loadDemoData() {
    renderNavigation(null);
    const app = document.getElementById('app');

    const demoMD = `
# Feature Demo
This page demonstrates the capabilities of the CMS rendering engine.
## 1. Typography & Lists
Standard text can be **bold**, *italic*, or [linked](#). 
We also support infinite nested lists:
- Item One
  - Nested Item 1.1
    - Nested Item 1.1.1
  - Nested Item 1.2
- Item Two
## 2. Callouts (Minimalist)
> [!info] Information
> Useful details about the ecosystem.
> [!warning] Warning
> Be careful with these settings.
> [!danger] Critical Error
> Something went wrong here.
## 3. Code Blocks
\`\`\`javascript
function helloWorld() {
    console.log("Hello, User!");
    return true;
}
\`\`\`
## 4. Mathematics
**Inline:** $a^2 + b^2 = c^2$
**Block:**
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
## 5. Media with Captions & Grid
**Side-by-Side (Map + Video):**
[https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.1422937950147!2d-73.9873196845941!3d40.75889497932681!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c25855c6480299%3A0x55194ec5a1ae072e!2sTimes+Square!5e0!3m2!1sen!2sus!4v1560412335497!5m2!1sen!2sus, https://www.youtube.com/watch?v=YE7VzlLtp-4]
**Image with Caption:**
![Unsplash Image](https://images.unsplash.com/photo-1549692520-acc6669e2f0c "A beautiful mountain view.")
## 6. Diagrams
\`\`\`mermaid
graph LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Success]
    B -->|No| D[Failure]
\`\`\`
## 7. Charts
[chart:bar:Jan,Feb,Mar:12,19,3:Q1 Sales]
## 8. 3D Models
Interactive WebGL viewer:
https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/stl/binary/pr2_head_pan.stl
## 9. Comparison Sliders
Rain vs Dry:
[compare:https://images.unsplash.com/photo-1515694346937-94d85e41e6f0:https://images.unsplash.com/photo-1500964757637-c85e8a162699]
## 10. Tables
| Feature | Status | Priority |
| :--- | :---: | ---: |
| Markdown | Ready | High |
| Charts | Ready | Med |
`;

    const html = processText(demoMD);

    // WRAP IN ARTICLE MODE FOR CONTROLS (3D Fullscreen, etc.)
    app.innerHTML = `
        <div class="content-container animate-fade article-mode">
            ${html}
        </div>
    `;

    // Post-Render Triggers
    setTimeout(() => {
        if (window.Prism) Prism.highlightAll();
        if (window.MathJax) MathJax.typeset();
        if (window.mermaid) mermaid.init();
        initCharts();
        init3DViewers();
        initComparisons();
        initImageZoomers(); 
    }, 100);
}
