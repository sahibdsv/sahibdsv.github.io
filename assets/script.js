/* assets/script.js */

let db = [], quotesDb = [], isSearchActive = false;
let lastScrollY = 0;

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
        
        // Remove transitions after initial load
        requestAnimationFrame(() => {
            setTimeout(() => {
                document.body.classList.remove('no-transition');
                document.getElementById('main-header').classList.remove('no-transition');
            }, 50);
        });
    }).catch(e => {
        console.error(e);
        document.getElementById('app').innerHTML = `<div style="text-align:center; padding:50px;"><h2>Load Error</h2></div>`;
    });
};

async function fetchData() {
    let config = FALLBACK_CONFIG;
    try {
        const cfgRes = await fetch('assets/config.json');
        if (cfgRes.ok) config = await cfgRes.json();
    } catch (e) {}

    const [main, quotes] = await Promise.all([
        fetchCSV(config.main_sheet), 
        fetchCSV(config.quotes_sheet).catch(()=>[])
    ]);
    return [main, quotes];
}

function fetchCSV(u) { 
    return new Promise((res, rej) => {
        if(typeof Papa === 'undefined') return rej(new Error("PapaParse missing"));
        Papa.parse(u, { download: true, header: true, skipEmptyLines: true, complete: (r) => res(r.data), error: (e) => rej(e) });
    });
}

function initApp() {
    buildNav(); handleRouting();
    window.addEventListener('hashchange', handleRouting);
    
    // Header Scroll Logic
    window.addEventListener('scroll', handleHeaderScroll);

    // Global Click Handler
    document.getElementById('app').addEventListener('click', (e) => {
        const block = e.target.closest('.clickable-block');
        if(block && !e.target.classList.contains('chip')) {
            const link = block.getAttribute('data-link'), target = block.getAttribute('data-target');
            if(link) { 
                if(target === '_blank') window.open(link, '_blank'); 
                else { window.location.href = link; if(isSearchActive) closeSearch(); } 
            }
        }
        if(e.target.classList.contains('chip')) {
             e.stopPropagation();
             const tag = e.target.getAttribute('data-tag');
             if(tag) window.location.hash = 'Filter:' + tag;
        }
    });
}

// HEADER SCROLL LOGIC
function handleHeaderScroll() {
    const st = window.scrollY;
    const body = document.body;
    
    if (st > 50 && st > lastScrollY) {
        // Scroll Down -> Collapse
        body.classList.add('scrolled-down');
    } else if (st < lastScrollY) {
        // Scroll Up -> Reveal
        body.classList.remove('scrolled-down');
    }
    lastScrollY = st;
}

function handleRouting() { 
    if(isSearchActive) return; 
    window.scrollTo(0, 0); 
    let h = window.location.hash.substring(1) || 'Home'; 
    
    // Header State Reset
    document.body.classList.remove('scrolled-down'); 

    if(h === 'Index') { renderIndex(); return; }
    if(h === 'Timeline') { renderTimeline(); return; }
    
    const top = h.split('/')[0]; 
    
    // Active State for Main Nav
    document.querySelectorAll('#primary-nav .nav-link').forEach(a => { 
        const href = a.getAttribute('href'); 
        if(href) a.classList.toggle('active', href.replace('#', '') === top); 
    }); 
    
    buildSubNav(top); 
    
    if(h.startsWith('Filter:')) { renderFiltered(decodeURIComponent(h.split(':')[1])); } 
    else { renderPage(h); }
}

function buildNav() { 
    const n = document.getElementById('primary-nav'); n.innerHTML = ''; 
    const p = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer').map(r => r.Page.split('/')[0]).filter(x => x))].sort(); 
    p.forEach(x => { if(x === 'Home') return; n.innerHTML += `<a href="#${x}" class="nav-link fill-anim" onclick="closeSearch()">${x}</a>`; }); 
}

function buildSubNav(top) {
    const n = document.getElementById('sub-nav'); n.innerHTML = '';
    
    const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/').slice(0, 2).join('/')))].sort();
    
    if(subs.length === 0) {
        n.classList.add('empty');
        buildTertiaryNav(''); // Clear tertiary
        return;
    }
    
    n.classList.remove('empty');
    subs.forEach(x => { 
        const name = x.split('/')[1];
        const active = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`); 
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="closeSearch()">${name}</a>`; 
    });
    
    // Trigger Tertiary Build based on active sub
    const activeSub = subs.find(x => window.location.hash.startsWith(`#${x}`));
    buildTertiaryNav(activeSub);
}

function buildTertiaryNav(activeSub) {
    const n = document.getElementById('tertiary-nav'); n.innerHTML = '';
    if(!activeSub) { n.classList.add('empty'); return; }

    const terts = [...new Set(db.filter(r => r.Page && r.Page.startsWith(activeSub + '/')).map(r => r.Page.split('/').slice(0, 3).join('/')))].sort();

    if(terts.length === 0) { n.classList.add('empty'); return; }
    
    n.classList.remove('empty');
    terts.forEach(x => {
        const name = x.split('/')[2];
        const active = window.location.hash === `#${x}`;
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="closeSearch()">${name}</a>`;
    });
}

function renderPage(p) { 
    if(p === 'Home') { renderHome(); return; } 
    const ex = db.filter(r => r.Page === p); 
    const app = document.getElementById('app'); app.innerHTML = ''; 
    
    const isMainPage = !p.includes('/');
    if(ex.length > 0) renderRows(ex, null, true, false);
    
    // Show Children Summaries for main pages
    if(isMainPage) {
        const children = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
        const overview = children.map(c => db.find(r => r.Page === c)).filter(r => r);
        if(overview.length > 0) renderRows(overview, null, true, true);
    }
}

function renderHome() { 
    const app = document.getElementById('app'); app.innerHTML = '';
    
    // 1. Hero Content
    const hr = db.filter(r => r.Page === 'Home');
    renderRows(hr, null, true); 
    
    // 2. Recent Items logic with Priority for "Featured"
    let allItems = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer');
    
    // Separate Featured
    const featured = allItems.filter(r => r.Tags && r.Tags.toLowerCase().includes('featured'));
    const others = allItems.filter(r => !r.Tags || !r.Tags.toLowerCase().includes('featured'));
    
    // Sort Others by Date
    others.sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0));
    
    // Combine: Featured First, then Recent Others
    const displayList = [...featured, ...others.slice(0, 6)];
    
    if(displayList.length > 0) renderRows(displayList, "Featured & Recent", true); 
}

function renderTimeline() {
    // UI Reset
    document.body.classList.remove('scrolled-down');
    document.querySelectorAll('#primary-nav .nav-link').forEach(a => a.classList.remove('active'));
    document.getElementById('sub-nav').classList.add('empty');
    document.getElementById('tertiary-nav').classList.add('empty');

    const app = document.getElementById('app');
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Timeline</h1></div><div class="timeline-container section"></div>';
    
    const container = app.querySelector('.timeline-container');
    
    // Group by Month Year
    const groups = {};
    const validItems = db.filter(r => r.Timestamp && r.Page !== 'Home');
    
    validItems.forEach(r => {
        const d = new Date(r.Timestamp);
        const key = `${d.getFullYear()}-${d.getMonth()}`; // Sortable Key
        const labelMonth = d.toLocaleString('default', { month: 'long' });
        const labelYear = d.getFullYear();
        
        if(!groups[key]) groups[key] = { m: labelMonth, y: labelYear, items: [] };
        groups[key].items.push(r);
    });
    
    // Sort Groups Reverse Chronological
    const keys = Object.keys(groups).sort((a,b) => {
        const [y1, m1] = a.split('-');
        const [y2, m2] = b.split('-');
        return new Date(y2, m2) - new Date(y1, m1);
    });
    
    keys.forEach(k => {
        const g = groups[k];
        // Sort items Alphabetically
        g.items.sort((a,b) => a.Title.localeCompare(b.Title));
        
        const row = document.createElement('div');
        row.className = 'timeline-month-row';
        
        // Render Cards
        // We reuse the grid card logic but force it into a string
        let cardsHtml = '';
        g.items.forEach(item => {
            cardsHtml += createCardHtml(item);
        });
        
        row.innerHTML = `
            <div class="timeline-date-col">
                <div class="timeline-year">${g.y}</div>
                <div class="timeline-month">${g.m}</div>
            </div>
            <div class="timeline-scroll-wrapper">
                <div class="timeline-cards-col" onscroll="checkScrollFade(this)">
                    ${cardsHtml}
                </div>
            </div>
        `;
        container.appendChild(row);
    });
}

// Fade Logic for Horizontal Scroll
function checkScrollFade(el) {
    const parent = el.parentElement;
    const isAtEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 5;
    if(isAtEnd) parent.classList.add('scrolled-end');
    else parent.classList.remove('scrolled-end');
}

function renderIndex() {
    document.body.classList.remove('scrolled-down');
    document.querySelectorAll('#primary-nav .nav-link').forEach(a => a.classList.remove('active'));
    document.getElementById('sub-nav').classList.add('empty');
    document.getElementById('tertiary-nav').classList.add('empty');

    const app = document.getElementById('app'); 
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Index</h1></div><div class="section index-list"></div>';
    
    const list = app.querySelector('.index-list');
    
    // Get all pages and sort Alphabetically
    const pages = [...new Set(db.map(r => r.Page).filter(p => p && p !== 'Home' && p !== 'Footer'))].sort();
    
    // Group by Top Category
    const groups = {};
    pages.forEach(p => {
        const parts = p.split('/');
        const cat = parts[0];
        if(!groups[cat]) groups[cat] = [];
        groups[cat].push({ page: p, parts: parts });
    });
    
    for(const [cat, items] of Object.entries(groups)) {
        let catClass = `cat-${cat.toLowerCase()}`;
        let html = `<div class="index-group ${catClass}"><h3>${cat}</h3>`;
        
        items.forEach(item => {
            const depth = item.parts.length - 1; // 0=Top(hidden), 1=Sub, 2=Tertiary
            if(depth === 0) return; // Skip main cat headers usually
            
            const row = db.find(r => r.Page === item.page);
            const title = row ? row.Title : item.parts[depth];
            
            // Indentation class
            const levelClass = depth === 2 ? 'level-1' : (depth === 3 ? 'level-2' : '');
            
            html += `<a href="#${item.page}" class="index-link fill-anim ${levelClass}">${title}</a>`;
        });
        html += `</div>`;
        list.innerHTML += html;
    }
}

// Helper: Generate Card HTML String manually for non-grid contexts
function createCardHtml(r) {
    const link = r.LinkURL || `#${r.Page}`;
    const target = link.startsWith('#') ? '' : '_blank';
    let media = '';
    
    if (r.Media) {
        let thumb = r.Media;
        if(thumb.includes('youtube') || thumb.includes('youtu.be')) {
            let v = thumb.split('v=')[1] || thumb.split('/').pop();
            thumb = `https://img.youtube.com/vi/${v}/mqdefault.jpg`;
        }
        media = `<div class="row-media"><img src="${thumb}" loading="lazy"></div>`;
    } else {
        media = `<div class="row-media placeholder"><span>${r.Title}</span></div>`;
    }
    
    let tagsHtml = '';
    if(r.Tags) {
        tagsHtml = '<div class="meta-row">';
        r.Tags.split(',').forEach(t => tagsHtml += `<span class="chip" data-tag="${t.trim()}">${t.trim()}</span>`);
        tagsHtml += '</div>';
    }

    return `<div class="layout-grid clickable-block" data-link="${link}" data-target="${target}">
        ${media}
        <h3 class="fill-anim">${r.Title}</h3>
        <p>${safeHTML(r.Content ? r.Content.substring(0, 100) + '...' : '')}</p>
        ${tagsHtml}
    </div>`;
}

function renderRows(rows, title, append, forceGrid) {
    const app = document.getElementById('app');
    if(!append) app.innerHTML = title ? `<h2>${title}</h2>` : '';
    
    let gc = app.querySelector('.grid-container');
    if(!gc) {
        gc = document.createElement('div'); gc.className = 'grid-container section'; app.appendChild(gc);
    }
    
    rows.forEach(r => {
        gc.innerHTML += createCardHtml(r);
    });
}

function renderFooter() { 
    const fd = document.getElementById('footer-links');
    fd.innerHTML = `
        <a href="#Index" class="fill-anim">Index</a>
        <a href="#Timeline" class="fill-anim">Timeline</a>
        <a href="mailto:sahibdsv+site@gmail.com" class="fill-anim">Contact</a>
        <a href="https://sahib.goatcounter.com" target="_blank" class="fill-anim">Analytics</a>
    `;
    
    // GitHub Stats
    const r = "sahibdsv/sahibdsv.github.io"; 
    fetch(`https://api.github.com/repos/${r}`).then(res => res.json()).then(d => { 
        if(d.pushed_at) {
             const date = new Date(d.pushed_at).toLocaleDateString();
             document.getElementById('version-tag').innerHTML = `Last updated ${date}`;
        } 
    }).catch(()=>{});
}

// Search & Utils
function toggleSearch() { 
    const h = document.getElementById('main-header');
    h.classList.toggle('search-mode');
    const overlay = document.getElementById('search-overlay');
    if(h.classList.contains('search-mode')) {
        document.getElementById('search-input').focus();
    } else {
        document.getElementById('search-input').value = '';
        isSearchActive = false;
        handleRouting(); // Reset view
    }
}
function handleSearch(q) {
    if(!q) return; isSearchActive = true;
    const t = q.toLowerCase();
    const res = db.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t)));
    renderRows(res, null, false, true);
}
function resetToHome() { window.location.hash = ''; }
function closeSearch() { document.getElementById('main-header').classList.remove('search-mode'); isSearchActive = false; }
function safeHTML(t) { return DOMPurify.sanitize(t); }

init();