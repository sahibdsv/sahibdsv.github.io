/* assets/script.js */

let db = [], quotesDb = [], isSearchActive = false;
let resizeObserver;

// Fallback Config
const FALLBACK_CONFIG = {
    main_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv",
    quotes_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=540861260&single=true&output=csv"
};

const init = () => {
    fetchData().then(([m, q]) => {
        db = m.filter(r => r.Title); 
        quotesDb = q;
        
        if(window.location.search) history.replaceState(null, null, window.location.pathname + window.location.hash);
        
        initApp(); 
        renderFooter(); 
        fetchGitHubStats();
        
        // Dynamic Header Offset
        const header = document.getElementById('main-header');
        resizeObserver = new ResizeObserver(() => {
            document.body.style.paddingTop = header.offsetHeight + 'px';
        });
        resizeObserver.observe(header);

        requestAnimationFrame(() => {
            setTimeout(() => {
                document.body.classList.remove('no-transition');
                document.getElementById('main-header').classList.remove('no-transition');
            }, 50);
        });
    }).catch(e => {
        console.error("Data Load Error:", e);
        document.getElementById('app').innerHTML = `<div style="text-align:center; padding:50px;">
            <h2>Unable to load content</h2>
            <p style="color:#888; font-family:monospace; background:#111; padding:10px; display:inline-block; border-radius:4px; margin-top:20px;">${e.message}</p>
            <p style="color:#666; margin-top:20px;">Please check your internet connection.</p>
        </div>`;
    });
};

async function fetchData() {
    let config = FALLBACK_CONFIG;
    try {
        const cfgRes = await fetch('assets/config.json');
        if (cfgRes.ok) config = await cfgRes.json();
    } catch (e) { console.warn("Config fetch failed, using fallback URLs."); }

    const [main, quotes] = await Promise.all([
        fetchCSV(config.main_sheet), 
        fetchCSV(config.quotes_sheet).catch(()=>[])
    ]);

    return [main, quotes];
}

function fetchCSV(u) { 
    return new Promise((res, rej) => {
        if(typeof Papa === 'undefined') return rej(new Error("PapaParse library not loaded. Check your internet connection."));
        Papa.parse(u, { 
            download: true, header: true, skipEmptyLines: true, 
            complete: (r) => res(r.data), 
            error: (e) => rej(new Error("CSV Error: " + e.message)) 
        });
    });
}

// ALLOW IFRAMES IN RAW HTML
function safeHTML(html) {
    if(typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height']
        });
    }
    return html; 
}

function initApp() {
    buildNav(); handleRouting();
    window.addEventListener('hashchange', handleRouting);
    
    // GOATCOUNTER TRACKING
    window.addEventListener('hashchange', function(e) {
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({
                path: location.pathname + location.search + location.hash,
                title: location.hash.substring(1) || 'Home',
                event: false,
            });
        }
    });

    // SCROLL LOGIC
    window.addEventListener('scroll', () => { 
        // Strict Rule: Hide brand on ANY scroll > 50px. Show ONLY if < 50px.
        const isScrolled = window.scrollY > 50;
        document.body.classList.toggle('scrolled', isScrolled);
    });

    document.addEventListener('click', (e) => {
        const overlay = document.getElementById('search-overlay');
        const controls = document.getElementById('search-controls');
        if (overlay.classList.contains('active') && !overlay.contains(e.target) && !controls.contains(e.target)) {
            closeSearch();
        }
    });

    document.getElementById('app').addEventListener('click', (e) => {
        if(e.target.closest('.refresh-btn')) { 
            const quoteContainer = e.target.closest('.layout-quote');
            if(quoteContainer && !quoteContainer.classList.contains('loading')) {
                quoteContainer.classList.add('loading');
                quoteContainer.innerHTML = `<div class="sk-box quote" style="height:100px; width:100%; margin:0 auto;"></div>`;
                setTimeout(() => {
                    renderQuoteCard(quoteContainer);
                    quoteContainer.classList.remove('loading');
                }, 600); 
            }
            e.stopPropagation(); return; 
        }
        
        if(e.target.classList.contains('zoomable')) { 
            if(e.target.parentElement.tagName === 'A') return;
            document.getElementById('lightbox-img').src = e.target.src; 
            document.getElementById('lightbox').classList.add('active'); 
            e.stopPropagation(); return; 
        }
        
        if(e.target.classList.contains('chip')) { 
            e.stopPropagation();
            if(isSearchActive) closeSearch(); 
            const tag = e.target.getAttribute('data-tag');
            const date = e.target.getAttribute('data-date');
            if(date) window.location.hash = 'Filter:' + date;
            else if(tag) window.location.hash = 'Filter:' + tag;
            return; 
        }
        
        const block = e.target.closest('.clickable-block');
        if(block && !e.target.classList.contains('chip')) {
            const link = block.getAttribute('data-link'), target = block.getAttribute('data-target');
            if(link) { 
                if(target === '_blank') window.open(link, '_blank'); 
                else { 
                    window.location.href = link; 
                    if(isSearchActive) closeSearch(); 
                } 
            }
        }
    });
}

function resetToHome() { closeSearch(); window.location.hash = ''; }
function closeSearch() { document.getElementById('search-overlay').classList.remove('active'); document.getElementById('main-header').classList.remove('search-mode'); document.getElementById('search-input').value = ''; if(isSearchActive) { isSearchActive = false; handleRouting(); } isSearchActive = false; }

function toggleSearch() { 
    const a = document.getElementById('search-overlay').classList.toggle('active'); 
    document.getElementById('main-header').classList.toggle('search-mode'); 
    if(a) setTimeout(() => document.getElementById('search-input').focus(), 100);
    else closeSearch(); 
}

function handleSearch(q) { 
    if(!q) return; 
    isSearchActive = true; 
    
    // Collapse all navs
    document.body.classList.remove('header-expanded'); // Legacy cleanup
    
    const t = q.toLowerCase();
    const res = db.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t))); 
    renderRows(res, `Search results for "${safeHTML(q)}"`, false, true); 
}

function buildNav() { 
    const n = document.getElementById('primary-nav'); if(!n) return; n.innerHTML = ''; 
    const p = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer').map(r => r.Page.split('/')[0]).filter(x => x))].sort(); 
    p.forEach(x => { if(x === 'Home') return; n.innerHTML += `<a href="#${x}" class="nav-link fill-anim" onclick="closeSearch()">${safeHTML(x)}</a>`; }); 
}

function buildSubNav(top) {
    const n = document.getElementById('sub-nav'), b = document.body; if(!n) return; n.innerHTML = ''; b.setAttribute('data-page', top);
    
    // Logic: Get children of Top
    const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/').slice(0, 2).join('/')))].sort();
    
    let activeSub = null;
    
    subs.forEach(x => { 
        const name = x.split('/')[1];
        const isActive = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`); 
        if(isActive) activeSub = x;
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${isActive ? 'active' : ''}" onclick="closeSearch()">${safeHTML(name)}</a>`; 
    });

    // Center ONLY when the sub-nav is first built
    setTimeout(() => centerNav(n, true), 100);
    
    // TRIGGER TERTIARY based on active Sub
    buildTertiaryNav(activeSub);
}

function buildTertiaryNav(activeSubPath) {
    const n = document.getElementById('tertiary-nav'); if(!n) return; n.innerHTML = '';
    n.classList.remove('visible');

    if(!activeSubPath) return; // Collapse if no selection

    // Get children of activeSubPath (Level 3)
    const tertiary = [...new Set(db.filter(r => r.Page && r.Page.startsWith(activeSubPath + '/')).map(r => r.Page.split('/').slice(0, 3).join('/')))].sort();
    
    if(tertiary.length === 0) return; // Collapse if no children

    n.classList.add('visible');
    
    tertiary.forEach(x => {
        const name = x.split('/')[2];
        const isActive = window.location.hash === `#${x}`;
        n.innerHTML += `<a href="#${x}" class="tertiary-link fill-anim ${isActive ? 'active' : ''}" onclick="closeSearch()">${safeHTML(name)}</a>`;
    });
    
    setTimeout(() => centerNav(n, true), 100);
}

function centerNav(el, forceMiddleIfNone) {
    if(!el) return;
    const activeLink = el.querySelector('.active');
    
    if (activeLink) {
        const scrollTarget = activeLink.offsetLeft + (activeLink.offsetWidth / 2) - (el.clientWidth / 2);
        el.scrollTo({ left: scrollTarget, behavior: 'smooth' });
    } else if (forceMiddleIfNone) {
        const middle = (el.scrollWidth - el.clientWidth) / 2;
        el.scrollTo({ left: middle, behavior: 'smooth' });
    }
}

function handleRouting() { 
    if(isSearchActive) return; 
    window.scrollTo(0, 0); 
    let h = window.location.hash.substring(1) || 'Home'; 
    
    if(h === 'Index') { renderIndex(); return; }
    if(h === 'Timeline') { renderTimeline(); return; }
    
    // Clear Timeline specific UI if present
    document.body.classList.remove('timeline-view');

    // Deactivate Main Nav Highlights if Index (or non-matching top)
    const top = h.split('/')[0]; 
    document.querySelectorAll('#primary-nav .nav-link').forEach(a => { const href = a.getAttribute('href'); if(href) a.classList.toggle('active', href.replace('#', '') === top); }); 
    
    buildSubNav(top); 
    
    if(h.startsWith('Filter:')) { renderFiltered(decodeURIComponent(h.split(':')[1])); } 
    else { renderPage(h); }
}

function renderFiltered(t) { 
    const res = db.filter(r => {
        const dateStr = formatDate(r.Timestamp);
        return (dateStr === t) || (r.Tags && r.Tags.includes(t));
    });
    renderRows(res, `Posts tagged "${safeHTML(t)}"`, false, true); 
}

function renderPage(p) { 
    if(p === 'Home') { renderHome(); return; } 
    const ex = db.filter(r => r.Page === p); 
    const app = document.getElementById('app'); app.innerHTML = ''; 
    
    const isMainPage = !p.includes('/');
    
    if(ex.length > 0) { renderRows(ex, null, true, false, !isMainPage); } 
    else if(childrenPagesCheck(p)) { }
    else {
        app.innerHTML = `<div class="layout-404"><h1>404</h1><h2>Data Not Found</h2><p>This page doesn't exist in the database yet.</p><a href="#" class="btn-primary" onclick="resetToHome()">Return to Base</a></div>`;
        return; 
    }
    
    if(isMainPage) {
        const childrenPages = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
        if(childrenPages.length > 0) {
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
    // Clear Sub-nav/Tertiary
    buildSubNav('Index'); 
    document.querySelectorAll('#primary-nav .nav-link').forEach(a => a.classList.remove('active'));

    const app = document.getElementById('app'); 
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Index</h1></div><div class="section index-list"></div>';
    
    const list = app.querySelector('.index-list');
    const pages = [...new Set(db.map(r => r.Page).filter(p => p && p !== 'Home' && p !== 'Footer'))].sort();
    
    const groups = {};
    pages.forEach(p => {
        const cat = p.split('/')[0];
        if(!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
    });
    
    for(const [cat, items] of Object.entries(groups)) {
        let catClass = '';
        const cLower = cat.toLowerCase();
        if(cLower === 'projects') catClass = 'cat-projects';
        else if(cLower === 'professional') catClass = 'cat-professional';
        else if(cLower === 'personal') catClass = 'cat-personal';

        let html = `<div class="index-group ${catClass}"><h3>${cat}</h3>`;
        items.forEach(p => {
            const row = db.find(r => r.Page === p);
            const date = row && row.Timestamp ? formatDate(row.Timestamp) : '';
            const title = row ? row.Title : p.split('/').pop();
            // Depth check for indentation
            const depth = p.split('/').length > 2 ? 'depth-2' : '';
            html += `<a href="#${p}" class="index-link fill-anim ${depth}">${title} ${date ? `<span>${date}</span>` : ''}</a>`;
        });
        html += `</div>`;
        list.innerHTML += html;
    }
}

function renderHome() { 
    const hr = db.filter(r => r.Page === 'Home');
    const app = document.getElementById('app'); app.innerHTML = ''; 
    renderRows(hr, null, true); 
    
    let allRows = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer');
    
    // Sort Date Descending
    allRows.sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0));

    // PINNED LOGIC
    const pinned = allRows.filter(r => r.Tags && r.Tags.toLowerCase().includes('featured'));
    const others = allRows.filter(r => !pinned.includes(r)).slice(0, 6); // Limit others
    
    // Combine (Pinned first)
    const displaySet = [...pinned, ...others];

    if(displaySet.length > 0) { renderRows(displaySet, "Featured & Recent", true); } 
}

function renderTimeline() {
    // Clear Headers
    buildSubNav('Timeline');
    document.querySelectorAll('#primary-nav .nav-link').forEach(a => a.classList.remove('active'));

    const app = document.getElementById('app');
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Timeline</h1></div><div class="timeline-container section"></div>';
    
    const container = app.querySelector('.timeline-container');
    const rows = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer' && r.Timestamp);
    
    // Group by YYYY-MM
    const groups = {};
    rows.forEach(r => {
        if(r.Timestamp && r.Timestamp.length === 8) {
            const key = r.Timestamp.substring(0, 6); // YYYYMM
            if(!groups[key]) groups[key] = [];
            groups[key].push(r);
        }
    });

    // Sort Groups Descending (Newest Month First)
    const keys = Object.keys(groups).sort((a, b) => b - a);

    keys.forEach(key => {
        const year = key.substring(0, 4);
        const monthIndex = parseInt(key.substring(4, 6)) - 1;
        const monthName = new Date(year, monthIndex).toLocaleString('default', { month: 'long' });
        
        const items = groups[key];
        // Sort items Alphabetically by Title within Month
        items.sort((a, b) => a.Title.localeCompare(b.Title));

        const rowDiv = document.createElement('div');
        rowDiv.className = 'timeline-row';
        
        // Date Column
        const dateHtml = `<div class="timeline-date"><div class="month">${monthName}</div><div class="year">${year}</div></div>`;
        
        // Cards Container
        const cardsDiv = document.createElement('div');
        cardsDiv.className = 'timeline-cards';
        
        // Fade Logic Handler
        cardsDiv.addEventListener('scroll', () => {
            const atEnd = Math.abs(cardsDiv.scrollWidth - cardsDiv.clientWidth - cardsDiv.scrollLeft) < 5;
            cardsDiv.classList.toggle('at-end', atEnd);
        });
        // Initial Check
        setTimeout(() => {
             const atEnd = cardsDiv.scrollWidth <= cardsDiv.clientWidth;
             cardsDiv.classList.toggle('at-end', atEnd);
        }, 100);

        rowDiv.innerHTML = dateHtml;
        rowDiv.appendChild(cardsDiv);
        container.appendChild(rowDiv);

        // Render Cards into cardsDiv using existing logic (slightly modified for append)
        items.forEach(r => {
            const card = createCardElement(r);
            cardsDiv.appendChild(card);
        });
    });

    // Initialize 3D viewers for timeline items
    setTimeout(init3DViewers, 500);
}

// Helper to create a single card element (Extracted from renderRows logic)
function createCardElement(r) {
    let contentHtml = processText(r.Content);
    let mediaHtml = '';
    let hasPlaceholder = false;

    const modelMatch = r.Content ? r.Content.match(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/i) : null;

    if (modelMatch) {
        const url = modelMatch[1].trim();
        const color = modelMatch[2] ? `data-color="${modelMatch[2].trim()}"` : '';
        mediaHtml = `<div class="row-media"><div class="embed-wrapper stl" data-src="${url}" ${color}></div></div>`;
        contentHtml = contentHtml.replace(/<div class="embed-wrapper stl".*?<\/div>/, ''); 
    } else if (r.Media) {
        const thumb = getThumbnail(r.Media);
        if(thumb) mediaHtml = `<div class="row-media"><img src="${thumb}" loading="lazy"></div>`;
    } else {
        hasPlaceholder = true;
        mediaHtml = `<div class="row-media placeholder"><span>${safeHTML(r.Title)}</span></div>`;
    }

    let catClass = '';
    const pLower = r.Page.toLowerCase();
    if(pLower.startsWith('projects')) catClass = 'cat-projects';
    else if(pLower.startsWith('professional')) catClass = 'cat-professional';
    else if(pLower.startsWith('personal')) catClass = 'cat-personal';

    const link = r.LinkURL || '';
    const tags = r.Tags ? r.Tags.split(',').map(x => x.trim()) : [];
    let l = link; if(!l) l = `#${r.Page}`; 
    const internal = l.startsWith('#'), target = internal ? '' : '_blank';
    
    let mh = '';
    if(r.Timestamp || tags.length > 0) {
            mh = `<div class="meta-row">`;
            if(r.Timestamp) {
                let dateVal = formatDate(r.Timestamp);
                mh += `<span class="chip date" data-date="${dateVal}" data-val="${dateVal}">${dateVal}</span>`; 
            }
            tags.forEach(t => mh += `<span class="chip" data-tag="${t}">${safeHTML(t)}</span>`); 
            mh += `</div>`;
    }

    const d = document.createElement('div'); 
    d.className = `layout-grid clickable-block ${catClass} ${hasPlaceholder ? 'has-placeholder' : ''}`;
    d.setAttribute('data-link', l); d.setAttribute('data-target', target);
    
    d.innerHTML = `${mediaHtml}<h3 class="fill-anim">${safeHTML(r.Title)}</h3><p>${contentHtml}</p>${mh}`;
    return d;
}

function renderRows(rows, title, append, forceGrid, isArticleMode = false) {
    const app = document.getElementById('app'); if(!app) return; 
    
    // Default sort if not Timeline/Home-pinned
    // rows.sort(...) - Handled outside for Home, generic here
    
    if(!append) {
        app.innerHTML = title ? `<h2 class="fill-anim" style="display:block; text-align:center; margin-bottom:20px; font-weight:400; font-size:24px; --text-base:#888; --text-hover:#fff;">${title}</h2>` : '';
    } else if(title) {
        app.innerHTML += `<h2 class="fill-anim" style="display:block; text-align:center; margin-bottom:20px; font-weight:400; font-size:24px; --text-base:#888; --text-hover:#fff;">${title}</h2>`;
    }

    if(rows.length === 0 && !append) { 
        app.innerHTML += `<div class="layout-404"><h2>Nothing Found</h2><p>No entries match your query.</p></div>`; 
        return; 
    }
    
    let gc = app.querySelector('.grid-container');
    if(append) {
        gc = document.createElement('div'); gc.className = 'grid-container section'; app.appendChild(gc);
    } else {
        const hasGridItems = forceGrid || (rows.some(r => r.SectionType !== 'quote' && r.SectionType !== 'hero' && r.SectionType !== 'text') && !isArticleMode);
        if(hasGridItems && !gc) {
            gc = document.createElement('div'); gc.className = 'grid-container section'; app.appendChild(gc);
        }
    }
    
    rows.forEach(r => {
        if(!r.Page || r.Page === 'Footer') return; 
        
        let contentHtml = processText(r.Content);
        let mediaHtml = '';
        
        const modelMatch = r.Content ? r.Content.match(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/i) : null;
        if (modelMatch) {
            const url = modelMatch[1].trim();
            const color = modelMatch[2] ? `data-color="${modelMatch[2].trim()}"` : '';
            mediaHtml = `<div class="row-media"><div class="embed-wrapper stl" data-src="${url}" ${color}></div></div>`;
            contentHtml = contentHtml.replace(/<div class="embed-wrapper stl".*?<\/div>/, ''); 
        } else if (r.Media) {
            const thumb = getThumbnail(r.Media);
            if(thumb) mediaHtml = `<div class="row-media"><img src="${thumb}" loading="lazy"></div>`;
        }

        if(!forceGrid && isArticleMode && (!r.SectionType || r.SectionType === 'card')) {
             const d = document.createElement('div'); d.className = 'section layout-text';
             
             if(modelMatch) mediaHtml = mediaHtml.replace('row-media', 'row-media article-mode');
             else if(r.Media) mediaHtml = mediaHtml.replace('row-media', 'row-media article-mode');
             else mediaHtml = ''; 

             let metaHtml = '<div class="article-meta-row"><a href="#Personal/About" class="author-link fill-anim">SAHIB VIRDEE</a>';
             if(r.LinkURL) {
                 metaHtml += `<a href="${r.LinkURL}" target="_blank" class="article-link-btn"><svg viewBox="0 0 24 24" style="width:12px;height:12px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
             }
             metaHtml += '<div class="article-tags">';
             if(r.Timestamp) {
                 const dateVal = formatDate(r.Timestamp);
                 metaHtml += `<span class="chip date" data-date="${dateVal}" data-val="${dateVal}">${dateVal}</span>`;
             }
             if(r.Tags) {
                 const tags = r.Tags.split(',').map(x => x.trim());
                 tags.forEach(t => metaHtml += `<span class="chip" data-tag="${t}">${safeHTML(t)}</span>`);
             }
             metaHtml += '</div></div>';

             d.innerHTML = `${mediaHtml}${safeHTML(r.Title) ? `<h2 class="fill-anim">${safeHTML(r.Title)}</h2>` : ''}${metaHtml}<p>${contentHtml}</p>`;
             app.appendChild(d);
             return;
        }

        if(!forceGrid) {
            if(r.SectionType === 'quote') { 
                const d = document.createElement('div'); d.className = 'layout-quote section'; 
                renderQuoteCard(d); app.appendChild(d); return; 
            }
            if(r.SectionType === 'hero') {
                const d = document.createElement('div'); d.className = 'section layout-hero';
                let dateHtml = '';
                if(r.Timestamp) {
                    let dateVal = formatDate(r.Timestamp);
                    dateHtml = `<div class="hero-meta"><span class="chip date" data-val="${dateVal}" onclick="event.stopPropagation(); window.location.hash='Filter:${dateVal}'">${dateVal}</span></div>`;
                }
                d.innerHTML = `<h1 class="fill-anim">${safeHTML(r.Title)}</h1>${dateHtml}<p>${processText(r.Content)}</p>`;
                app.appendChild(d); return;
            }
            if(r.SectionType === 'text') {
                 const d = document.createElement('div'); d.className = 'section layout-text';
                 d.innerHTML = `${safeHTML(r.Title) ? `<h2 class="fill-anim">${safeHTML(r.Title)}</h2>` : ''}<p>${processText(r.Content)}</p>`;
                 app.appendChild(d); return;
            }
        }
        
        // Use helper for grid items
        const d = createCardElement(r);
        if(gc) gc.appendChild(d);
    });
    
    if(window.MathJax && window.MathJax.typeset) {
        window.MathJax.typeset();
    }

    setTimeout(init3DViewers, 500);
}

function renderQuoteCard(c) {
    if(quotesDb.length === 0) { c.innerHTML = "Quote sheet empty."; return; }
    const r = quotesDb[Math.floor(Math.random() * quotesDb.length)];
    let auth = r.Author || 'Unknown'; 
    if(r.Source && r.Source.startsWith('http')) auth = `<a href="${r.Source}" target="_blank" class="fill-anim">${safeHTML(auth)}</a>`; 
    else if(r.Source) auth += ` • ${safeHTML(r.Source)}`;
    
    const text = safeHTML(r.Quote.trim().replace(/^"|"$/g, ''));
    
    const len = text.length;
    let sizeClass = 'short';
    
    if(len > 230) sizeClass = 'xxl';
    else if(len > 150) sizeClass = 'xl';
    else if(len > 100) sizeClass = 'long';
    else if(len > 50) sizeClass = 'medium';
    
    c.innerHTML = `<blockquote class="${sizeClass}">"${text}"</blockquote>
                   <div class="quote-footer"><div class="author">— ${auth}</div></div>
                   <svg class="refresh-btn" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;
}

function renderFooter() { 
    const fd = document.getElementById('footer-links');
    const fr = db.filter(r => r.Page === 'Footer' || r.Title === 'LinkedIn' || r.Title === 'Contact'); 
    fd.innerHTML = ''; 
    fr.forEach(r => { 
        let link = r.LinkURL;
        if(r.Title === 'Contact') {
            link = 'mailto:sahibdsv+site@gmail.com';
        }
        if(link) fd.innerHTML += `<a href="${link}" target="_blank" class="fill-anim">${safeHTML(r.Title)}</a>`; 
    }); 
    
    fd.innerHTML += `<a href="#Timeline" class="fill-anim" onclick="closeSearch()">Timeline</a>`;
    fd.innerHTML += `<a href="#Index" class="fill-anim" onclick="closeSearch()">Index</a>`;
    fd.innerHTML += `<a href="https://sahib.goatcounter.com" target="_blank" class="fill-anim">Analytics</a>`;
}

function fetchGitHubStats() { 
    const r = "sahibdsv/sahibdsv.github.io"; 
    fetch(`https://api.github.com/repos/${r}`).then(res => res.json()).then(d => { 
        if(d.pushed_at) {
            const date = new Date(d.pushed_at);
            // RELATIVE TIME LOGIC
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
            document.getElementById('version-tag').innerHTML = `<a href="https://github.com/${r}/commits" target="_blank" class="fill-anim">Last updated ${relTime}</a>`;
        } 
    }).catch(()=>{}); 
}

function getThumbnail(u) { if(!u) return null; if(u.includes('youtube.com')||u.includes('youtu.be')) { let v = u.split('v=')[1]; if(v&&v.includes('&')) v=v.split('&')[0]; if(!v&&u.includes('youtu.be')) v=u.split('/').pop(); return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; } if(u.endsWith('.mp4')) return null; return u; }

function processText(t) { 
    if(!t) return ''; 
    let clean = safeHTML(t);
    
    // 1. UNIVERSAL 3D VIEWER: {{3D: file.ext | #color}}
    clean = clean.replace(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/gi, (match, url, color) => {
        const colorAttr = color ? `data-color="${color.trim()}"` : '';
        return `<div class="embed-wrapper stl" data-src="${url.trim()}" ${colorAttr}></div>`;
    });

    // 2. INLINE IMAGE GALLERIES: [https://url1, https://url2]
    clean = clean.replace(/\[\s*(https?:\/\/[^\]]+)\s*\]/gi, (match, content) => {
        const urls = content.split(',').map(u => u.trim());
        const isPureGallery = urls.every(u => u.toLowerCase().startsWith('http'));
        if (!isPureGallery) return match; 
        const imgs = urls.map(u => `<img src="${u}" class="inline-img zoomable" loading="lazy" alt="Gallery Image">`).join('');
        return `<div class="inline-gallery">${imgs}</div>`;
    });

    // 3. WIKI LINKS: [[Page Name]]
    clean = clean.replace(/\[\[(.*?)\]\]/g, '<a href="#$1" class="wiki-link fill-anim">$1</a>');

    // 4. EMBED SHORTCODES
    clean = clean.replace(/\{\{MAP: (.*?)\}\}/g, '<div class="embed-wrapper map"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{DOC: (.*?)\}\}/g, '<div class="embed-wrapper doc"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{YOUTUBE: (.*?)\}\}/g, '<div class="embed-wrapper video"><iframe src="$1" allowfullscreen></iframe></div>');
    clean = clean.replace(/\{\{EMBED: (.*?)\}\}/g, '<div class="embed-wrapper"><iframe src="$1"></iframe></div>');

    // 5. GENERAL LINK STYLING
    clean = clean.replace(/<a /g, '<a class="fill-anim" '); 

    return clean; 
}

function formatDate(s) {
    if(!s) return '';
    if(s.length === 8 && !isNaN(s)) {
        const y = s.substring(0, 4);
        const m = s.substring(4, 6);
        const d = s.substring(6, 8);
        const dateObj = new Date(`${y}-${m}-${d}`);
        return `${dateObj.toLocaleString('default', { month: 'short' }).toUpperCase()} ${y}`;
    }
    const d = new Date(s);
    if(isNaN(d.getTime())) return s;
    const mo = d.toLocaleString('default', { month: 'short' }).toUpperCase();
    const yr = d.getFullYear();
    return `${mo} ${yr}`;
}

// 3D VIEWER LOGIC (LAZY LOADED)
function init3DViewers() {
    const containers = document.querySelectorAll('.embed-wrapper.stl:not(.loaded)');
    
    if(containers.length === 0) return;

    Promise.all([
        import('three'),
        import('three/addons/loaders/STLLoader.js'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js')
    ]).then(([THREE, { STLLoader }, { GLTFLoader }, { OrbitControls }]) => {
        
        // VISIBILITY OBSERVER: Only animate when visible! (Fixes "skippy" scroll)
        const visibilityObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const container = entry.target;
                if (entry.isIntersecting) {
                    container.setAttribute('data-visible', 'true');
                } else {
                    container.setAttribute('data-visible', 'false');
                }
            });
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadModel(entry.target, THREE, STLLoader, GLTFLoader, OrbitControls);
                    observer.unobserve(entry.target);
                    // Start tracking visibility for performance
                    visibilityObserver.observe(entry.target);
                }
            });
        }, { rootMargin: "200px" });

        containers.forEach(c => observer.observe(c));
    });
}

function loadModel(container, THREE, STLLoader, GLTFLoader, OrbitControls) {
    container.classList.add('loaded');
    
    const url = container.getAttribute('data-src');
    const customColor = container.getAttribute('data-color');
    const ext = url.split('.').pop().toLowerCase();
    
    const scene = new THREE.Scene();
    scene.background = null; 

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    
    // RENDERER SETUP
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    // Performance: Limit pixel ratio on phones
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    
    // FIX: Updated Color Space Management (Three.js r152+)
    // Old: renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.outputColorSpace = THREE.SRGBColorSpace; 
    
    // Lighting Setup
    renderer.physicallyCorrectLights = true; // Note: In r160+ this becomes renderer.useLegacyLights = false;
    
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 10, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xcceeff, 1.0);
    rimLight.position.set(-5, 5, -5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false; 
    controls.autoRotate = true; 
    controls.autoRotateSpeed = 2.0;

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
        container.classList.add('ready'); // Fade in canvas

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
        const dist = size / (2 * Math.tan(Math.PI * 45 / 360)) * 0.6; 
        
        camera.position.set(dist, dist * 0.4, dist * 0.8); 
        camera.lookAt(0, 0, 0);
        
        controls.minDistance = size * 0.2; 
        controls.maxDistance = size * 5;

        // SMART RENDER LOOP (Pauses when off-screen)
        function animate() {
            requestAnimationFrame(animate);
            // If not visible, skip heavy lifting
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

    window.addEventListener('resize', () => {
        if(!container.isConnected) return; 
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

init();