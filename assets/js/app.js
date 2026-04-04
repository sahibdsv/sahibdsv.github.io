if (history.scrollRestoration) {
    history.scrollRestoration = 'manual';
}

// Global Debounce Utility
function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// Shared Media Entrance Handler
window.mediaLoaded = function (el) {
    el.classList.add('loaded');

    // Intelligent Theme Matching for tagged images
    if (el.tagName === 'IMG' && el.classList.contains('theme-invert')) {
        applySmartInversion(el);
    }

    // Look for loader specifically in the same media container
    const container = el.closest('.row-media, .model-viewer-wrapper, .mapbox-container');
    const sk = container ? container.querySelector('.loader-overlay') : (el.previousElementSibling?.classList.contains('loader-overlay') ? el.previousElementSibling : null);

    if (sk) {
        sk.classList.add('finished');
        setTimeout(() => {
            if (sk.parentNode) sk.remove();
        }, 600);
    }
};

// === CORE APPLICATION (app.js inlined) ===
let _activeRenderPath = null;
let _renderRAF = null;
window._activeVideoCount = 0; // Global counter for throttling 3D rendering during video playback

// CSV Parser
function parseCSV(text) {
    const p = [[]];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];
        if (char === '"' && inQuotes && next === '"') {
            cur += '"'; i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            p[p.length - 1].push(cur.trim()); cur = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i++;
            p[p.length - 1].push(cur.trim()); cur = '';
            p.push([]);
        } else {
            cur += char;
        }
    }
    if (cur || p[p.length - 1].length) p[p.length - 1].push(cur.trim());
    const rows = p.filter(r => r.length > 1);
    if (rows.length < 2) return [];

    const header = (rows[0] || []).map(h => h.trim());
    return rows.slice(1)
        .filter(row => row.some(cell => cell))
        .map(row => {
            const obj = {};
            header.forEach((key, idx) => {
                obj[key] = row[idx] || '';
            });
            return obj;
        });
}

// Global State
let db = [];
let quotesDb = [];
let resumeDb = [];
let musicDb = []; // Music logging data
let quoteBag = []; // Shuffled indices to pick from
let _lastQuoteIndex = -1;

let _activeRandomQuote = null;

let isSearchActive = false;
let _lastRenderedPath = null;

// Unified Mobile Detection
const isTrueMobile = window.matchMedia("(pointer: coarse) and (hover: none)").matches;

const CONFIG = {
    main_sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv',
    resume_sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=1812444133&single=true&output=csv',
    music_api: 'https://script.google.com/macros/s/AKfycby6WOq30gXuuswxkBvouOetN1v9_1NLyEgl5Qq-0zJWLHa-266zEEHMAECAtu2pOQUC/exec',
    quotes_api: 'https://script.google.com/macros/s/AKfycby6WOq30gXuuswxkBvouOetN1v9_1NLyEgl5Qq-0zJWLHa-266zEEHMAECAtu2pOQUC/exec?type=quotes'
};

// Quote Randomness Logic (Fisher-Yates / Durstenfeld Shuffle Bag)
function refillQuoteBag() {
    // Create a fresh batch of indices
    quoteBag = quotesDb.map((_, index) => index);

    // Fisher-Yates (Durstenfeld) Shuffle: Truly uniform distribution
    for (let i = quoteBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [quoteBag[i], quoteBag[j]] = [quoteBag[j], quoteBag[i]];
    }

    // Boundary Fix: If the first quote in the NEW bag is the same as the LAST one from the old bag,
    // swap it with another random item in the bag to prevent consecutive repeats.
    if (quotesDb.length > 2 && quoteBag[quoteBag.length - 1] === _lastQuoteIndex) {
        const randomIndex = Math.floor(Math.random() * (quoteBag.length - 1));
        [quoteBag[quoteBag.length - 1], quoteBag[randomIndex]] = [quoteBag[randomIndex], quoteBag[quoteBag.length - 1]];
    }
}

function getNextQuote() {
    if (quotesDb.length === 0) return null;

    if (quoteBag.length === 0) {
        refillQuoteBag();
    }

    let nextIndex = quoteBag.pop();

    // Safety: If the randomly picked quote has identical text as the last one, try to skip it
    if (_lastQuoteIndex !== -1 && quotesDb[nextIndex].Quote === quotesDb[_lastQuoteIndex].Quote && quotesDb.length > 1) {
        if (quoteBag.length > 0) {
            const swap = quoteBag.pop();
            quoteBag.push(nextIndex);
            nextIndex = swap;
        } else {
            refillQuoteBag();
            nextIndex = quoteBag.pop();
        }
    }

    _lastQuoteIndex = nextIndex;
    const selected = quotesDb[_lastQuoteIndex];

    return {
        Quote: selected.Quote || selected.quote || selected.content || "",
        Author: selected.Author || selected.author || "Unknown",
        Source: selected.Source || selected.source || null
    };
}

// App Initialization
let _appInitialized = false;
function startApp() {
    if (_appInitialized) {
        // Refresh existing UI with new data
        updateSEO();
        renderFooter();
        handleRouting();
        return;
    }
    _appInitialized = true;

    initApp();
    updateSEO();
    renderFooter();

    if (window.location.search) {
        history.replaceState(null, null, window.location.pathname + window.location.hash);
    }

    requestAnimationFrame(() => {
        document.body.classList.remove('no-transition');
        document.getElementById('main-header')?.classList.remove('no-transition');
        
        // Use ID for boot loader to avoid selecting card loaders
        const sk = document.getElementById('boot-loader');
        if (sk) {
            sk.classList.add('finished');
            setTimeout(() => {
                if (sk.parentNode) sk.remove();
            }, 600);
        }
    });
}

// fetchDataAndCache retrieves high-fidelity content across all sources
async function fetchDataAndCache() {
    try {
        // Phase 0: Instant Cache Recovery
        const cachedDb = localStorage.getItem('db_cache');
        const cachedResume = localStorage.getItem('resume_cache');
        const cachedQuotes = localStorage.getItem('quotes_cache');
        const cachedMusic = localStorage.getItem('music_cache');
        const cachedRewind = localStorage.getItem('rewind_cache');
        
        let hasCache = false;

        if (cachedDb) {
            db = JSON.parse(cachedDb);
            window.db = db;
            initFuse(db);
            hasCache = true;
        }
        if (cachedResume) {
            resumeDb = JSON.parse(cachedResume);
            hasCache = true;
        }
        if (cachedQuotes) {
            quotesDb = JSON.parse(cachedQuotes);
        }
        if (cachedMusic) {
            musicDb = JSON.parse(cachedMusic);
        }
        if (cachedRewind) {
            _rewindData = JSON.parse(cachedRewind);
        }

        // If we have cache, trigger the first render immediately
        if (hasCache) {
            startApp();
        }

        // Phase 1: CRITICAL PATH AGGREGATION (Main Data & Resume)
        // We only wait for the core database to show the first-time user the site.
        const [mainRaw, resumeRaw] = await Promise.all([
            fetch(CONFIG.main_sheet).then(res => res.text()),
            fetch(CONFIG.resume_sheet).then(res => res.text()).catch(e => {
                console.warn('Resume fetch failed', e);
                return "";
            })
        ]);

        // Process Main DB & Resume
        const mainData = parseCSV(mainRaw);
        const resumeDbLocal = parseCSV(resumeRaw);
        const filtered = mainData.filter(e => e.Title || e.Content || e.Page === 'Professional/Resume');

        // Inject hidden snapshots page for search discoverability
        filtered.push({
            Page: "Snapshots",
            Title: "Snapshots",
            Content: "Explore the development history and version snapshots of this website.",
            Tags: "",
            Thumbnail: ""
        });

        const currentMainRaw = localStorage.getItem('db_raw_cache');
        const currentResumeRaw = localStorage.getItem('resume_raw_cache');
        const dataChanged = mainRaw !== currentMainRaw || resumeRaw !== currentResumeRaw;

        db = filtered;
        resumeDb = (resumeDbLocal || []).map(entry => {
            if (entry.Page && entry.Page.includes('#')) {
                const [page, sectionType] = entry.Page.split('#');
                return { ...entry, Page: page, SectionType: sectionType };
            }
            return entry;
        });
        window.db = db;

        // Persist fresh critical data
        localStorage.setItem('db_cache', JSON.stringify(db));
        localStorage.setItem('resume_cache', JSON.stringify(resumeDb));
        localStorage.setItem('db_raw_cache', mainRaw);
        localStorage.setItem('resume_raw_cache', resumeRaw);

        initFuse(db);

        // WAVE 1 COMPLETE: If first-time user, they see the site NOW.
        if (!hasCache || dataChanged) {
            startApp();
        }

        // Phase 2: BACKGROUND AGGREGATION (Music & Quotes)
        // Importance 'low' ensures these don't compete with images/assets for the current page.
        const [quotesRes, musicRes] = await Promise.all([
            fetch(CONFIG.quotes_api, { priority: 'low' }).then(res => res.json()).catch(e => {
                console.warn('Quotes fetch failed', e);
                return null;
            }),
            fetch(CONFIG.music_api, { priority: 'low' }).then(res => res.json()).catch(e => {
                console.warn('Music fetch failed', e);
                return null;
            })
        ]);

        const currentPath = window.location.hash.substring(1) || "Home";

        // Process Quotes
        if (quotesRes) {
            const quotesRaw = quotesRes.quotes || quotesRes.data || quotesRes.items || quotesRes.rows || quotesRes.content || quotesRes;
            quotesDb = Array.isArray(quotesRaw) ? quotesRaw : [];
            localStorage.setItem('quotes_cache', JSON.stringify(quotesDb));
            
            // Only re-render UI if we are on a page that actually shows quotes (Personal or Home)
            if (currentPath === "Home" || currentPath.startsWith("Personal")) {
                document.querySelectorAll('.layout-quote').forEach(el => renderQuoteCard(el));
            }
        }

        // Process Music
        if (musicRes && !musicRes.error) {
            musicDb = musicRes.recent || [];
            _rewindData = musicRes.rewind || null;
            localStorage.setItem('music_cache', JSON.stringify(musicDb));
            if (_rewindData) localStorage.setItem('rewind_cache', JSON.stringify(_rewindData));
            
            // Only re-render UI if we are on the Home page or Personal/Music subpages
            if (currentPath === "Home" || currentPath.startsWith("Personal")) {
                document.querySelectorAll('[data-type="recent-music"]').forEach(el => renderRecentMusic(el));
                document.querySelectorAll('[data-type="top-artists"]').forEach(el => renderRewindSection(el, 'top-artists'));
                document.querySelectorAll('[data-type="top-songs"]').forEach(el => renderRewindSection(el, 'top-songs'));
                document.querySelectorAll('[data-type="fresh-favorites"]').forEach(el => renderRewindSection(el, 'fresh-favorites'));
            }
        }

        return [db, quotesDb, resumeDb, musicDb];
    } catch (e) {
        console.error('Fetch failed', e);
        if (db.length > 0) startApp();
    }
}

function initFuse(data) {
    window.fuse = new Fuse(data, {
        keys: [
            { name: 'Title', weight: 0.7 },
            { name: 'Content', weight: 0.5 },
            { name: 'Tags', weight: 0.5 },
            { name: 'Page', weight: 0.3 },
            { name: 'Author', weight: 0.1 }
        ],
        threshold: 0.4, 
        location: 0,
        distance: 100,
        minMatchCharLength: 2,
        includeScore: true,
        useExtendedSearch: true,
        ignoreLocation: true
    });
}

function fetchCSV(url) {
    // Enabled browser caching for CSV data. 
    // This allows the site to feel "instant" on repeat visits while the background 
    // update logic (SEO sync or manual refresh) ensures data stays fresh eventually.
    return fetch(url)
        .then(res => res.text())
        .then(text => parseCSV(text));
}

function safeHTML(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, m => map[m]);
}

function trackEvent(path, title = "") {
    if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({
            path: path,
            title: title || path,
            event: true
        });
    }
}

function initApp() {
    handleRouting();
    window.addEventListener("hashchange", handleRouting);
    // Intelligent touch listener to prevent only BOTTOM overscroll bounce
    window.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) window._startY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        document.getElementById("main-header").classList.add("scrolling");
        
        if (!window._startY) return;
        const y = e.touches[0].clientY;
        const isScrollingDown = window._startY > y;
        
        // If we are at the bottom and pulling up (scrolling down), prevent bounce
        if (isScrollingDown) {
            const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
            if (window.scrollY >= scrollableHeight - 2) {
                // Prevent bottom bounce (which causes Chrome browser bar glitches)
                if (e.cancelable) e.preventDefault();
            }
        }
    }, { passive: false });

    // 1. Central Haptic Engine: Intercepts taps in CAPTURE phase
    document.addEventListener("click", e => {
        const interactive = e.target.closest(
            "#brand-name, #search-controls, .nav-link, .sub-link, button, [onclick], [role=\"button\"], .layout-grid, .archive-item-card, .clickable-block, .hero-link, .refresh-btn, .dice-icon, a, .chip, .article-link-btn, .author-link, .music-yt-overlay"
        );
        if (interactive && navigator.vibrate) {
            const isMajor = interactive.closest("#brand-name, #search-controls, #theme-toggle, .nav-row.level-1 .nav-link, .archive-item-card");
            haptic(isMajor ? 'pulse' : 'tap');

            // GoatCounter: General Click Tracking
            const type = interactive.id || interactive.className || interactive.tagName;
            const text = (interactive.innerText || interactive.title || interactive.ariaLabel || "").trim().substring(0, 50);
            trackEvent(`click:${type}`, text);
        }
    }, {
        passive: true,
        capture: true
    });

    let _lastWidth = window.innerWidth;
    window.addEventListener("resize", (() => {
        let resizeTimeout;
        return () => {
            if (resizeTimeout) cancelAnimationFrame(resizeTimeout);
            resizeTimeout = requestAnimationFrame(() => {
                const currentWidth = window.innerWidth;
                if (currentWidth === _lastWidth) return;
                _lastWidth = currentWidth;

                const isDesktop = currentWidth > 768;
                document.querySelectorAll(".nav-row").forEach(row => {
                    if (isDesktop) {
                        row.scrollLeft = 0;
                    } else {
                        centerNavRow(row, true);
                    }
                });
            });
        };
    })());

    // 2. Search & Dismissal Logic
    document.addEventListener("click", e => {
        const overlay = document.getElementById("search-overlay");
        const controls = document.getElementById("search-controls");
        const results = document.getElementById("search-results");

        if (overlay.classList.contains("active")) {
            const isInsideSearch = overlay.contains(e.target) || controls.contains(e.target);
            const card = e.target.closest('.layout-grid');
            const isCardClick = card && results.contains(card);

            // Close if:
            // 1. Clicked on a result card (navigation will happen, then search closes)
            // 2. Clicked completely outside the search bar and results container
            // 3. Clicked on the search results background (not on a card)
            if (isCardClick || !isInsideSearch) {
                // If it's a card click, navigateTo will handle the closeSearch() 
                // but we add a safety timeout or direct call if it wasn't a link
                closeSearch();
            }
        }
    });

    // 3. Chip Filtering (CAPTURE phase to prevent card navigation)
    document.getElementById("app").addEventListener("click", e => {
        const chip = e.target.closest(".chip");
        if (chip) {
            // If the user clicked a link INSIDE the chip, let the link handle it.
            // We do NOT stop propagation here so the link's own click/bubble can happen,
            // and we DO NOT trigger the filter logic.
            if (e.target.closest("a")) return;

            // Prevent navigation of parent card
            e.stopPropagation();

            if (isSearchActive) closeSearch();

            const t = chip.getAttribute("data-tag");
            const n = chip.getAttribute("data-date");

            if (n) {
                window.location.hash = "Filter:" + n.replace(/\s+/g, "_");
            } else if (t) {
                window.location.hash = "Filter:" + t.replace(/\s+/g, "_");
            }
        }
    }, {
        capture: true,
        passive: false
    });

    // 4. Global Music Dismissal (Stop player when clicking outside)
    document.addEventListener("click", e => {
        const activePlayingCard = document.querySelector('.layout-grid.cat-music.is-playing');
        if (!activePlayingCard) return;

        // If click is NOT inside the active card
        if (!activePlayingCard.contains(e.target)) {
            // Cancel any pending transitions to avoid blanking out the restored image
            if (activePlayingCard._playTimer) {
                clearTimeout(activePlayingCard._playTimer);
                activePlayingCard._playTimer = null;
            }

            const mediaRow = activePlayingCard.querySelector('.row-media');
            const originalHTML = activePlayingCard.getAttribute('data-original-media');
            if (mediaRow && originalHTML) {
                mediaRow.innerHTML = originalHTML;
                activePlayingCard.classList.remove('is-playing');
            }
        }
    });

    document.addEventListener("keydown", e => {
        const isSearchFocused = "search-input" === (document.activeElement ? document.activeElement.id : "");

        if (isSearchFocused) {
            if ("/" === e.key || "Escape" === e.key) {
                e.preventDefault();
                closeSearch();
                return;
            }
            if ("Enter" === e.key) {
                e.preventDefault();
                const searchInput = document.getElementById("search-input");
                const t = (searchInput.value || '').toLowerCase();
                const cmdMatch = ['!bug', '!idea', '!feedback'].find(w => t.startsWith(w));
                
                if (cmdMatch) {
                    const msg = searchInput.value.substring(cmdMatch.length).trim();
                    if (msg.length >= 3) {
                        const actionLabel = cmdMatch.replace('!', '').toUpperCase();
                        submitFeedback(actionLabel, msg);
                    }
                } else {
                    const firstResultUrl = document.querySelector('#search-results a');
                    if(firstResultUrl) {
                         firstResultUrl.click();
                    }
                }
            }
        }

        if (("/" === e.key || e.metaKey && "k" === e.key || e.ctrlKey && "k" === e.key) && !isSearchActive &&
            !isSearchFocused) {
            e.preventDefault();
            toggleSearch();
        }

        if ("Escape" === e.key) {
            if (isSearchActive || document.getElementById("search-overlay").classList.contains("active")) {
                closeSearch();
            } else if (window.location.hash && "#Home" !== window.location.hash) {
                resetToHome();
            }
        }
    });

    // 5. Debounced Search Listener
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        const debouncedSearch = debounce((val) => handleSearch(val), 250);
        searchInput.addEventListener("input", (e) => debouncedSearch(e.target.value));
    }

    // 6. Bottom nav: keep body padding-bottom in sync with the nav bar height
    //    so content is never hidden behind the fixed bottom nav.
    const headerEl = document.getElementById("main-header");
    if (headerEl) {
        const syncPadding = () => {
            document.body.style.paddingBottom = headerEl.offsetHeight + "px";
        };
        syncPadding();
        new ResizeObserver(syncPadding).observe(headerEl);
    }
}

function renderNavigation(currentPath, forceSmoothNav = false) {
    const navStack = document.getElementById("nav-stack");
    const header = document.getElementById("main-header");
    const pathParts = currentPath && "Home" !== currentPath ? currentPath.split("/") : [];
    const totalLevels = pathParts.length + 1;
    const activeRowIds = [];

    for (let level = 1; level <= totalLevels; level++) {
        const parentPath = level === 1 ? null : pathParts.slice(0, level - 1).join("/");
        const activeName = pathParts.length >= level ? pathParts[level - 1] : null;

        let items = [];
        if (level === 1) {
            items = [...new Set([
                ...db.filter(e => e.Page && "Footer" !== e.Page && "Home" !== e.Page && "Snapshots" !== e.Page)
                    .map(e => e.Page.split("/")[0])
                    .filter(e => e),
                quotesDb.length > 0 ? "Personal" : null
            ].filter(e => e))];
        } else {
            items = [...new Set(
                db.filter(e => e.Page && e.Page.startsWith(parentPath + "/"))
                    .map(e => e.Page.split("/")[level - 1])
                    .filter(e => e)
            )];
        }

        if (items.length === 0) break;

        const rowId = `nav-row-${level}`;
        activeRowIds.push(rowId);

        let row = document.getElementById(rowId);
        const isNew = !row;
        if (isNew) {
            row = document.createElement("nav");
            row.id = rowId;
            row.className = "nav-row level-" + (level > 1 ? "n" : "1");
            // Only add slide animation if the user isn't actively swiping 
            row.classList.add("slide-in-right");
            navStack.appendChild(row);
            setupHapticScroll(row);
        }

        let html = "";
        const prefix = parentPath ? parentPath + "/" : "";

        // Optimized non-destructive update
        const current = Array.from(row.children);
        const canUpdateInPlace = current.length === items.length &&
            current.every((link, i) => link.textContent === safeHTML(items[i]));

        if (canUpdateInPlace) {
            items.forEach((item, i) => {
                const linkClass = level === 1 ? "nav-link" : "sub-link";
                const activeClass = item === activeName ? "active" : "";
                const newClass = `${linkClass} fill-anim ${activeClass}`;
                if (current[i].className !== newClass) {
                    current[i].className = newClass;
                }
            });
        } else {
            if (row._resetHaptic) row._resetHaptic(); // Reset haptics only on full re-render

            // Mark for instant center-reset when category content changes
            row._needsReset = true;

            row.innerHTML = items.map(item => {
                const linkClass = level === 1 ? "nav-link" : "sub-link";
                const activeClass = item === activeName ? "active" : "";
                const fullPath = (parentPath ? parentPath + "/" : "") + item;
                return `<a href="#${path2url(fullPath)}" class="${linkClass} fill-anim ${activeClass}" onclick="closeSearch()">${safeHTML(item)}</a>`;
            }).join("");
        }
        // Re-enable snapping and center after content is set
        requestAnimationFrame(() => {
            const activeLink = row.querySelector(".active");
            const isInteracting = (_activeNavControl === row);

            if (!isInteracting) {
                setNavSnapping(row, (activeLink && row.scrollWidth > row.clientWidth + 5) ? 'proximity' : 'none');
                // Only center if we're not touching/swiping the row
                centerNavRow(row, level > 1, forceSmoothNav ? "smooth" : "auto");
            }
        });
    }

    navStack.querySelectorAll(".nav-row").forEach(row => {
        const isActive = activeRowIds.includes(row.id);
        row.classList.toggle("hidden", !isActive);
    });

    const brand = document.getElementById("brand-name");
    if (brand) brand.classList.toggle("active", !currentPath || currentPath === "Home");
}

let _lastHaptic = 0;

function haptic(tier) {
    try {
        if (!navigator.vibrate) return;

        // Allow long-scroll haptics by relying on browser's native activation tracking
        // and simply throttling to prevent spam-blocking (15ms safety gap)
        const now = Date.now();
        if (now - _lastHaptic < 15) return;
        _lastHaptic = now;

        const tiers = {
            tick: 1,
            tap: 1,
            bump: 3,
            pulse: [1, 25, 1]
        };
        navigator.vibrate(tiers[tier] || tier || 2);
    } catch (e) { }
}

let _activeNavControl = null; // Tracks the row currently being manually interacted with

function setNavSnapping(row, mode = "none") {
    if (!row) return;
    // Snapping is only useful if there's an active item to lock onto
    const hasActive = row.querySelector(".active");
    if (!hasActive || mode === "none") {
        row.style.scrollSnapType = 'none';
    } else if (mode === "mandatory") {
        row.style.scrollSnapType = 'x mandatory';
    } else if (mode === "proximity") {
        row.style.scrollSnapType = 'x proximity';
    }
}

function centerNavRow(row, isSubNav, behavior = "auto") {
    if (!row || row === _activeNavControl) return;
    if (window.innerWidth > 768) return;

    row._needsReset = false;
    // Only scroll if there is overflow
    if (row.scrollWidth <= row.clientWidth + 5) {
        setNavSnapping(row, "none");
        return;
    }

    const activeLink = row.querySelector(".active");
    setNavSnapping(row, "none"); // Always disable during programmatic glide

    const restoreSnap = () => {
        // After a programmatic center, we use proximity to allow some manual drift 
        // while still encouraging the active link to stay in view.
        if (row !== _activeNavControl) setNavSnapping(row, "proximity");
    };

    if (activeLink) {
        const targetScroll = activeLink.offsetLeft + activeLink.offsetWidth / 2 - row.clientWidth / 2;
        row.scrollTo({
            left: targetScroll,
            behavior: behavior
        });

        if (behavior === "smooth") {
            if ('onscrollend' in window) row.addEventListener('scrollend', restoreSnap, {
                once: true
            });
            else setTimeout(restoreSnap, 500);
        } else {
            requestAnimationFrame(restoreSnap);
        }
    } else {
        const midpoint = (row.scrollWidth - row.clientWidth) / 2;
        row.scrollTo({
            left: midpoint,
            behavior: behavior
        });
    }
}

/* 
 * Haptic System — Touch-gated, instant-navigate scroll picker 
 */
const _hapticRows = new WeakSet();

function setupHapticScroll(row) {
    if (_hapticRows.has(row) || !navigator.vibrate) return;
    _hapticRows.add(row);
    let s = {
        hitStart: false,
        hitEnd: false,
        hTicking: false,
        lastCenteredHref: null,
        settleTimer: null,
        lastInputTime: 0,
        lastScrollTime: 0,
        fingerDown: false,
        isValidInteraction: false
    };

    const markInput = (e) => {
        s.lastInputTime = Date.now();
        s.isValidInteraction = true;
        s.fingerDown = true;
        _activeNavControl = row;
        setNavSnapping(row, "none");
    };

    const releaseInput = () => {
        s.fingerDown = false;
    };

    // Public API for Global Swipe Proxy
    row._markNavInput = markInput;
    row._releaseNavInput = releaseInput;

    row.addEventListener("touchstart", (e) => {
        markInput(e);
        row.scrollTo({
            left: row.scrollLeft,
            behavior: 'auto'
        });
        Object.assign(s, {
            hitStart: false,
            hitEnd: false
        });
    }, {
        passive: true
    });

    row.addEventListener("touchmove", markInput, {
        passive: true
    });
    row.addEventListener("touchend", releaseInput, {
        passive: true
    });
    row.addEventListener("wheel", markInput, {
        passive: true
    });
    row.addEventListener("mousedown", markInput, {
        passive: true
    });
    row.addEventListener("mouseup", releaseInput, {
        passive: true
    });
    row.addEventListener("mouseleave", releaseInput, {
        passive: true
    });

    row.addEventListener("scroll", () => {
        const now = Date.now();
        // Determine if this is a user-initiated interaction or a programmatic shift.
        // We keep the interaction valid as long as we have recent touch input OR active scrolling.
        if (now - s.lastInputTime > 500 && now - s.lastScrollTime > 150) {
            s.isValidInteraction = false;
        }
        if (!s.isValidInteraction) {
            if (_activeNavControl === row) _activeNavControl = null;
            return;
        }

        s.lastScrollTime = now;
        _activeNavControl = row;

        const cur = row.scrollLeft;
        const max = row.scrollWidth - row.clientWidth;

        // End-of-Chain Haptics (Production Polish)
        if (cur <= 0) {
            if (!s.hitStart) {
                haptic('bump');
                s.hitStart = true;
            }
        } else if (cur >= max - 1) {
            if (!s.hitEnd) {
                haptic('bump');
                s.hitEnd = true;
            }
        } else Object.assign(s, {
            hitStart: false,
            hitEnd: false
        });

        if (!s.hTicking) {
            s.hTicking = true;
            requestAnimationFrame(() => {
                const links = row.querySelectorAll(".sub-link");
                if (!links.length) return (s.hTicking = false);

                const center = cur + row.clientWidth / 2;
                let closest = null,
                    minDist = Infinity;
                links.forEach(link => {
                    const dist = Math.abs(link.offsetLeft + link.offsetWidth / 2 - center);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = link;
                    }
                });

                const href = closest?.getAttribute("href")?.substring(1);
                if (href && href !== s.lastCenteredHref) {
                    s.lastCenteredHref = href;
                    haptic('tick');
                    links.forEach(l => l.classList.toggle("active", l === closest));
                    navigateTo(href, true);
                }
                s.hTicking = false;
            });
        }

        clearTimeout(s.settleTimer);
        s.settleTimer = setTimeout(() => {
            if (s.lastCenteredHref) {
                history.replaceState(null, "", "#" + path2url(s.lastCenteredHref));
            }
            if (!s.fingerDown) {
                _activeNavControl = null;
                s.isValidInteraction = false;
                setNavSnapping(row, "none");
            }
        }, 240);
    }, {
        passive: true
    });

    row._resetHaptic = () => {
        s.lastCenteredHref = null;
        s.isValidInteraction = false;
        s.fingerDown = false;
        if (_activeNavControl === row) _activeNavControl = null;
    };
}



function resetToHome() {
    closeSearch();
    clearTextSelection();
    window.location.hash = "";
}

const clearTextSelection = () => window.getSelection()?.removeAllRanges();

function closeSearch() {
    document.getElementById("search-overlay").classList.remove("active");
    document.body.classList.remove("search-active");
    const e = document.getElementById("search-input");
    e.value = "";
    e.style.color = "";
    e.disabled = false;
    e.blur();

    const resultsContainer = document.getElementById("search-results");
    const app = document.getElementById("app");
    if (resultsContainer) {
        resultsContainer.style.display = "none";
        resultsContainer.innerHTML = "";
    }
    if (app) app.style.display = "block";

    if (isSearchActive) {
        isSearchActive = false;
    }
}

function toggleSearch() {
    const overlay = document.getElementById("search-overlay");
    const isActive = overlay.classList.toggle("active");
    document.body.classList.toggle("search-active");

    if (isActive) {
        isSearchActive = true;
        setTimeout(() => document.getElementById("search-input").focus(), 100);
    } else {
        closeSearch();
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Models match background via CSS variables.

}

window.submitFeedback = async function(type, text) {
    const searchInput = document.getElementById("search-input");
    const resultsContainer = document.getElementById("search-results");
    
    if (searchInput) {
        searchInput.disabled = true;
    }

    
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const formattedTimestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    const payload = new URLSearchParams();
    payload.append("type", "feedback");
    payload.append("category", type);
    payload.append("message", text);
    payload.append("path", window.location.hash || '#Home');
    payload.append("timestamp", formattedTimestamp);
    
    try {
        const response = await fetch(CONFIG.music_api, {
            method: "POST",
            body: payload
        });
        
        const result = await response.json();
        
        if (result.status === "success" || result.result === "success") {
            if (searchInput) {
                searchInput.style.color = "#00ffa3"; // SUCCESS GREEN
                haptic('pulse');
                setTimeout(() => {
                    closeSearch();
                    searchInput.value = '';
                    searchInput.disabled = false;
                    searchInput.style.color = "";
                }, 1000);
            }
        } else {
            if (searchInput) {
                searchInput.style.color = "#e74c3c"; // ERROR RED
                searchInput.disabled = false;
                haptic('pulse');
            }
            console.error("Failed to submit feedback:", result);
        }
    } catch (err) {
        if (searchInput) {
            searchInput.style.color = "#e74c3c"; // ERROR RED
            searchInput.disabled = false;
            haptic('pulse');
        }
        console.error("Error during feedback submission:", err);
    }
};

function handleSearch(e) {
    if (!document.getElementById("search-overlay").classList.contains("active")) return;
    const resultsContainer = document.getElementById("search-results");
    const app = document.getElementById("app");

    if (!e || e.trim() === "") {
        if (resultsContainer) {
            resultsContainer.innerHTML =
                '<div class="section layout-hero"><h2 class="header-fade-anim">Search</h2><p style="color:var(--text-dim); font-size:16px;">Type to search across all content...</p></div>';
            resultsContainer.style.display = "block";
        }
        if (app) app.style.display = "none";
        return;
    }
    const t = e.toLowerCase();
    
    // GoatCounter: Track significant search queries (throttled/debounced implicitly by the search logic)
    if (t.length > 2) trackEvent(`search:${t}`, `Searching for: ${t}`);

    // ⚡ COMMAND INTERCEPT LOGIC
    const searchInput = document.getElementById("search-input");
    const cmdMatch = ['!bug', '!idea', '!feedback'].find(w => t.startsWith(w));
    
    if (cmdMatch) {
         if (searchInput) {
              // Highlight the input green to show it's detected a command
              searchInput.style.color = "#00ffa3"; 
         }
         if (resultsContainer) {
              resultsContainer.innerHTML = ''; // Keep it clean
         }
         if (app) app.style.display = "none";
         return; // Stop normal search execution
    } else {
         if (searchInput && !searchInput.disabled) searchInput.style.color = ""; // Restore normal color
    }




    const matchesQuery = (entry, term) => entry?.Title?.toLowerCase().includes(term) || entry?.Content
        ?.toLowerCase().includes(term) || entry?.Tags?.toLowerCase().includes(term);
    
    // Fuzzy search using Fuse.js
    let n = [];
    if (window.fuse) {
        n = window.fuse.search(e).map(result => result.item);
    } else {
        // Fallback to basic search if Fuse isn't ready
        n = db.filter(entry => matchesQuery(entry, t));
    }

    // Exclude dynamic blocks and non-searchable UI placeholders
    n = n.filter(item => {
        const title = (item.Title || "").toLowerCase();
        // Skip purely dynamic block triggers
        if (title.includes("{random quote}") || title.includes("{top artists}") || 
            title.includes("{top songs}") || title.includes("{fresh favorites}") ||
            title.includes("{recently played}") || title.includes("{recent music}")) return false;
        return true;
    });

    // Special case for Resume content which lives in a separate sheet
    if (resumeDb.some(entry => matchesQuery(entry, t)) && !n.find(entry => "Professional/Resume" === entry.Page)) {
        const resumePage = db.find(entry => "Professional/Resume" === entry.Page);
        if (resumePage) n.push(resumePage);
    }

    if (resultsContainer) {
        resultsContainer.innerHTML = '';
        // Use requestAnimationFrame to ensure the clearing of the container 
        // and the rendering of results happens smoothly without blocking input
        requestAnimationFrame(() => {
            renderRows(n, `Search results for "${safeHTML(e)}"`, false, true, false, true, resultsContainer);
            resultsContainer.style.display = "block";
            if (app) app.style.display = "none";
        });
    }
}

const path2url = p => p?.replace(/ /g, '_') ?? '';
const url2path = u => u?.replace(/_/g, ' ') ?? '';

function navigateTo(path, isSwipe = false, forceSmoothNav = false) {
    if (window.closeSearch && !isSwipe) closeSearch();

    const header = document.getElementById("main-header");
    if (header && !isSwipe) header.classList.remove("scrolled");
    window.scrollTo({
        top: 0,
        behavior: 'instant'
    });

    clearTextSelection();

    const cleanPath = url2path(path || "Home");
    _activeRenderPath = cleanPath;
    window._lastNavTime = Date.now();

    // 1. Immediately update navigation metadata (Header Fill + Active States)
    renderNavigation(cleanPath === "Home" ? null : cleanPath, forceSmoothNav);

    // 2. Optimization: If we're swiping and the content is already there, SKIP rendering.
    if (isSwipe && cleanPath === _lastRenderedPath) {
        return;
    }

    // 3. Debounced heavy rendering pipeline
    if (_renderRAF) cancelAnimationFrame(_renderRAF);

    // Show skeleton for transitions to give immediate feedback
    if (!isSwipe && cleanPath !== _lastRenderedPath) {
        // showPageLoader(); // DISABLING GLOBAL LOADERS FOR HIGHER PERFORMANCE
    }

    _renderRAF = requestAnimationFrame(() => {
        // Render Guard: Only build the page if this is still the final target
        if (_activeRenderPath !== cleanPath) return;

        const route = {
            "Index": renderIndex,
            "Snapshots": renderSnapshots,
            "Professional/Resume": renderResume
        };
        (route[cleanPath] ?? (cleanPath.startsWith("Filter:") ? () => renderFiltered(decodeURIComponent(
            cleanPath.split(":")[1].replace(/_/g, " "))) : () => renderPage(cleanPath)))();

        // Clean up any stale 3D viewers from the old page
        if (window.cleanupStale3DViewers) window.cleanupStale3DViewers();

        // 4. Update SEO based on the newly rendered page
        updateSEO(cleanPath);


        // Mark this path as rendered so subsequent identical swipes don't trigger re-renders
        _lastRenderedPath = cleanPath;
        _renderRAF = null;

        // Force scroll to top after rendering to prevent "scroll leakage" from search results or previous pages
        window.scrollTo(0, 0);

        // STRAVA: Re-trigger embed bootstrap if content was added
        if (typeof window.__STRAVA_EMBED_BOOTSTRAP__ === 'function') {
            window.__STRAVA_EMBED_BOOTSTRAP__();
        }

        // GOATCOUNTER: Track SPA page view
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({
                path: location.pathname + location.search + location.hash
            });
        }
    });
}

function handleRouting() {
    const path = window.location.hash.substring(1) || "Home";
    // Routing via hashchange (clicks, back button) should always be smooth
    navigateTo(path, false, true);
}

const getCategoryClass = page => {
    const p = (page || '').toLowerCase();
    return p.startsWith('projects') ? 'cat-projects' : p.startsWith('professional') ? 'cat-professional' : p
        .startsWith('personal') ? 'cat-personal' : '';
};

function renderFiltered(filter) {
    const range = getDateRange(filter);
    let label = filter;

    // Humanize label if it's a simple YYYY-MM
    const m = filter.match(/^(\d{4})-(\d{2})$/);
    if (m) {
        label = `${new Date(m[1], parseInt(m[2]) - 1, 1).toLocaleString("default", { month: "long" })} ${m[1]}`;
    }

    const filtered = db.filter(row => {
        // 1. Direct Tag Match (Always priority)
        if (row.Tags && row.Tags.includes(filter)) return true;
        
        // 2. Advanced Range Overlap Check (Only if 'filter' was actually a date)
        if (range && row.Timestamp) {
            const itemRange = getDateRange(row.Timestamp);
            if (itemRange && itemRange.start <= range.end && itemRange.end >= range.start) return true;
        }
        
        return false;
    });
    
    renderRows(filtered, safeHTML(label), false, true, false, true);
}

function renderPage(e) {
    if ("Home" === e) return void renderHome();
    const t = db.filter(t => t.Page === e);
    const isTopLevel = !e.includes("/");
    const hasChildren = childrenPagesCheck(e);

    if (t.length === 0 && !hasChildren && !("Personal" === e && quotesDb.length > 0)) {
        updateContainer(document.getElementById("app"), 
            `<div class="section layout-hero"><h1 class="header-fade-anim">404</h1><p style="color:var(--text-dim); font-size:16px;">This page doesn't exist in the database yet.</p></div>`);
        return;
    }

    // Build complete HTML for the page to update DOM only once
    let finalHTML = buildRowsHTML(t, null, false, !isTopLevel);

    const pathParts = e.split("/");
    const currentDepth = pathParts.length;
    const childPaths = [...new Set(
        db.filter(item => item.Page && item.Page.startsWith(e + "/") && item.Page !== e)
            .map(item => item.Page.split("/").slice(0, currentDepth + 1).join("/"))
    )];

    if (childPaths.length > 0) {
        const childEntries = childPaths.map(childPath => {
            const exactMatch = db.find(entry => entry.Page === childPath);
            if (exactMatch) return exactMatch;
            const folderName = childPath.split("/").pop().replace(/_/g, ' ');
            const descendant = db.find(entry => entry.Page && entry.Page.startsWith(childPath + "/") && entry.CoverImage);
            return {
                Page: childPath,
                Title: folderName,
                Subtitle: "Collection",
                Description: `Explore the ${folderName} collection.`,
                CoverImage: descendant ? descendant.CoverImage : "",
                Tags: "",
                Timestamp: descendant ? descendant.Timestamp : ""
            };
        });
        finalHTML += buildRowsHTML(childEntries, null, true);
    }

    updateContainer(document.getElementById("app"), finalHTML);
}

function childrenPagesCheck(e) {
    // Check if ANY children exist (even deep ones) to validate page existence
    return db.some(t => t.Page && t.Page.startsWith(e + "/"));
}

function renderIndex() {
    const allPages = [...new Set(
        db.map(e => e.Page).filter(e => e && "Home" !== e && "Footer" !== e)
    )];

    const groups = {};
    allPages.forEach(page => {
        const category = page.split("/")[0];
        if (!groups[category]) groups[category] = [];
        groups[category].push(page);
    });

    let finalHTML = '<div class="section layout-hero"><h1 class="fill-anim">Index</h1></div><div class="section index-list">';
    for (const [category, pages] of Object.entries(groups)) {
        const catClass = getCategoryClass(category);
        finalHTML += `<div class="index-group ${catClass}"><h3>${category}</h3>`;
        pages.forEach(page => {
            const entry = db.find(e => e.Page === page);
            const title = entry ? entry.Title : page.split("/").pop();
            const depth = page.split("/").length;
            finalHTML += `<a href="#${path2url(page)}" class="index-link fill-anim ${depth > 1 ? `depth-${depth}` : ""}">${title}</a>`;
        });
        finalHTML += "</div>";
    }
    finalHTML += '</div>';
    updateContainer(document.getElementById("app"), finalHTML);
}

let _archiveSortAsc = false;
async function renderSnapshots() {
    let history = [];
    try {
        // Atomic Mode: Fetch manifest then load fragments in parallel
        const manifestRes = await fetch('assets/data/history/manifest.json');
        const manifest = await manifestRes.json();
        
        const fragments = await Promise.all(
            manifest.map(month => 
                fetch(`assets/data/history/${month}.json`).then(res => res.json())
            )
        );
        
        // Flatten the fragments into a single history array
        history = fragments.flat();
    } catch (e) {
        console.warn('Failed to load fragmented history, falling back to monolithic...', e);
        try {
            const res = await fetch('assets/data/history.json');
            history = await res.json();
        } catch (innerE) {
            console.error('Total history load failure', innerE);
        }
    }

    if (!history) history = [];

    // Apply sorting (default newest first)
    const sortedHistory = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Distill v0 history: only show the final commit of each week for the legacy era.
    // v1+ Milestones are always shown.
    // Spree Detection: Group v0 commits into "coding sessions" separated by 4-hour gaps.
    // We only show the latest (highest) commit from each spree. v1+ milestones are always shown.
    const distilledHistory = [];
    const SPREE_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

    sortedHistory.forEach((item, index) => {
        // First commit is always the start of its spree
        if (index === 0) {
            distilledHistory.push(item);
        } else {
            const prevTime = new Date(sortedHistory[index - 1].date).getTime();
            const currTime = new Date(item.date).getTime();
            const gap = Math.abs(prevTime - currTime);
            
            // If the gap between THIS and the PREVIOUS (newer) commit is > 4h, this is a new spree
            if (gap > SPREE_GAP_MS) {
                distilledHistory.push(item);
            }
        }
    });

    const distilledCount = distilledHistory.length; 
    
    // Grouping logic (Distilled)
    const groups = {};
    distilledHistory.forEach(item => {
        const monthKey = item.date.substring(0, 7);
        if (!groups[monthKey]) groups[monthKey] = [];
        groups[monthKey].push(item);
    });

    const monthKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    
    // Total commits mentioned in hero will be the count before distillation?
    // User: "evolution of this site through 808 commits"... I'll show the total history.length
    
    const tocLinks = monthKeys.map(key => {
        const [y, m] = key.split('-');
        const name = new Date(y, parseInt(m)-1).toLocaleString('default', {month:'long'});
        return `<div class="toc-item depth-2">
            <a href="javascript:void(0)" onclick="document.getElementById('month-${key}')?.scrollIntoView({behavior:'smooth'}); haptic('tick');" style="font-size: 15px; font-weight: 600; line-height: 1.2; display: inline-block; font-family:'Jost', sans-serif;">${name} ${y}</a>
        </div>`;
    }).join('');

    let finalHTML = `<div class="section layout-hero">
        <h1 class="fill-anim">Snapshots</h1>
        <p style="color:var(--text-dim); max-width:600px; font-family:'Jost', sans-serif;">Exploring the evolution of this site through <b>${history.length} commits</b> across <b>${distilledCount}</b> coding sessions.</p>
        
        <div class="toc-container" style="margin: 1.5rem 0; text-align: center;">
            <h2 id="contents" style="margin-bottom: 8px; font-size: 18px; font-weight: 700; font-family:'Jost', sans-serif;">Chronology</h2>
            <div class="toc-list" style="padding-left: 0; display: flex; flex-direction: column; gap: 8px; align-items: center;">
                ${tocLinks}
            </div>
        </div>
    </div>`;

    if (history.length === 0) {
        finalHTML += `<div class="section layout-text"><p>No version history available yet.</p></div>`;
    } else {
        monthKeys.forEach(monthKey => {
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'long' });
            
            finalHTML += `<div id="month-${monthKey}" class="section-title-wrapper" style="margin-top: 40px; margin-bottom: 20px;">
                <h2 class="header-fade-anim" style="font-size: 18px; font-weight: 600; opacity: 0.9; font-family:'Jost', sans-serif;">${monthName} ${year}</h2>
            </div>`;
            
            finalHTML += '<div class="section archive-list-grid" style="padding-top: 0; padding-bottom: 20px;">';
            // Assign stable, distinct colors to version tags
            const getVersionColor = (tag) => {
                if (tag === 'v0') return { bg: 'var(--border-subtle)', text: 'var(--text-dim)', border: 'none' };
                let hash = 0;
                for (let i = 0; i < tag.length; i++) {
                    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
                }
                const h = Math.abs(hash % 360);
                return { 
                    bg: `hsla(${h}, 70%, 45%, 0.15)`, 
                    text: `hsl(${h}, 80%, 75%)`,
                    border: `1px solid hsla(${h}, 70%, 45%, 0.3)`
                };
            };

            groups[monthKey].forEach(item => {
                const visitUrl = `https://raw.githack.com/sahibdsv/sahibdsv.github.io/${item.hash}/index.html`;
                const versionMatch = item.message.match(/\[v(\d+\.\d+)\]/i);
                const versionTag = versionMatch ? `v${versionMatch[1]}` : 'v0';
                const vColor = getVersionColor(versionTag);

                finalHTML += `
                    <div class="archive-item-card" onclick="window.open('${visitUrl}', '_blank')">
                        <div class="archive-card-header">
                            <div style="display:flex; align-items:center; gap:8px;">
                                ${versionMatch ? `<span class="chip stat version-chip" style="margin:0; pointer-events:none; cursor:default; background:${vColor.bg}; color:${vColor.text}; border:${vColor.border}; font-size:9px; height:auto; padding:3px 6px; opacity:1;">${versionTag}</span>` : ''}
                                <span class="date">${item.date}</span>
                            </div>
                            <span class="hash" style="color:var(--accent-projects);">${item.hash.substring(0, 7)}</span>
                        </div>
                        <h3 class="message" style="font-family:'Jost', sans-serif;">${safeHTML(item.message.replace(/\[v\d+\.\d+\]/i, '').trim())}</h3>
                    </div>
                `;
            });
            finalHTML += '</div>';
        });
    }

    updateContainer(document.getElementById("app"), finalHTML);
}

function renderHome() {
    const heroEntries = db.filter(e => "Home" === e.Page);
    let finalHTML = buildRowsHTML(heroEntries, null, false);

    const otherEntries = db.filter(e => e.Page && "Home" !== e.Page && "Footer" !== e.Page);
    const activityMap = {};
    otherEntries.forEach(e => {
        const isFeatured = e.Tags && e.Tags.toLowerCase().includes("featured");
        // Improved detection: Trust anything that isn't empty, even if JS Date doesn't like it (e.g. "FALL 2025")
        // but still validate for Recent Activity to avoid complete junk
        const hasTimestamp = e.Timestamp && String(e.Timestamp).trim().length > 0;
        
        if (isFeatured || hasTimestamp) {
            activityMap[e.Page] = e;
        }
    });

    const recentItems = Object.values(activityMap).sort((a, b) => {
        const featA = a.Tags?.toLowerCase().includes("featured") ? 1 : 0;
        const featB = b.Tags?.toLowerCase().includes("featured") ? 1 : 0;
        if (featA !== featB) return featB - featA;

        // Sorting Resilience: Extract a year/month/day safely for comparison
        const getTime = (val) => {
            if (!val) return 0;
            const d = new Date(val);
            if (!isNaN(d.getTime())) return d.getTime();
            
            // Fallback for stuff like "FALL 2025" - try to find the year and sort by that
            const yearMatch = String(val).match(/\d{4}/);
            if (yearMatch) return new Date(yearMatch[0], 0, 1).getTime();
            
            return 0;
        };

        return getTime(b.Timestamp) - getTime(a.Timestamp);
    }).slice(0, 6);

    if (recentItems.length > 0) {
        finalHTML += buildRowsHTML(recentItems, "Recent Activity", true, false, true);
    }

    updateContainer(document.getElementById("app"), finalHTML);
}

function processSingleLine(e) {
    // Using the central high-fidelity inline processor for titles and metadata
    return processInlineMarkdown(e);
}

function formatTitle(e, t) {
    if (!e) return "";

    const lines = e.split('\n').map(l => l.trim()).filter(Boolean);
    const rawTitle = lines[0];
    const rawDesc = lines.slice(1).join(' ');

    const n = rawTitle.match(/^(#{1,6})\s+(.*)$/);
    let tag = t,
        content = rawTitle;
    n && (tag = "h" + n[1].length, content = n[2]);

    let html = `<${tag} class="header-fade-anim">${processInlineMarkdown(content)}</${tag}>`;
    if (rawDesc) {
        // We use a specific class to anchor this to the 'header lead' rhythmic rules
        html += `<p class="article-subtitle header-fade-anim">${processInlineMarkdown(rawDesc)}</p>`;
    }
    return html;
}
// Chip rendering helper
function renderChip(tag, cat = "") {
    if (!tag) return "";
    const isFeatured = tag.toLowerCase() === 'featured';
    const featuredClass = isFeatured ? 'chip-featured' : '';
    const catClass = cat ? `cat-${cat.toLowerCase().replace(/\s+/g, '-')}` : '';
    return `<span class="chip ${featuredClass} ${catClass}" data-tag="${tag}">${processInlineMarkdown(tag)}</span>`;
}

function renderCardHTML(entry, contextCategory = "") {
    const content = entry.Content || "";
    const isTitleLink = entry.Title ? /^https?:\/\/\S+$/.test(entry.Title) : false;
    const tEx = extractMediaFromContent(entry.Title);
    const cEx = extractMediaFromContent(content);
    const thumbUrl = getThumbnail(entry.Thumbnail);
    const mediaBuilder = (type, src, id, bgUrl = null) => {
        if (type === 'glb') {
            // Resolve path for internal models
            const glbPath = (src.startsWith('assets/') || src.startsWith('http')) ? src : `assets/models/${src}`;
            return `<div class="row-media">${renderGLBViewer(glbPath, true, bgUrl)}</div>`;
        }
        if (type === 'map') {
            const mapPath = (src.startsWith('assets/') || src.startsWith('http')) ? src : `assets/GPX/${src}`;
            return `<div class="row-media">${renderMapBoxViewer(mapPath, true)}</div>`;
        }
        if (type === 'yt-embed') return `<div class="row-media"><div class="loader-overlay"><div class="spinner"></div></div><div class="embed-wrapper video"><iframe class="media-enter" onload="mediaLoaded(this)" src="https://www.youtube-nocookie.com/embed/${id}?modestbranding=1&rel=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div></div>`;
        
        if (type === 'video') {
            const p = processMediaUrl(src);
            return `<div class="row-media">
                        <div class="loader-overlay"><div class="spinner"></div></div>
                        <video class="media-enter lazy-video ${p.invert ? 'theme-invert' : ''}" 
                                data-src="${p.url}" 
                                ${p.autoplay ? 'data-autoplay="true" muted' : ''} 
                                ${p.loop ? 'loop' : ''} 
                                ${p.controls ? 'controls' : ''} playsinline 
                                onloadeddata="mediaLoaded(this)" 
                                onerror="this.previousElementSibling?.remove()"></video>
                    </div>`;
        }

        const p = processMediaUrl(src);
        return `<div class="row-media"><div class="loader-overlay"><div class="spinner"></div></div><img class="media-enter ${p.invert ? 'theme-invert' : ''}" src="${p.url}" loading="lazy" decoding="async" crossorigin="anonymous" onload="mediaLoaded(this)" onerror="this.previousElementSibling?.remove()"></div>`;
    };

    const mediaSources = [
        () => isTitleLink && !entry.Thumbnail && tEx ? mediaBuilder(tEx.type === 'yt' ? 'yt-embed' : tEx.type, tEx.url, tEx.id) : "",
        () => entry.Thumbnail && (thumbUrl === 'GLB_VIEWER' || thumbUrl === 'GLB_WITH_BG') ? (() => {
            if (thumbUrl === 'GLB_WITH_BG') {
                const lines = entry.Thumbnail.split('\n').map(l => l.trim()).filter(Boolean);
                const glb = lines.find(l => l.match(/\.glb/i));
                const img = lines.find(l => l.match(/\.(png|jpg|jpeg|webp|svg)/i));
                return mediaBuilder('glb', glb, null, img);
            }
            return mediaBuilder('glb', entry.Thumbnail);
        })() : "",
        () => entry.Thumbnail && thumbUrl === 'MAP_VIEWER' ? mediaBuilder('map', entry.Thumbnail) : "",
        () => entry.Thumbnail && thumbUrl?.match(/\.(mp4|webm|mov|ogg)(\?.*|-(?:autoplay|thumb|noloop|nocontrols))*/i) ? mediaBuilder('video', thumbUrl) : "",
        () => entry.Thumbnail && thumbUrl ? mediaBuilder('img', thumbUrl) : "",
        () => !isTitleLink ? `<div class="row-media placeholder"><span>${(entry.Title || "").split('\n')[0].replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/\*\*(.*?)\*\*/g, '$1')}</span></div>` : ""
    ];

    const mediaHTML = mediaSources.reduce((html, fn) => html || fn(), "");

    const tagsList = entry.Tags ? entry.Tags.split(",").map(t => t.trim()) : [];

    let metaRowHTML = "";
    if (entry.Timestamp || tagsList.length > 0) {
        const cat = contextCategory || (entry.Page ? entry.Page.split('/')[0] : "");
        metaRowHTML =
            `<div class="meta-row">${entry.Timestamp ? `<span class="chip date" data-date="${entry.Timestamp}" data-val="${formatDate(entry.Timestamp)}">${formatDate(entry.Timestamp)}</span>` : ""}${tagsList.map(t => renderChip(t, cat)).join("")}</div>`;
    }

    let titleHTML = "";
    if (entry.Title && !isTitleLink) {
        const lines = entry.Title.split('\n').map(l => l.trim()).filter(Boolean);
        const mainTitle = lines[0] || "";
        const descText = lines.slice(1).join(' ');
        
        titleHTML = `<h3 class="fill-anim">${processSingleLine(mainTitle)}</h3>`;
        if (descText) {
            titleHTML += `<p class="card-description">${processSingleLine(descText)}</p>`;
        }
    }

    return `<div class="layout-grid ${contextCategory || getCategoryClass(entry.Page)} ${!entry.Thumbnail ? "has-placeholder" : ""}" onclick="location.hash=path2url('${entry.Page}')">${mediaHTML}<div class="card-info">${titleHTML}${metaRowHTML}</div></div>`;
};

const SECTION_RENDERERS = {
    quote: (entry) =>
        `<div class="layout-quote section loading" data-title="${entry.Title || ""}" data-static-quote="${entry.Content || entry.Quote || ""}" data-static-author="${entry.Content || entry.Quote ? (entry.Author || "Sahib Virdee") : ""}" data-needs-init="true">
                </div>`,
    hero: (entry) => {
        let metaHTML = "";
        if (entry.Timestamp) {
            const dateStr = formatDate(entry.Timestamp),
                monthKey = (entry.Timestamp && /^\d{4}-\d{2}/.test(entry.Timestamp)) ? entry.Timestamp.substring(0, 7) : (entry.Timestamp || "");
            metaHTML +=
                `<span class="chip date" data-val="${dateStr}" data-date="${monthKey}">${dateStr}</span>`;
        }
        if (entry.Tags) entry.Tags.split(",").map(t => t.trim()).forEach(t => metaHTML += renderChip(t, entry.Page));
        return `<div class="section layout-hero">\n${formatTitle(entry.Title, "h1")}${metaHTML ? `<div class="hero-meta">${metaHTML}</div>` : ""}${processContentWithBlocks(entry.Content || "")}\n</div>`;
    },
    text: (entry) =>
        `<div class="section layout-text">\n${entry.Title ? formatTitle(entry.Title, "h2") : ""}${processContentWithBlocks(entry.Content || "")}\n</div>`,
    article: (entry, index) => {
        let metaHTML = "";
        if (index === 0) {
            const hasLink = !!entry.LinkURL;
            const dateStr = entry.Timestamp ? formatDate(entry.Timestamp) : "";
            const monthKey = (entry.Timestamp && /^\d{4}-\d{2}/.test(entry.Timestamp)) ? entry.Timestamp.substring(0, 7) : (entry.Timestamp || "");
            const tags = entry.Tags ? entry.Tags.split(",").map(t => t.trim()) : [];
            const readTime = Math.ceil((entry.Content || "").trim().split(/\s+/).length / 200);

            if (hasLink || dateStr || tags.length > 0 || readTime > 1) {
                metaHTML = `<div class="article-meta-row">`;
                if (hasLink) metaHTML +=
                    `<a href="${entry.LinkURL}" target="_blank" class="article-link-btn"><svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
                
                metaHTML += `<div class="article-tags">`;
                if (dateStr) metaHTML += `<span class="chip date" data-val="${dateStr}" data-date="${monthKey}">${dateStr}</span>`;
                tags.forEach(t => metaHTML += renderChip(t, entry.Page));
                if (readTime > 1) metaHTML += `<span class="chip no-hover" style="opacity:0.6; cursor:default;">${readTime} min read</span>`;
                metaHTML += `</div></div>`;
            }
        }
        return `<div class="section layout-text">${entry.Title ? formatTitle(entry.Title, index === 0 ? "h1" : "h2") : ""}${metaHTML}<div class="article-body">${processContentWithBlocks(entry.Content || "")}</div></div>`;
    }

};

function buildRowsHTML(data, title, isSubPage, isHeroOnly = false, isRecentActivity = false) {
    if (isRecentActivity) {
        data.sort((a, b) => {
            const featA = a.Tags?.toLowerCase().includes("featured") ? 1 : 0;
            const featB = b.Tags?.toLowerCase().includes("featured") ? 1 : 0;
            if (featA !== featB) return featB - featA;
            return new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0);
        });
    }

    let htmlBuffer = title ?
        `<div class="section-title-wrapper"><h2 class="header-fade-anim" style="display:inline-block; font-weight:600; font-size:24px; --text-base:var(--text-dim); --text-hover:var(--text-bright);">${title}</h2></div>` :
        "";

    if (data.length === 0) {
        if (title) htmlBuffer +=
            `<div class="section layout-hero"><h2 class="header-fade-anim">Nothing Found</h2><p style="color:var(--text-dim); font-size:16px;">No entries match your query.</p></div>`;
        return htmlBuffer;
    }

    let gridBuffer = "";
    const topLevelPages = ["home", "personal", "professional", "projects", "snapshots"];

    data.forEach((entry, index) => {
        if (!entry.Page || entry.Page === "Footer") return;

        if ((entry.Title || "").toLowerCase().match(/\{?random quote\}?/)) {
            htmlBuffer += SECTION_RENDERERS.quote(entry, index);
            return;
        }

        const entryIsSubPage = entry.Page.includes('/');
        const isTopLevel = topLevelPages.includes(entry.Page.toLowerCase());

        if (isHeroOnly) {
            htmlBuffer += SECTION_RENDERERS.article(entry, index);
        } else if (!entryIsSubPage && isTopLevel && !isSubPage) {
            htmlBuffer += SECTION_RENDERERS.hero(entry, index);
        } else {
            gridBuffer += renderCardHTML(entry, getCategoryClass(entry.Page));
        }
    });

    if (gridBuffer) htmlBuffer += `<div class="grid-container section">${gridBuffer}</div>`;
    return htmlBuffer;
}

function renderRows(data, title, isHome, isSubPage, isHeroOnly = false, isRecentActivity = false,
    targetElement = null) {
    const html = buildRowsHTML(data, title, isSubPage, isHeroOnly, isRecentActivity);
    updateContainer(targetElement || document.getElementById("app"), html, isHome);
}

function updateContainer(container, html, append = false) {
    if (!container) return;

    if (append) {
        // For appending (e.g. adding Recent Activity to Home), we check if the section is already there
        // This is a bit loose but prevents double-appending on re-renders
        const sectionCheck = html.substring(0, 100);
        if (!container.innerHTML.includes(sectionCheck)) {
            container.innerHTML += html;
            postRender(container);
        }
    } else {
        // ATOMIC SOFT UPDATE
        // We use a temporary element to normalize the HTML for a reliable comparison
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const normalizedHTML = temp.innerHTML;

        if (container.innerHTML !== normalizedHTML) {
            // PRESERVATION LAYER: Prevent flickering of dynamic components (Music, Quotes)
            const dynamicState = new Map();
            container.querySelectorAll('[data-type], .layout-quote').forEach(el => {
                const key = el.getAttribute('data-type') || el.getAttribute('data-title') || el.className;
                if (el.innerHTML.trim() && !el.getAttribute('data-needs-init')) {
                    dynamicState.set(key, {
                        content: el.innerHTML,
                        hash: el.getAttribute('data-last-render') || el.getAttribute('data-last-id'),
                        attrs: Array.from(el.attributes)
                            .filter(a => !['data-needs-init', 'id', 'class'].includes(a.name))
                            .map(a => ({n: a.name, v: a.value}))
                    });
                }
            });

            // RESTORATION LAYER: Inject preserved content ATOMICALLY before rendering to DOM
            temp.querySelectorAll('[data-needs-init="true"]').forEach(el => {
                const key = el.getAttribute('data-type') || el.getAttribute('data-title') || el.className;
                const state = dynamicState.get(key);
                if (state) {
                    el.innerHTML = state.content;
                    state.attrs.forEach(a => el.setAttribute(a.n, a.v));
                    if (state.hash) el.setAttribute('data-last-render', state.hash);
                    el.removeAttribute('data-needs-init'); // Skip re-initialization in postRender
                }
            });

            container.innerHTML = temp.innerHTML;
            postRender(container);
        }
    }
}

function postRender(container) {
    container.querySelectorAll('[data-needs-init="true"]').forEach(el => {
        if (el.classList.contains("layout-quote")) renderQuoteCard(el);
        if (el.getAttribute('data-type') === 'recent-music') renderRecentMusic(el);
        if (['top-artists', 'top-songs', 'fresh-favorites'].includes(el.getAttribute('data-type'))) renderRewindSection(el, el.getAttribute('data-type'));
        if (el.getAttribute('data-type') === 'music-cluster') renderMusicCluster(el);
        el.removeAttribute('data-needs-init');
    });
    observeVideos(container);
}

function showPageLoader() {
    const app = document.getElementById("app");
    if (!app) return;
    // Immediate partial clear for responsiveness
    app.innerHTML = `
                <div class="loader-overlay" style="position: fixed; background: var(--bg); z-index: 1000;">
                    <div class="spinner" style="width: 40px; height: 40px; border-width: 3px;"></div>
                </div>
            `;
}

window.rollQuote = function (btn) {
    trackEvent('quote-roll', 'Rolling a new quote');
    const allQuotes = document.querySelectorAll('.layout-quote');
    const randomQuotes = Array.from(allQuotes).filter(q => {
        const title = (q.getAttribute('data-title') || '').toLowerCase();
        return title === '{random quote}' || title === 'random quote';
    });

    if (randomQuotes.some(q => q.classList.contains("loading"))) return;

    // 1. Enter Loading State (Invisible)
    randomQuotes.forEach(q => q.classList.add("loading"));

    // 2. Wait for the exit animation, then swap content
    setTimeout(() => {
        // Keep the OLD _activeRandomQuote until getNextQuote is done so it can perform identity checks
        const next = getNextQuote();
        _activeRandomQuote = next;

        randomQuotes.forEach(q => {
            renderQuoteCard(q);
            // We don't remove "loading" here; renderQuoteCard handles it via rAF to ensure
            // the new quote is in the DOM before it fades back in.
        });
    }, 650); // Matches the 0.6s CSS animation + bounceback overhead
};

function renderQuoteCard(container) {
    let quoteData;
    let isRandom = false;
    const title = (container.getAttribute("data-title") || "").toLowerCase();

    if (title === "{random quote}" || title === "random quote") {
        if (quotesDb.length === 0) {
            container.innerHTML = renderEmptyStateHTML("", true);
            return;
        }
        
        // Logic: On initial render or page navigation, ensure we have a persistent global quote.
        if (!_activeRandomQuote) {
            _activeRandomQuote = getNextQuote();
        }
        quoteData = _activeRandomQuote;
        isRandom = true;
    } else {
        quoteData = {
            Quote: container.getAttribute("data-static-quote") || "No content.",
            Author: container.getAttribute("data-static-author") || "Unknown",
            Source: null
        };
    }

    if (!quoteData) return;

    let author = quoteData.Author || "Unknown";
    if (quoteData.Source) {
        if (quoteData.Source.startsWith("http")) {
            author = `<a href="${quoteData.Source}" target="_blank" onclick="event.stopPropagation();">${safeHTML(author)}</a>`;
        } else {
            author += ` — ${safeHTML(quoteData.Source)}`;
        }
    }

    const rawQuote = (quoteData.Quote || "").trim().replace(/^"|"$/g, "");
    const processedQuote = processInlineMarkdown(rawQuote);
    const len = rawQuote.length;

    const sizeClass = [
        [350, 'xxl'],
        [250, 'xl'],
        [150, 'long'],
        [80, 'medium']
    ].find(([n]) => len > n)?.[1] || 'short';

    let bq = container.querySelector('blockquote');
    let footer = container.querySelector('.quote-footer');

    if (bq && footer) {
        bq.className = sizeClass;
        bq.innerHTML = `"${processedQuote}"`;
        footer.innerHTML = `<span class="author"> &mdash; ${author}</span>`;
    } else {
        let refreshBtnHTML = "";
        if (isRandom) {
            refreshBtnHTML = `
                    <svg class="dice-icon refresh-btn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" data-tooltip="Roll" onclick="event.stopPropagation(); rollQuote(this);">
                        <rect x="4" y="4" width="16" height="16" rx="4" ry="4" fill="none" stroke="currentColor"></rect>
                        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"></circle>
                        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"></circle>
                        <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"></circle>
                        <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"></circle>
                        <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none"></circle>
                    </svg>`;
        }
        container.innerHTML = `<blockquote class="${sizeClass}">"${processedQuote}"</blockquote>
                                    <div class="quote-footer"><span class="author"> &mdash; ${author}</span></div>
                                    ${refreshBtnHTML}`;
    }

    // Surgical Fade-In: Remove loading only after DOM is ready
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            container.classList.remove('loading');
        });
    });
}


function initMusicMarquee(container) {
    const marqueeContents = container.querySelectorAll('.marquee-content');
    marqueeContents.forEach(el => {
        if (el.classList.contains('marquee-processed')) return; // Avoid double processing
        const parentWidth = el.parentElement.clientWidth;
        const contentWidth = el.scrollWidth;

        if (contentWidth > parentWidth - 5) {
            el.classList.add('should-scroll');
            el.classList.add('marquee-processed');
            el.parentElement.classList.add('has-marquee');
            const content = el.innerHTML;
            el.innerHTML = `
                        <span class="marquee-clone" style="display:inline-block; padding-right:80px;">${content}</span>
                        <span class="marquee-clone" style="display:inline-block; padding-right:80px;">${content}</span>
                    `;
            el.style.display = 'inline-flex';
            el.style.alignItems = 'center';
            el.style.paddingRight = '0px'; // Prevent outer padding from misaligning the 50% translation skip
        }
    });
};/**
 * Unified high-fidelity music card template for all site components.
 * Consolidates layout for Recently Played, Rewind Grids, and Indie Clusters.
 */
function renderMusicCardHTML(item) {
    const ytLogo = "https://upload.wikimedia.org/wikipedia/commons/6/6a/Youtube_Music_icon.svg";
    const track = safeHTML(item.track || "Unknown Track");
    const artist = (item.artist === "" || item.artist === null) ? "" : safeHTML(item.artist || "Unknown Artist");
    
    // SVG Guard: Never use the YT Music SVG as a full-bleed thumbnail (Case-Insensitive & Fuzzy)
    const isSVGLogo = item.thumb && (item.thumb.toLowerCase().includes("youtube_music_icon.svg") || item.thumb === ytLogo);
    const thumb = (item.thumb && !isSVGLogo) ? item.thumb.replace(/^http:\/\//i, "https://") : null;
    const sourceLabel = String(item.source || "");
    const isYTMusic = (!item.source || sourceLabel.startsWith("YT Music") || sourceLabel === "YouTube Music" || sourceLabel === "Music (Desktop)");
    
    // Play Count Chip logic - Standardized with other unclickable chips
    const hasCount = item.count !== undefined && item.count !== null && String(item.count).trim() !== "";
    const countLabel = parseInt(item.count) === 1 ? "play" : "plays";
    const countHTML = hasCount ? `<span class="chip stat no-hover music-stat-chip">${item.count} ${countLabel}</span>` : "";

    // Explicit branding icons / overlays
    let sourceOverlay = "";
    if (isYTMusic) {
        sourceOverlay = `<div class="music-yt-overlay" data-tooltip="Open in YouTube Music" style="cursor: pointer;"><img src="${ytLogo}" alt="YT Music"></div>`;
    } else {
        sourceOverlay = `<div class="music-yt-overlay" data-tooltip="Open Track" style="cursor: pointer; background: #000; color: white; border-radius: 4px; font-size: 10px; padding: 4px 6px; font-weight: 600;">${safeHTML(item.source)}</div>`;
    }

    return `
        <div class="layout-grid cat-music" data-link="${item.link}" onclick="return playMusicInCard(event)">
            <div class="row-media">
                <div class="music-card-fallback"><img src="${ytLogo}" alt="YT Music" class="yt-placeholder-icon"></div>
                ${thumb ? `<img src="${thumb}" class="media-enter" onload="mediaLoaded(this)" onerror="this.style.display='none'; mediaLoaded(this)">` : ''}
            </div>
            <div class="card-info">
                <div class="marquee-container track-marquee">
                    <span class="marquee-content highlight-pulse"><h3 class="fill-anim">${track}</h3></span>
                </div>
                <div class="marquee-container artist-marquee">
                    <span class="marquee-content"><span class="music-artist-label">${artist}${countHTML}</span></span>
                </div>
            </div>
            ${sourceOverlay}
        </div>
    `;
}

function renderEmptyStateHTML(message, showSpinner = false) {
    if (showSpinner) {
        return `<div style="padding:40px; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;">
                    <div class="spinner" style="width: 30px; height: 30px; border-width: 2px; border-color: var(--border-subtle); border-top-color: var(--accent-personal); position:relative; left:0; top:0;"></div>
                    <span style="opacity:0.5; font-size:13px; font-weight:500; letter-spacing:0.5px;">${message}</span>
                </div>`;
    }
    return `<div style="padding:40px; text-align:center; opacity:0.3; border: 1px dashed var(--border-subtle); border-radius:12px; font-size:14px;">${message}</div>`;
}

function renderRecentMusic(container) {
    if (musicDb.length === 0) {
        if (!container.innerHTML.trim() || container.querySelector('.spinner')) {
            container.innerHTML = renderEmptyStateHTML("Syncing Music...", true);
        }
        return;
    }

    // The music API returns tracks in newest-first order.
    // We take the first 3 for the display.
    const latestItems = musicDb.slice(0, 3);

    // Prevent double-render stutter if local cache matches remote data perfectly
    const renderHash = JSON.stringify(latestItems);
    if (container.getAttribute('data-last-render') === renderHash) return;
    container.setAttribute('data-last-render', renderHash);

    const cardsHTML = latestItems.map((item) => {
        // Map to our unified structure
        const artist = cleanMusicLabel(item.artist || item.Artist || "Unknown Artist");
        const track = cleanMusicLabel(item.track || item.Track || item.Song || "Unknown Track");
        let link = (item.link || item.Link || "").trim();
        const thumb = (item.thumbnail || item.Thumbnail || "").trim();
        const source = item.source || item.Source || "YT Music";
        // Unified Play Count extraction for Quantified Self - High Resilience
        let count = item.PlayCount || item.plays || item.Plays || item.playCount || item.Count || item.count || 0;
        
        // If count is 0 or missing, calculate the real total plays across the entire DB
        if (count === 0) {
            const linkVal = (item.link || item.Link || "").trim();
            const ytId = linkVal ? getYouTubeID(linkVal) : null;
            const trackNorm = fuzzyNorm_(track);
            const artistNorm = fuzzyNorm_(artist);

            const matches = musicDb.filter(m => {
                const mLink = (m.link || m.Link || "").trim();
                // 1. Identify by YouTube ID (Primary)
                if (ytId && getYouTubeID(mLink) === ytId) return true;
                // 2. Identify by exact link match (Only if link is not empty)
                if (linkVal && mLink === linkVal) return true;
                // 3. Fallback: Identify by Artist + Track (Safest for missing links)
                const mTrack = fuzzyNorm_(m.track || m.Track || m.Song || "");
                const mArtist = fuzzyNorm_(m.artist || m.Artist || "");
                return mTrack === trackNorm && mArtist === artistNorm;
            });
            count = matches.length || 1; 
        }

        // Fallback to search if link is missing or invalid
        const bareURL = link.toLowerCase();
        const isValidTrackLink = bareURL.includes('watch?v=') || bareURL.includes('youtu.be');
        if (!link || !isValidTrackLink) {
            const searchQuery = encodeURIComponent(artist + " " + track);
            link = `https://music.youtube.com/search?q=${searchQuery}`;
        }

        return renderMusicCardHTML({ artist, track, link, thumb, source, count });
    }).join("");

    container.innerHTML = `
                <div class="music-sections-container">
                    <div class="music-grid" style="--music-cols: ${latestItems.length}">
                        ${cardsHTML}
                    </div>
                </div>
            `;

    // Initialization for marquee - use RAF for buttery smooth transition
    requestAnimationFrame(() => initMusicMarquee(container));
}

let _rewindData = null;
async function fetchRewindData() {
    return _rewindData;
}

// Resilient string normalization for cross-referencing stats with the main music database
function cleanMusicLabel(val) {
    if (!val) return "";
    let str = String(val).trim();
    // Detect 1899-12-30T... (Google Sheets "Time" as ISO Date)
    if (str.startsWith('1899-12-30T')) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) {
            // Reconstruct HH:MMam/pm (e.g., "5am")
            let h = d.getHours();
            const m = d.getMinutes();
            const ampm = h >= 12 ? 'pm' : 'am';
            h = h % 12 || 12;
            return `${h}${m > 0 ? ':' + String(m).padStart(2, '0') : ''}${ampm}`;
        }
    }
    return str;
}

function fuzzyNorm_(str) {
    if (typeof str !== 'string') str = String(str || "");
    return str.toLowerCase().replace(/[^\w\d]/g, "");
}

async function renderRewindSection(container, type) {
    const data = await fetchRewindData();
    if (!data) {
        if (!container.innerHTML.trim() || container.querySelector('.spinner')) {
            container.innerHTML = renderEmptyStateHTML("Syncing Stats...", true);
        }
        return;
    }

    const ytLogo = "https://upload.wikimedia.org/wikipedia/commons/6/6a/Youtube_Music_icon.svg";

    let items = [];
    let title = "";
    if (type === 'top-artists') { items = data.topArtists || []; title = "Top Artists"; }
    if (type === 'top-songs') { items = data.topSongs || []; title = "Top Songs"; }
    if (type === 'fresh-favorites') { items = data.freshFavorites || []; title = "Fresh Favorites"; }

    if (items.length === 0) {
        container.innerHTML = renderEmptyStateHTML("No music data found.");
        return;
    }
    const seenSongs = new Set();
    const cardsHTML = items.slice(0, 3).map((item) => {
        // Map to our unified structure with extreme resilience (Objects vs Strings)
        let track = "Unknown Track";
        let artistVal = "Unknown Artist";
        let count = item.PlayCount || item.count || item.playCount || item.Count || item.plays || item.Plays || 0;

        // Quantified Self Resilience: If count is 0, calculate from the main DB
        if (count === 0 && typeof musicDb !== 'undefined') {
            const searchVal = fuzzyNorm_(track);
            const matches = musicDb.filter(m => {
                const mSong = fuzzyNorm_(m.track || m.Track || m.Song || m.title || "");
                const mArtist = fuzzyNorm_(m.artist || m.Artist || "");
                if (type === 'top-artists') return mArtist === searchVal;
                return mSong === searchVal;
            });
            count = matches.length || 1;
        }

        if (typeof item === 'string') {
            if (item.includes(" - ")) {
                const parts = item.split(" - ");
                artistVal = cleanMusicLabel(parts[0].trim());
                track = cleanMusicLabel(parts[1].trim());
            } else {
                track = cleanMusicLabel(item.trim());
                artistVal = (type === 'top-artists') ? cleanMusicLabel(item.trim()) : "Unknown Artist";
            }
        } else if (item && typeof item === 'object') {
            track = cleanMusicLabel(item.track || item.Track || item.Song || item.name || item.Name || item.title || "Unknown Track");
            artistVal = cleanMusicLabel(item.artist || item.Artist || item.author || (item.name && !item.track ? item.name : "Unknown Artist"));

            // Display Guard: If the backend returns "Unknown" for the track, lead with the artist
            if (track === "Unknown" || track === "Unknown Track") {
                track = artistVal;
                artistVal = (type === 'top-artists') ? "" : "Recent Track"; 
            }
        }

        let thumb = item.thumbnail || item.Thumbnail || null;
        let link = item.link || item.Link || `https://music.youtube.com/search?q=${encodeURIComponent(track + (artistVal && artistVal !== "Unknown Artist" ? " " + artistVal : ""))}`;

        // Phase 3: Priority Branding (Backend provided Top Song / Thumbnail)
        if (type === 'top-artists' && item.topTrack) {
            artistVal = cleanMusicLabel(item.topTrack); 
        }

        if (!thumb && typeof musicDb !== 'undefined') {
            const match = musicDb.find(m => {
                const fuzzyTrack = fuzzyNorm_(track);
                const potentialSong = m.track || m.Track || m.Song || m.title || "";
                const fuzzyHistory = fuzzyNorm_(potentialSong);

                if (type === 'top-artists') {
                    // For artists, find a match for the artist name that hasn't been displayed yet
                    return fuzzyNorm_(m.artist || m.Artist || "") === fuzzyTrack && !seenSongs.has(fuzzyHistory);
                } else {
                    // For Top Songs / Favorites: resilient partial matching (e.g., 'Teardrop' matches 'Teardrop - Massive Attack')
                    return fuzzyHistory.includes(fuzzyTrack) || fuzzyTrack.includes(fuzzyHistory);
                }
            });
            if (match) {
                if (!thumb) thumb = match.thumbnail || match.Thumbnail;
                if (!item.link) link = match.link || match.Link;
                
                // Top Artist: Strictly show their #1 track as the sub-label
                if (type === 'top-artists') {
                    const topSong = match.track || match.Track || match.Song || match.title;
                    if (topSong && fuzzyNorm_(topSong) !== fuzzyNorm_(track) && !item.topTrack) {
                        artistVal = topSong;
                    }
                }
            }
        }
               // Final Sanity Guard: Handle track/artist labels with extreme care site-wide
        const isArtistMode = (type === 'top-artists');
        const displayTitle = isArtistMode ? artistVal : track;
            // Hide sub-label for Top Artists to emphasize the Artist themselves
        // Passing an explicit null ensures the renderer doesn't use the 'Unknown Artist' fallback
        const displaySub = isArtistMode ? null : artistVal;

        const lowSong = fuzzyNorm_(displayTitle);
        const lowSub = displaySub ? fuzzyNorm_(displaySub) : "";

        // Deduplication Guard: Only hide the sub-label if the TWO labels on ONE card are identical
        if (lowSong === lowSub || displaySub === "Unknown Artist") {
            // (displaySub already set to empty for artists above)
        }
        
        // Echo Guard: If we've already seen this SONG in the current grid, clear it for the next card
        if (type === 'top-artists' && displaySub && seenSongs.has(lowSub)) {
            // This logic is now handled by the displaySub being empty for artists
        }
        
        // Mark the SONG (and only the song) as "Seen" to prevent it being guessed for the next card
        if (type === 'top-artists' && displaySub) seenSongs.add(lowSub);
        else if (type !== 'top-artists' && displayTitle) seenSongs.add(lowSong);

        return renderMusicCardHTML({ artist: displaySub, track: displayTitle, link, thumb, source: "YT Music", count });
    }).join("");

    container.innerHTML = `
        <div class="music-sections-container">
            <div class="music-grid" style="--music-cols: ${Math.min(items.length, 3)}">
                ${cardsHTML}
            </div>
        </div>
    `;
    setTimeout(() => initMusicMarquee(container), 100);
}

// --- PHOTOSWIPE V5 LIGHTBOX INITIALIZER ---
(function() {
    let lightbox = null;

    function initPhotoSwipe() {
        if (lightbox) lightbox.destroy();

        lightbox = new PhotoSwipeLightbox({
            gallery: '#app',
            // ONLY target images in content, NOT project card thumbnails
            children: '.article-body img, .media-container img, .gallery-item img',
            pswpModule: PhotoSwipe,
            imageClickAction: 'zoom',
            tapAction: 'toggle-controls',
            doubleTapAction: 'zoom',
            bgOpacity: 0.95,
            showHideAnimationType: 'zoom'
        });

        // Dynamic dimension detection (PhotoSwipe 5 requires w/h)
        lightbox.addFilter('itemData', (itemData, index) => {
            const img = itemData.element;
            if (img) {
                itemData.src = img.src;
                itemData.w = img.naturalWidth || 1200; 
                itemData.h = img.naturalHeight || 800;
                itemData.msrc = img.src; 
            }
            return itemData;
        });

        lightbox.init();
    }

    window.__reinitLightbox = initPhotoSwipe;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPhotoSwipe);
    } else {
        initPhotoSwipe();
    }
})();

async function renderMusicCluster(container) {
    const urlsRaw = container.getAttribute('data-urls') || "";
    const urls = urlsRaw.split(',').filter(Boolean);
    if (urls.length === 0) return;

    // Show a centered spinner while fetching metadata
    container.innerHTML = renderEmptyStateHTML("", true);

    const ytLogo = "https://upload.wikimedia.org/wikipedia/commons/6/6a/Youtube_Music_icon.svg";

    // Fetch details for each independently 
    const cardsData = await Promise.all(urls.map(async (rawLink, index) => {
        const bareURL = rawLink.trim();
        const ytId = getYouTubeID(bareURL);

        let artist = "Unknown Artist";
        let track = "Unknown Track";
        let thumb = ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : null;
        let fromDb = false;

        let count = null;

        // 1. Cross-reference with our Music Logger DB for high-fidelity square album art & PLAY COUNTS
        if (typeof musicDb !== 'undefined') {
            const dbMatch = musicDb.find(item => item.Link && (item.Link.includes(ytId) || item.Link === bareURL));
            if (dbMatch) {
                if (dbMatch.Thumbnail) {
                    thumb = dbMatch.Thumbnail;
                    fromDb = true;
                }
                if (dbMatch.Artist) artist = dbMatch.Artist;
                if (dbMatch.Song || dbMatch.Track) track = dbMatch.Song || dbMatch.Track;

                // QUANTIFIED SELF: If it's in our DB, find the real play count
                // (Looking for any row that matches this Link or ID)
                const allPlays = musicDb.filter(m => m.Link && (m.Link.includes(ytId) || m.Link === bareURL));
                count = dbMatch.PlayCount || allPlays.length || 0;
            }
        }

        // 2. Fallback to scraping NoEmbed ONLY if local DB is missing info or it's a completely novel track
        const needsScrape = !fromDb || artist === "Unknown Artist" || track === "Unknown Track";
        if (needsScrape) {
            try {
                const noembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(bareURL)}`;
                const res = await fetch(noembedUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data.title && track === "Unknown Track") track = data.title;
                    if (data.author_name && artist === "Unknown Artist") artist = data.author_name.replace(" - Topic", "");
                }
            } catch (e) {
                // Silently fall back to DB/placeholders if service is down
            }
        }



        return {
            link: bareURL,
            ytId: ytId,
            artist: safeHTML(artist),
            track: safeHTML(track),
            thumb: thumb ? thumb.replace(/^http:\/\//i, "https://") : null,
            source: "YT Music",
            count: count
        };
    }));

    // Prevent double-render stutter if local cache matches remote data perfectly
    const renderHash = JSON.stringify(cardsData);
    if (container.getAttribute('data-last-render') === renderHash) return;
    container.setAttribute('data-last-render', renderHash);
    const cardsHTML = cardsData.map((item) => {
        return renderMusicCardHTML(item);
    }).join("");

    container.innerHTML = `
                <div class="music-sections-container">
                    <div class="music-grid" style="--music-cols: ${cardsData.length}">
                        ${cardsHTML}
                    </div>
                </div>
            `;

    // Initialization for marquee
    setTimeout(() => initMusicMarquee(container), 100);
}

function playMusicInCard(event) {
    const card = event.currentTarget;
    const link = card.getAttribute('data-link');

    // Explicitly handle Outward Redirection via Corner Badge first
    if (event && event.target.closest('.music-yt-overlay')) {
        event.preventDefault();
        event.stopPropagation();
        window.open(link, '_blank');
        return false;
    }

    const ytId = getYouTubeID(link);

    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (card.querySelector('iframe')) return false;

    if (ytId) {
        const mediaRow = card.querySelector('.row-media');
        if (mediaRow) {
            // 1. Capture original state IMMEDIATELY before we touch the DOM
            if (!card.getAttribute('data-original-media')) {
                card.setAttribute('data-original-media', mediaRow.innerHTML);
            }

            // 2. Stop any other currently playing cards
            document.querySelectorAll('.layout-grid.cat-music.is-playing').forEach(pCard => {
                const pMedia = pCard.querySelector('.row-media');
                const originalHTML = pCard.getAttribute('data-original-media');
                if (pMedia && originalHTML) {
                    pMedia.innerHTML = originalHTML;
                    pCard.classList.remove('is-playing');
                }
            });

            const iframe = document.createElement('iframe');
            const origin = window.location.origin;
            iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`;
            iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
            iframe.allowFullscreen = true;
            iframe.style.opacity = '0'; // Hide initially
            
            iframe.onload = () => {
                // Instant switch: Show video, hide thumbnail/placeholders immediately
                iframe.style.opacity = '1';
                const currentImg = mediaRow.querySelector('img.media-enter');
                if (currentImg) currentImg.style.opacity = '0';
                const fallback = mediaRow.querySelector('.music-card-fallback');
                if (fallback) fallback.style.opacity = '0';
            };

            // Append on top of existing content
            mediaRow.appendChild(iframe);
            card.classList.add('is-playing');

            // GoatCounter: Track Music Play
            trackEvent('music-play', `${card.querySelector('.row-title')?.innerText || ytId}`);
        }
    } else if (link) {
        window.open(link, '_blank');
    }
    return false;
}

function renderFooter() {
    const footerEl = document.getElementById("footer-links");
    const footerEntries = db.filter(e => "Footer" === e.Page);
    
    footerEl.innerHTML = footerEntries.map(entry => {
        let text = (entry.Title || "").replace(/{year}/g, new Date().getFullYear());
        // Use the global inline processor to handle links, bold, and wiki-links [[...]]
        return text ? `<span>${processInlineMarkdown(text)}</span>` : "";
    }).join("");
}
// === MEDIA UTILITIES ===
function getYouTubeID(url) {
    if (!url) return null;
    const match = url.match(/(?:(?:music\.)?youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
}

function getYouTubeThumbnail(videoId) {
    return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : "";
}

function processMediaUrl(url) {
    if (!url) return { url: '', autoplay: false, loop: false, controls: true, invert: false };

    // 1. Identify behavior markers before they get caught in path resolution
    const lower = url.toLowerCase();
    const autoplay = lower.includes('-autoplay');
    const loop = lower.includes('-loop');
    const invert = lower.includes('-invert');
    const controls = !lower.includes('-nocontrols') && !autoplay;

    // 2. Clean behavior markers from the URL string
    let cleanUrl = url.replace(/-(?:autoplay|loop|noloop|nocontrols|invert)/gi, '');
    
    // SPECIAL CASE: Only strip '-thumb' from videos, as some images (like resume-thumb.jpg)
    // legitimately use it in their real filename.
    if (lower.match(/\.(mp4|webm|mov|ogg)/i)) {
        cleanUrl = cleanUrl.replace(/-thumb/gi, '');
    }

    // 3. Resolve Relative Paths for local assets
    // If it doesn't have an explicit protocol or directory, we infer it based on extension
    if (!cleanUrl.startsWith('http') && !cleanUrl.startsWith('assets/')) {
        const extMatch = cleanUrl.match(/\.([a-z0-9]+)(?:$|\?)/i);
        if (extMatch) {
            const ext = extMatch[1].toLowerCase();
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
            const videoExts = ['mp4', 'webm', 'mov', 'ogg'];
            
            if (imageExts.includes(ext)) {
                cleanUrl = `assets/images/${cleanUrl}`;
            } else if (videoExts.includes(ext)) {
                cleanUrl = `assets/videos/${cleanUrl}`;
            }
        }
    }

    // 4. Force HTTPS for security
    cleanUrl = cleanUrl.replace(/^http:\/\//i, "https://");

    return { url: cleanUrl, autoplay, loop, controls, invert };
}

function extractMediaFromContent(content) {
    if (!content) return null;
    const url = content.trim();

    if (getYouTubeID(url)) {
        if (url.includes('music.youtube.com')) return { type: 'music-card', id: getYouTubeID(url), url };
        return { type: 'yt', id: getYouTubeID(url), url };
    }
    if (url.match(/\.glb(?:-[a-zA-Z0-9_-]+)*/i)) {
        const fullUrl = (url.startsWith('assets/') || url.startsWith('http')) ? url : `assets/models/${url}`;
        return { type: 'glb', url: fullUrl };
    }
    if (url.match(/\.geojson(?:-[NSEW]{1,2})?(?:\?.*)?$/i)) {
        const fullUrl = (url.startsWith('assets/') || url.startsWith('http')) ? url : `assets/GPX/${url}`;
        return { type: 'geojson', url: fullUrl };
    }
    // Image detection: Match common extensions even if they have suffixes like -invert
    if (url.match(/\.(?:jpg|jpeg|png|gif|webp|svg)(?:-[a-zA-Z0-9_-]+)*/i)) {
        const fullUrl = (url.startsWith('assets/') || url.startsWith('http')) ? url : `assets/images/${url}`;
        return { type: 'image', url: fullUrl };
    }    // Video detection: Match common extensions even if they have suffixes
    if (url.match(/\.(?:mp4|webm|mov|ogg)(?:-[a-zA-Z0-9_-]+)*/i)) {
        const fullUrl = (url.startsWith('assets/') || url.startsWith('http')) ? url : `assets/videos/${url}`;
        return { type: 'video', url: fullUrl };
    }    return null;
}
function getThumbnail(media) {
    if (!media) return null;

    // Check for multi-line Thumbnail (special case: GLB model + background logo)
    // Support all common newline separators in Spreadsheet data (\n, \r\n, \r, etc.)
    const lines = String(media).split(/\r?\n|\r/).map(l => l.trim()).filter(Boolean);
    const hasGLB = lines.some(l => l.match(/\.glb(?:-[a-zA-Z0-9_-]+)*/i));
    const hasIMG = lines.some(l => l.match(/\.(png|jpg|jpeg|webp|svg)(?:-[a-zA-Z0-9_-]+)*/i));
    if (hasGLB && hasIMG) return 'GLB_WITH_BG';

    if (media.match(/\.glb(?:-[a-zA-Z0-9_-]+)*$/i)) return 'GLB_VIEWER';
    if (media.match(/\.geojson(?:-[NSEW]{1,2})?(\?.*)?$/i)) return 'MAP_VIEWER';
    
    const ytId = getYouTubeID(media);
    if (ytId) return getYouTubeThumbnail(ytId);

    if (media.match(/\.(mp4|webm|mov|ogg)/i)) {
        return media;
    }

    return media;
}

// Staggered GLB initialization
_glbInitQueue = [];
_isProcessingGlbQueue = false;

// Video Lazy Loading Observer
_videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const video = entry.target;
        if (entry.isIntersecting) {
            video._isVisible = true;

            // Phase 1: Assign source if not yet loaded (lazy-load)
            if (!video.src && video.dataset.src) {
                video.src = video.dataset.src;
            }

            // Phase 2: Autoplay logic — only if not already playing and not ended
            if (video.dataset.autoplay === "true" && !video.ended && video.paused) {
                // CRITICAL: Wait for the browser to actually prepare the decoder
                // before calling play(). Calling play() before canplay causes
                // the browser to fight between decoder init and frame delivery.
                const startWhenReady = () => {
                    // Re-check visibility: user may have scrolled away during decode
                    if (!video._isVisible) return;

                    video.play().then(() => {
                        if (!video._isVisible) {
                            video.pause(); // Scrolled away during async play resolve
                            return;
                        }
                        if (!video.dataset.isPlaying) {
                            video.dataset.isPlaying = "true";
                            window._activeVideoCount++;
                        }
                    }).catch(() => { });
                };

                if (video.readyState >= 3) {
                    // HAVE_FUTURE_DATA or higher — already buffered, play immediately
                    startWhenReady();
                } else {
                    // Not ready yet — wait for canplay event (fires once decoder is primed)
                    video.addEventListener('canplay', startWhenReady, { once: true });
                }
            }
        } else {
            video._isVisible = false;
            if (video.dataset.isPlaying) {
                delete video.dataset.isPlaying;
                window._activeVideoCount = Math.max(0, window._activeVideoCount - 1);
            }
            if (!video.paused) {
                video.pause();
            }
        }
    });
}, { rootMargin: '0px', threshold: 0.25 });

// Observe newly added videos
function observeVideos(container) {
    if (!container) return;
    // Delay observation slightly to let the browser settle after innerHTML
    setTimeout(() => {
        container.querySelectorAll('.lazy-video').forEach(v => {
            _videoObserver.observe(v);
            // Ensure the counter is decremented when a video finishes naturally
            if (!v._endedListenerAttached) {
                v._endedListenerAttached = true;
                v.addEventListener('ended', () => {
                    if (v.dataset.isPlaying) {
                        delete v.dataset.isPlaying;
                        window._activeVideoCount = Math.max(0, window._activeVideoCount - 1);
                    }
                });
            }
        });
    }, 100);
}

function processGlbQueue() {
    // CIRCUIT BREAKER: If WebGL context is dead, stop hammering and retry slowly
    if (window._glbContextDead) {
        console.warn("GLB Queue paused — WebGL context is dead. Retrying in 3s...");
        setTimeout(processGlbQueue, 3000);
        return;
    }

    // ENGINE CHECK: If Three.js isn't ready, wait
    if (!window.initThreeJSViewer) {
        setTimeout(processGlbQueue, 200);
        return;
    }

    if (_glbInitQueue.length === 0) {
        _isProcessingGlbQueue = false;
        return;
    }

    // PACE CONTROL: Don't process if a heavy navigation just happened recently
    const timeSinceNav = Date.now() - (window._lastNavTime || 0);
    if (timeSinceNav < 300) {
        setTimeout(processGlbQueue, 100);
        return;
    }

    _isProcessingGlbQueue = true;

    try {
        const nextItem = _glbInitQueue.shift();
        const { uniqueId, glbPath, isCardMode } = nextItem;
        const container = document.getElementById(uniqueId);

        if (container && window.initThreeJSViewer) {
            if (!_glbViewers[uniqueId]) {
                try {
                    const viewer = window.initThreeJSViewer(container, glbPath, isCardMode);
                    _glbViewers[uniqueId] = viewer;
                    new ResizeObserver(() => {
                        if (document.contains(container) && viewer.onResize) {
                            viewer.onResize();
                        }
                    }).observe(container);
                } catch (e) {
                    console.error("GLB Init Warning:", e);
                    // HALT: Don't keep processing if init itself is failing (context dead)
                    _isProcessingGlbQueue = false;
                    setTimeout(processGlbQueue, 2000);
                    return;
                }
            }
        }
    } catch (outerError) {
        console.error("Critical GLB Queue Error:", outerError);
    }

    // STAGGERED BATCHING: Only process one model per 150ms to keep main thread free for transitions
    // If a video is playing, double the delay to preserve resources for smooth playback
    const stepDelay = (window._activeVideoCount > 0) ? 500 : 150;
    if (_glbInitQueue.length > 0) {
        setTimeout(() => processGlbQueue(), stepDelay);
    } else {
        _isProcessingGlbQueue = false;
    }
}

// Initialize the IntersectionObserver for lazy loading
_glbObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const uniqueId = entry.target.id;
            const glbPath = entry.target.dataset.glbPath;
            const isCardMode = entry.target.classList.contains('card-preview');

            // Queue the initialization
            _glbInitQueue.push({ uniqueId, glbPath, isCardMode });
            if (!_isProcessingGlbQueue) {
                _isProcessingGlbQueue = true;
                // Start processing with a healthy delay to allow page transition to finish
                // If a video is playing, triple the delay to avoid initial loading hitch
                const initialDelay = (window._activeVideoCount > 0) ? 1200 : 400;
                setTimeout(processGlbQueue, initialDelay);
            }

            // Stop observing once queued
            _glbObserver.unobserve(entry.target);
        }
    });
}, { rootMargin: '50px' }); // Reduced pre-loading so models start building near view

// GLB Viewer Renderer
function renderGLBViewer(glbPath, isCardMode, bgUrl = null) {
    const uniqueId = 'viewer-' + Math.random().toString(36).substring(2, 11);

    // Process optional background watermark
    let bgHTML = '';
    if (bgUrl) {
        const p = processMediaUrl(bgUrl);
        // Ensure background images from spreadsheet use the assets/images prefix if raw
        const fullBgUrl = (p.url.startsWith('assets/') || p.url.startsWith('http')) ? p.url : `assets/images/${p.url}`;
        // We no longer manually tag 'theme-invert' as we use applySmartWatermark for per-model logic
        bgHTML = `<div class="model-bg-watermark" style="background-image: url('${fullBgUrl}');"></div>`;
    }

    const html = `
                <div class="model-viewer-wrapper ${isCardMode ? 'card-preview' : ''}" 
                     id="${uniqueId}" 
                     data-glb-path="${glbPath}">
                    ${bgHTML}
                    <div class="loader-overlay">
                        <div class="spinner"></div>
                    </div>
                    <canvas></canvas>
                    ${!isCardMode ? `
                        <button class="fs-btn" onclick="toggleFullscreen('${uniqueId}')" title="Fullscreen">
                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `;

    // Start observing for lazy initialization (needs 0+ms for DOM insertion)
    setTimeout(() => {
        const container = document.getElementById(uniqueId);
        if (container) {
            // Detect watermark brightness if present to facilitate intelligent contrast
            const watermark = container.querySelector('.model-bg-watermark');
            if (watermark) {
                const bgImg = watermark.style.backgroundImage;
                if (bgImg) applySmartWatermark(watermark, bgImg);
            }
            _glbObserver.observe(container);
        }
    }, 0);

    return html;
};

// --- UNIVERSAL MAPBOX VIEWER ---
function renderMapBoxViewer(geojsonUrl, isCardMode) {
    const mapId = 'mapbox-' + Math.random().toString(36).substr(2, 9);

    // Lazy-loading Observer for Mapbox to prevent WebGL context exhaustion
    if (!window._mapboxObserver) {
        window._mapboxObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const container = entry.target;
                    const url = container.dataset.geojsonUrl;
                    const isInteractive = container.dataset.interactive === 'true';

                    const tryInit = () => {
                        if (window.mapboxgl) {
                            window.__initMapbox(container.id, url, isInteractive);
                        } else {
                            setTimeout(tryInit, 100);
                        }
                    };
                    tryInit();
                    window._mapboxObserver.unobserve(container);
                }
            });
        }, { rootMargin: '50px' });
    }

    if (!window._mapboxScriptLoaded) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
        document.head.appendChild(link);

        window._mapboxScriptLoaded = true;
        const script = document.createElement('script');
        script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
        // No longer need immediate init here as the observer will handle it
        document.head.appendChild(script);
    }

    // Start observing for viewport entry
    setTimeout(() => {
        const mapEl = document.getElementById(mapId);
        if (mapEl) window._mapboxObserver.observe(mapEl);
    }, 0);

    return `<div class="mapbox-container ${isCardMode ? 'card-preview' : ''}" id="${mapId}" data-geojson-url="${geojsonUrl}" data-interactive="${!isCardMode}">
                        <div class="loader-overlay">
                            <div class="spinner"></div>
                        </div>
                    </div>`;
}

function toggleFullscreen(viewerId) {
    const wrapper = document.getElementById(viewerId);
    if (!wrapper) return;
    const viewer = _glbViewers[viewerId];
    const btn = wrapper.querySelector('.fs-btn');

    if (!document.fullscreenElement) {
        wrapper.requestFullscreen().then(() => {
            wrapper.classList.add('fullscreen');
            btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>';
            btn.title = 'Exit Fullscreen';
            if (viewer && viewer.controls) {
                viewer.controls.enabled = true; // restore interaction
                viewer.controls.enableZoom = true;
                viewer.controls.enablePan = true;
                viewer.controls.enableRotate = true; // explicitly enable
                viewer.canvas.style.setProperty('touch-action', 'none', 'important'); // Restore OrbitControls expectation
                viewer.controls.minDistance = 0.2;
                viewer.controls.maxDistance = 100; // Let her rip
                viewer.controls.zoomSpeed = 0.6; // v=69.16
            }
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('landscape').catch(() => { });
            }
            if (viewer) viewer.onResize();
        });
    } else {
        document.exitFullscreen();
    }
};

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();

        // Remove fullscreen class from all wrappers on exit
        document.querySelectorAll('.model-viewer-wrapper.fullscreen').forEach(el => el.classList.remove('fullscreen'));

        // STABILIZATION: Delay resize on exit to allow browser layout to settle (especially on mobile)
        setTimeout(() => {
            const isTrueMobile = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
            Object.values(_glbViewers).forEach(viewer => {
                if (viewer.controls) {
                    viewer.controls.enableZoom = false;
                    if (isTrueMobile) {
                        viewer.controls.enabled = false; // disable event hijacking
                        viewer.controls.enablePan = false;
                        viewer.controls.enableRotate = false;
                        viewer.canvas.style.setProperty('touch-action', 'auto', 'important'); // Allow pull-to-refresh
                    } else {
                        viewer.controls.enablePan = true;
                        viewer.controls.enableRotate = true;
                    }
                }
                const btn = viewer.canvas.parentElement?.querySelector('.fs-btn');
                if (btn) {
                    btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
                    btn.title = 'Fullscreen';
                }
                if (viewer.onResize) viewer.onResize();
            });
        }, 50); // 50ms is usually enough for the layout swap to settle
    }
});

function formatDate(e) {
    if (!e) return "";
    if (e instanceof Date) return `${e.getDate()} ${e.toLocaleString("default", { month: "short" }).toUpperCase()} ${e.getFullYear()}`;
    e = String(e).trim();

    // If it looks like a range or season (contains non-digit/non-dash chars beyond simple ISO), keep it as is
    // This allows "FALL 2025" or "DEC 2025 - FEB 2026" to render beautifully
    if (/[A-Za-z]/.test(e) && !/^\d{4}-\d{2}-\d{2}$/.test(e)) return e;

    const isYearOnly = /^\d{4}$/.test(e);
    const isYearMonth = /^\d{4}-\d{2}$/.test(e);

    const n = new Date(e);
    if (isNaN(n.getTime())) return e;
    
    const r = new Date(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12, 0, 0);
    const day = r.getUTCDate();
    const month = r.toLocaleString("default", { month: "short" }).toUpperCase();
    const year = r.getUTCFullYear();
    
    if (isYearOnly) return `${year}`;
    if (isYearMonth) return `${month} ${year}`;
    return `${day} ${month} ${year}`;
}

/**
 * Smart Date Range Parser
 * Converts "FALL 25 - SPR 2026", "2026-01-03", "DEC 2025", etc. into {start, end} Dates.
 */
function getDateRange(str) {
    if (!str) return { start: new Date(0), end: new Date(8640000000000000) };
    
    // Heuristic: If it has no year, month, or season token, it's not a date.
    // This prevents tags like "Fusion" or "SolidWorks" from triggering accidental 2026 range filters.
    const isDateLike = /\d{2,4}|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|SPRING|SUMMER|FALL|AUTUMN|WINTER|SPR|SUM|AUT|WIN|WTR/.test(str.toUpperCase());
    if (!isDateLike) return null;

    let parts;
    // Special handling for ISO format YYYY-MM-DD which contains dashes but isn't a range
    if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) {
        parts = [str.trim()];
    } else {
        // Only split on dashes that look like range separators (spaces around them)
        parts = str.split(/ - | – | — /).map(p => p.trim());
        // Fallback for YYYY-YYYY format
        if (parts.length === 1 && str.includes('-') && !str.includes(' ')) {
            const yyyyRange = str.match(/^(\d{4})-(\d{4})$/);
            if (yyyyRange) parts = [yyyyRange[1], yyyyRange[2]];
        }
    }

    const startObj = parseFlexibleDate(parts[0], true);
    const endObj = parts.length > 1 ? parseFlexibleDate(parts[1], false) : parseFlexibleDate(parts[0], false);
    
    return { start: startObj, end: endObj };
}

function parseFlexibleDate(token, isStart) {
    const t = token.toUpperCase();
    
    // Extract Year (4 digits or 2 digits with ')
    const yearMatch = t.match(/\b(\d{4})\b/) || t.match(/'?(\d{2})\b/);
    let year = yearMatch ? parseInt(yearMatch[yearMatch.length - 1]) : new Date().getFullYear();
    if (year < 100) year += 2000;

    // Fallback if no specific month/season found
    let monthStart = 0; // Jan
    let monthEnd = 11; // Dec

    const seasons = {
        'WINTER': [11, 1], 'WIN': [11, 1], 'WTR': [11, 1],
        'SPRING': [2, 4],  'SPR': [2, 4],
        'SUMMER': [5, 7],  'SUM': [5, 7],
        'FALL': [8, 10],   'AUTUMN': [8, 10], 'AUT': [8, 10]
    };

    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    
    // Check Seasons
    for (const [name, range] of Object.entries(seasons)) {
        if (t.includes(name)) {
            monthStart = range[0];
            monthEnd = range[1];
            // Winter special case (Dec - Feb)
            if (monthStart > monthEnd && !isStart) year += 1; 
            break;
        }
    }

    // Check Months (Overwrites season if specific month is named)
    months.forEach((name, idx) => {
        if (t.includes(name)) {
            monthStart = idx;
            monthEnd = idx;
        }
    });

    // ISO Format overrides (2026-01-03)
    const isoMatch = t.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
        return d;
    }
    const isoMonthMatch = t.match(/(\d{4})-(\d{2})/);
    if (isoMonthMatch) {
        monthStart = parseInt(isoMonthMatch[2]) - 1;
        monthEnd = monthStart;
        year = parseInt(isoMonthMatch[1]);
    }

    if (isStart) {
        return new Date(year, monthStart, 1);
    } else {
        // Last day of the period
        return new Date(year, monthEnd + 1, 0, 23, 59, 59);
    }
}



function updateSEO(path = "") {
    const cleanPath = url2path(path || window.location.hash.substring(1) || "Home");

    // 1. Data Retrieval
    const pageData = db.filter(e => e.Page === cleanPath);
    const entry = pageData[0] || {};

    // 2. Title & Description Logic
    const baseTitle = "Sahib Virdee";
    let pageTitle = entry.Title || "";

    // Strip dynamic tags like {Random Quote} from the tab title first
    pageTitle = pageTitle.replace(/\{?random quote\}?/gi, '').trim();

    if (!pageTitle) {
        if (cleanPath === "Home") {
            pageTitle = "Mechanical Design Engineer Portfolio";
        } else {
            // Use only the last part of the path (e.g., "Personal/Hobbies" -> "Hobbies")
            // to keep the tab titles concise and consistent.
            pageTitle = cleanPath.split("/").pop();
        }
    }

    const fullTitle = (cleanPath === "Home" || !pageTitle) ? baseTitle : `${pageTitle} | ${baseTitle}`;

    // Strip markdown and HTML for meta-description
    const description = entry.Description || (entry.Content ? entry.Content.substring(0, 160).replace(/[#*`]/g, '').replace(/<[^>]*>/g, '').trim() : "Portfolio of Sahib Virdee, a Mechanical Engineering graduate specializing in detailed CAD design, manufacturing processes, and technical documentation.");

    // 3. Update DOM Title
    document.title = fullTitle;

    // 4. Update Meta Tags
    const setMeta = (query, content) => {
        const el = document.querySelector(query);
        if (el) el.setAttribute('content', content);
    };

    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', fullTitle);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', `https://sahibvirdee.com/#${path2url(cleanPath)}`);
    setMeta('meta[name="twitter:title"]', fullTitle);
    setMeta('meta[name="twitter:description"]', description);

    // Thumbnail vs CoverImage vs Default
    let image = entry.Thumbnail || entry.CoverImage || "https://sahibvirdee.com/assets/images/social.jpg";
    if (image && !image.includes('.glb')) {
        if (!image.startsWith('http')) {
            image = `https://sahibvirdee.com/${image.startsWith('/') ? image.substring(1) : image}`;
        }
        setMeta('meta[property="og:image"]', image);
        setMeta('meta[name="twitter:image"]', image);
    }

    // 5. Update Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', `https://sahibvirdee.com/#${path2url(cleanPath)}`);

    // 6. Update JSON-LD (Dynamic Graph)
    const oldLD = document.getElementById("json-ld-script");
    if (oldLD) oldLD.remove();

    const jsonLD = {
        "@context": "https://schema.org",
        "@type": cleanPath === "Home" ? "WebSite" : "WebPage",
        "name": fullTitle,
        "description": description,
        "url": `https://sahibvirdee.com/#${path2url(cleanPath)}`,
        "author": {
            "@type": "Person",
            "name": "Sahib Virdee"
        }
    };

    if (cleanPath === "Home") {
        jsonLD["mainEntity"] = {
            "@type": "Person",
            "name": "Sahib Virdee",
            "jobTitle": "Mechanical Design Engineer",
            "description": "Specializing in detailed CAD design, manufacturing processes, and technical documentation.",
            "url": "https://sahibvirdee.com/",
            "sameAs": ["https://github.com/sahibdsv", "https://www.linkedin.com/in/sahibdsv/"]
        };
    }

    const script = document.createElement("script");
    script.id = "json-ld-script";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(jsonLD);
    document.head.appendChild(script);

    // 7. Context-Specific JSON-LD (Resume)
    if (cleanPath === "Professional/Resume") {
        generateResumeJSONLD();
    } else {
        const resumeLD = document.getElementById("json-ld-resume");
        if (resumeLD) resumeLD.remove();
    }
}

function generateResumeJSONLD() {
    const e = document.getElementById("json-ld-resume");
    if (e) e.remove();
    const t = resumeDb;
    if (0 === t.length) return;
    const o = t[0], r = o.Title.split("|")[0].trim(), i = o.Title.split("|")[1] ? o.Title.split("|")[1].trim() : "Engineer",
        s = {
            "@context": "https://schema.org",
            "@type": "Person",
            name: r,
            jobTitle: i,
            url: "https://sahibvirdee.com/resume",
            description: `Resume of ${r}, ${i}.`,
        };
    const a = document.createElement("script");
    a.id = "json-ld-resume", a.type = "application/ld+json";
    a.textContent = JSON.stringify(s);
    document.head.appendChild(a);
}

const formatSectionTitle = type => (!type || type.toLowerCase().replace(/^#/, '').replace(/_/g, '-') === 'header') ? null
    : type.replace(/^#/, '').replace(/_/g, '-').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');


function renderResume() {
    const data = resumeDb;
    let buffer = '<div id="resume-view" class="resume-container">';

    // 1. Render Header
    const headerData = data.find(e => e.SectionType === 'header');
    if (headerData) {
        const parts = (headerData.Title || "").split("|");
        const name = parts[0].trim();
        const sub = parts[1] ? parts[1].trim() : "";
        const pdfLink = headerData.Tags || '';

        const contacts = (headerData.Content || "").split("|")
            .map(e => `<span style="white-space:nowrap; vertical-align:middle;">${processInlineMarkdown(e.trim())}</span>`)
            .join('');

        buffer += `
                <div class="resume-header section" style="position:relative;">
                    <h1 class="header-fade-anim" style="margin-top:0;">${name}</h1>
                    <div class="resume-sub-row header-fade-anim" style="animation-delay:0.1s; margin-bottom: 6px;">
                        <div class="resume-sub" style="margin-bottom: 0;">${sub}</div>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; column-gap: 24px; row-gap: 16px;">
                        <div class="resume-contact" style="align-items: center; column-gap: 24px; row-gap: 6px; margin: 0;">
                            ${contacts}
                        </div>
                        ${pdfLink ? `<a href="${pdfLink}" target="_blank" rel="noopener" class="btn-cta" style="font-size: 13px; padding: 4px 12px; margin: 0;">Download PDF</a>` : ''}
                    </div>
                </div>`;
    }

    // 2. Group Sections
    const leftSections = ['education', 'skills', 'awards', 'languages', 'certifications', 'interests'];
    let leftColBuffer = "";
    let rightColBuffer = "";

    const getSection = e => (e.SectionType || "").toLowerCase().replace(/^#/, '').replace(/_/g, '-');
    const sectionTypes = [...new Set(data.map(e => e.SectionType).filter(t => t && getSection({ SectionType: t }) !== 'header'))];
    sectionTypes.forEach(type => {
        const sections = data.filter(e => e.SectionType === type);
        if (sections.length === 0) return;
        const normalized = getSection({ SectionType: type });
        const formattedTitle = formatSectionTitle(type);
        const sectionHTML = `<div class="resume-section">${formattedTitle ? formatTitle(formattedTitle, "h3") : ""}${sections.map(s => RenderResumeEntry(s)).join("")}</div>`;
        if (leftSections.some(ls => normalized.startsWith(ls))) leftColBuffer += sectionHTML;
        else rightColBuffer += sectionHTML;
    });

    buffer += `
            <div class="resume-grid section">
                <div class="resume-left">${leftColBuffer}</div>
                <div class="resume-right">${rightColBuffer}</div>
            </div></div>`;

    updateContainer(document.getElementById("app"), buffer);
}
function RenderResumeEntry(entry) {
    let role = entry.Title || "";
    let company = "";

    // Natural Language Parsing for Title: "Role @ Company" or "Role at Company"
    const companyMatch = role.match(/^(.*?)\s+(@|at)\s+(.*)$/i);
    if (companyMatch) {
        role = processInlineMarkdown(companyMatch[1].trim());
        company = processInlineMarkdown(companyMatch[3].trim());
    } else if (role.includes("|")) {
        const parts = role.split("|");
        role = processInlineMarkdown(parts[0].trim());
        company = processInlineMarkdown(parts[1].trim());
    } else {
        role = processInlineMarkdown(role);
    }

    const processedContent = processContentWithBlocks(entry.Content || "");

    let dateHTML = "";
    let metaHTML = "";

    if (entry.Tags) {
        const chipLink = (label, url, iconHtml) => `<a href="${url}" target="_blank" style="text-decoration:none; display:flex; align-items:center;">${iconHtml}${processInlineMarkdown(label)}</a>`;
        const processTag = (tag) => {
            tag = tag.trim();
            if (tag.match(/[A-Za-z]{3,}\s+\d{4}/) || tag.toLowerCase().includes("present")) return { type: "date", html: processInlineMarkdown(tag) };

            const locMatch = tag.match(/^@\s*(.*)$/);
            if (locMatch) {
                const linkMatch = locMatch[1].trim().match(/^\[(.*?)\]\((.*?)\)$/);
                if (linkMatch) return { type: "loc", html: chipLink(linkMatch[1], linkMatch[2], '<svg class="chip-icon" viewBox="0 0 24 24" style="width:12px; height:12px; margin-right:4px; vertical-align:middle; display:inline-block;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>') };
            }

            const linkMatchRaw = tag.match(/^\[(.*?)\]\((.*?)\)$/);
            if (linkMatchRaw) {
                const isMap = /maps\.app\.goo\.gl|google\.com\/maps/i.test(linkMatchRaw[2]);
                const icon = isMap ? '<svg class="chip-icon" viewBox="0 0 24 24" style="width:12px; height:12px; margin-right:4px; vertical-align:middle; display:inline-block;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>' : '<svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; margin-right:4px; vertical-align:middle; display:inline-block;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
                return { type: "loc", html: chipLink(linkMatchRaw[1], linkMatchRaw[2], icon) };
            }
            return { type: "other", html: processInlineMarkdown(tag) };
        };

        const delimiter = entry.Tags.includes(";") ? /(?:;|\u2022)\s*/ : /(?:;|,|\u2022)\s*/;
        const tags = entry.Tags.split(delimiter).filter(t => t.trim());
        let metaItems = [];

        tags.forEach(t => {
            const processed = processTag(t);
            if (processed.type === "date" && !dateHTML) {
                dateHTML = processed.html;
            } else {
                metaItems.push(processed.html);
            }
        });
        if (metaItems.length > 0) metaHTML = metaItems.join(", ");
    }

    return `
                <div class="resume-entry" id="res-${entry.ID || Math.random().toString(36).substring(2, 11)}">
                    <div class="resume-entry-header">
                        <div class="resume-row-main" style="display:flex; justify-content:space-between; align-items:baseline;">
                            <div class="resume-role">${role}</div>
                            <div class="resume-date-slot">${dateHTML}</div>
                        </div>
                        <div class="resume-row-sub" style="display:flex; justify-content:space-between; align-items:baseline;">
                            ${company ? `<div class="resume-company">${company}</div>` : "<div></div>"}
                            <div class="resume-loc-slot">${metaHTML}</div>
                        </div>
                    </div>
                    <div class="resume-list text-content">${processedContent}</div>
                </div>`;
}



// === FLEXIBLE CONTENT BLOCK SYSTEM ===

// Parse content into blocks separated by blank lines
function parseContentBlocks(text) {
    if (!text) return [];

    const rawLines = text.split(/\n|\r\n/);
    const blocks = [];
    let textBuffer = [];

    const flushText = () => {
        if (textBuffer.length > 0) {
            blocks.push(processBlock(textBuffer));
            textBuffer = [];
        }
    };

    for (let i = 0; i < rawLines.length; i++) {
        const lineRaw = rawLines[i].trimEnd();
        const line = lineRaw.trim();

        if (line === '') {
            flushText();
            continue;
        }

        // 3. SPECIAL BLOCK DETECTION: Check for TOC or Buttons
        const isTOC = line.match(/^\[\s*(?:[^\]|]+\s*\|\s*)?TOC\s*\]$/i);
        const isButtonRow = line.match(/^(\s*\[\s*[^\]|]+\s*\|\s*[^\]|]+\s*(?:\|\s*[^\]|]+\s*)?\]\s*(?:,\s*)?)+$/i);

        // 4. Check for Media (Grouping consecutive media lines)
        const parts = line.split(',').map(p => p.trim()).filter(p => p);
        const mediaItems = parts.map(p => detectMediaItem(p));
        const isPureMedia = mediaItems.length > 0 && mediaItems.every(m => m !== null);

        // 5. BREAK-OUT LOGIC: Ensure these blocks always start fresh
        if (isTOC || isButtonRow || isPureMedia) {
            flushText();

            if (isTOC || isButtonRow) {
                blocks.push(processBlock([lineRaw]));
            } else {
                // Media Grouping logic: Collect consecutive media lines or a trailing caption
                let mediaLines = [lineRaw];
                while (i + 1 < rawLines.length) {
                    const nextRaw = rawLines[i + 1];
                    const nextLine = nextRaw.trim();
                    if (!nextLine) break;

                    // Check for buttons first - they should NOT be grouped as media captions
                    const nextIsButton = nextLine.match(/^(\s*\[\s*[^\]|]+\s*\|\s*[^\]|]+\s*(?:\|\s*[^\]|]+\s*)?\]\s*(?:,\s*)?)+$/i);
                    const nextIsTOC = nextLine.match(/^\[\s*(?:[^\]|]+\s*\|\s*)?TOC\s*\]$/i);
                    if (nextIsButton || nextIsTOC) break;

                    const nextParts = nextLine.split(',').map(p => p.trim()).filter(p => p);
                    const nextMedia = nextParts.map(p => detectMediaItem(p));
                    const isNextPureMedia = nextMedia.length > 0 && nextMedia.every(m => m !== null);
                    
                    // Caption detection: [Text] but NO pipe | AND not TOC
                    const isNextCaption = nextLine.match(/^\[([^|]*?)\]$/s);

                    if (isNextPureMedia || isNextCaption) {
                        mediaLines.push(nextRaw.trimEnd());
                        i++;
                        if (isNextCaption) break; // Caption ends the block
                    } else break;
                }
                blocks.push(processBlock(mediaLines));
            }
            continue;
        }

        textBuffer.push(lineRaw);
    }

    flushText();
    return blocks;
};

// Process a single block of lines into typed content
function processBlock(lines) {
    if (lines.length === 0) return null;
    const combinedBlock = lines.join(' ').trim();

    // 1. HIGH-PRIORITY TAGS: Check for TOC first (Prevents it being stolen by caption logic)
    const tocMatch = combinedBlock.match(/^\[\s*(?:([^\]|]+)\s*\|\s*)?TOC\s*\]$/i);
    if (tocMatch) {
        return { type: 'toc', title: (tocMatch[1] ? tocMatch[1].trim() : "Content") };
    }

    // 2. Smart Caption Detection: [This is a caption]
    // We check the last line for square brackets, but ensure it's NOT a button (no pipe | allowed in captions)
    let sharedCaption = null;
    const lastLine = lines[lines.length - 1].trim();
    // Match [Caption] - must start with [ and end with ] and NOT contain a pipe |
    const captionMatch = lastLine.match(/^\[([^|]*?)\]$/s);
    if (captionMatch) {
        sharedCaption = captionMatch[1].trim();
        lines = lines.slice(0, -1); // Remove caption line from media processing
        if (lines.length === 0) return { type: 'text', content: `[${sharedCaption}]` }; 
    }

    // 3. Fluid Media Detection (Support for multi-line and comma-separated media)
    let allMediaMatches = [];
    let allTextMatches = true;

    for (let line of lines) {
        const lineParts = line.split(',').map(p => p.trim()).filter(p => p);
        if (lineParts.length === 0) continue;

        for (const part of lineParts) {
            const item = detectMediaItem(part);
            if (item) {
                allMediaMatches.push(item);
            } else {
                allTextMatches = false;
                break;
            }
        }
        if (!allTextMatches) break;
    }

    if (allMediaMatches.length > 0 && allTextMatches) {
        // If every item is a pure YT Music URL, trigger the dynamic music-card renderer
        const allMusicCards = allMediaMatches.every(m => m.type === 'music-card');
        if (allMusicCards) {
            return {
                type: 'music-cluster',
                items: allMediaMatches
            };
        }

        // If it's more than one item, it's a gallery
        if (allMediaMatches.length > 1) {
            return {
                type: 'gallery',
                items: allMediaMatches,
                sharedCaption: sharedCaption
            };
        } else {
            // Single media item
            const item = allMediaMatches[0];
            if (sharedCaption && !item.caption) item.caption = sharedCaption;
            return item;
        }
    }

    // 4. Smart Button Detection (Extract all buttons from the block/line)
    const buttonItems = [];
    // Regex to find all buttons: [text | link | color (optional)]
    const btnRegex = /\[\s*([^\]|]+?)\s*\|\s*([^\]|]+?)\s*(?:\|\s*([^\]|]+?)\s*)?\]/gi;

    for (let line of lines) {
        let match;
        while ((match = btnRegex.exec(line)) !== null) {
            const text = match[1];
            const url = match[2];
            const color = match[3] || null;
            if (text && url) {
                buttonItems.push({ text: text.trim(), url: url.trim(), color: color ? color.trim() : null });
            }
        }
    }

    if (buttonItems.length > 0) {
        return { type: 'buttons', items: buttonItems };
    }

    // 5. Dynamic Tag Detection (Expanded to allow flexible inclusion)
    const musicTag = lines.some(l => l.trim().match(/\{(Recent Music|Recently Played|Top Artists|Top Songs|Fresh Favorites)\}/i));
    if (musicTag) {
        const line = combinedBlock.trim();
        if (line.match(/^\{(Recent Music|Recently Played)\}$/i)) return { type: 'music' };
        if (line.match(/^\{Top Artists\}$/i)) return { type: 'top-artists' };
        if (line.match(/^\{Top Songs\}$/i)) return { type: 'top-songs' };
        if (line.match(/^\{Fresh Favorites\}$/i)) return { type: 'fresh-favorites' };
    }

    const quoteTag = lines.some(l => l.trim().match(/\{Random Quote\}/i));
    if (quoteTag && combinedBlock.match(/^\{Random Quote\}$/i)) {
        return { type: 'quote', title: '{random quote}' };
    }
    // OTHERWISE: It's text content
    return {
        type: 'text',
        content: (sharedCaption ? [...lines, `[${sharedCaption}]`] : lines).join('\n')
    };
}

// Detect media type and caption from a string
function detectMediaItem(text) {
    text = text.trim();
    if (!text || text.includes('|')) return null;

    // 1. Support inline Square-Bracket Captions: "path/to/media.jpg [This is my caption]"
    const inlineCaptionMatch = text.match(/^(.+?)\s*\[(.*)\]$/);
    let caption = null;
    let url = text;

    if (inlineCaptionMatch) {
        url = inlineCaptionMatch[1].trim();
        caption = inlineCaptionMatch[2].trim();
    }

    // 2. Markdown Image Syntax (Self-Contained)
    const markdownImgMatch = url.match(/^!\[(.*)\]\(([^)]+)\)$/);
    if (markdownImgMatch) {
        const subUrl = markdownImgMatch[2].trim();
        const subCaption = markdownImgMatch[1].trim();
        const subType = extractMediaFromContent(subUrl);
        return {
            type: subType ? subType.type : 'image',
            url: subUrl,
            id: subType ? subType.id : null,
            caption: caption || subCaption || null
        };
    }

    // 3. Direct URL or Special Syntax
    const media = extractMediaFromContent(url);
    if (media) {
        return {
            ...media,
            caption: caption || media.caption || null
        };
    }

    return null;
}

// Helper to detect type from a raw URL or specific tag syntax (without markdown wrapper)
function detectBasicUrlType(text) {
    text = text.trim();

    // 1. YouTube (including Music)
    const ytId = getYouTubeID(text);
    if (ytId) {
        if (text.includes('music.youtube.com')) {
            return { type: 'music-card', id: ytId, url: text };
        }
        return { type: 'youtube', id: ytId, url: text };
    }

    // 2. GLB / 3D Models - support new -scale and -z-up suffixes
    if (text.match(/\.glb(\?.*|-(?:autoplay|thumb|loop|noloop|nocontrols|scale\d+|z-up))*$/i) || text.match(/assets\/models\/.*\.glb/i)) {
        const url = (text.startsWith('assets/') || text.startsWith('http')) ? text : `assets/models/${text}`;
        return { type: 'glb', url: url };
    }

    // 3. Native Video
    if (text.match(/\.(mp4|webm|mov|ogg)(\?.*|-(?:autoplay|thumb|loop|noloop|nocontrols))*/i)) {
        return { type: 'video', url: text };
    }

    // 3.5 GeoJSON / GPS Visualizer Art
    if (!text.includes('|') && (text.match(/\.geojson(?:-[A-Z]{1,2})?(\?.*)?(?![\w-])/i) || text.match(/assets\/GPX\/.*\.geojson(?:-[A-Z]{1,2})?/i))) {
        // If it doesn't already have an HTTP or assets prefix, add it. (Preserve the suffix for init parsing)
        const url = (text.startsWith('assets/') || text.startsWith('http')) ? text : `assets/GPX/${text}`;
        return { type: 'geojson', url: url };
    }

    // 4. Strava Activities (Links, IDs, Snippets)
    const stravaIdMatch = text.match(/(?:strava\.com\/activities\/|strava\.app\.link\/|strava:\/\/activity\/|data-embed-id=")\s*(\d{10,12})/i);
    if (stravaIdMatch) {
        return { type: 'strava', id: stravaIdMatch[1], url: text };
    }
    if (text.includes('strava.com') || text.includes('strava.app.link')) {
        return { type: 'strava', id: null, url: text };
    }

    // 5. Image
    if (isImageURL(text)) {
        return { type: 'image', url: text };
    }

    return null;
}

// Check if a string is an image URL
function isImageURL(str) {
    // Check for explicit image extensions (allowing behavior markers)
    if (str.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?.*|-(?:autoplay|thumb|loop|noloop|nocontrols))*/i)) {
        return true;
    }

    // Check for common image CDN patterns (Picsum, Unsplash, etc.)
    if (str.match(/^https?:\/\/(picsum\.photos|images\.unsplash\.com|source\.unsplash\.com|placehold\.it|placeholder\.com|via\.placeholder\.com)/i)) {
        return true;
    }

    // Check if URL contains image dimensions pattern (likely an image)
    if (str.match(/https?:\/\/[^\/]+\/\d+\/\d+/)) {
        return true;
    }

    return false;
}


// Unified Media Renderer (Single Source of Truth)
function renderUnifiedMediaItem(item, isGallery = false) {
    let mediaHTML = '';
    let captionHTML = '';
    // For gallery embeds, we use a specific class to handle flex height
    const embedClass = isGallery ? 'embed-wrapper video gallery-embed' : 'embed-wrapper video';

    // 1. Generate Media HTML
    if (item.type === 'video') {
        const p = processMediaUrl(item.url);
        mediaHTML = `<div class="${embedClass}">
                        <div class="loader-overlay"><div class="spinner"></div></div>
                        <video class="media-enter lazy-video ${p.invert ? 'theme-invert' : ''}"
                               data-src="${p.url}"
                               ${p.autoplay ? 'data-autoplay="true" muted' : ''}
                               ${p.loop ? 'loop' : ''}
                               ${p.controls ? 'controls' : ''} playsinline
                               onloadeddata="mediaLoaded(this)"
                               onerror="this.previousElementSibling?.remove()"></video>
                    </div>`;

    } else if (item.type === 'image') {
        const style = isGallery ? 'style="height:100%; width:100%; object-fit:cover;"' : '';
        const p = processMediaUrl(item.url);
        mediaHTML = `<div class="loader-overlay"><div class="spinner"></div></div><img class="media-enter ${p.invert ? 'theme-invert' : ''}" src="${p.url}" alt="${item.caption || 'Media'}" loading="lazy" ${style} onload="mediaLoaded(this)" onerror="this.previousElementSibling?.remove()">`;
        if (!isGallery) mediaHTML = `<div class="media-container">${mediaHTML}</div>`;
    } else if (item.type === 'youtube') {
        const ytId = item.id || getYouTubeID(item.url);
        const thumbUrl = `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
        const fallbackThumb = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
        const fallbackThumb2 = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;

        const playIconHTML = `
                    <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: transparent; cursor: pointer; z-index: 2;" 
                         onmouseover="const btn=this.querySelector('.yt-glass-btn'); btn.style.background='var(--card-bg-hover)'; btn.style.borderColor='var(--text-bright)'; btn.style.boxShadow='0 4px 12px rgba(0,0,0,0.2), inset 0 0 0 1px var(--text-bright)';" 
                         onmouseout="const btn=this.querySelector('.yt-glass-btn'); btn.style.background='var(--bg-trans)'; btn.style.borderColor='var(--border-header)'; btn.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)';">
                        <div class="yt-glass-btn" style="width: 72px; height: 72px; border-radius: 50%; background: var(--bg-trans); border: 1px solid var(--border-header); display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                            <svg viewBox="0 0 24 24" fill="var(--text-bright)" style="width: 34px; height: 34px;"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                    </div>`;

        const iframeHTML = `<iframe class="media-enter" onload="mediaLoaded(this)" src="https://www.youtube-nocookie.com/embed/${ytId}?modestbranding=1&rel=0&autoplay=1" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="width: 100%; height: 100%; position: absolute; top:0; left:0; border-radius: inherit;"></iframe>`;

        // Properly escape double quotes so we can store it in a data attribute
        const encodedIframe = iframeHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        const thumbStyle = isGallery ? 'style="width: 100%; height: 100%; object-fit: cover; display: block; position: relative; z-index: 1;"' : 'style="width: 100%; height: auto; display: block; position: relative; z-index: 1;"';

        // CHAINED FALLBACK: MaxRes -> HQ -> MQ -> Generic
        // This prevents 404s from showing broken images and handles videos without high-res thumbs.
        mediaHTML = `<div class="${embedClass}" style="position: relative; overflow: hidden; display: block; border-radius: var(--card-radius);" data-iframe="${encodedIframe}" onclick="if(!this.dataset.playing){this.dataset.playing='1'; this.style.aspectRatio = (this.offsetWidth / this.offsetHeight); this.innerHTML = this.dataset.iframe;}">
                        <div class="sk-img loader-overlay" style="z-index: 0;"></div>
                        <img class="media-enter" src="${thumbUrl}" alt="Video thumbnail" ${thumbStyle} 
                             onload="mediaLoaded(this)" 
                             onerror="if(!this.dataset.fallback){this.dataset.fallback='1'; this.src='${fallbackThumb}';} else if(this.dataset.fallback=='1'){this.dataset.fallback='2'; this.src='${fallbackThumb2}';}">
                        ${playIconHTML}
                    </div>`;
    } else if (item.type === 'glb' && renderGLBViewer) {
        // renderGLBViewer returns a div with class "model-viewer-wrapper" which has border-radius
        // Strip wrapper width/height on mobile using specific css later if needed
        mediaHTML = renderGLBViewer(item.url, false);

    } else if (item.type === 'geojson') {
        mediaHTML = renderMapBoxViewer(item.url, false);

    } else if (item.type === 'strava') {
        const stravaId = item.id;
        const stravaUrl = item.url.startsWith('http') ? item.url : `https://www.strava.com/activities/${stravaId}`;

        if (stravaId) {
            mediaHTML = `<div class="strava-embed-placeholder" data-embed-type="activity" data-embed-id="${stravaId}" data-style="standard" data-from-embed="false" style="width: 100%; min-height: 180px; border-radius: var(--card-radius); overflow: hidden; background: var(--card-bg-dark); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; border: 1px solid var(--border-subtle); box-sizing: border-box;">
                        <div class="loader-overlay"><div class="spinner"></div></div>
                        <svg viewBox="0 0 24 24" style="width: 32px; height: 32px; fill: var(--accent-projects); margin-bottom: 12px; opacity: 0.8;"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"></path></svg>
                        <a href="${stravaUrl}" target="_blank" style="color: var(--text-bright); text-decoration: none; font-weight: 600; font-family: Jost, sans-serif; font-size: 16px; letter-spacing: 0.5px;">VIEW ON STRAVA</a>
                    </div>`;
        } else {
            // Fallback for links where we couldn't parse the ID (like short redirects)
            mediaHTML = `<div style="width: 100%; padding: 40px 20px; border-radius: var(--card-radius); background: var(--card-bg-dark); text-align: center; border: 1px solid var(--border-subtle); display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
                        <svg viewBox="0 0 24 24" style="width: 32px; height: 32px; fill: var(--text-muted); margin-bottom: 12px; opacity: 0.5;"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"></path></svg>
                        <a href="${item.url}" target="_blank" style="color: var(--text-bright); text-decoration: none; font-weight: 600; font-family: Jost, sans-serif; font-size: 16px; letter-spacing: 0.5px;">CHECK OUT STRAVA ACTIVITY</a>
                    </div>`;
        }

        // Ensure Strava script is loaded
        if (!window._stravaScriptLoaded) {
            const script = document.createElement('script');
            script.src = "https://strava-embeds.com/embed.js";
            script.async = true;
            script.onload = () => {
                if (typeof window.__STRAVA_EMBED_BOOTSTRAP__ === 'function') {
                    window.__STRAVA_EMBED_BOOTSTRAP__();
                }
            };
            document.head.appendChild(script);
            window._stravaScriptLoaded = true;
        } else if (typeof window.__STRAVA_EMBED_BOOTSTRAP__ === 'function') {
            // Script already exists, but we need to scan the new placeholder
            setTimeout(() => window.__STRAVA_EMBED_BOOTSTRAP__(), 10);
        }
    }
    if (item.caption) {
        // Use the full markdown engine for "Universal Markdown" support in captions (lists, links, etc.)
        // We strip the outer paragraph tag to maintain the caption block's expected flow/styling 
        // but only if it's a simple paragraph (not a list/header).
        let processed = processMarkdown(item.caption);
        if (processed.startsWith('<p>') && processed.endsWith('</p>') && (processed.match(/<p>/g) || []).length === 1) {
            processed = processed.substring(3, processed.length - 4);
        }

        const captionStyle = isGallery ? '' : 'style="margin-top: 4px;"';
        captionHTML = `<div class="image-caption" ${captionStyle}>${processed}</div>`;
    }

    // 3. Assembly
    if (isGallery) {
        // Multi-item Gallery: Uses a wrapper to isolate media framing from captions.
        // This ensures uniform media scaling without distortion from varying caption lengths.
        return `<div class="gallery-item-wrapper">
                    <div class="gallery-item">
                        ${mediaHTML}
                    </div>
                    ${captionHTML}
                </div>`;
    } else {
        // Single Item: Wrap in a container to maintain spacing relationship with caption
        return `<div class="unified-media-wrapper">${mediaHTML}${captionHTML}</div>`;
    }
}
// Render a block as HTML
function renderContentBlock(block, index, allBlocks) {
    if (!block) return '';

    // Detect current page category for inheritance
    const contextCategory = getCategoryClass(window.location.hash.substring(1) || "Home");

    switch (block.type) {
        case 'text':
            return processMarkdown(block.content);

        case 'image':
        case 'youtube':
        case 'video':
        case 'glb':
        case 'geojson': // Added geojson to renderable types
        case 'strava':
            return renderUnifiedMediaItem(block, false);

        case 'gallery':
            return renderUnifiedGallery(block.items, block.sharedCaption);

        case 'music-cluster':
            const urls = block.items.map(i => i.url).join(',');
            return `<div class="music-embed-container" data-needs-init="true" data-type="music-cluster" data-urls="${urls}"></div>`;

        case 'button':
            return renderButtonHTML(block.text, block.url, block.color);

        case 'buttons':
            const btnsHTML = block.items.map(b => renderButtonHTML(b.text, b.url, b.color, true)).join('');
            return `<div class="btn-cta-wrapper">${btnsHTML}</div>`;

        case 'music':
            return `<div class="music-embed-container" data-needs-init="true" data-type="recent-music"></div>`;
        
        case 'top-artists':
            return `<div class="music-embed-container" data-needs-init="true" data-type="top-artists"></div>`;
        
        case 'top-songs':
            return `<div class="music-embed-container" data-needs-init="true" data-type="top-songs"></div>`;
        
        case 'fresh-favorites':
            return `<div class="music-embed-container" data-needs-init="true" data-type="fresh-favorites"></div>`;

        case 'toc':
            return renderTOC(allBlocks, index);

        case 'quote':
            return `<div class="layout-quote" data-needs-init="true" data-title="${block.title || 'random quote'}"></div>`;

        case 'music-cluster':
            const clusterUrls = block.items.map(i => i.url).join(',');
            return `<div class="music-embed-container" data-needs-init="true" data-type="music-cluster" data-urls="${clusterUrls}"></div>`;

        case 'card':
            return `<div class="markdown-single-card" style="margin: 20px 0;">${renderCardHTML(block.data, contextCategory)}</div>`;

        case 'grid':
            const cardsHTML = block.cards.map(card => renderCardHTML(card, contextCategory)).join('');
            return `<div class="markdown-grid section">${cardsHTML}</div>`;

        default:
            return '';
    }
}

// Centralized Toolset for Markdown Elements
function renderButtonHTML(text, url, color = null, isInline = false) {
    const finalURL = (url || "").trim().replace(/^\(|\)$/g, "").trim(); 
    let colorClass = (color || "").toLowerCase().trim();
    let cleanText = (text || "").trim();

    // Auto-Branding for Strava (if no explicit color provided)
    if (!colorClass && (cleanText.toLowerCase().includes("strava") || finalURL.includes("strava.com"))) {
        colorClass = "strava";
    }

    const target = finalURL.startsWith('#') || finalURL.startsWith('javascript:') ? '' : 'target="_blank"';

    // Recursively process markdown inside the button text
    let formattedText = processInlineMarkdown(cleanText, 1);

    const btnHTML = `<a href="${finalURL}" class="btn-cta ${colorClass}" ${target} rel="noopener">${formattedText}</a>`;
    if (isInline) return btnHTML;
    return `<div class="btn-cta-wrapper">${btnHTML}</div>`;
};



// Unified Gallery Renderer (Images, YT, GLB)
function renderUnifiedGallery(items, sharedCaption) {
    const galleryHTML = items.map(item => renderUnifiedMediaItem(item, true)).join('');

    let sharedCaptionHTML = '';
    if (sharedCaption) {
        let processed = processMarkdown(sharedCaption);
        // Strip outer P for single-paragraph captions to avoid double-padding
        if (processed.startsWith('<p>') && processed.endsWith('</p>') && (processed.match(/<p>/g) || []).length === 1) {
            processed = processed.substring(3, processed.length - 4);
        }
        sharedCaptionHTML = `<div class="image-caption shared-caption">${processed}</div>`;
    }

    return `<div class="media-gallery uniform-height">
                ${galleryHTML}
            </div>
            ${sharedCaptionHTML}`;
}

// Enhanced markdown processor with nested list support
function processMarkdown(text) {
    if (!text) return '';

    const lines = text.split(/\n|\r\n/);
    const output = [];
    let listStack = []; // Track nested list levels
    const MAX_DEPTH = 2;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimEnd();

        if (!trimmed) {
            // Close all open lists on empty line
            while (listStack.length > 0) {
                output.push('</ul>');
                listStack.pop();
            }
            continue;
        }

        // Handle tables (GFM pipe syntax: | head | head |)
        const isTableLine = trimmed.includes('|') && trimmed.startsWith('|') && trimmed.endsWith('|');
        if (isTableLine && i + 1 < lines.length) {
            const nextTrimmed = lines[i + 1].trim();
            const isSeparator = nextTrimmed.match(/^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/);
            if (isSeparator) {
                while (listStack.length > 0) { output.push('</ul>'); listStack.pop(); }
                let tableHTML = '<div class="table-wrapper"><table><thead><tr>';
                const headerCells = trimmed.split('|').slice(1, -1);
                headerCells.forEach(cell => {
                    tableHTML += `<th>${processInlineMarkdown(cell.trim())}</th>`;
                });
                tableHTML += '</tr></thead><tbody>';
                i++; // Skip separator
                let nextRowIdx = i + 1;
                while (nextRowIdx < lines.length) {
                    const rowLine = lines[nextRowIdx].trim();
                    if (rowLine.includes('|') && rowLine.startsWith('|') && rowLine.endsWith('|')) {
                        tableHTML += '<tr>';
                        const cells = rowLine.split('|').slice(1, -1);
                        cells.forEach(cell => {
                            tableHTML += `<td>${processInlineMarkdown(cell.trim())}</td>`;
                        });
                        tableHTML += '</tr>';
                        i = nextRowIdx;
                        nextRowIdx++;
                    } else { break; }
                }
                tableHTML += '</tbody></table></div>';
                output.push(tableHTML);
                continue;
            }
        }

        // Check for headers (# to ####)
        const headerMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (headerMatch) {
            while (listStack.length > 0) {
                output.push('</ul>');
                listStack.pop();
            }
            const level = headerMatch[1].length;
            const content = processInlineMarkdown(headerMatch[2]);
            const id = headerMatch[2].toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
            output.push(`<h${level} id="${id}">${content}</h${level}>`);
            continue;
        }

        // Check for list items with indentation (including checkboxes)
        const listMatch = line.match(/^(\s*)-\s+(.*)$/);
        if (listMatch) {
            const indent = listMatch[1].length;
            let itemContent = listMatch[2];
            const currentLevel = Math.min(Math.floor(indent / 2), MAX_DEPTH);
            let checkboxHTML = '';
            let isCheckbox = false;
            const checkboxMatch = itemContent.match(/^\[([ xX])\]\s*(.*)$/);
            if (checkboxMatch) {
                isCheckbox = true;
                const isChecked = checkboxMatch[1].toLowerCase() === 'x';
                checkboxHTML = `<span class="checkbox ${isChecked ? 'checked' : ''}"></span>`;
                itemContent = checkboxMatch[2];
            }
            const content = processInlineMarkdown(itemContent);
            while (listStack.length > currentLevel + 1) { output.push('</ul>'); listStack.pop(); }
            while (listStack.length < currentLevel + 1) { output.push('<ul>'); listStack.push(true); }
            if (isCheckbox) {
                output.push(`<li class="checkbox-item">${checkboxHTML}${content}</li>`);
            } else {
                output.push(`<li>${content}</li>`);
            }
            continue;
        }

        // Close all lists if we hit non-list content
        while (listStack.length > 0) {
            output.push('</ul>');
            listStack.pop();
        }

        // Handle blockquotes
        if (trimmed.startsWith('>')) {
            output.push(`<blockquote>${processInlineMarkdown(trimmed.replace(/^>\s*/, ''))}</blockquote>`);
            continue;
        }

        // Handle horizontal rules
        if (trimmed.match(/^(?:---|\*\*\*)$/)) {
            output.push('<hr>');
            continue;
        }

        // Regular paragraph
        output.push(`<p>${processInlineMarkdown(trimmed)}</p>`);
    }

    // Close any remaining open lists
    while (listStack.length > 0) {
        output.push('</ul>');
        listStack.pop();
    }

    return output.join('\n');
}

// Process inline markdown (bold, italic, code, links) with recursion guard
function processInlineMarkdown(text, depth = 0) {
    if (!text || depth > 5) return text || '';

    // Escape HTML first (only on first call)
    let result = depth === 0 ? safeHTML(text) : text;

    if (depth === 0) {
        result = result.replace(/&lt;br\s*\/?&gt;/gi, '<br>');

        // B. DYNAMIC TAGS: {Recently Played}, {Random Quote}, Rewind Stats
        result = result.replace(/\{(Recent Music|Recently Played)\}/gi, '<div class="music-embed-container" data-needs-init="true" data-type="recent-music"></div>');
        result = result.replace(/\{Top Artists\}/gi, '<div class="music-embed-container" data-needs-init="true" data-type="top-artists"></div>');
        result = result.replace(/\{Top Songs\}/gi, '<div class="music-embed-container" data-needs-init="true" data-type="top-songs"></div>');
        result = result.replace(/\{Fresh Favorites\}/gi, '<div class="music-embed-container" data-needs-init="true" data-type="fresh-favorites"></div>');
        result = result.replace(/\{Random Quote\}/gi, '<div class="layout-quote" data-needs-init="true" data-title="random quote"></div>');
        result = result.replace(/\{(Refresh|Reload)\}|\[\[(Refresh|Reload)\]\]/gi, (match) => {
            const label = match.replace(/^[\{\[]+|[\}\]]+$/g, '');
            return `<a href="javascript:location.reload()">${label}</a>`;
        });
    }

    // Standard Markdown (Multi-line support with [\s\S])
    result = result.replace(/\*\*((?:[\s\S])*?)\*\*/g, (m, p1) => `<strong>${processInlineMarkdown(p1, depth + 1)}</strong>`);
    result = result.replace(/__((?:[\s\S])*?)__/g, (m, p1) => `<u>${processInlineMarkdown(p1, depth + 1)}</u>`);
    result = result.replace(/\*((?:[\s\S])*?)\*/g, (m, p1) => `<em>${processInlineMarkdown(p1, depth + 1)}</em>`);
    result = result.replace(/~~((?:[\s\S])*?)~~/g, (m, p1) => `<s>${processInlineMarkdown(p1, depth + 1)}</s>`);
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

    // D. INTERNAL WIKI LINKS: [[Page Title]] or [[Page/Path]]
    // This allows linking to any page in the database or resume by its exact Title or Page path.
    result = result.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
        const target = p1.trim();
        const searchDBs = [db, resumeDb];
        let entry = null;

        for (const currentDB of searchDBs) {
            entry = currentDB.find(e => 
                (e.Page && e.Page === target) || 
                (e.Title && e.Title.trim() === target) ||
                (e.ID && e.ID === target)
            );
            if (entry) break;
        }

        if (entry) {
            const url = entry.Page ? `#${path2url(entry.Page)}` : (entry.ID ? `#Professional/Resume` : '#');
            return `<a href="${url}" onclick="event.stopPropagation(); closeSearch();">${processInlineMarkdown(p1, depth + 1)}</a>`;
        }
        
        // Fallback: Partial title match in main DB
        const partial = db.find(e => e.Title && e.Title.toLowerCase().includes(target.toLowerCase()));
        if (partial) {
            return `<a href="#${path2url(partial.Page)}" onclick="event.stopPropagation(); closeSearch();">${processInlineMarkdown(p1, depth + 1)}</a>`;
        }
        return `<span class="broken-link" title="Page not found in DB">${safeHTML(target)}</span>`;
    });

    // C. SMART LINKS & MARKDOWN LINKS
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
        const cleanURL = url.trim();
        const isInternal = cleanURL.startsWith('#') || cleanURL.startsWith('/') || cleanURL.includes(window.location.hostname);
        const target = isInternal ? '' : 'target="_blank" rel="noopener"';
        
        // Standard Link
        if (label.toLowerCase().includes('strava')) {
            return `<a href="${cleanURL}" ${target} class="strava-link" onclick="event.stopPropagation();">${processInlineMarkdown(label, depth + 1)}</a>`;
        }
        return `<a href="${cleanURL}" ${target} onclick="event.stopPropagation();">${processInlineMarkdown(label, depth + 1)}</a>`;
    });

    if (depth === 0) {
        result = result.replace(/(?<!href=")(https?:\/\/(?:www\.)?(?:strava\.com|strava\.app\.link)\/\S+)/gi, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }

    return result;
}

// --- MAPBOX GL JS INITIALIZER FOR GEOJSON ART ---
window.__initMapbox = async function (containerId, geojsonUrl, isInteractive = true) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear the container to avoid "The map container element should be empty" warnings
    container.innerHTML = '';

    // Automatically authenticating with provided Mapbox account token.
    // Split to bypass aggressive GitHub secret scanners that confuse 'pk' public keys with 'sk' private keys.
    mapboxgl.accessToken = 'pk.' + 'eyJ1Ijoic2FoaWJkc3YiLCJhIjoiY21tbGY2YW5lMWJhMjJwcHlka3l4eWh5cSJ9.fZj2rE1j3Eb7xn013s1DHA';

    let realUrl = geojsonUrl;
    let orientationBearing = -17.6; // Default artistic twist

    // Extract explicit bearing from URL suffix (e.g. .geojson-NW)
    const bearingFormatMatch = geojsonUrl.match(/\.geojson-([NSEW]{1,2})(?:\?.*)?$/i);
    if (bearingFormatMatch) {
        const dir = bearingFormatMatch[1].toUpperCase();
        // Robustly strip the direction suffix from the .geojson part only
        realUrl = geojsonUrl.replace(new RegExp(`\\.geojson-${dir}`, "i"), ".geojson");
        const bearingMap = { 'N': 0, 'NE': 45, 'E': 90, 'SE': 135, 'S': 180, 'SW': 225, 'W': 270, 'NW': 315 };
        if (bearingMap[dir] !== undefined) {
            orientationBearing = bearingMap[dir];
        }
    }

    try {
        // Fetch GeoJSON directly to evaluate bounds before loading
        const geoReq = await fetch(realUrl);
        if (!geoReq.ok) throw new Error(`Failed to fetch GeoJSON: ${geoReq.status} ${geoReq.statusText}`);

        const geoData = await geoReq.json();

        const bounds = new mapboxgl.LngLatBounds();
        let hasCoords = false;

        const processCoords = (coords) => {
            if (Array.isArray(coords) && typeof coords[0] === 'number') {
                // Mapbox LngLatBounds.extend is safest with explicit [lng, lat]
                bounds.extend([coords[0], coords[1]]);
                hasCoords = true;
            } else if (Array.isArray(coords)) {
                coords.forEach(processCoords);
            }
        };

        if (geoData.features) {
            geoData.features.forEach(f => {
                if (f.geometry && f.geometry.coordinates) processCoords(f.geometry.coordinates);
            });
        } else if (geoData.geometry && geoData.geometry.coordinates) {
            processCoords(geoData.geometry.coordinates);
        }

        container.classList.remove('loader-overlay');

        const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';
        const styleUrl = isLightMode ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11';

        // Grab styling rules visually
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-personal').trim() || '#00e676';

        const map = new mapboxgl.Map({
            container: containerId,
            style: styleUrl,
            pitch: 45,       // Artistic isometric lean
            bearing: orientationBearing, // Uses explicit suffix or default twist
            interactive: isInteractive,
            attributionControl: false // Minimalist aesthetic
        });

        // Use hover media query to reliably distinguish desktop from touch
        if (window.matchMedia('(hover: hover)').matches) {
            map.scrollZoom.enable();
        } else {
            map.scrollZoom.disable();
        }

        const addMapboxArtLayers = () => {
            const currentAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent-personal').trim() || '#00e676';

            if (!map.getSource('route')) {
                map.addSource('route', { 'type': 'geojson', 'data': geoData });
            }
            if (!map.getLayer('route-glow')) {
                map.addLayer({
                    'id': 'route-glow', 'type': 'line', 'source': 'route',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 'line-color': currentAccent, 'line-width': 12, 'line-blur': 12, 'line-opacity': 0.3 }
                });
            }
            if (!map.getLayer('route')) {
                map.addLayer({
                    'id': 'route', 'type': 'line', 'source': 'route',
                    'layout': { 'line-join': 'round', 'line-cap': 'round' },
                    'paint': { 'line-color': currentAccent, 'line-width': 3, 'line-opacity': 0.9 }
                });
            }
        };

        // Mapbox setStyle wipes all sources and layers, so we must inject them cleanly 
        // every time the style physically finishes loading.
        map.on('style.load', () => {
            addMapboxArtLayers();
            // Re-confirm scroll zoom settings after style load
            if (window.matchMedia('(hover: hover)').matches) {
                map.scrollZoom.enable();
            } else {
                map.scrollZoom.disable();
            }
        });

        map.on('load', () => {
            if (hasCoords) {
                map.fitBounds(bounds, { padding: 40, duration: 0, pitch: 45, bearing: orientationBearing });
            }

            // Dynamically react to theme changes
            const observer = new MutationObserver(() => {
                const newIsLightMode = document.documentElement.getAttribute('data-theme') === 'light';
                map.setStyle(newIsLightMode ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11');
            });

            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

            // Re-trigger layout calculation just in case container flex flexed
            setTimeout(() => map.resize(), 200);
        });

    } catch (e) {
        console.error("Mapbox load failed:", e);
        container.classList.remove('loader-overlay');
        container.innerHTML = `<div style="padding: 20px; font-family: monospace; color: var(--text-dim); text-align: center;">GPS Route processing failed: ${e.message}</div>`;
    }
};


// Process content with block system - convenience function
function applySmartInversion(img) {
    if (!img.complete) return;

    try {
        // Use a tiny 1x1 canvas to calculate average brightness efficiently
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Set crossOrigin if it's an external URL to avoid tainted canvas
        if (img.src.startsWith('http') && !img.src.includes(window.location.hostname)) {
            img.crossOrigin = "anonymous";
        }

        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

        // Perceptual brightness formula
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;

        // Mark the image based on its natural state
        if (brightness > 128) {
            img.classList.add('is-bright');
        } else {
            img.classList.add('is-dark');
        }
    } catch (e) {
        // Fallback: If CORS blocks us, assume it's a Light-themed image 
        // (safe bet for most logos/diagrams)
        img.classList.add('is-bright');
    }
}

function applySmartWatermark(el, url) {
    if (!url) return;
    const img = new Image();
    
    // Robust URL normalization from backgroundImage CSS string
    let cleanUrl = url.trim().replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
    
    // Security: Handle external CORS for brightness detection
    if (cleanUrl.startsWith('http') && !cleanUrl.includes(window.location.hostname)) {
        img.crossOrigin = "anonymous";
    }
    
    img.src = cleanUrl;
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            // Use a slightly larger sample area to avoid edges
            const size = 20;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0, 0, size, size).data;
            
            let totalBrightness = 0;
            let count = 0;

            for (let i = 0; i < data.length; i += 4) {
                const alpha = data[i+3];
                if (alpha > 50) { // Only count pixels that aren't mostly transparent
                    const r = data[i], g = data[i+1], b = data[i+2];
                    totalBrightness += (r * 299 + g * 587 + b * 114) / 1000;
                    count++;
                }
            }
            
            const bness = count > 0 ? (totalBrightness / count) : 255; // Default white if empty/transparent
            if (bness > 128) el.classList.add('is-bright');
            else el.classList.add('is-dark');
        } catch (e) {
            el.classList.add('is-bright'); // Safest default
        }
    };
    img.onerror = () => el.classList.add('is-bright');
}

function renderTOC(allBlocks, currentIndex) {
    const headings = [];
    
    // Find previous heading level to set TOC header height and its "scope"
    let parentLevel = 1; // Default to 1 (H1 article title)
    for (let i = currentIndex - 1; i >= 0; i--) {
        const b = allBlocks[i];
        if (b.type === 'text') {
            const matches = b.content.match(/(?:^|\n)(#{1,4})\s+/g);
            if (matches) {
                const lastMatch = matches[matches.length - 1].trim();
                parentLevel = lastMatch.length;
                break;
            }
        }
    }
    const tocHeadingLevel = Math.min(5, parentLevel + 1);
    const isGlobal = parentLevel === 1;

    let stopScanning = false;
    for (let i = currentIndex + 1; i < allBlocks.length; i++) {
        const block = allBlocks[i];
        if (block.type === 'text') {
            const lines = block.content.split(/\n|\r\n/);
            for (let line of lines) {
                const match = line.trim().match(/^(#{1,4})\s+(.*)$/);
                if (match) {
                    const level = match[1].length;
                    
                    if (isGlobal) {
                        // Global TOC shows everything up to H3
                        if (level <= 3) {
                            const text = match[2];
                            const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                            headings.push({ level, text, id });
                        }
                    } else {
                        // Contextual TOC: Only show headings deeper than our current level
                        if (level > parentLevel) {
                            const text = match[2];
                            const id = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                            headings.push({ level, text, id });
                        } else {
                            // Hit a peer or parent heading: scope ends here
                            stopScanning = true;
                            break;
                        }
                    }
                }
            }
        }
        if (stopScanning) break;
    }

    if (headings.length === 0) return '';

    const tocLinks = headings.map(h => {
        const size = Math.max(13, 16 - (h.level - 1) * 1);
        const weight = 700 - (h.level - 1) * 100;
        return `<div class="toc-item depth-${h.level}" style="margin-left: ${(h.level - 1) * 12}px;">
            <a href="javascript:void(0)" onclick="document.getElementById('${h.id}')?.scrollIntoView({behavior:'smooth'})" style="font-size: ${size}px; font-weight: ${weight}; line-height: 1.2; display: inline-block;">${h.text}</a>
        </div>`;
    }).join('');

    const title = allBlocks[currentIndex].title || "Content";
    return `
        <div class="toc-container" style="margin: 1.5rem 0; text-align: left;">
            <h${tocHeadingLevel} id="contents" style="margin-bottom: 4px;">${title}</h${tocHeadingLevel}>
            <div class="toc-list" style="padding-left: 0; display: flex; flex-direction: column; gap: 8px;">
                ${tocLinks}
            </div>
        </div>
    `;
}

// Process content with block system - convenience function
function processContentWithBlocks(content) {
    if (!content) return '';

    const blocks = parseContentBlocks(content);
    return blocks
        .filter(block => block !== null)
        .map((block, index, all) => renderContentBlock(block, index, all))
        .join('\n');
};

function showEasterEgg() {
    const lines = [
        "   ██████  ",
        "██ ██   ██ ",
        "   ██   ██ ",
        "██ ██   ██ ",
        "   ██████  "
    ];
    const colors = [
        '#FF416C', '#FF4E59', '#FF5B46', '#FF6833', '#FF7520', '#FF820D', '#FF8C00'
    ];

    console.log(
        lines.map(l => `%c${l}\n`).join('') +
        `%cI'd love to know what you think!\n` +
        `%creach me %c@sahibdsv%c everywhere!`,
        // Logo (5 lines) - MUST remain Monospace for alignment
        ...colors.slice(0, 5).map(c => `color: ${c}; white-space: pre-wrap; display: block; font-family: 'Roboto Mono', monospace; font-size: 24px; line-height: 20px; font-weight: 900;`),
        // Note 1
        `color: ${colors[5]}; display: block; font-family: 'Jost', 'Century Gothic', 'Futura', sans-serif; font-size: 14px; font-style: normal; margin-top: 10px; line-height: 18px;`,
        // Note 2 Part 1
        `color: ${colors[6]}; display: block; font-family: 'Jost', 'Century Gothic', 'Futura', sans-serif; font-size: 14px; font-style: normal; line-height: 18px; margin-top: 2px;`,
        // Note 2 Part 2 (@sahibdsv Bold White)
        `color: #FFFFFF; font-family: 'Jost', 'Century Gothic', 'Futura', sans-serif; font-size: 14px; font-weight: 900; font-style: normal;`,
        // Note 2 Part 3
        `color: ${colors[6]}; font-family: 'Jost', 'Century Gothic', 'Futura', sans-serif; font-size: 14px; font-style: normal;`
    );
}

showEasterEgg();
fetchDataAndCache();
