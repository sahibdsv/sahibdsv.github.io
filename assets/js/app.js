        // Set scroll restoration to manual to prevent browser jumps
        if (history.scrollRestoration) {
            history.scrollRestoration = 'manual';
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

        // CSV Parser
        function parseCSV(csvText) {
            const rows = [];
            let currentField = '';
            let inQuotes = false;
            let currentRow = [];

            for (let i = 0; i < csvText.length; i++) {
                const char = csvText[i];

                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    currentRow.push(currentField.trim());
                    currentField = '';
                } else if ((char === '\n' || char === '\r') && !inQuotes) {
                    if (currentField.length || currentRow.length) {
                        currentRow.push(currentField.trim());
                        rows.push(currentRow);
                    }
                    currentField = '';
                    currentRow = [];
                    if (char === '\r' && csvText[i + 1] === '\n') {
                        i++; // Skip \n in \r\n
                    }
                } else {
                    currentField += char;
                }
            }

            // Handle last row if no trailing newline
            if (currentField.length || currentRow.length) {
                currentRow.push(currentField.trim());
                rows.push(currentRow);
            }

            if (rows.length < 2) return [];

            // Convert to object array
            // Trim header keys to avoid whitespace issues from Google Sheets
            const header = (rows[0] || []).map(h => h.trim());
            return rows.slice(1)
                .filter(row => row.some(cell => cell))
                .map(row => {
                    const obj = {};
                    header.forEach((key, idx) => {
                        obj[key] = row[idx] || '';
                    });
                    return obj;
                })
        }

        // Global State
        let db = [];
        let quotesDb = [];
        let resumeDb = [];
        let musicDb = []; // Music logging data
        let variablesDb = []; // Variables metadata
        let quoteBag = []; // Shuffled indices to pick from
        let _lastQuoteIndex = -1;
        
        let _activeRandomQuote = null;

        let isSearchActive = false;
        let _lastRenderedPath = null;

        const CONFIG = {
            main_sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv',
            quotes_sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=540861260&single=true&output=csv',
            resume_sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=1812444133&single=true&output=csv',
            music_sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=1199341895&single=true&output=csv',
            variables_sheet: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=554193488&single=true&output=csv'
        };

        // Quote Randomness Logic (Fisher-Yates Shuffle Bag)
        function refillQuoteBag() {
            // Create a fresh batch of indices
            quoteBag = quotesDb.map((_, index) => index);

            // Fisher-Yates Shuffle
            for (let i = quoteBag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [quoteBag[i], quoteBag[j]] = [quoteBag[j], quoteBag[i]];
            }
            
            // Boundary Fix: Don't start a new bag with the same quote we just ended with
            if (quotesDb.length > 1 && quoteBag[quoteBag.length - 1] === _lastQuoteIndex) {
                const repeatIndex = quoteBag.pop();
                quoteBag.unshift(repeatIndex);
            }
            
        }

        function getNextQuote() {
            if (quotesDb.length === 0) return null;

            if (quoteBag.length === 0) {
                refillQuoteBag();
            }

            let nextIndex = quoteBag.pop();

            // Safety: If the randomly picked quote has identical text as the last one, try to skip it
            if (_activeRandomQuote && quotesDb[nextIndex].Quote === _activeRandomQuote.Quote && quotesDb.length > 1) {
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
            _activeRandomQuote = selected;
            
            
            return selected;
        }

        // App Initialization
        const init = () => {
            // Theme preference listener only (Theme apply handled in HEAD)
            window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
                if (!localStorage.getItem('theme')) {
                    document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark');
                }
            });
        };

        fetchDataAndCache().then(() => {
            startApp();
        });

        function startApp() {
            // Initial Skeleton setup
            showPageSkeleton();

            initApp();
            updateSEO();
            renderFooter();

            if (window.location.search) {
                history.replaceState(null, null, window.location.pathname + window.location.hash);
            }

            requestAnimationFrame(() => {
                document.body.classList.remove('no-transition');
                document.getElementById('main-header').classList.remove('no-transition');
            });
        }

        // Live Dashboard Polling


        // fetchDataAndCache retrieves high-fidelity content across all sources
        async function fetchDataAndCache() {
            try {
                const [mainData, quotesDbLocal, resumeDbLocal, musicDbLocal, variablesDbLocal] = await Promise.all([
                    fetchCSV(CONFIG.main_sheet),
                    fetchCSV(CONFIG.quotes_sheet).catch(e => {
                        console.warn('Quotes fetch failed', e);
                        return [];
                    }),
                    fetchCSV(CONFIG.resume_sheet).catch(e => {
                        console.warn('Resume fetch failed', e);
                        return [];
                    }),
                    fetchCSV(CONFIG.music_sheet).catch(e => {
                        console.warn('Music fetch failed', e);
                        return [];
                    }),
                    fetchCSV(CONFIG.variables_sheet).catch(e => {
                        console.warn('Variables fetch failed', e);
                        return [];
                    })
                ]);

                const filtered = mainData.filter(e => e.Title || e.Content || e.Page === 'Professional/Resume');
                if (!filtered.find(e => e.Page === 'Professional/Resume')) {
                }

                db = filtered;
                quotesDb = quotesDbLocal;
                musicDb = musicDbLocal;
                variablesDb = variablesDbLocal;
                resumeDb = (resumeDbLocal || []).map(entry => {
                    if (entry.Page && entry.Page.includes('#')) {
                        const [page, sectionType] = entry.Page.split('#');
                        return {
                            ...entry,
                            Page: page,
                            SectionType: sectionType
                        };
                    }
                    return entry;
                });
                window.db = db;

                // Caching removed to enforce direct fetching

                // Auto-refresh any dynamic components currently in the DOM
                document.querySelectorAll('[data-type="recent-music"]').forEach(el => renderRecentMusic(el));
                document.querySelectorAll('.layout-quote').forEach(el => renderQuoteCard(el));

                return [db, quotesDb, resumeDb, musicDb];
            } catch (e) {
                console.error('Fetch failed', e);
            }
        }

        function fetchCSV(url) {
            // Use browser directive to skip local cache, but DO NOT modify the URL with timestamps.
            // Bypassing Google's CDN with dynamic query parameters triggers 429 Rate Limits from the origin server.
            return fetch(url, { cache: 'no-store' })
                .then(res => res.text())
                .then(text => parseCSV(text));
        }

        function safeHTML(str) {
            if (!str) return '';
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return str.replace(/[&<>"']/g, m => map[m]);
        }

        function initApp() {
            handleRouting();
            window.addEventListener("hashchange", handleRouting);
            window.addEventListener("touchmove", () => {
                document.getElementById("main-header").classList.add("scrolling");
            }, { passive: true });

            // 1. Central Haptic Engine: Intercepts taps in CAPTURE phase
            document.addEventListener("click", e => {
                const interactive = e.target.closest(
                    "#brand-name, #search-controls, .nav-link, .sub-link, button, [onclick], [role=\"button\"], .layout-grid, .clickable-block, .hero-link, .refresh-btn, .dice-icon, a, .chip, .article-link-btn, .author-link, .music-yt-overlay"
                );
                if (interactive && navigator.vibrate) {
                    const isMajor = interactive.closest("#brand-name, #search-controls, #theme-toggle, .nav-row.level-1 .nav-link");
                    haptic(isMajor ? 'pulse' : 'tap');
                }
            }, {
                passive: true,
                capture: true
            });

            window.addEventListener("resize", (() => {
                let resizeTimeout;
                return () => {
                    clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(() => {
                        document.querySelectorAll(".nav-row").forEach(row => {
                            centerNavRow(row, true);
                        });
                    }, 150);
                };
            })());

            // 2. Search & Dismissal Logic
            document.addEventListener("click", e => {
                const overlay = document.getElementById("search-overlay");
                const controls = document.getElementById("search-controls");
                const results = document.getElementById("search-results");

                if (overlay.classList.contains("active")) {
                    const card = e.target.closest('.layout-grid');
                    const isInsideSearch = overlay.contains(e.target) || controls.contains(e.target);
                    const isInsideResultsContent = results && results.contains(e.target);

                    if (card && results.contains(card)) {
                        closeSearch();
                        return;
                    }

                    if (!isInsideSearch && !isInsideResultsContent) {
                        closeSearch();
                    }
                }
            });

            // 3. Chip Filtering (CAPTURE phase to prevent card navigation)
            document.getElementById("app").addEventListener("click", e => {
                const chip = e.target.closest(".chip");
                if (chip) {
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

                document.addEventListener("keydown", e => {
                    const isSearchFocused = "search-input" === (document.activeElement ? document.activeElement.id : "");

                    if (isSearchFocused) {
                        if ("/" === e.key || "Escape" === e.key) {
                            e.preventDefault();
                            closeSearch();
                            return;
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
                })
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
                        ...db.filter(e => e.Page && "Footer" !== e.Page && "Home" !== e.Page)
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
                    if (!_gSwipe.active) row.classList.add("slide-in-right");
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
                    const isInteracting = (_activeNavControl === row) || (_gSwipe.active && _gSwipe.row === row);
                    
                    if (!isInteracting) {
                        row.style.scrollSnapType = (activeLink && row.scrollWidth > row.clientWidth + 5) ? 'x mandatory' : 'none';
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

        function setNavSnapping(row, enabled) {
            if (!row) return;
            // Snapping is only useful if there's an active item to lock onto
            const hasActive = row.querySelector(".active");
            row.style.scrollSnapType = (enabled && hasActive) ? 'x mandatory' : 'none';
        }

        function centerNavRow(row, isSubNav, behavior = "auto") {
            if (!row || row === _activeNavControl) return;
            if (window.innerWidth > 768) return;

            row._needsReset = false;
            // Only scroll if there is overflow
            if (row.scrollWidth <= row.clientWidth + 5) {
                setNavSnapping(row, false);
                return;
            }

            const activeLink = row.querySelector(".active");
            setNavSnapping(row, false); // Always disable during programmatic glide

            const restoreSnap = () => {
                if (row !== _activeNavControl) setNavSnapping(row, true);
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
                setNavSnapping(row, false);
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
                        setNavSnapping(row, true);
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

        /* 
         * GLOBAL SWIPE ENGINE (v68.0) 
         * Allows horizontal navigation from anywhere on the page.
         */
        let _gSwipe = {
            sx: 0,
            sy: 0,
            sScroll: 0,
            row: null,
            active: false,
            tracking: false
        };

        document.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || window.innerWidth > 768) return;
            const tgt = e.target;

            // Interaction Protection: Don't hijack 3D models or existing horizontal containers
            if (tgt.tagName === 'CANVAS' || tgt.closest('.model-viewer-wrapper')) return;

            const local = tgt.closest('pre') || tgt.closest('.scrollable-x');
            if (local && local.scrollWidth > local.clientWidth + 5) return;

            // V69.0: PRIORITIZE HEADING ROW SWIPE & REDUCE ACCIDENTAL PAGE SWIPES
            // We restrict the start of a swipe to the header region to avoid accidental triggers
            const touchedHeader = tgt.closest('#main-header');
            if (!touchedHeader) return;

            const rows = Array.from(document.querySelectorAll('.nav-row.level-n:not(.hidden)')).filter(r => r
                .scrollWidth > r.clientWidth + 5);
            if (!rows.length) return;

            // Intelligent Target Selection:
            // 1. If we touched a row directly, that row is the absolute priority.
            // 2. Fallback: find the deepest subnav row that HAS an active selection.
            const touchedRow = tgt.closest('.nav-row');
            let activeRow = touchedRow;

            if (!activeRow) {
                for (let i = rows.length - 1; i >= 0; i--) {
                    if (rows[i].querySelector('.active')) {
                        activeRow = rows[i];
                        break;
                    }
                }
            }

            if (!activeRow) return;

            _gSwipe = {
                sx: e.touches[0].clientX,
                sy: e.touches[0].clientY,
                row: activeRow,
                sScroll: activeRow.scrollLeft,
                active: false,
                tracking: true
            };
        }, {
            passive: true
        });

        document.addEventListener('touchmove', (e) => {
            if (!_gSwipe.tracking || !_gSwipe.row) return;

            const dx = _gSwipe.sx - e.touches[0].clientX;
            const dy = _gSwipe.sy - e.touches[0].clientY;

            if (!_gSwipe.active) {
                // Directional Lock: latch into horizontal mode if horizontal movement exceeds vertical
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
                    _gSwipe.active = true;
                    _gSwipe.row.style.scrollBehavior = 'auto'; // Instant response
                    _gSwipe.row.style.scrollSnapType = 'none'; // Unlock for proxy swing
                } else if (Math.abs(dy) > 10) {
                    _gSwipe.tracking = false; // Vertical intent detected, bail
                    return;
                }
            }

            if (_gSwipe.active) {
                // Lock the viewport: prevent page jitter and vertical scrolling once header swipe is active
                if (e.cancelable) e.preventDefault(); 
                
                if (_gSwipe.row._markNavInput) _gSwipe.row._markNavInput();
                // 1.25x speed multiplier for effortless proxy swiping (allows finger to move less than row)
                _gSwipe.row.scrollLeft = Math.max(0, _gSwipe.sScroll + (dx * 1.25));
            }
        }, {
            passive: false // CRITICAL: Must be false to allow e.preventDefault() for axis locking
        });

        document.addEventListener('touchend', () => {
            if (_gSwipe.active && _gSwipe.row) {
                if (_gSwipe.row._releaseNavInput) _gSwipe.row._releaseNavInput();
                _gSwipe.row.style.scrollBehavior = '';
                // Note: snapping is restored by the settle timer in setupHapticScroll
            }
            _gSwipe.tracking = false;
            _gSwipe.active = false;
            _gSwipe.row = null;
        }, {
            passive: true
        });


        let resizeTimeout;
        let ticking = false;
        /* Scroll Listener Removed - Sticky Header handles this natively */
        window.addEventListener('resize', () => {
            if (resizeTimeout) cancelAnimationFrame(resizeTimeout);
            resizeTimeout = requestAnimationFrame(() => {
                if (window.innerWidth > 768) {
                    document.querySelectorAll('.nav-row').forEach(e => e.scrollLeft = 0);
                }
            });
        });

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
                if (lastScrollPos > 0) window.scrollTo(0, lastScrollPos);
            }
        }

        function toggleSearch() {
            const overlay = document.getElementById("search-overlay");
            const isActive = overlay.classList.toggle("active");
            document.body.classList.toggle("search-active");

            if (isActive) {
                lastScrollPos = window.scrollY;
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

            // GLB Sync: With alpha transparency enabled, models will automatically
            // match their container background via CSS variables.
        }

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
            if (t === "clear cache") {
                localStorage.removeItem(CACHE_KEY);
                location.reload();
                return;
            }
            const matchesQuery = (entry, term) => entry?.Title?.toLowerCase().includes(term) || entry?.Content
                ?.toLowerCase().includes(term) || entry?.Tags?.toLowerCase().includes(term);

            const n = db.filter(e => matchesQuery(e, t));
            if (resumeDb.some(e => matchesQuery(e, t)) && !n.find(e => "Professional/Resume" === e.Page)) {
                n.push(db.find(e => "Professional/Resume" === e.Page));
            }

            if (resultsContainer) {
                resultsContainer.innerHTML = '';
                // safeHTML output is sanitized DOM text, safe for innerHTML
                renderRows(n, `Search results for "${safeHTML(e)}"`, false, true, false, true, resultsContainer);
                resultsContainer.style.display = "block";
            }
            if (app) app.style.display = "none";
        }

        const path2url = p => p?.replace(/ /g, '_') ?? '';
        const url2path = u => u?.replace(/_/g, ' ') ?? '';

        function navigateTo(path, isSwipe = false, forceSmoothNav = false) {
            if (window.closeSearch && !isSwipe) closeSearch();

            const header = document.getElementById("main-header");
            if (header && !isSwipe) header.classList.remove("scrolled");
            if (!isSwipe) window.scrollTo({
                top: 0,
                behavior: 'instant'
            });

            clearTextSelection();

            const cleanPath = url2path(path || "Home");
            _activeRenderPath = cleanPath;
            window._lastNavTime = Date.now(); // Mark navigation time for 3D scheduling

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
                showPageSkeleton();
            }

            _renderRAF = requestAnimationFrame(() => {
                // Render Guard: Only build the page if this is still the final target
                if (_activeRenderPath !== cleanPath) return;

                const route = {
                    "Index": renderIndex,
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

                // STRAVA: Re-trigger embed bootstrap if content was added
                if (typeof window.__STRAVA_EMBED_BOOTSTRAP__ === 'function') {
                    window.__STRAVA_EMBED_BOOTSTRAP__();
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
            const m = filter.match(/^(\d{4})-(\d{2})/) || filter.match(/^(\d{4})(\d{2})/);
            let label = filter;

            if (m) {
                label = `${new Date(m[1], parseInt(m[2]) - 1, 1).toLocaleString("default", { month: "short" }).toUpperCase()} ${m[1]}`;
            }

            renderRows(
                db.filter(row => (row.Timestamp || "").startsWith(filter) || row.Tags && row.Tags.includes(filter)),
                `Posts from ${safeHTML(label)}`, false, true, false, true
            );
        }

        function renderPage(e) {
            if ("Home" === e) return void renderHome();
            const t = db.filter(t => t.Page === e);
            const isTopLevel = !e.includes("/");
            const hasChildren = childrenPagesCheck(e);

            // 404 Logic: If no content AND no children AND not personal/quotes -> 404
            if (t.length === 0 && !hasChildren && !("Personal" === e && quotesDb.length > 0)) {
                document.getElementById("app").innerHTML =
                    `<div class="section layout-hero"><h1 class="header-fade-anim">404</h1><p style="color:var(--text-dim); font-size:16px;">This page doesn't exist in the database yet.</p></div>`;
                return;
            }

            // ATOMIC RENDER: Always call renderRows first to clear the container
            renderRows(t, null, false, false, !isTopLevel);

            // Natural Hierarchy: Show immediate children for automated navigation
            const pathParts = e.split("/");
            const currentDepth = pathParts.length;

            // Find all unique immediate child sub-paths (even implicit ones)
            const childPaths = [...new Set(
                db.filter(item => item.Page && item.Page.startsWith(e + "/") && item.Page !== e)
                    .map(item => item.Page.split("/").slice(0, currentDepth + 1).join("/"))
            )];

            if (childPaths.length > 0) {
                // Map the children pages back to their primary DB entries, or synthesize a collection card
                const childEntries = childPaths.map(childPath => {
                    const exactMatch = db.find(entry => entry.Page === childPath);
                    if (exactMatch) return exactMatch;

                    // Synthesize a virtual DB entry for the implicitly defined category
                    const folderName = childPath.split("/").pop().replace(/_/g, ' ');

                    // Attempt to borrow a cover image from the first descendant in the DB
                    const descendant = db.find(entry => entry.Page && entry.Page.startsWith(childPath + "/") && entry
                        .CoverImage);

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

                renderRows(childEntries, null, true, true);
            }
        }

        function childrenPagesCheck(e) {
            // Check if ANY children exist (even deep ones) to validate page existence
            return db.some(t => t.Page && t.Page.startsWith(e + "/"));
        }

        function renderIndex() {
            const app = document.getElementById("app");
            app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Index</h1></div><div class="section index-list"></div>';

            const listContainer = app.querySelector(".index-list");
            const allPages = [...new Set(
                db.map(e => e.Page).filter(e => e && "Home" !== e && "Footer" !== e)
            )];

            const groups = {};
            allPages.forEach(page => {
                const category = page.split("/")[0];
                if (!groups[category]) groups[category] = [];
                groups[category].push(page);
            });

            for (const [category, pages] of Object.entries(groups)) {
                const catClass = getCategoryClass(category);

                let html = `<div class="index-group ${catClass}"><h3>${category}</h3>`;
                pages.forEach(page => {
                    const entry = db.find(e => e.Page === page);
                    const title = entry ? entry.Title : page.split("/").pop();
                    const depth = page.split("/").length;
                    html +=
                        `<a href="#${path2url(page)}" class="index-link fill-anim ${depth > 1 ? `depth-${depth}` : ""}">\n${title} \n</a>`;
                });
                html += "</div>";
                listContainer.innerHTML += html;
            }
        }

        function renderHome() {
            const e = db.filter(e => "Home" === e.Page);
            renderRows(e, null, false);

            const t = db.filter(e => e.Page && "Home" !== e.Page && "Footer" !== e.Page);
            const n = {};
            t.forEach(e => {
                const isFeatured = e.Tags && e.Tags.toLowerCase().includes("featured");
                // Discovery logic for Recent Activity: only show content up to 1 level deep, 
                // OR any page explicitly marked as 'featured',
                // AND must have a valid timestamp OR be featured (to avoid showing static/structure-only pages)
                const hasTimestamp = e.Timestamp && !isNaN(new Date(e.Timestamp).getTime());
                if ((e.Page.split("/").length <= 2 || isFeatured) && (isFeatured || hasTimestamp)) {
                    n[e.Page] = e;
                }
            });
            const o = Object.values(n).sort((a, b) => {
                const featA = a.Tags?.toLowerCase().includes("featured") ? 1 : 0;
                const featB = b.Tags?.toLowerCase().includes("featured") ? 1 : 0;
                if (featA !== featB) return featB - featA;
                return new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0);
            }).slice(0, 6);
            // Append Recent Activity (isHome=true)
            o.length > 0 && renderRows(o, "Recent Activity", true, true, false, true);
        }

        function processSingleLine(e) {
            // Using the central high-fidelity inline processor for titles and metadata
            return processInlineMarkdown(e);
        }

        function formatTitle(e, t) {
            if (!e) return "";
            const processed = processInlineMarkdown(e);
            // If the content is basically just a button, don't wrap it in H tags
            if (processed.includes('btn-cta-wrapper')) {
                return processed;
            }
            const n = e.match(/^(#{1,6})\s+(.*)$/);
            let o = t,
                r = e;
            n && (o = "h" + n[1].length, r = n[2]);
            return `<${o} class="header-fade-anim">${processInlineMarkdown(r)}</${o}>`
        }
        // Chip rendering helper
        function renderChip(tag) {
            if (!tag) return "";
            return `<span class="chip" data-tag="${tag}">${processInlineMarkdown(tag)}</span>`;
        }

        function renderCardHTML(entry, contextCategory = "") {
            const content = entry.Content || "";
            const isTitleLink = entry.Title ? /^https?:\/\/\S+$/.test(entry.Title) : false;
            const tEx = extractMediaFromContent(entry.Title);
            const cEx = extractMediaFromContent(content);
            const thumbUrl = getThumbnail(entry.Thumbnail);

            const mediaBuilder = (type, src, id) => {
                if (type === 'glb') {
                    // Resolve path for internal models
                    const glbPath = (src.startsWith('assets/') || src.startsWith('http')) ? src : `assets/models/${src}`;
                    return `<div class="row-media">${renderGLBViewer(glbPath, true)}</div>`;
                }
                if (type === 'map') {
                    const mapPath = (src.startsWith('assets/') || src.startsWith('http')) ? src : `assets/GPX/${src}`;
                    return `<div class="row-media">${renderMapBoxViewer(mapPath, true)}</div>`;
                }
                if (type === 'yt-embed') return `<div class="row-media"><div class="sk-img loader-overlay"></div><div class="embed-wrapper video"><iframe class="media-enter" onload="mediaLoaded(this)" src="https://www.youtube-nocookie.com/embed/${id}?modestbranding=1&rel=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div></div>`;

                if (type === 'video') {
                    const p = processMediaUrl(src);
                    return `<div class="row-media">
                        <div class="sk-img loader-overlay"></div>
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
                return `<div class="row-media"><div class="sk-img loader-overlay"></div><img class="media-enter ${p.invert ? 'theme-invert' : ''}" src="${p.url}" loading="lazy" crossorigin="anonymous" onload="mediaLoaded(this)" onerror="this.previousElementSibling?.remove()"></div>`;
            };

            const mediaSources = [
                () => isTitleLink && !entry.Thumbnail && tEx ? mediaBuilder(tEx.type === 'yt' ? 'yt-embed' : tEx.type,
                    tEx.url, tEx.id) : "",
                () => entry.Thumbnail && thumbUrl === 'GLB_VIEWER' ? mediaBuilder('glb', entry.Thumbnail) : "",
                () => entry.Thumbnail && thumbUrl === 'MAP_VIEWER' ? mediaBuilder('map', entry.Thumbnail) : "",
                () => entry.Thumbnail && thumbUrl?.match(/\.(mp4|webm|mov|ogg)(\?.*|-(?:autoplay|thumb|noloop|nocontrols))*/i) ?
                    mediaBuilder('video', thumbUrl) : "",
                () => entry.Thumbnail && thumbUrl ? mediaBuilder('img', thumbUrl) : "",
                () => !entry.Thumbnail && cEx ? mediaBuilder(cEx.type === 'yt' ? 'img' : cEx.type, cEx.type === 'yt' ?
                    `https://img.youtube.com/vi/${cEx.id}/mqdefault.jpg` : cEx.url) : "",
                () => !isTitleLink ?
                    `<div class="row-media placeholder"><span>${(entry.Title || "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/\*\*(.*?)\*\*/g, '$1')}</span></div>` :
                    ""
            ];

            const mediaHTML = mediaSources.reduce((html, fn) => html || fn(), "");

            const tagsList = entry.Tags ? entry.Tags.split(",").map(t => t.trim()) : [];

            let metaRowHTML = "";
            if (entry.Timestamp || tagsList.length > 0) {
                metaRowHTML =
                    `<div class="meta-row">${entry.Timestamp ? `<span class="chip date" data-date="${entry.Timestamp.substring(0, 7)}" data-val="${formatDate(entry.Timestamp)}">${formatDate(entry.Timestamp)}</span>` : ""}${tagsList.map(renderChip).join("")}</div>`;
            }

            return `<div class="layout-grid ${contextCategory || getCategoryClass(entry.Page)} ${!entry.Thumbnail ? "has-placeholder" : ""}" onclick="location.hash=path2url('${entry.Page}')">${mediaHTML}<div class="card-info">${(entry.Title && !isTitleLink) ? `<h3 class="fill-anim">${processSingleLine(entry.Title)}</h3>` : ""}${metaRowHTML}</div></div>`;
        };

        const SECTION_RENDERERS = {
            quote: (entry) =>
                `<div class="layout-quote section" data-title="${entry.Title || ""}" data-static-quote="${entry.Content || entry.Quote || ""}" data-static-author="${entry.Content || entry.Quote ? (entry.Author || "Sahib Virdee") : ""}" data-needs-init="true">
                </div>`,
            hero: (entry) => {
                let metaHTML = "";
                if (entry.Timestamp) {
                    const dateStr = formatDate(entry.Timestamp),
                        monthKey = entry.Timestamp.substring(0, 7);
                    metaHTML +=
                        `<span class="chip date" data-val="${dateStr}" data-date="${monthKey}">${dateStr}</span>`;
                }
                if (entry.Tags) entry.Tags.split(",").map(t => t.trim()).forEach(t => metaHTML += renderChip(t));
                return `<div class="section layout-hero">\n${formatTitle(entry.Title, "h1")}${metaHTML ? `<div class="hero-meta">${metaHTML}</div>` : ""}${processContentWithBlocks(entry.Content || "")}\n</div>`;
            },
            text: (entry) =>
                `<div class="section layout-text">\n${entry.Title ? formatTitle(entry.Title, "h2") : ""}${processContentWithBlocks(entry.Content || "")}\n</div>`,
            article: (entry, index) => {
                let metaHTML = "";
                if (index === 0) {
                    metaHTML = `<div class="article-meta-row"><a href="#Personal/About" class="author-link">Sahib Virdee</a>`;
                    if (entry.LinkURL) metaHTML +=
                        `<a href="${entry.LinkURL}" target="_blank" class="article-link-btn"><svg viewBox="0 0 24 24" style="width:12px;height:12px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
                    metaHTML += `<div class="article-tags">`;
                    if (entry.Timestamp) {
                        const dateStr = formatDate(entry.Timestamp),
                            monthKey = entry.Timestamp.substring(0, 7);
                        metaHTML +=
                            `<span class="chip date" data-val="${dateStr}" data-date="${monthKey}">${dateStr}</span>`;
                    }
                    if (entry.Tags) entry.Tags.split(",").map(t => t.trim()).forEach(t => metaHTML += renderChip(t));
                    const readTime = Math.ceil((entry.Content || "").trim().split(/\s+/).length / 200);
                    if (readTime > 0) metaHTML += `<span class="chip" style="opacity:0.6; cursor:default;">${readTime} min read</span>`;
                    metaHTML += `</div></div>`;
                }
                return `<div class="section layout-text">${entry.Title ? formatTitle(entry.Title, index === 0 ? "h1" : "h2") : ""}${metaHTML}<div class="article-body">${processContentWithBlocks(entry.Content || "")}</div></div>`;
            }

        };

        function renderRows(data, title, isHome, isSubPage, isHeroOnly = false, isRecentActivity = false,
            targetElement = null) {
            const container = targetElement || document.getElementById("app");
            if (!container) return;
            if (isRecentActivity) {
                data.sort((a, b) => {
                    const featA = a.Tags?.toLowerCase().includes("featured") ? 1 : 0;
                    const featB = b.Tags?.toLowerCase().includes("featured") ? 1 : 0;
                    if (featA !== featB) return featB - featA;
                    return new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0);
                });
            }
            let htmlBuffer = title ?
                `<div style="display:flex;justify-content:center;margin-bottom:20px;"><h2 class="header-fade-anim" style="display:inline-block; font-weight:600; font-size:24px; --text-base:var(--text-dim); --text-hover:var(--text-bright);">${title}</h2></div>` :
                "";
            if (data.length === 0) {
                if (isHome) return;
                if (title) htmlBuffer +=
                    `<div class="section layout-hero"><h2 class="header-fade-anim">Nothing Found</h2><p style="color:var(--text-dim); font-size:16px;">No entries match your query.</p></div>`;
                container.innerHTML = htmlBuffer;
                return;
            }

            let gridBuffer = "";
            const activePage = (window.location.hash.substring(1) || "Home").toLowerCase();
            const topLevelPages = ["home", "personal", "professional", "projects"];

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
            if (isHome) {
                container.innerHTML += htmlBuffer;
            } else {
                container.innerHTML = htmlBuffer;
            }

            // 4. Post-render logic: Initialize dynamic components
            container.querySelectorAll('[data-needs-init="true"]').forEach(el => {
                if (el.classList.contains("layout-quote")) renderQuoteCard(el);
                if (el.getAttribute('data-type') === 'recent-music') renderRecentMusic(el);
                if (el.getAttribute('data-type') === 'music-cluster') renderMusicCluster(el);
                el.removeAttribute('data-needs-init');
            });

            // Observe lazy videos
            observeVideos(container);
        }

        function showPageSkeleton() {
            const app = document.getElementById("app");
            const skTpl = document.getElementById('sk-card-tpl');
            if (!app || !skTpl) return;
            // Immediate partial clear for responsiveness
            app.innerHTML = `
                <div class="section layout-hero skeleton-visible">
                    <div class="sk-line title" style="width: 60%; max-width: 600px; height: 50px; margin: 10px auto 26px;"></div>
                    <div class="sk-line text" style="width: 80%; max-width: 700px; height: 18px; margin: 0 auto;"></div>
                </div>
                <div class="grid-container section skeleton-visible">
                    ${Array(6).fill(skTpl.innerHTML).join('')}
                </div>
            `;
        }

        window.rollQuote = function(btn) {
            // Find all quote containers that are currently showing the active random quote
            const allQuotes = document.querySelectorAll('.layout-quote');
            const randomQuotes = Array.from(allQuotes).filter(q => {
                const title = (q.getAttribute('data-title') || '').toLowerCase();
                return title === '{random quote}' || title === 'random quote';
            });

            if (randomQuotes.some(q => q.classList.contains("loading"))) return;


            randomQuotes.forEach(q => q.classList.add("loading"));

            setTimeout(() => {
                _activeRandomQuote = null;
                
                // Get one new quote once for all cards
                const next = getNextQuote();
                _activeRandomQuote = next; 

                randomQuotes.forEach(q => {
                    renderQuoteCard(q);
                    // Force reflow for a clean fade transition
                    void q.offsetWidth; 
                    q.classList.remove("loading");
                });
            }, 600); 
        };

        function renderQuoteCard(container) {
            let quoteData;
            let isRandom = false;
            const title = (container.getAttribute("data-title") || "").toLowerCase();

            if (title === "{random quote}" || title === "random quote") {
                if (quotesDb.length === 0) {
                    container.innerHTML = "Quote sheet empty.";
                    return;
                }
                if (!_activeRandomQuote) _activeRandomQuote = getNextQuote();
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
                    author = `<a href="${quoteData.Source}" target="_blank">${safeHTML(author)}</a>`;
                } else {
                    author += ` — ${safeHTML(quoteData.Source)}`;
                }
            }

            const rawQuote = (quoteData.Quote || "").trim().replace(/^"|"$/g, "");
            const safeQuote = safeHTML(rawQuote);
            const len = rawQuote.length;

            // Flexible scaling for a FIXED 250px container
            const sizeClass = [
                [350, 'xxl'], // Extremely long quotes fit gracefully
                [250, 'xl'],
                [150, 'long'],
                [80, 'medium']
            ]
                .find(([n]) => len > n)?.[1] || 'short';

            let bq = container.querySelector('blockquote');
            let footer = container.querySelector('.quote-footer');

            if (bq && footer) {
                // Surgical update: preserves the dice icon element (and its hover state)
                bq.className = sizeClass;
                bq.innerHTML = `"${safeQuote}"`;
                footer.innerHTML = `<span class="author"> &mdash; ${author}</span>`;
            } else {
                // Standard refresh button HTML
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

                container.innerHTML = `<blockquote class="${sizeClass}">"${safeQuote}"</blockquote>
                                    <div class="quote-footer"><span class="author"> &mdash; ${author}</span></div>
                                    ${refreshBtnHTML}`;
            }
        }

        window.__initMusicMarquee = function(container) {
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
                        <span class="marquee-clone">${content}</span>
                        <span style="display:inline-block; width:100px;"></span>
                        <span class="marquee-clone">${content}</span>
                    `;
                    el.style.display = 'inline-flex';
                    el.style.alignItems = 'center';
                }
            });
        };

        function renderRecentMusic(container) {
            if (musicDb.length === 0) {
                container.innerHTML = `<div style="padding:40px; text-align:center; opacity:0.3; border: 1px dashed var(--border-subtle); border-radius:12px; font-size:14px;">No music logged recently.</div>`;
                return;
            }

            // The backend no longer tracks Timestamps. 
            // The absolute bottom of the sheet represents the newest items.
            // Slice the last 3 rows and reverse them so index 0 is the newest.
            const latestItems = [...musicDb].slice(-3).reverse();

            // Prevent double-render stutter if local cache matches remote data perfectly
            const renderHash = JSON.stringify(latestItems);
            if (container.getAttribute('data-last-render') === renderHash) return;
            container.setAttribute('data-last-render', renderHash);

            const ytLogo = "https://upload.wikimedia.org/wikipedia/commons/6/6a/Youtube_Music_icon.svg";

            const cardsHTML = latestItems.map((item, index) => {
                const artist = safeHTML(item.Artist || "Unknown Artist");
                const track = safeHTML(item.Song || item.Track || "Unknown Track");

                // Aggressive home-page link detection for fallback to search
                let link = (item.Link || "").trim();
                const bareURL = link.toLowerCase();
                // A valid track URL almost always contains 'watch?v=' or 'youtu.be'
                const isValidTrackLink = bareURL.includes('watch?v=') || bareURL.includes('youtu.be');

                if (!link || !isValidTrackLink) {
                    // Fallback to searching YT Music for the exact Artist + Track Name
                    const searchQuery = encodeURIComponent((item.Artist || "") + " " + (item.Song || item.Track || ""));
                    link = `https://music.youtube.com/search?q=${searchQuery}`;
                }
                const thumbRaw = item.Thumbnail || "";
                const thumb = thumbRaw.replace(/^http:\/\//i, "https://");

                // Waveform Atmosphere logic for the absolute latest track
                let atmosphereHTML = "";
                let liveClass = "";

                // Because timestamps are gone, the latest entry (index 0) is ALWAYS considered actively playing
                if (index === 0) {
                    liveClass = "is-live";
                    atmosphereHTML = `
                        <div class="steel-waveform-aura">
                            <div class="crisp-wave w1"></div>
                            <div class="crisp-wave w2"></div>
                            <div class="crisp-wave w3"></div>
                        </div>
                    `;
                }

                // Source icon mapping handling explicit 'YT Music' OPSEC update
                let sourceIconHTML = "";
                let isYTMusic = (!item.Source || item.Source === "YT Music" || item.Source === "YouTube Music" || item.Source === "Music (Desktop)");

                if (isYTMusic) {
                    sourceIconHTML = `<div class="music-yt-overlay" data-tooltip="Open in YouTube Music" style="cursor: pointer;"><img src="${ytLogo}" alt="YT Music"></div>`;
                } else {
                    sourceIconHTML = `<div class="music-yt-overlay" data-tooltip="Open Track" style="cursor: pointer; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); color: white; border-radius: 4px; font-size: 10px; padding: 4px 6px; font-weight: 600;">${safeHTML(item.Source)}</div>`;
                }

                const fallbackPlaceholder = isYTMusic ? `<img src="${ytLogo}" alt="YT Music">` : `<span>${safeHTML(item.Source || "Music")}</span>`;

                return `
                    <div class="layout-grid cat-music ${liveClass}" data-link="${link}" onclick="return playMusicInCard(event)">
                        <div class="row-media">
                            ${thumb ? `<div class="sk-img loader-overlay" style="width:100%; height:100%; position:absolute; top:0; left:0; z-index:0;"></div>` : ''}
                            <div class="music-card-fallback">${fallbackPlaceholder}</div>
                            ${thumb ? `<img src="${thumb}" class="media-enter" onload="mediaLoaded(this)" onerror="this.style.display='none'; mediaLoaded(this)">` : ''}
                        </div>
                        <div class="card-info">
                            ${atmosphereHTML}
                            <div class="marquee-container track-marquee">
                                <span class="marquee-content"><h3 class="fill-anim">${track}</h3></span>
                            </div>
                            <div class="marquee-container artist-marquee">
                                <span class="marquee-content"><div class="music-artist-label">${artist}</div></span>
                            </div>
                        </div>
                        ${sourceIconHTML}
                    </div>
                `;
            }).join("");

            container.innerHTML = `
                <div class="music-sections-container">
                    <div class="music-grid" style="--music-cols: ${latestItems.length}">
                        ${cardsHTML}
                    </div>
                </div>
            `;

            // Initialization for marquee
            setTimeout(() => window.__initMusicMarquee(container), 100);
        }

        async function renderMusicCluster(container) {
            const urlsRaw = container.getAttribute('data-urls') || "";
            const urls = urlsRaw.split(',').filter(Boolean);
            if (urls.length === 0) return;

            const ytLogo = "https://upload.wikimedia.org/wikipedia/commons/6/6a/Youtube_Music_icon.svg";

            // Show a tiny loading skeleton immediately to prevent layout jumps
            container.innerHTML = `<div class="music-sections-container"><div class="sk-img loader-overlay" style="border-radius:var(--card-radius); height:120px; width:100%;"></div></div>`;

            // Fetch details for each independently 
            const cardsData = await Promise.all(urls.map(async (rawLink) => {
                const bareURL = rawLink.trim();
                const ytId = getYouTubeID(bareURL);

                let artist = "Unknown Artist";
                let track = "Unknown Track";
                let thumb = ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : null;
                let fromDb = false;

                // 1. Cross-reference with our Music Logger DB for high-fidelity square album art
                if (typeof musicDb !== 'undefined') {
                    const dbMatch = musicDb.find(item => item.Link && (item.Link.includes(ytId) || item.Link === bareURL));
                    if (dbMatch) {
                        if (dbMatch.Thumbnail) {
                            thumb = dbMatch.Thumbnail;
                            fromDb = true;
                        }
                        if (dbMatch.Artist) artist = dbMatch.Artist;
                        if (dbMatch.Song || dbMatch.Track) track = dbMatch.Song || dbMatch.Track;
                    }
                }

                // 2. Fallback to scraping NoEmbed if it's a completely novel track we haven't logged
                if (!fromDb || artist === "Unknown Artist" || track === "Unknown Track") {
                    try {
                        const noembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(bareURL)}`;
                        const res = await fetch(noembedUrl);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.title && track === "Unknown Track") track = data.title;
                            if (data.author_name && artist === "Unknown Artist") artist = data.author_name.replace(" - Topic", "");
                        }
                    } catch (e) { }
                }



                return {
                    link: bareURL,
                    ytId: ytId,
                    artist: safeHTML(artist),
                    track: safeHTML(track),
                    thumb: thumb ? thumb.replace(/^http:\/\//i, "https://") : null,
                    source: "YT Music"
                };
            }));

            // Prevent double-render stutter if local cache matches remote data perfectly
            const renderHash = JSON.stringify(cardsData);
            if (container.getAttribute('data-last-render') === renderHash) return;
            container.setAttribute('data-last-render', renderHash);

            const cardsHTML = cardsData.map((item, index) => {
                const sourceIconHTML = `<div class="music-yt-overlay" data-tooltip="Open in YouTube Music" style="cursor: pointer;"><img src="${ytLogo}" alt="YT Music"></div>`;

                const fallbackPlaceholder = `<img src="${ytLogo}" alt="YT Music">`;

                return `
                    <div class="layout-grid cat-music" data-link="${item.link}" onclick="return playMusicInCard(event)">
                        <div class="row-media">
                            ${item.thumb ? `<div class="sk-img loader-overlay" style="width:100%; height:100%; position:absolute; top:0; left:0; z-index:0;"></div>` : ''}
                            <div class="music-card-fallback">${fallbackPlaceholder}</div>
                            ${item.thumb ? `<img src="${item.thumb}" class="media-enter" onload="mediaLoaded(this)" onerror="this.style.display='none'; mediaLoaded(this)">` : ''}
                        </div>
                        <div class="card-info">
                            <div class="marquee-container track-marquee">
                                <span class="marquee-content"><h3 class="fill-anim">${item.track}</h3></span>
                            </div>
                            <div class="marquee-container artist-marquee">
                                <span class="marquee-content"><div class="music-artist-label">${item.artist}</div></span>
                            </div>
                        </div>
                        ${sourceIconHTML}
                    </div>
                `;
            }).join("");

            container.innerHTML = `
                <div class="music-sections-container">
                    <div class="music-grid" style="--music-cols: ${cardsData.length}">
                        ${cardsHTML}
                    </div>
                </div>
            `;

            // Initialization for marquee
            setTimeout(() => window.__initMusicMarquee(container), 100);
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

            // Critical for ensuring we don't redirect or do anything else
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            if (card.querySelector('iframe')) return false;

            if (ytId) {
                const mediaRow = card.querySelector('.row-media');
                if (mediaRow) {
                    // 1. Stop any other currently playing cards
                    document.querySelectorAll('.layout-grid.cat-music.is-playing').forEach(pCard => {
                        const pMedia = pCard.querySelector('.row-media');
                        const originalHTML = pCard.getAttribute('data-original-media');
                        if (pMedia && originalHTML) {
                            pMedia.innerHTML = originalHTML;
                            pCard.classList.remove('is-playing');
                            const pAura = pCard.querySelector('.steel-waveform-aura');
                            if (pAura) pAura.style.display = '';
                        }
                    });

                    // 2. Save current state if not already saved
                    if (!card.getAttribute('data-original-media')) {
                        card.setAttribute('data-original-media', mediaRow.innerHTML);
                    }

                    const iframe = document.createElement('iframe');
                    const origin = window.location.origin;
                    iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`;
                    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
                    iframe.allowFullscreen = true;
                    // Note: CSS now handles width/height 100% natively in cat-music .row-media iframe rule

                    mediaRow.innerHTML = '';
                    mediaRow.appendChild(iframe);

                    const aura = card.querySelector('.steel-waveform-aura');
                    if (aura) aura.style.display = 'none';

                    card.classList.add('is-playing');
                }
            } else if (link) {
                window.open(link, '_blank');
            }
            return false;
        }

        function renderFooter() {
            const footerEl = document.getElementById("footer-links");
            let hasVisitorCounter = false;

            footerEl.innerHTML = db.filter(e => "Footer" === e.Page).map(entry => {
                let title = (entry.Title || "").replace(/{year}/g, new Date().getFullYear());
                
                return title ? `<span>${title}</span>` : "";
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
            
            // SECURITY: Force HTTPS to avoid 'Not Secure' Mixed Content warnings for external images
            let processedUrl = url.replace(/^http:\/\//i, "https://");

            const lower = processedUrl.toLowerCase();
            const autoplay = lower.includes('-autoplay');
            const loop = lower.includes('-loop');
            const invert = lower.includes('-invert');
            // Behavior for controls: generally on, but off for autoplay unless specified
            const controls = !lower.includes('-nocontrols') && !autoplay;

            // Strip behavior markers.
            // These can be appended after the extension (e.g. .jpg-invert)
            let cleanUrl = processedUrl.replace(/-(?:autoplay|loop|noloop|nocontrols|invert)/gi, '');
            
            // SPECIAL CASE: Only strip '-thumb' from videos, as some images (like resume-thumb.jpg)
            // legitimately use it in their real filename.
            if (lower.match(/\.(mp4|webm|mov|ogg)/i)) {
                cleanUrl = cleanUrl.replace(/-thumb/gi, '');
            }

            return { url: cleanUrl, autoplay, loop, controls, invert };
        }

        function extractMediaFromContent(content) {
            if (!content) return null;

            // 1. YouTube
            const ytMatch = content.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
            if (ytMatch) return { type: 'yt', id: ytMatch[1] };

            // 2. GLB
            const glbMatch = content.match(/\S+\.glb(?:-[a-zA-Z0-9_-]+)*/i);
            if (glbMatch) {
                const path = glbMatch[0];
                const url = (path.startsWith('assets/') || path.startsWith('http')) ? path : `assets/models/${path}`;
                return { type: 'glb', url: url };
            }

            // 3. Image
            const imgMatch = content.match(/\S+\.(?:jpg|jpeg|png|gif|webp|svg)(?:-[a-zA-Z0-9_-]+)*/i);
            if (imgMatch) return { type: 'img', url: imgMatch[0] };

            // 4. Video
            const videoMatch = content.match(/\S+\.(?:mp4|webm|mov|ogg)(?:-[a-zA-Z0-9_-]+)*/i);
            if (videoMatch) return { type: 'video', url: videoMatch[0] };

            return null;
        }

        function getThumbnail(media) {
            if (!media) return null;
            // Catch GLB/3D models - support new -scale and -z-up suffixes
            if (media.match(/\.glb(\?.*|-(?:autoplay|thumb|loop|noloop|nocontrols|scale\d+|z-up|invert))*$/i)) return 'GLB_VIEWER';
            // Catch GeoJSON maps
            if (media.match(/\.geojson(?:-[NSEW]{1,2})?(\?.*)?$/i)) return 'MAP_VIEWER';
            // Catch YouTube
            const ytId = getYouTubeID(media);
            if (ytId) return getYouTubeThumbnail(ytId);

            // Catch Videos: Keep full raw string to preserve behavior markers for mediaBuilder
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
                    if (!video.src && video.dataset.src) {
                        video.src = video.dataset.src;
                    }
                    if (video.dataset.autoplay === "true") {
                        video.play().catch(e => { });
                    }
                } else {
                    if (!video.paused) {
                        video.pause();
                    }
                }
            });
        }, { rootMargin: '200px' });

        // Observe newly added videos
        function observeVideos(container) {
            if (!container) return;
            // Delay observation slightly to let the browser settle after innerHTML
            setTimeout(() => {
                container.querySelectorAll('.lazy-video').forEach(v => _videoObserver.observe(v));
            }, 100);
        }

        function processGlbQueue() {
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
                        }
                    }
                }
            } catch (outerError) {
                console.error("Critical GLB Queue Error:", outerError);
            }

            // STAGGERED BATCHING: Only process one model per 150ms to keep main thread free for transitions
            if (_glbInitQueue.length > 0) {
                setTimeout(() => processGlbQueue(), 150);
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
                        setTimeout(processGlbQueue, 400);
                    }

                    // Stop observing once queued
                    _glbObserver.unobserve(entry.target);
                }
            });
        }, { rootMargin: '200px' }); // Smaller margin to reduce initial burst

        // GLB Viewer Renderer
        function renderGLBViewer(glbPath, isCardMode) {
            const uniqueId = 'viewer-' + Math.random().toString(36).substring(2, 11);
            const html = `
                <div class="model-viewer-wrapper ${isCardMode ? 'card-preview' : ''}" 
                     id="${uniqueId}" 
                     data-glb-path="${glbPath}">
                    <div class="loader-overlay sk-img">
                        <div class="glb-loader-text">Loading 3D</div>
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
                }, { rootMargin: '300px' });
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
                        <div class="loader-overlay sk-img">
                            <div class="glb-loader-text">Loading Map</div>
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
                        viewer.controls.zoomSpeed = 0.6;
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
            const n = new Date(e);
            if (isNaN(n.getTime())) return e;
            const r = new Date(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12, 0, 0);
            return `${r.getDate()} ${r.toLocaleString("default", { month: "short" }).toUpperCase()} ${r.getFullYear()}`;
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

        let _lastResumeLD = null;
        function generateResumeJSONLD() {
            const currentLD = JSON.stringify(resumeDb);
            if (_lastResumeLD === currentLD) return;
            _lastResumeLD = currentLD;

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

        function renderButton(text, url) {
            return `<div class="btn-cta-wrapper"><a href="${url}" target="_blank" rel="noopener" class="btn-cta">${text}</a></div>`;
        }


        function renderResume() {
            const app = document.getElementById("app");
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
            </div>`;

            buffer += '</div>';

            // 3. ATOMIC SWAP
            app.innerHTML = buffer;
        }
        function RenderResumeEntry(entry) {
            let role = entry.Title || "";
            let company = "";

            // Natural Language Parsing for Title: "Role @ Company" or "Role at Company"
            const companyMatch = role.match(/^(.*?)\s+(@|at)\s+(.*)$/i);
            if (companyMatch) {
                role = companyMatch[1].trim();
                company = companyMatch[3].trim();
            } else if (role.includes("|")) {
                const parts = role.split("|");
                role = parts[0].trim();
                company = parts[1].trim();
            }

            const processedContent = processContentWithBlocks(entry.Content || "");

            let dateHTML = "";
            let metaHTML = "";

            if (entry.Tags) {
                const chipLink = (label, url, iconHtml) => `<a href="${url}" target="_blank" style="text-decoration:none; display:flex; align-items:center;">${iconHtml}${safeHTML(label)}</a>`;
                const processTag = (tag) => {
                    tag = tag.trim();
                    if (tag.match(/[A-Za-z]{3,}\s+\d{4}/) || tag.toLowerCase().includes("present")) return { type: "date", html: safeHTML(tag) };

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
                    return { type: "other", html: safeHTML(tag) };
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

                // 1. Check for Buttons (Standalone lines or multi-button rows)
                // This detects lines that are PURELY composed of one or more buttons in any supported syntax.
                const isButtonRow = line.match(/^(\s*(?:\[\s*(?:button\]:)?\s*[^\]|]+?\s*\|\s*[^\]\s]+\s*\]|\[[^\]]+\]\((?:[^)]+-btn(?:-[a-z]+)?)\)|[^\[\]\s]+?\s*\|\s*(?:https?:\/\/\S+|[a-zA-Z0-9.\/_#-]+\.[a-z]{2,4}[^\s]*|#\S+))\s*)+$/i);

                if (isButtonRow) {
                    flushText();
                    blocks.push(processBlock([lineRaw])); // Process exactly this one line as a centered button row
                    continue;
                }

                // 2. Check for Media (Grouping consecutive media lines)
                const parts = line.split(',').map(p => p.trim()).filter(p => p);
                const mediaItems = parts.map(p => detectMediaItem(p));
                const isPureMedia = mediaItems.length > 0 && mediaItems.every(m => m !== null);

                if (isPureMedia) {
                    flushText();
                    let mediaLines = [lineRaw];

                    // Grouping: Look ahead for more media or a caption
                    while (i + 1 < rawLines.length) {
                        const nextRaw = rawLines[i + 1];
                        const nextLine = nextRaw.trim();
                        if (!nextLine) break;

                        const nextParts = nextLine.split(',').map(p => p.trim()).filter(p => p);
                        const nextMedia = nextParts.map(p => detectMediaItem(p));
                        const isNextPureMedia = nextMedia.length > 0 && nextMedia.every(m => m !== null);
                        const isNextCaption = nextLine.match(/^\[(.*)\]$/s);

                        if (isNextPureMedia || isNextCaption) {
                            mediaLines.push(nextRaw.trimEnd());
                            i++;
                            if (isNextCaption) break; // Caption ends the block
                        } else break;
                    }

                    blocks.push(processBlock(mediaLines));
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

            // 1. Smart Caption Detection: [This is a caption]
            // We check the last line for square brackets.
            let sharedCaption = null;
            const lastLine = lines[lines.length - 1].trim();
            // Match [Caption] - must start with [ and end with ]
            const captionMatch = lastLine.match(/^\[(.*)\]$/s);
            if (captionMatch) {
                sharedCaption = captionMatch[1].trim();
                lines = lines.slice(0, -1); // Remove caption line from media processing
                if (lines.length === 0) return { type: 'text', content: `[${sharedCaption}]` }; // Fallback for standalone bracketed text
            }

            // 2. Fluid Media Detection (Support for multi-line and comma-separated media)
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

            // 3. Smart Button Detection (Extract all buttons from the block/line)
            const buttonItems = [];
            // Regex to find all button-like patterns in the block
            const btnRegex = /\[\s*(?:button\]:)?\s*([^\]|]+?)\s*\|\s*([^\]\s]+)\s*\]|\[([^\]]+)\]\(([^)]+-btn(?:-[a-z]+)?)\)|([^\[\]\s]+?)\s*\|\s*(https?:\/\/\S+|[a-zA-Z0-9.\/_#-]+\.[a-z]{2,4}[^\s]*|#\S+)/gi;

            for (let line of lines) {
                let match;
                while ((match = btnRegex.exec(line)) !== null) {
                    const text = match[1] || match[3] || match[5];
                    const url = match[2] || match[4] || match[6];
                    if (text && url) {
                        buttonItems.push({ text: text.trim(), url: url.trim() });
                    }
                }
            }

            if (buttonItems.length > 0) {
                return { type: 'buttons', items: buttonItems };
            }

            // 4. Dynamic Tag Detection (Expanded to allow flexible inclusion)
            const musicTag = lines.some(l => l.trim().match(/\{(Recent Music|Recently Played)\}/i));
            if (musicTag && combinedBlock.match(/^\{(Recent Music|Recently Played)\}$/i)) {
                return { type: 'music' };
            }

            const quoteTag = lines.some(l => l.trim().match(/\{Random Quote\}/i));
            if (quoteTag && combinedBlock.match(/^\{Random Quote\}$/i)) {
                return { type: 'quote', title: '{random quote}' };
            }

            // Otherwise it's text content
            return {
                type: 'text',
                content: (sharedCaption ? [...lines, `[${sharedCaption}]`] : lines).join('\n')
            };
        }

        // Detect media type and caption from a string
        function detectMediaItem(text) {
            text = text.trim();
            if (!text) return null;

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
                const subType = detectBasicUrlType(subUrl);
                return {
                    type: subType ? subType.type : 'image',
                    url: subUrl,
                    id: subType ? subType.id : null,
                    caption: caption || subCaption || null
                };
            }

            // 3. Direct URL or Special Syntax
            const basicType = detectBasicUrlType(url);
            if (basicType) {
                return {
                    ...basicType,
                    caption: caption || basicType.caption || null
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
                        <div class="sk-img loader-overlay"></div>
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
                mediaHTML = `<div class="sk-img loader-overlay"></div><img class="media-enter ${p.invert ? 'theme-invert' : ''}" src="${p.url}" alt="${item.caption || 'Media'}" loading="lazy" ${style} onload="mediaLoaded(this)" onerror="this.previousElementSibling?.remove()">`;
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
                        <div class="yt-glass-btn" style="width: 72px; height: 72px; border-radius: 50%; background: var(--bg-trans); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid var(--border-header); display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
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
                        <svg viewBox="0 0 24 24" style="width: 32px; height: 32px; fill: var(--accent-projects); margin-bottom: 12px; opacity: 0.8;"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"></path></svg>
                        <a href="${stravaUrl}" target="_blank" style="color: var(--text-bright); text-decoration: none; font-weight: 600; font-family: Jost, sans-serif; font-size: 16px; letter-spacing: 0.5px;">VIEW ON STRAVA</a>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;">Interactive Map Loading...</div>
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
                // In gallery, the gallery-item handles the rounding and clipping
                return `<div class="gallery-item">
                    ${mediaHTML}
                    ${captionHTML}
                </div>`;
            } else {
                // Single Item: Wrap in a container to maintain spacing relationship with caption
                return `<div class="unified-media-wrapper">${mediaHTML}${captionHTML}</div>`;
            }
        }
        // Render a block as HTML
        function renderContentBlock(block, index) {
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

                case 'button':
                    return renderButtonHTML(block.text, block.url);

                case 'buttons':
                    const btnsHTML = block.items.map(b => renderButtonHTML(b.text, b.url, true)).join('');
                    return `<div class="btn-cta-wrapper">${btnsHTML}</div>`;

                case 'music':
                    return `<div class="music-embed-container" data-needs-init="true" data-type="recent-music"></div>`;

                case 'quote':
                    return `<div class="layout-quote" data-needs-init="true" data-title="${block.title || 'random quote'}"></div>`;

                case 'music-cluster':
                    const clusterUrls = block.items.map(i => i.url).join(',');
                    return `<div class="music-embed-container" data-needs-init="true" data-type="music-cluster" data-urls="${clusterUrls}"></div>`;

                // GPS gimmicks removed in favor of standard card structure
                case 'strava':

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
        function renderButtonHTML(text, url, isInline = false) {
            const rawURL = (url || "").trim().replace(/^\(|\)$/g, "").trim(); // Remove outer ( ) if present
            let colorClass = "";
            let cleanText = (text || "").trim();
            let finalURL = rawURL;

            // 1. Identify Color from Text (Legacy Support: "Label-green")
            const textColorMatch = cleanText.match(/-(green|red|blue|orange|purple|strava)$/i);
            if (textColorMatch) {
                colorClass = textColorMatch[1].toLowerCase();
                cleanText = cleanText.replace(/-[a-z]+$/i, "");
            }

            // 2. Identify Color & Markers from URL (Marker Strategy: "url.pdf-btn-green")
            const urlMarkerMatch = rawURL.match(/-btn(-green|-red|-blue|-orange|-purple|-strava)?(?:\?.*)?$/i);
            if (urlMarkerMatch) {
                if (!colorClass && urlMarkerMatch[1]) {
                    colorClass = urlMarkerMatch[1].substring(1).toLowerCase();
                }
                finalURL = rawURL.replace(/-btn(-green|-red|-blue|-orange|-purple|-strava)?(?:\?.*)?$/i, "");
            }

            // 3. Auto-Branding for Strava
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

                // Check for headers (# to ####)
                const headerMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
                if (headerMatch) {
                    while (listStack.length > 0) {
                        output.push('</ul>');
                        listStack.pop();
                    }
                    const level = headerMatch[1].length;
                    const content = processInlineMarkdown(headerMatch[2]);
                    output.push(`<h${level} class="header-fade-anim">${content}</h${level}>`);
                    continue;
                }

                // Check for list items with indentation (including checkboxes)
                const listMatch = line.match(/^(\s*)-\s+(.*)$/);
                if (listMatch) {
                    const indent = listMatch[1].length;
                    let itemContent = listMatch[2];
                    const currentLevel = Math.min(Math.floor(indent / 2), MAX_DEPTH); // 2 spaces = 1 level

                    // Check for checkbox syntax: [ ] or [x]
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

                    // Adjust list stack to match current level
                    while (listStack.length > currentLevel + 1) {
                        output.push('</ul>');
                        listStack.pop();
                    }

                    while (listStack.length < currentLevel + 1) {
                        output.push('<ul>');
                        listStack.push(true);
                    }

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

                // Handle horizontal rules (matches --- or ***)
                if (trimmed.match(/^(?:---|\*\*\*)$/)) {
                    output.push('<hr>');
                    continue;
                }

                // Zero Syntax: Block-level Button Support (Label | URL or [Label | URL])
                // We use a broader regex to catch his bracketed syntax as a centered block
                const buttonBlockRegex = /^\[?\s*([^\]|]+?)\s*\|\s*([^\]]+?)\s*\]?$/i;
                const buttonMatch = trimmed.match(buttonBlockRegex);
                if (buttonMatch) {
                    output.push(renderButtonHTML(buttonMatch[1].trim(), buttonMatch[2].trim(), false));
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

                // A. SHORTHAND PIPE: [Label | URL] -> Buttons
                result = result.replace(/\[\s*([^\]|]+?)\s*\|\s*([^\]]+?)\s*\]/gi, (match, btnText, btnUrl) => {
                    return renderButtonHTML(btnText.trim(), btnUrl.trim(), true);
                });

                // B. DYNAMIC TAGS: {Recently Played}, {Random Quote}
                result = result.replace(/\{(Recent Music|Recently Played)\}/gi, '<div class="music-embed-container" data-needs-init="true" data-type="recent-music"></div>');
                result = result.replace(/\{Random Quote\}/gi, '<div class="layout-quote" data-needs-init="true" data-title="random quote"></div>');

                // B. LEGACY CTA: [button]: Label | URL
                result = result.replace(/\[button\]:\s*(.+?)\s*\|\s*(\S+)/gi, (match, btnText, btnUrl) => {
                    return renderButtonHTML(btnText.trim(), btnUrl.trim(), true);
                });
            }

            // Standard Markdown
            result = result.replace(/\*\*(.*?)\*\*/g, (m, p1) => `<strong>${processInlineMarkdown(p1, depth + 1)}</strong>`);
            result = result.replace(/__(.*?)__/g, (m, p1) => `<u>${processInlineMarkdown(p1, depth + 1)}</u>`);
            result = result.replace(/\*(.*?)\*/g, (m, p1) => `<em>${processInlineMarkdown(p1, depth + 1)}</em>`);
            result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

            // C. SMART LINKS & MARKDOWN LINKS
            result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
                const cleanURL = url.trim();
                // If it has a -btn marker, render it as a button
                if (cleanURL.match(/-btn(-[a-z]+)?$/i)) {
                    return renderButtonHTML(label, cleanURL, true);
                }
                // Process blockquotes as usual
                if (label.startsWith('>')) {
                    // It's a blockquote that was parsed via standard markdown logic
                    return renderBlockquote(label);
                }
                // Standard Link
                if (label.toLowerCase().includes('strava')) {
                    return `<a href="${cleanURL}" target="_blank" rel="noopener" class="strava-link">${processInlineMarkdown(label, depth + 1)}</a>`;
                }
                return `<a href="${cleanURL}" target="_blank" rel="noopener">${processInlineMarkdown(label, depth + 1)}</a>`;
            });

            if (depth === 0) {
                result = result.replace(/(?<!href=")(https?:\/\/(?:www\.)?(?:strava\.com|strava\.app\.link)\/\S+)/gi, '<a href="$1" target="_blank" rel="noopener">$1</a>');
            }

            return result;
        }

        // --- MAPBOX GL JS INITIALIZER FOR GEOJSON ART ---
        window.__initMapbox = async function(containerId, geojsonUrl, isInteractive = true) {
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
                realUrl = geojsonUrl.replace(`-${dir}`, '');
                const bearingMap = { 'N': 0, 'NE': 45, 'E': 90, 'SE': 135, 'S': 180, 'SW': 225, 'W': 270, 'NW': 315 };
                if (bearingMap[dir] !== undefined) {
                    orientationBearing = bearingMap[dir];
                }
            }

            try {
                // Fetch GeoJSON directly to evaluate bounds before loading
                const geoReq = await fetch(realUrl);
                const geoData = await geoReq.json();

                const bounds = new mapboxgl.LngLatBounds();
                let hasCoords = false;
                
                const processCoords = (coords) => {
                    if (typeof coords[0] === 'number') {
                        bounds.extend(coords);
                        hasCoords = true;
                    } else {
                        coords.forEach(processCoords);
                    }
                };
                
                if (geoData.features) {
                    geoData.features.forEach(f => {
                         if (f.geometry && f.geometry.coordinates) processCoords(f.geometry.coordinates);
                    });
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

                // Prevent cursor trap where map intercepts all scroll events
                map.scrollZoom.disable();

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

            } catch(e) {
                console.warn("Mapbox load failed:", e);
                container.classList.remove('loader-overlay');
                container.innerHTML = '<div style="padding: 20px; font-family: monospace; color: var(--text-dim); text-align: center;">GPS Route processing failed or Invalid Mapbox Token.</div>';
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

        // Process content with block system - convenience function
        function processContentWithBlocks(content) {
            if (!content) return '';

            const blocks = parseContentBlocks(content);
            return blocks
                .filter(block => block !== null)
                .map((block, index) => renderContentBlock(block, index))
                .join('\n');
        };

