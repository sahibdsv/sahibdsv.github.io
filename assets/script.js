/* assets/script.js */

let db = [], quotesDb = [], isSearchActive = false;
let lastScrollY = 0;

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
        
        requestAnimationFrame(() => {
            setTimeout(() => {
                document.body.classList.remove('no-transition');
                document.getElementById('main-header').classList.remove('no-transition');
            }, 50);
        });
    }).catch(e => {
        console.error(e);
        document.getElementById('app').innerHTML = `<div style="text-align:center; padding:50px; color:#666;">Unable to load content.</div>`;
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
            error: (e) => rej(e) 
        });
    });
}

function initApp() {
    buildNav(); 
    handleRouting();
    window.addEventListener('hashchange', handleRouting);
    
    // SCROLL BEHAVIOR: Collapse Row 1 on Scroll Down, Show on Scroll Up
    window.addEventListener('scroll', () => { 
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY;
        
        if (currentY > 50 && delta > 0) {
            document.body.classList.add('scroll-down');
        } else if (delta < 0) {
            document.body.classList.remove('scroll-down');
        }
        
        lastScrollY = currentY;
    });

    document.addEventListener('click', (e) => {
        const overlay = document.getElementById('search-overlay');
        const wrapper = document.getElementById('search-wrapper');
        if (overlay.classList.contains('active') && !wrapper.contains(e.target)) {
            closeSearch();
        }
    });
    
    // ... existing event listeners (refresh-btn, zoomable, chip, etc) ...
    document.getElementById('app').addEventListener('click', (e) => {
        if(e.target.closest('.refresh-btn')) { 
            /* Quote logic same as before */
            const quoteContainer = e.target.closest('.layout-quote');
            if(quoteContainer && !quoteContainer.classList.contains('loading')) {
                quoteContainer.classList.add('loading');
                setTimeout(() => { renderQuoteCard(quoteContainer); quoteContainer.classList.remove('loading'); }, 600); 
            }
            e.stopPropagation(); return; 
        }
        if(e.target.classList.contains('zoomable')) { 
            document.getElementById('lightbox-img').src = e.target.src; 
            document.getElementById('lightbox').classList.add('active'); 
            e.stopPropagation(); return; 
        }
        if(e.target.classList.contains('chip')) { 
            e.stopPropagation(); closeSearch(); 
            const t = e.target.getAttribute('data-tag');
            const d = e.target.getAttribute('data-date');
            window.location.hash = d ? 'Filter:'+d : 'Filter:'+t;
            return; 
        }
        const block = e.target.closest('.clickable-block');
        if(block && !e.target.classList.contains('chip')) {
            const link = block.getAttribute('data-link'), target = block.getAttribute('data-target');
            if(link) { 
                if(target === '_blank') window.open(link, '_blank'); 
                else { window.location.href = link; closeSearch(); } 
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
    const t = q.toLowerCase();
    const res = db.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t))); 
    renderRows(res, `Search results for "${safeHTML(q)}"`, false, true); 
}

function buildNav() { 
    const n = document.getElementById('primary-nav'); if(!n) return; n.innerHTML = ''; 
    const p = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer').map(r => r.Page.split('/')[0]).filter(x => x))].sort(); 
    p.forEach(x => { if(x === 'Home') return; n.innerHTML += `<a href="#${x}" class="nav-link fill-anim" onclick="closeSearch()">${safeHTML(x)}</a>`; }); 
}

// Logic for Sub (Row 3) and Tertiary (Row 4)
function updateNavs(top, sub) {
    const navSub = document.getElementById('sub-nav');
    const navTert = document.getElementById('tertiary-nav');
    if(!navSub || !navTert) return;

    // Reset
    navSub.classList.remove('visible'); navSub.innerHTML = '';
    navTert.classList.remove('visible'); navTert.innerHTML = '';
    
    // Calc Body Padding based on visible rows
    const basePad = 100; // Approx Row 1 + 2 + gap
    let extraPad = 0;

    if (top && top !== 'Home' && top !== 'Index' && !top.startsWith('Filter')) {
        // BUILD SUB NAV
        const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/')[1]))].sort();
        
        if (subs.length > 0) {
            subs.forEach(x => {
                const path = `${top}/${x}`;
                const active = window.location.hash.includes(path); // Simple check
                navSub.innerHTML += `<a href="#${path}" class="fill-anim ${active?'active':''}" onclick="closeSearch()">${safeHTML(x)}</a>`;
            });
            navSub.classList.add('visible');
            extraPad += 32; // var(--nav-row-h)

            // BUILD TERTIARY NAV
            if (sub) {
                // Look for pages starting with Top/Sub/
                const prefix = `${top}/${sub}/`;
                const terts = [...new Set(db.filter(r => r.Page && r.Page.startsWith(prefix)).map(r => r.Page.split('/')[2]))].sort();
                
                if (terts.length > 0) {
                    terts.forEach(x => {
                        const path = `${prefix}${x}`;
                        const active = window.location.hash === `#${path}`;
                        navTert.innerHTML += `<a href="#${path}" class="fill-anim ${active?'active':''}" onclick="closeSearch()">${safeHTML(x)}</a>`;
                    });
                    navTert.classList.add('visible');
                    extraPad += 32;
                }
            }
        }
    }

    document.body.style.paddingTop = `calc(var(--header-top-h) + var(--header-main-h) + ${extraPad}px + 10px)`;
    
    // Center active elements
    setTimeout(() => {
        centerNav(navSub);
        centerNav(navTert);
    }, 100);
}

function centerNav(nav) {
    if(!nav) return;
    const active = nav.querySelector('.active');
    if(active) {
        const target = active.offsetLeft + (active.offsetWidth / 2) - (nav.clientWidth / 2);
        nav.scrollTo({ left: target, behavior: 'smooth' });
    }
}

function handleRouting() { 
    if(isSearchActive) return; 
    window.scrollTo(0, 0); 
    
    let h = window.location.hash.substring(1) || 'Home'; 
    if(h === 'Index') { renderIndex(); updateNavs(null, null); return; }
    
    // Active State for Main Nav
    const parts = h.split('/');
    const top = parts[0];
    const sub = parts.length > 1 ? parts[1] : null;

    document.querySelectorAll('#primary-nav .nav-link').forEach(a => { 
        const href = a.getAttribute('href'); 
        if(href) a.classList.toggle('active', href.replace('#', '') === top); 
    }); 

    updateNavs(top, sub);
    
    if(h.startsWith('Filter:')) { renderFiltered(decodeURIComponent(h.split(':')[1])); } 
    else { renderPage(h); }
}

function renderIndex() {
    const app = document.getElementById('app'); 
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Index</h1></div><div class="section index-list"></div>';
    
    const list = app.querySelector('.index-list');
    
    // Sort Alphabetically
    const pages = [...new Set(db.map(r => r.Page).filter(p => p && p !== 'Home' && p !== 'Footer'))].sort();
    
    const groups = {};
    pages.forEach(p => {
        const cat = p.split('/')[0];
        if(!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
    });
    
    for(const [cat, items] of Object.entries(groups)) {
        let catClass = '';
        if(cat.toLowerCase().includes('project')) catClass = 'cat-projects';
        else if(cat.toLowerCase().includes('prof')) catClass = 'cat-professional';
        else if(cat.toLowerCase().includes('person')) catClass = 'cat-personal';

        let html = `<div class="index-group ${catClass}"><h3>${cat}</h3>`;
        
        items.forEach(p => {
            const row = db.find(r => r.Page === p);
            const date = row && row.Timestamp ? formatDate(row.Timestamp) : '';
            
            // Check Hierarchy Depth
            const parts = p.split('/');
            const depth = parts.length - 1; // 1 = Top/Sub, 2 = Top/Sub/Tert
            const name = parts.pop();
            const indentClass = depth >= 2 ? 'indent-1' : '';

            html += `<a href="#${p}" class="index-link fill-anim ${indentClass}">${name} ${date ? `<span>${date}</span>` : ''}</a>`;
        });
        html += `</div>`;
        list.innerHTML += html;
    }
}

// ... Rest of the functions (renderHome, renderRows, renderPage, safeHTML, processText, etc) remain unchanged ...
// Including them here for completeness or assuming they persist in the file.
// For brevity in the output, I assume you will retain the existing helper functions below.

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
        app.innerHTML = `<div class="layout-404"><h1>404</h1><h2>Data Not Found</h2><p>This page doesn't exist yet.</p><a href="#" class="btn-primary" onclick="resetToHome()">Return to Base</a></div>`;
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
    return db.some(r => r.Page && r.Page.startsWith(p + '/'));
}

function renderHome() { 
    const hr = db.filter(r => r.Page === 'Home');
    const app = document.getElementById('app'); app.innerHTML = ''; 
    renderRows(hr, null, true); 
    const recents = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer').sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0)).slice(0, 6);
    if(recents.length > 0) { renderRows(recents, "Recent Activity", true); } 
}

function renderRows(rows, title, append, forceGrid, isArticleMode = false) {
    const app = document.getElementById('app'); if(!app) return; 
    rows.sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0));
    if(!append) { app.innerHTML = title ? `<h2 class="fill-anim" style="text-align:center;margin-bottom:20px;font-weight:400;color:#888;">${title}</h2>` : ''; } 
    else if(title) { app.innerHTML += `<h2 class="fill-anim" style="text-align:center;margin-bottom:20px;font-weight:400;color:#888;">${title}</h2>`; }

    if(rows.length === 0 && !append) { app.innerHTML += `<div class="layout-404"><h2>Nothing Found</h2></div>`; return; }
    
    let gc = app.querySelector('.grid-container');
    if(append || !gc) { gc = document.createElement('div'); gc.className = 'grid-container section'; app.appendChild(gc); }
    
    rows.forEach(r => {
        if(!r.Page || r.Page === 'Footer') return; 
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

        if(!forceGrid && isArticleMode && (!r.SectionType || r.SectionType === 'card')) {
             const d = document.createElement('div'); d.className = 'section layout-text';
             if(modelMatch || r.Media) mediaHtml = mediaHtml.replace('row-media', 'row-media article-mode');
             else mediaHtml = ''; 

             let metaHtml = '<div class="article-meta-row"><a href="#Personal/About" class="author-link fill-anim">SAHIB VIRDEE</a>';
             if(r.LinkURL) { metaHtml += `<a href="${r.LinkURL}" target="_blank" class="article-link-btn"><svg viewBox="0 0 24 24" style="width:12px;height:12px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`; }
             metaHtml += '<div class="article-tags">';
             if(r.Timestamp) { const dateVal = formatDate(r.Timestamp); metaHtml += `<span class="chip date" data-date="${dateVal}">${dateVal}</span>`; }
             if(r.Tags) { r.Tags.split(',').forEach(t => metaHtml += `<span class="chip" data-tag="${t.trim()}">${safeHTML(t.trim())}</span>`); }
             metaHtml += '</div></div>';

             d.innerHTML = `${mediaHtml}${safeHTML(r.Title) ? `<h2 class="fill-anim">${safeHTML(r.Title)}</h2>` : ''}${metaHtml}<p>${contentHtml}</p>`;
             app.appendChild(d); return;
        }

        if(!forceGrid) {
            if(r.SectionType === 'quote') { const d = document.createElement('div'); d.className = 'layout-quote section'; renderQuoteCard(d); app.appendChild(d); return; }
            if(r.SectionType === 'hero') {
                const d = document.createElement('div'); d.className = 'section layout-hero';
                let dateHtml = r.Timestamp ? `<div class="hero-meta"><span class="chip date" onclick="event.stopPropagation(); window.location.hash='Filter:${formatDate(r.Timestamp)}'">${formatDate(r.Timestamp)}</span></div>` : '';
                d.innerHTML = `<h1 class="fill-anim">${safeHTML(r.Title)}</h1>${dateHtml}<p>${processText(r.Content)}</p>`;
                app.appendChild(d); return;
            }
            if(r.SectionType === 'text') {
                 const d = document.createElement('div'); d.className = 'section layout-text';
                 d.innerHTML = `${safeHTML(r.Title) ? `<h2 class="fill-anim">${safeHTML(r.Title)}</h2>` : ''}<p>${processText(r.Content)}</p>`;
                 app.appendChild(d); return;
            }
        }

        const link = r.LinkURL || `#${r.Page}`;
        const target = link.startsWith('#') ? '' : '_blank';
        let mh = '';
        if(r.Timestamp || r.Tags) {
             mh = `<div class="meta-row">`;
             if(r.Timestamp) mh += `<span class="chip date" data-date="${formatDate(r.Timestamp)}">${formatDate(r.Timestamp)}</span>`; 
             if(r.Tags) r.Tags.split(',').forEach(t => mh += `<span class="chip" data-tag="${t.trim()}">${safeHTML(t.trim())}</span>`); 
             mh += `</div>`;
        }

        const d = document.createElement('div'); 
        d.className = `layout-grid clickable-block ${catClass} ${hasPlaceholder ? 'has-placeholder' : ''}`;
        d.setAttribute('data-link', link); d.setAttribute('data-target', target);
        d.innerHTML = `${mediaHtml}<h3 class="fill-anim">${safeHTML(r.Title)}</h3><p>${contentHtml}</p>${mh}`;
        gc.appendChild(d);
    });
    if(window.MathJax && window.MathJax.typeset) window.MathJax.typeset();
    setTimeout(init3DViewers, 500);
}

// ... existing helper functions (renderQuoteCard, renderFooter, fetchGitHubStats, getThumbnail, processText, formatDate, safeHTML, init3DViewers, loadModel) ...
// Copy them from the original file to complete the script.
// Ensure renderQuoteCard, processText, safeHTML, formatDate, getThumbnail, fetchGitHubStats, renderFooter and init3DViewers are present.

function safeHTML(html) {
    if(typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height'] });
    } return html; 
}
function processText(t) { 
    if(!t) return ''; 
    let clean = safeHTML(t);
    clean = clean.replace(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/gi, (m, u, c) => `<div class="embed-wrapper stl" data-src="${u.trim()}" ${c?`data-color="${c.trim()}"`:''}></div>`);
    clean = clean.replace(/\[\s*(https?:\/\/[^\]]+)\s*\]/gi, (m, c) => {
        const urls = c.split(',').map(u => u.trim());
        if (!urls.every(u => u.toLowerCase().startsWith('http'))) return m; 
        const imgs = urls.map(u => `<img src="${u}" class="inline-img zoomable" loading="lazy" alt="Gallery Image">`).join('');
        return `<div class="inline-gallery">${imgs}</div>`;
    });
    clean = clean.replace(/\[\[(.*?)\]\]/g, '<a href="#$1" class="wiki-link fill-anim">$1</a>');
    clean = clean.replace(/\{\{MAP: (.*?)\}\}/g, '<div class="embed-wrapper map"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{DOC: (.*?)\}\}/g, '<div class="embed-wrapper doc"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{YOUTUBE: (.*?)\}\}/g, '<div class="embed-wrapper video"><iframe src="$1" allowfullscreen></iframe></div>');
    clean = clean.replace(/\{\{EMBED: (.*?)\}\}/g, '<div class="embed-wrapper"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/<a /g, '<a class="fill-anim" '); 
    return clean; 
}
function formatDate(s) {
    if(!s) return '';
    if(s.length === 8 && !isNaN(s)) {
        const y = s.substring(0, 4), m = s.substring(4, 6), d = s.substring(6, 8);
        return `${new Date(`${y}-${m}-${d}`).toLocaleString('default', { month: 'short' }).toUpperCase()} ${y}`;
    }
    const d = new Date(s); return isNaN(d.getTime()) ? s : `${d.toLocaleString('default', { month: 'short' }).toUpperCase()} ${d.getFullYear()}`;
}
function getThumbnail(u) { if(!u) return null; if(u.includes('youtube.com')||u.includes('youtu.be')) { let v = u.split('v=')[1]; if(v&&v.includes('&')) v=v.split('&')[0]; if(!v&&u.includes('youtu.be')) v=u.split('/').pop(); return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; } if(u.endsWith('.mp4')) return null; return u; }

function renderQuoteCard(c) {
    if(quotesDb.length === 0) { c.innerHTML = "Quote sheet empty."; return; }
    const r = quotesDb[Math.floor(Math.random() * quotesDb.length)];
    let auth = r.Author || 'Unknown'; 
    if(r.Source && r.Source.startsWith('http')) auth = `<a href="${r.Source}" target="_blank" class="fill-anim">${safeHTML(auth)}</a>`; 
    else if(r.Source) auth += ` • ${safeHTML(r.Source)}`;
    const text = safeHTML(r.Quote.trim().replace(/^"|"$/g, ''));
    let sizeClass = text.length > 230 ? 'xxl' : text.length > 150 ? 'xl' : text.length > 100 ? 'long' : text.length > 50 ? 'medium' : 'short';
    c.innerHTML = `<blockquote class="${sizeClass}">"${text}"</blockquote><div class="quote-footer"><div class="author">— ${auth}</div></div><svg class="refresh-btn" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;
}
function renderFooter() { 
    const fd = document.getElementById('footer-links');
    const fr = db.filter(r => r.Page === 'Footer' || r.Title === 'LinkedIn' || r.Title === 'Contact'); 
    fd.innerHTML = ''; 
    fr.forEach(r => { let link = r.LinkURL; if(r.Title === 'Contact') link = 'mailto:sahibdsv+site@gmail.com'; if(link) fd.innerHTML += `<a href="${link}" target="_blank" class="fill-anim">${safeHTML(r.Title)}</a>`; }); 
    fd.innerHTML += `<a href="#Index" class="fill-anim" onclick="closeSearch()">Index</a><a href="https://sahib.goatcounter.com" target="_blank" class="fill-anim">Analytics</a>`;
}
function fetchGitHubStats() { 
    fetch(`https://api.github.com/repos/sahibdsv/sahibdsv.github.io`).then(res => res.json()).then(d => { 
        if(d.pushed_at) {
            const timeAgo = (d) => { const s = Math.floor((new Date() - d)/1000); if(s>31536000) return Math.floor(s/31536000)+" years ago"; if(s>2592000) return Math.floor(s/2592000)+" months ago"; if(s>86400) return Math.floor(s/86400)+" days ago"; if(s>3600) return Math.floor(s/3600)+" hours ago"; if(s>60) return Math.floor(s/60)+" mins ago"; return "just now"; };
            document.getElementById('version-tag').innerHTML = `<a href="https://github.com/sahibdsv/sahibdsv.github.io/commits" target="_blank" class="fill-anim">Last updated ${timeAgo(new Date(d.pushed_at))}</a>`;
        } 
    }).catch(()=>{}); 
}
function init3DViewers() {
    const containers = document.querySelectorAll('.embed-wrapper.stl:not(.loaded)');
    if(containers.length === 0) return;
    Promise.all([import('three'), import('three/addons/loaders/STLLoader.js'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/controls/OrbitControls.js')])
    .then(([THREE, { STLLoader }, { GLTFLoader }, { OrbitControls }]) => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => { if (entry.isIntersecting) { loadModel(entry.target, THREE, STLLoader, GLTFLoader, OrbitControls); observer.unobserve(entry.target); } });
        }, { rootMargin: "200px" });
        containers.forEach(c => observer.observe(c));
    });
}
function loadModel(container, THREE, STLLoader, GLTFLoader, OrbitControls) {
    container.classList.add('loaded');
    const url = container.getAttribute('data-src'), customColor = container.getAttribute('data-color');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(container.clientWidth, container.clientHeight); renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const k = new THREE.DirectionalLight(0xffffff, 1.2); k.position.set(5, 10, 7); scene.add(k);
    const r = new THREE.DirectionalLight(0xcceeff, 1.0); r.position.set(-5, 5, -5); scene.add(r);
    const f = new THREE.DirectionalLight(0xffeedd, 0.5); f.position.set(-5, 0, 5); scene.add(f);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 2.0;
    controls.addEventListener('start', () => controls.autoRotate = false);
    const onLoad = (object) => {
        container.classList.add('ready');
        const box = new THREE.Box3().setFromObject(object); const center = new THREE.Vector3(); box.getCenter(center);
        object.position.sub(center); scene.add(object);
        if (customColor) object.traverse((child) => { if (child.isMesh) child.material = new THREE.MeshPhongMaterial({ color: customColor, specular: 0x111111, shininess: 100 }); });
        const size = box.getSize(new THREE.Vector3()).length(); const dist = size / (2 * Math.tan(Math.PI * 45 / 360)) * 0.6;
        camera.position.set(dist, dist * 0.4, dist * 0.8); camera.lookAt(0, 0, 0); controls.minDistance = size * 0.2; controls.maxDistance = size * 5;
        function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); } animate();
    };
    if (url.toLowerCase().endsWith('glb') || url.toLowerCase().endsWith('gltf')) { const loader = new GLTFLoader(); loader.load(url, (gltf) => onLoad(gltf.scene)); } 
    else { const loader = new STLLoader(); loader.load(url, (g) => { onLoad(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: customColor || 0xaaaaaa, specular: 0x111111, shininess: 200 }))); }); }
}

init();