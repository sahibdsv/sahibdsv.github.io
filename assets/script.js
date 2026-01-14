/* assets/script.js */

let db = [], quotesDb = [], isSearchActive = false;
const CACHE_KEY = 'sahib_site_data';
const CACHE_DURATION = 3600000; // 1 Hour in milliseconds

const init = () => {
    loadData().then(([m, q]) => {
        db = m.filter(r => r.Title); 
        quotesDb = q;
        
        if(window.location.search) history.replaceState(null, null, window.location.pathname + window.location.hash);
        
        initApp(); 
        renderFooter(); 
        fetchGitHubStats();
        
        // Unblock transitions once loaded
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
            <p style="color:#666">Please check your internet connection or try again later.</p>
        </div>`;
    });
};

// CACHING LOGIC
async function loadData() {
    // 1. Check Local Storage
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            const age = Date.now() - parsed.timestamp;
            if (age < CACHE_DURATION) {
                console.log("Loading from Cache");
                return [parsed.main, parsed.quotes];
            }
        } catch (e) {
            console.warn("Cache parse failed, fetching fresh data.");
        }
    }

    // 2. Fetch Fresh Data if Cache invalid/missing
    console.log("Fetching from Google Sheets");
    const config = await fetch('assets/config.json').then(res => res.json());
    const [main, quotes] = await Promise.all([
        fetchCSV(config.main_sheet), 
        fetchCSV(config.quotes_sheet).catch(()=>[])
    ]);

    // 3. Save to Cache
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            main: main,
            quotes: quotes
        }));
    } catch (e) { console.warn("Quota exceeded for localStorage"); }

    return [main, quotes];
}

function fetchCSV(u) { 
    return new Promise((res, rej) => Papa.parse(u, { 
        download: true, 
        header: true, 
        skipEmptyLines: true, 
        complete: (r) => res(r.data), 
        error: (e) => rej(e) 
    })); 
}

function initApp() {
    buildNav(); handleRouting();
    window.addEventListener('hashchange', handleRouting);
    window.addEventListener('scroll', () => { 
        const h = document.getElementById('main-header'); 
        if(h) h.classList.toggle('shrink', window.scrollY > 50); 
    });

    // Click Outside to Close Search
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
                
                // Show Skeleton Box
                quoteContainer.innerHTML = `<div class="sk-box quote" style="height:140px; width:100%; margin:0 auto;"></div>`;

                setTimeout(() => {
                    renderQuoteCard(quoteContainer);
                    quoteContainer.classList.remove('loading');
                }, 600); 
            }
            e.stopPropagation(); return; 
        }
        
        if(e.target.classList.contains('zoomable')) { 
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
    document.body.classList.remove('header-expanded');
    document.getElementById('main-header').classList.remove('expanded');

    const t = q.toLowerCase();
    const res = db.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t))); 
    renderRows(res, `Search results for "${DOMPurify.sanitize(q)}"`, false, true); 
}

function buildNav() { 
    const n = document.getElementById('primary-nav'); if(!n) return; n.innerHTML = ''; 
    const p = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer').map(r => r.Page.split('/')[0]).filter(x => x))].sort(); 
    p.forEach(x => { if(x === 'Home') return; n.innerHTML += `<a href="#${x}" class="nav-link fill-anim" onclick="closeSearch()">${DOMPurify.sanitize(x)}</a>`; }); 
}

function buildSubNav(top) {
    const n = document.getElementById('sub-nav'), h = document.getElementById('main-header'), b = document.body; if(!n) return; n.innerHTML = ''; b.setAttribute('data-page', top);
    
    const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/').slice(0, 2).join('/')))].sort();
    
    subs.forEach(x => { 
        const name = x.split('/')[1];
        const active = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`); 
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="closeSearch()">${DOMPurify.sanitize(name)}</a>`; 
    });
}

function handleRouting() { 
    if(isSearchActive) return; 
    window.scrollTo(0, 0); 
    let h = window.location.hash.substring(1) || 'Home'; 
    
    const shouldCollapse = (h === 'Home' || h.startsWith('Filter:'));
    document.body.classList.toggle('header-expanded', !shouldCollapse);
    document.getElementById('main-header').classList.toggle('expanded', !shouldCollapse);
    
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
    renderRows(res, `Posts tagged "${DOMPurify.sanitize(t)}"`); 
}

function renderPage(p) { 
    if(p === 'Home') { renderHome(); return; } 
    const ex = db.filter(r => r.Page === p); 
    const app = document.getElementById('app'); app.innerHTML = ''; 
    
    if(ex.length > 0) { renderRows(ex, null, true); } 
    
    const childrenPages = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
    
    if(childrenPages.length > 0) {
        const overviewRows = childrenPages.map(childPage => db.find(r => r.Page === childPage)).filter(r => r);
        renderRows(overviewRows, null, true, true); 
    } else if (ex.length === 0) {
        renderRows([], "Page Empty");
    }
}

function renderHome() { 
    const hr = db.filter(r => r.Page === 'Home');
    const fr = db.filter(r => r.isFeatured === 'TRUE' && r.Page !== 'Home'); 
    const app = document.getElementById('app'); app.innerHTML = ''; 
    
    renderRows(hr, null, true); 
    if(fr.length > 0) { renderRows(fr, null, true); } 
}

function renderRows(rows, title, append, forceGrid) {
    const app = document.getElementById('app'); if(!app) return; 
    
    rows.sort((a, b) => {
        const da = new Date(a.Timestamp || 0);
        const db = new Date(b.Timestamp || 0);
        return db - da; 
    });

    if(!append) {
        app.innerHTML = title ? `<h2 class="fill-anim" style="display:block; text-align:center; margin-bottom:20px; font-weight:400; font-size:24px; --text-base:#888; --text-hover:#fff;">${title}</h2>` : '';
    }
    if(rows.length === 0 && !append) { app.innerHTML += '<div style="text-align:center; margin-top:50px; color:#666;">Nothing found here.</div>'; return; }
    
    let gc = app.querySelector('.grid-container');
    const hasGridItems = forceGrid || rows.some(r => r.SectionType !== 'quote' && r.SectionType !== 'hero' && r.SectionType !== 'text');
    
    if(hasGridItems && (!gc || !append)) {
        gc = document.createElement('div'); gc.className = 'grid-container section'; app.appendChild(gc);
    }
    
    rows.forEach(r => {
        if(!r.Page || r.Page === 'Footer') return; 
        
        let catClass = '';
        if(r.Page.toLowerCase().startsWith('projects')) catClass = 'cat-projects';
        else if(r.Page.toLowerCase().startsWith('professional')) catClass = 'cat-professional';
        else if(r.Page.toLowerCase().startsWith('personal')) catClass = 'cat-personal';

        if(!forceGrid) {
            if(r.SectionType === 'quote') { 
                const d = document.createElement('div'); d.className = 'layout-quote section'; 
                renderQuoteCard(d); app.appendChild(d); return; 
            }
            if(r.SectionType === 'hero') {
                const d = document.createElement('div'); d.className = 'section layout-hero';
                let dateVal = formatDate(r.Timestamp);
                let dateChip = r.Timestamp ? `<span class="chip date" data-val="${dateVal}" onclick="event.stopPropagation(); window.location.hash='Filter:${dateVal}'">${dateVal}</span>` : `<span class="chip date" style="cursor:default">NO DATE</span>`;
                d.innerHTML = `<h1 class="fill-anim">${DOMPurify.sanitize(r.Title)}</h1><div class="hero-meta">${dateChip}</div><p>${processText(r.Content)}</p>`;
                app.appendChild(d); return;
            }
            if(r.SectionType === 'text') {
                 const d = document.createElement('div'); d.className = 'section layout-text';
                 d.innerHTML = `${r.Title ? `<h2 class="fill-anim">${DOMPurify.sanitize(r.Title)}</h2>` : ''}<p>${processText(r.Content)}</p>`;
                 app.appendChild(d); return;
            }
        }

        const media = r.Media || '', link = r.LinkURL || '', tags = r.Tags ? r.Tags.split(',').map(x => x.trim()) : [];
        let l = link; if(!l) l = `#${r.Page}`; 
        const internal = l.startsWith('#'), target = internal ? '' : '_blank';
        
        const thumb = getThumbnail(media);
        const imgH = thumb ? `<div class="row-media"><img src="${thumb}" loading="lazy"></div>` : '';
        
        let mh = '';
        if(r.Timestamp || tags.length > 0) {
             mh = `<div class="meta-row">`;
             if(r.Timestamp) {
                 let dateVal = formatDate(r.Timestamp);
                 mh += `<span class="chip date" data-date="${dateVal}" data-val="${dateVal}">${dateVal}</span>`; 
             }
             tags.forEach(t => mh += `<span class="chip" data-tag="${t}">${DOMPurify.sanitize(t)}</span>`); 
             mh += `</div>`;
        }

        const d = document.createElement('div'); d.className = `layout-grid clickable-block ${catClass}`;
        d.setAttribute('data-link', l); d.setAttribute('data-target', target);
        
        d.innerHTML = `${imgH}<h3 class="fill-anim">${DOMPurify.sanitize(r.Title)}</h3><p>${processText(r.Content)}</p>${mh}`;
        
        if(gc) gc.appendChild(d);
    });
    if(window.MathJax) MathJax.typeset();
}

function renderQuoteCard(c) {
    if(quotesDb.length === 0) { c.innerHTML = "Quote sheet empty."; return; }
    const r = quotesDb[Math.floor(Math.random() * quotesDb.length)];
    let auth = r.Author || 'Unknown'; 
    if(r.Source && r.Source.startsWith('http')) auth = `<a href="${r.Source}" target="_blank" class="fill-anim">${DOMPurify.sanitize(auth)}</a>`; 
    else if(r.Source) auth += ` • ${DOMPurify.sanitize(r.Source)}`;
    
    // SECURITY: Sanitize & Trim Quotes
    const safeQuote = DOMPurify.sanitize(r.Quote).trim().replace(/^"|"$/g, '');
    
    const len = safeQuote.length;
    let sizeClass = 'short';
    if(len > 250) sizeClass = 'xl';
    else if(len > 150) sizeClass = 'long';
    else if(len > 70) sizeClass = 'medium';
    
    c.innerHTML = `<blockquote class="${sizeClass}">"${safeQuote}"</blockquote>
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
        if(link) fd.innerHTML += `<a href="${link}" target="_blank" class="fill-anim">${DOMPurify.sanitize(r.Title)}</a>`; 
    }); 
}

function fetchGitHubStats() { 
    const r = "sahibdsv/sahibdsv.github.io"; 
    fetch(`https://api.github.com/repos/${r}`).then(res => res.json()).then(d => { 
        if(d.pushed_at) {
            const dateStr = new Date(d.pushed_at).toLocaleDateString();
            document.getElementById('version-tag').innerHTML = `<a href="https://github.com/${r}/commits" target="_blank">Last Updated: ${dateStr}</a>`;
        } 
    }).catch(()=>{}); 
}

function getThumbnail(u) { if(!u) return null; if(u.includes('youtube.com')||u.includes('youtu.be')) { let v = u.split('v=')[1]; if(v&&v.includes('&')) v=v.split('&')[0]; if(!v&&u.includes('youtu.be')) v=u.split('/').pop(); return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; } if(u.endsWith('.mp4')) return null; return u; }

function processText(t) { 
    if(!t) return ''; 
    // Security: Sanitize first
    let clean = DOMPurify.sanitize(t);
    return clean.replace(/\[\[(.*?)\]\]/g, '<a href="#$1" class="wiki-link fill-anim">$1</a>')
            .replace(/<a /g, '<a class="fill-anim" '); 
}

function formatDate(s) {
    if(!s) return '';
    const d = new Date(s);
    if(isNaN(d.getTime())) return s;
    const mo = d.toLocaleString('default', { month: 'short' }).toUpperCase();
    const yr = d.getFullYear();
    return `${mo} ${yr}`;
}

init();