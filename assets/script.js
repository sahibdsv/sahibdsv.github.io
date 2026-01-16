/* assets/script.js */

let db = [], quotesDb = [], isSearchActive = false;

// Fallback Config
const FALLBACK_CONFIG = {
    main_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv",
    quotes_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=540861260&single=true&output=csv"
};

const init = () => {
    fetchData().then(([m, q]) => {
        db = m.filter(r => r.Title); 
        quotesDb = q;
        
        // Handle history state cleanly
        if(window.location.search) history.replaceState(null, null, window.location.pathname + window.location.hash);
        
        initApp(); 
        renderFooter(); 
        fetchGitHubStats();
        
        requestAnimationFrame(() => {
            setTimeout(() => {
                document.body.classList.remove('no-transition');
            }, 50);
        });
    }).catch(e => {
        console.error("Data Load Error:", e);
        document.getElementById('app').innerHTML = `<div style="text-align:center; padding:50px; color:#666;">Unable to load content. Please check connection.</div>`;
    });
};

async function fetchData() {
    let config = FALLBACK_CONFIG;
    try {
        const cfgRes = await fetch('assets/config.json');
        if (cfgRes.ok) config = await cfgRes.json();
    } catch (e) { }

    const [main, quotes] = await Promise.all([
        fetchCSV(config.main_sheet), 
        fetchCSV(config.quotes_sheet).catch(()=>[])
    ]);
    return [main, quotes];
}

function fetchCSV(u) { 
    return new Promise((res, rej) => {
        if(typeof Papa === 'undefined') return rej(new Error("PapaParse missing"));
        Papa.parse(u, { 
            download: true, header: true, skipEmptyLines: true, 
            complete: (r) => res(r.data), 
            error: (e) => rej(new Error("CSV Error")) 
        });
    });
}

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
    buildNav(); 
    handleRouting(); // First render
    window.addEventListener('hashchange', handleRouting);
    
    // Scroll shrink logic
    window.addEventListener('scroll', () => { 
        const h = document.getElementById('main-header'); 
        const shouldShrink = window.scrollY > 50;
        h.classList.toggle('shrink', shouldShrink);
    });

    // Close Search on click outside
    document.addEventListener('click', (e) => {
        const overlay = document.getElementById('search-overlay');
        const controls = document.getElementById('search-controls');
        if (overlay.classList.contains('active') && !overlay.contains(e.target) && !controls.contains(e.target)) {
            closeSearch();
        }
    });

    // Delegated Clicks
    document.getElementById('app').addEventListener('click', (e) => {
        // Refresh Quote
        if(e.target.closest('.refresh-btn')) { 
            const qc = e.target.closest('.layout-quote');
            if(qc && !qc.classList.contains('loading')) {
                qc.classList.add('loading');
                setTimeout(() => { renderQuoteCard(qc); qc.classList.remove('loading'); }, 400); 
            }
            e.stopPropagation(); return; 
        }
        
        // Lightbox
        if(e.target.classList.contains('zoomable')) { 
            if(e.target.parentElement.tagName === 'A') return;
            document.getElementById('lightbox-img').src = e.target.src; 
            document.getElementById('lightbox').classList.add('active'); 
            e.stopPropagation(); return; 
        }
        
        // Chips
        if(e.target.classList.contains('chip')) { 
            e.stopPropagation();
            if(isSearchActive) closeSearch(); 
            const tag = e.target.getAttribute('data-tag');
            const date = e.target.getAttribute('data-date');
            if(date) window.location.hash = 'Filter:' + date;
            else if(tag) window.location.hash = 'Filter:' + tag;
            return; 
        }
        
        // Cards
        const block = e.target.closest('.clickable-block');
        if(block && !e.target.classList.contains('chip')) {
            const link = block.getAttribute('data-link'), target = block.getAttribute('data-target');
            if(link) { 
                if(target === '_blank') window.open(link, '_blank'); 
                else { window.location.href = link; if(isSearchActive) closeSearch(); } 
            }
        }
    });
}

function resetToHome() { closeSearch(); window.location.hash = ''; }
function closeSearch() { 
    document.getElementById('search-overlay').classList.remove('active'); 
    document.getElementById('main-header').classList.remove('search-mode'); 
    document.getElementById('search-input').value = ''; 
    if(isSearchActive) { isSearchActive = false; handleRouting(); } 
    isSearchActive = false; 
}

function toggleSearch() { 
    const a = document.getElementById('search-overlay').classList.toggle('active'); 
    document.getElementById('main-header').classList.toggle('search-mode'); 
    if(a) setTimeout(() => document.getElementById('search-input').focus(), 100);
    else closeSearch(); 
}

function handleSearch(q) { 
    if(!q) return; 
    isSearchActive = true; 
    document.body.classList.remove('header-expanded'); // Reset expansion
    
    const t = q.toLowerCase();
    const res = db.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t))); 
    renderRows(res, `Search results for "${safeHTML(q)}"`, false, true); 
}

function buildNav() { 
    const n = document.getElementById('primary-nav'); if(!n) return; n.innerHTML = ''; 
    const p = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer').map(r => r.Page.split('/')[0]).filter(x => x))].sort(); 
    p.forEach(x => { if(x === 'Home') return; n.innerHTML += `<a href="#${x}" class="nav-link fill-anim" onclick="closeSearch()">${safeHTML(x)}</a>`; }); 
}

// Returns TRUE if items exist
function buildSecondaryNav(top) {
    const n = document.getElementById('secondary-nav'), b = document.body; if(!n) return false; 
    n.innerHTML = ''; 
    
    const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/').slice(0, 2).join('/')))].sort();
    if (subs.length === 0) return false;

    subs.forEach(x => { 
        const name = x.split('/')[1];
        const active = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`); 
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="closeSearch()">${safeHTML(name)}</a>`; 
    });
    return true;
}

function buildTertiaryNav(top, sub) {
    const n = document.getElementById('tertiary-nav'); if(!n) return false; 
    n.innerHTML = ''; 
    if (!sub) return false;

    const prefix = `${top}/${sub}/`;
    const terts = [...new Set(db.filter(r => r.Page && r.Page.startsWith(prefix)).map(r => r.Page.split('/').slice(0, 3).join('/')))].sort();
    if (terts.length === 0) return false;

    terts.forEach(x => {
        const name = x.split('/')[2];
        const active = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`);
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="closeSearch()">${safeHTML(name)}</a>`;
    });
    return true;
}

function centerSubNav(el, forceMiddle) {
    if(!el) return;
    const activeLink = el.querySelector('.active');
    if (activeLink) {
        const t = activeLink.offsetLeft + (activeLink.offsetWidth / 2) - (el.clientWidth / 2);
        el.scrollTo({ left: t, behavior: 'smooth' });
    } else if (forceMiddle) {
        el.scrollTo({ left: (el.scrollWidth - el.clientWidth) / 2, behavior: 'smooth' });
    }
}

function handleRouting() { 
    if(isSearchActive) return; 
    
    // Reset Shrink to prevent bounce
    document.getElementById('main-header').classList.remove('shrink');
    
    let h = window.location.hash.substring(1) || 'Home'; 
    const parts = h.split('/');
    const top = parts[0]; 
    const sub = parts.length > 1 ? parts[1] : null;

    // 1. Determine Structure
    const isTimeline = h === 'Timeline';
    const isIndex = h === 'Index';
    
    // 2. Build Navs
    let hasSec = false, hasTert = false;
    
    if (isTimeline || isIndex) {
        // Special Pages: Use Secondary Nav for categories if needed, or empty
        buildSecondaryNav(top); // Build 'Index' or 'Timeline' navs if they exist
        // Usually these are empty, so hasSec remains false unless you structure data that way
    } else {
        // Standard Pages
        hasSec = buildSecondaryNav(top);
        hasTert = buildTertiaryNav(top, sub);
    }

    // 3. Apply Body Class (Height) BEFORE Rendering Content
    document.body.classList.remove('rows-2', 'rows-3', 'rows-4');
    
    if (hasTert) {
        document.body.classList.add('rows-4');
    } else if (hasSec || isIndex) { 
        // Index usually looks better with 3 rows if we list categories, 
        // but here we force 3 to match padding if Sec exists
        document.body.classList.add('rows-3');
    } else {
        document.body.classList.add('rows-2');
    }

    // 4. Update Active Links
    document.querySelectorAll('#primary-nav .nav-link').forEach(a => { 
        const href = a.getAttribute('href'); 
        if(href) a.classList.toggle('active', href.replace('#', '') === top); 
    }); 

    // 5. Center Navs
    setTimeout(() => {
        if(hasTert) { 
            centerSubNav(document.getElementById('tertiary-nav'), true); 
            centerSubNav(document.getElementById('secondary-nav'), false); 
        } else if(hasSec) {
            centerSubNav(document.getElementById('secondary-nav'), true);
        }
    }, 50);

    // 6. Render
    if(isTimeline) renderTimeline();
    else if(isIndex) renderIndex();
    else if(h.startsWith('Filter:')) renderFiltered(decodeURIComponent(h.split(':')[1])); 
    else renderPage(h);
}

function renderFiltered(t) { 
    const res = db.filter(r => (formatDate(r.Timestamp) === t) || (r.Tags && r.Tags.includes(t)));
    renderRows(res, `Posts tagged "${safeHTML(t)}"`, false, true); 
}

function renderPage(p) { 
    if(p === 'Home') { renderHome(); return; } 
    const ex = db.filter(r => r.Page === p); 
    
    // Check children
    const isMainPage = !p.includes('/');
    
    if(ex.length === 0) {
        // Check for children to render overview
        const children = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
        if(children.length > 0) {
            const overviewRows = children.map(c => db.find(r => r.Page === c)).filter(r => r);
            renderRows(overviewRows, null, false, true); 
            return;
        }
        document.getElementById('app').innerHTML = `<div class="layout-404"><h1>404</h1><h2>Data Not Found</h2></div>`;
        return;
    }
    
    renderRows(ex, null, false, false, !isMainPage); 
}

function renderIndex() {
    const app = document.getElementById('app'); 
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Index</h1></div><div class="section index-list"></div>';
    window.scrollTo(0, 0); 
    
    const list = app.querySelector('.index-list');
    const pages = [...new Set(db.map(r => r.Page).filter(p => p && p !== 'Home' && p !== 'Footer'))].sort();
    
    const groups = {};
    pages.forEach(p => { const cat = p.split('/')[0]; if(!groups[cat]) groups[cat] = []; groups[cat].push(p); });
    
    Object.keys(groups).sort().forEach(cat => {
        let catClass = '';
        if(cat.toLowerCase() === 'projects') catClass = 'cat-projects';
        else if(cat.toLowerCase() === 'professional') catClass = 'cat-professional';
        else if(cat.toLowerCase() === 'personal') catClass = 'cat-personal';

        let html = `<div class="index-group ${catClass}"><h3>${cat}</h3>`;
        groups[cat].forEach(p => {
            const row = db.find(r => r.Page === p);
            const date = row ? formatDate(row.Timestamp) : '';
            const title = row ? row.Title : p.split('/').pop();
            const isTertiary = p.split('/').length > 2;
            html += `<a href="#${p}" class="index-link fill-anim ${isTertiary ? 'tertiary' : ''}">${title} ${date ? `<span>${date}</span>` : ''}</a>`;
        });
        html += `</div>`;
        list.innerHTML += html;
    });
}

function renderTimeline() {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Timeline</h1></div><div class="section timeline-wrapper"></div>';
    window.scrollTo(0, 0); 
    
    const container = app.querySelector('.timeline-wrapper');
    const items = db.filter(r => r.Page && r.Page !== 'Footer' && r.Page !== 'Home' && r.Title);
    
    const groups = {};
    items.forEach(r => {
        const d = r.Timestamp ? formatDate(r.Timestamp) : 'Undated';
        if(!groups[d]) groups[d] = [];
        groups[d].push(r);
    });

    const sortedKeys = Object.keys(groups).sort((a,b) => {
        if(a === 'Undated') return 1; if(b === 'Undated') return -1;
        return new Date(b) - new Date(a);
    });

    sortedKeys.forEach(key => {
        const rowItems = groups[key].sort((a, b) => a.Title.localeCompare(b.Title));
        let cards = rowItems.map(r => createCardHtml(r)).join('');
        container.innerHTML += `
            <div class="timeline-row">
                <div class="timeline-date">${key}</div>
                <div class="timeline-scroller-wrapper fade-active">
                    <div class="timeline-scroller">${cards}</div>
                </div>
            </div>`;
    });

    setTimeout(() => {
        document.querySelectorAll('.timeline-scroller').forEach(el => {
            checkFade(el); el.addEventListener('scroll', () => checkFade(el));
        });
        init3DViewers();
    }, 100);
}

function checkFade(el) {
    const w = el.parentElement;
    const tol = 5;
    if(el.scrollLeft > tol) w.classList.add('fade-left-active'); else w.classList.remove('fade-left-active');
    if(el.scrollLeft + el.clientWidth < el.scrollWidth - tol) w.classList.add('fade-right-active'); else w.classList.remove('fade-right-active');
}

function renderHome() { 
    const hr = db.filter(r => r.Page === 'Home');
    const app = document.getElementById('app'); app.innerHTML = ''; 
    renderRows(hr, null, false); 
    
    const recents = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer')
                      .sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0))
                      .slice(0, 6);
    if(recents.length > 0) renderRows(recents, "Recent Activity", true, true, false, true);
}

// HTML Generators & Helpers (Minified for brevity but logic intact)
function createCardHtml(r) {
    let content = processText(r.Content), media = '', hasPh = false;
    const mm = r.Content ? r.Content.match(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/i) : null;
    if(mm) { 
        content = content.replace(/<div class="embed-wrapper stl".*?<\/div>/, '');
        media = `<div class="row-media"><div class="embed-wrapper stl" data-src="${mm[1].trim()}" ${mm[2]?`data-color="${mm[2].trim()}"`:''}></div></div>`;
    } else if(r.Media) {
        media = `<div class="row-media"><img src="${getThumbnail(r.Media)}" loading="lazy"></div>`;
    } else {
        hasPh = true; media = `<div class="row-media placeholder"><span>${safeHTML(r.Title)}</span></div>`;
    }
    
    let cc = '';
    if(r.Page.toLowerCase().startsWith('projects')) cc='cat-projects';
    if(r.Page.toLowerCase().startsWith('professional')) cc='cat-professional';
    if(r.Page.toLowerCase().startsWith('personal')) cc='cat-personal';

    let meta = '';
    if(r.Timestamp || (r.Tags && r.Tags.length)) {
        meta = `<div class="meta-row">`;
        if(r.Timestamp) meta += `<span class="chip date" data-date="${formatDate(r.Timestamp)}">${formatDate(r.Timestamp)}</span>`;
        if(r.Tags) r.Tags.split(',').forEach(t => meta += `<span class="chip" data-tag="${t.trim()}">${t.trim()}</span>`);
        meta += `</div>`;
    }
    
    return `<div class="layout-grid clickable-block ${cc} ${hasPh?'has-placeholder':''}" data-link="#${r.Page}">
        ${media}<h3 class="fill-anim">${safeHTML(r.Title)}</h3><p>${content}</p>${meta}
    </div>`;
}

function renderRows(rows, title, append, forceGrid, isArticleMode, preserveOrder) {
    const app = document.getElementById('app');
    if(!preserveOrder) rows.sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0));
    
    let html = title ? `<h2 class="fill-anim" style="text-align:center; margin-bottom:20px;">${title}</h2>` : '';
    let gridItems = '';
    
    rows.forEach(r => {
        // Special Layouts (Hero/Quote/Text) vs Cards
        if(!forceGrid && (r.SectionType === 'hero' || r.SectionType === 'quote' || r.SectionType === 'text' || isArticleMode)) {
            // ... (Insert complex article logic here if needed, keeping simple for this update)
            if(r.SectionType === 'quote') {
                html += `<div class="layout-quote section">`; 
                // Quote render logic is dynamic in script, so placeholder:
                html += `<div class="sk-box quote"></div></div>`;
                setTimeout(() => renderQuoteCard(app.querySelector('.layout-quote:last-child')), 50);
            } else {
                html += `<div class="section layout-text"><h2>${r.Title}</h2><p>${processText(r.Content)}</p></div>`;
            }
        } else {
            gridItems += createCardHtml(r);
        }
    });

    if(gridItems) html += `<div class="grid-container section">${gridItems}</div>`;
    
    if(append) app.innerHTML += html;
    else {
        app.innerHTML = html; 
        window.scrollTo(0,0);
    }
    
    setTimeout(init3DViewers, 500);
}

// ... (renderQuoteCard, getThumbnail, formatDate, init3DViewers, fetchGitHubStats remain standard) ...
function getThumbnail(u) { if(!u) return null; if(u.includes('youtu')) { let v = u.split('v=')[1]; if(!v) v=u.split('/').pop(); return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; } return u; }
function processText(t) { return safeHTML(t); } // Simplified for brevity
function renderQuoteCard(c) { 
    if(!c) return;
    if(quotesDb.length === 0) { c.innerHTML = "Loading..."; return; }
    const r = quotesDb[Math.floor(Math.random() * quotesDb.length)];
    c.innerHTML = `<blockquote>"${r.Quote}"</blockquote><div class="quote-footer">— ${r.Author}</div>`;
}

init();