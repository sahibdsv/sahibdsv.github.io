/* assets/script.js */

let db = [], quotesDb = [], isSearchActive = false;

const FALLBACK_CONFIG = {
    main_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv",
    quotes_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=540861260&single=true&output=csv"
};

const init = () => {
    fetchData().then(([m, q]) => {
        db = m.filter(r => r.Title); 
        quotesDb = q;
        if(window.location.search) history.replaceState(null, null, window.location.pathname + window.location.hash);
        initApp(); renderFooter(); fetchGitHubStats();
        requestAnimationFrame(() => { setTimeout(() => { document.body.classList.remove('no-transition'); document.getElementById('main-header').classList.remove('no-transition'); }, 50); });
    }).catch(e => { console.error(e); document.getElementById('app').innerHTML = `<div style="text-align:center; padding:50px;"><h2>Unable to load content</h2><p style="color:#666">Check connection.</p></div>`; });
};

async function fetchData() {
    let config = FALLBACK_CONFIG;
    try { const cfgRes = await fetch('assets/config.json'); if (cfgRes.ok) config = await cfgRes.json(); } catch (e) {}
    const [main, quotes] = await Promise.all([fetchCSV(config.main_sheet), fetchCSV(config.quotes_sheet).catch(()=>[])]);
    return [main, quotes];
}

function fetchCSV(u) { return new Promise((res, rej) => Papa.parse(u, { download: true, header: true, skipEmptyLines: true, complete: (r) => res(r.data), error: (e) => rej(e) })); }
function safeHTML(h) { return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(h) : h; }

function initApp() {
    buildNav(); handleRouting();
    window.addEventListener('hashchange', handleRouting);
    window.addEventListener('scroll', () => { const h = document.getElementById('main-header'); if(h) h.classList.toggle('shrink', window.scrollY > 50); });
    document.addEventListener('click', (e) => {
        const o = document.getElementById('search-overlay'), c = document.getElementById('search-controls');
        if (o.classList.contains('active') && !o.contains(e.target) && !c.contains(e.target)) closeSearch();
    });
    document.getElementById('app').addEventListener('click', (e) => {
        if(e.target.closest('.refresh-btn')) { 
            const qc = e.target.closest('.layout-quote');
            if(qc && !qc.classList.contains('loading')) {
                qc.classList.add('loading'); qc.innerHTML = `<div class="sk-box quote" style="height:130px; width:100%; margin:0 auto;"></div>`;
                setTimeout(() => { renderQuoteCard(qc); qc.classList.remove('loading'); }, 600);
            }
            e.stopPropagation(); return;
        }
        if(e.target.classList.contains('zoomable')) { document.getElementById('lightbox-img').src = e.target.src; document.getElementById('lightbox').classList.add('active'); e.stopPropagation(); return; }
        if(e.target.classList.contains('chip')) { e.stopPropagation(); if(isSearchActive) closeSearch(); const t = e.target.getAttribute('data-tag'), d = e.target.getAttribute('data-date'); if(d) window.location.hash='Filter:'+d; else if(t) window.location.hash='Filter:'+t; return; }
        const blk = e.target.closest('.clickable-block');
        if(blk && !e.target.classList.contains('chip')) { const l = blk.getAttribute('data-link'), t = blk.getAttribute('data-target'); if(l) { if(t === '_blank') window.open(l, '_blank'); else { window.location.href = l; if(isSearchActive) closeSearch(); }}}
    });
}

function resetToHome() { closeSearch(); window.location.hash = ''; }
function closeSearch() { document.getElementById('search-overlay').classList.remove('active'); document.getElementById('main-header').classList.remove('search-mode'); document.getElementById('search-input').value = ''; if(isSearchActive) { isSearchActive = false; handleRouting(); } isSearchActive = false; }
function toggleSearch() { const a = document.getElementById('search-overlay').classList.toggle('active'); document.getElementById('main-header').classList.toggle('search-mode'); if(a) setTimeout(() => document.getElementById('search-input').focus(), 100); else closeSearch(); }
function handleSearch(q) { if(!q) return; isSearchActive = true; document.body.classList.remove('header-expanded'); document.getElementById('main-header').classList.remove('expanded'); const t = q.toLowerCase(), res = db.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t))); renderRows(res, `Search results for "${safeHTML(q)}"`, false, true); }

function buildNav() { const n = document.getElementById('primary-nav'); n.innerHTML = ''; const p = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer').map(r => r.Page.split('/')[0]).filter(x => x))].sort(); p.forEach(x => { if(x === 'Home') return; n.innerHTML += `<a href="#${x}" class="nav-link fill-anim" onclick="closeSearch()">${safeHTML(x)}</a>`; }); }
function buildSubNav(top) { const n = document.getElementById('sub-nav'); n.innerHTML = ''; document.body.setAttribute('data-page', top); const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/').slice(0, 2).join('/')))].sort(); subs.forEach(x => { const name = x.split('/')[1], active = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`); n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="closeSearch()">${safeHTML(name)}</a>`; }); }

function handleRouting() { 
    if(isSearchActive) return; window.scrollTo(0, 0); 
    let h = window.location.hash.substring(1) || 'Home'; 
    const col = (h === 'Home' || h.startsWith('Filter:'));
    document.body.classList.toggle('header-expanded', !col); document.getElementById('main-header').classList.toggle('expanded', !col);
    const top = h.split('/')[0]; document.querySelectorAll('#primary-nav .nav-link').forEach(a => { const hr = a.getAttribute('href'); if(hr) a.classList.toggle('active', hr.replace('#', '') === top); });
    buildSubNav(top);
    if(h.startsWith('Filter:')) { renderFiltered(decodeURIComponent(h.split(':')[1])); } else { renderPage(h); }
}

function renderFiltered(t) { const res = db.filter(r => { const d = formatDate(r.Timestamp); return (d === t) || (r.Tags && r.Tags.includes(t)); }); renderRows(res, `Posts tagged "${safeHTML(t)}"`, false, true); }

function renderPage(p) { 
    if(p === 'Home') { renderHome(); return; } 
    const ex = db.filter(r => r.Page === p); 
    const app = document.getElementById('app'); app.innerHTML = ''; 
    
    // Check if this page has children (Sub-pages)
    const childrenPages = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
    
    if (childrenPages.length > 0) {
        // MAIN PAGE (e.g. Projects) -> Show Hero + Grid of Cards
        if(ex.length > 0) renderRows(ex, null, true, true); // Render Hero
        // Find cover cards for children (first row of each child page)
        const covers = childrenPages.map(child => db.find(r => r.Page === child)).filter(r => r);
        renderRows(covers, null, true, true); // Force Grid
    } else {
        // SUB PAGE (e.g. Projects/Sarit) -> Show Full Article Content (No Cards)
        if (ex.length > 0) {
            // Render rows linearly in Article Mode (forceGrid = false)
            renderRows(ex, null, true, false); 
        } else {
            app.innerHTML = '<div style="text-align:center; margin-top:50px; color:#666;">Page Empty</div>';
        }
    }
}

function renderHome() { 
    const hr = db.filter(r => r.Page === 'Home');
    const fr = db.filter(r => r.isFeatured === 'TRUE' && r.Page !== 'Home'); 
    const app = document.getElementById('app'); app.innerHTML = ''; 
    renderRows(hr, null, true, true); // Home Hero
    if(fr.length > 0) renderRows(fr, null, true, true); // Featured Grid
}

function renderRows(rows, title, append, forceGrid) {
    const app = document.getElementById('app'); if(!app) return; 
    
    // Only sort if we are in Grid Mode (Main Pages). If Article Mode, keep CSV order.
    if(forceGrid) {
        rows.sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0));
    }

    if(!append) app.innerHTML = title ? `<h2 class="fill-anim" style="display:block; text-align:center; margin-bottom:20px; font-weight:400; font-size:24px; --text-base:#888; --text-hover:#fff;">${title}</h2>` : '';
    
    let container;
    
    if (forceGrid) {
        // GRID MODE (Cards)
        container = app.querySelector('.grid-container');
        if(!container || !append) {
            container = document.createElement('div'); container.className = 'grid-container section'; app.appendChild(container);
        }
    } else {
        // ARTICLE MODE (Linear Content)
        container = app.querySelector('.article-container');
        if(!container || !append) {
            container = document.createElement('div'); container.className = 'article-container section'; app.appendChild(container);
        }
    }
    
    rows.forEach(r => {
        if(!r.Page || r.Page === 'Footer') return; 
        
        let catClass = '';
        if(r.Page.toLowerCase().startsWith('projects')) catClass = 'cat-projects';
        else if(r.Page.toLowerCase().startsWith('professional')) catClass = 'cat-professional';
        else if(r.Page.toLowerCase().startsWith('personal')) catClass = 'cat-personal';

        // 1. HERO / QUOTE / TEXT (Render same for both modes mostly)
        if(r.SectionType === 'quote') { 
            const d = document.createElement('div'); d.className = 'layout-quote section'; 
            renderQuoteCard(d); (forceGrid ? app : container).appendChild(d); return; 
        }
        if(r.SectionType === 'hero') {
            const d = document.createElement('div'); d.className = 'section layout-hero';
            let dateHtml = '';
            if(r.Timestamp) {
                let dateVal = formatDate(r.Timestamp);
                dateHtml = `<div class="hero-meta"><span class="chip date" data-val="${dateVal}" onclick="event.stopPropagation(); window.location.hash='Filter:${dateVal}'">${dateVal}</span></div>`;
            }
            d.innerHTML = `<h1 class="fill-anim">${safeHTML(r.Title)}</h1>${dateHtml}<p>${processText(r.Content)}</p>`;
            // Heros usually go to root app or article container depending on context
            (forceGrid ? app : container).appendChild(d); return;
        }
        if(r.SectionType === 'text') {
             const d = document.createElement('div'); d.className = 'section layout-text';
             d.innerHTML = `${safeHTML(r.Title) ? `<h2 class="fill-anim">${safeHTML(r.Title)}</h2>` : ''}<p>${processText(r.Content)}</p>`;
             (forceGrid ? app : container).appendChild(d); return;
        }

        // 2. CONTENT CARDS / IMAGES
        const media = r.Media || '';
        const tags = r.Tags ? r.Tags.split(',').map(x => x.trim()) : [];
        
        if (forceGrid) {
            // --- CARD LAYOUT ---
            let l = r.LinkURL || `#${r.Page}`; 
            const target = l.startsWith('#') ? '' : '_blank';
            const thumb = getThumbnail(media.split(',')[0]); // Take 1st image
            const imgH = thumb ? `<div class="row-media"><img src="${thumb}" loading="lazy"></div>` : '';
            
            let mh = '';
            // Only show meta row if there is data
            if(r.Timestamp || tags.length > 0) {
                 mh = `<div class="meta-row">`;
                 if(r.Timestamp) {
                     let dateVal = formatDate(r.Timestamp);
                     mh += `<span class="chip date" data-date="${dateVal}" data-val="${dateVal}">${dateVal}</span>`; 
                 }
                 tags.forEach(t => mh += `<span class="chip" data-tag="${t}">${safeHTML(t)}</span>`); 
                 mh += `</div>`;
            }

            const d = document.createElement('div'); d.className = `layout-grid clickable-block ${catClass}`;
            d.setAttribute('data-link', l); d.setAttribute('data-target', target);
            d.innerHTML = `${imgH}<h3 class="fill-anim">${safeHTML(r.Title)}</h3><p>${processText(r.Content)}</p>${mh}`;
            container.appendChild(d);

        } else {
            // --- ARTICLE LAYOUT (Subpage) ---
            // Handle Collages (Comma separated images)
            const images = media.split(',').map(u => u.trim()).filter(u => u);
            
            if (images.length > 0) {
                const collageDiv = document.createElement('div');
                collageDiv.className = images.length > 1 ? 'layout-collage' : 'row-media';
                if(images.length === 1) collageDiv.style.marginBottom = '20px'; // Spacing for single img

                images.forEach(imgUrl => {
                    const thumb = getThumbnail(imgUrl);
                    if(thumb) {
                        // Zoomable image in article mode
                        collageDiv.innerHTML += `<img src="${thumb}" class="zoomable" loading="lazy">`;
                    }
                });
                container.appendChild(collageDiv);
            }

            // If there is also text content in this row, add it below images
            if (r.Title || r.Content) {
                const textDiv = document.createElement('div'); textDiv.className = 'layout-text';
                textDiv.innerHTML = `${safeHTML(r.Title) ? `<h2>${safeHTML(r.Title)}</h2>` : ''}<p>${processText(r.Content)}</p>`;
                container.appendChild(textDiv);
            }
        }
    });
    
    if(window.MathJax && window.MathJax.typeset) window.MathJax.typeset();
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
    if(len > 250) sizeClass = 'xl'; else if(len > 150) sizeClass = 'long'; else if(len > 70) sizeClass = 'medium';
    c.innerHTML = `<blockquote class="${sizeClass}">"${text}"</blockquote><div class="quote-footer"><div class="author">— ${auth}</div></div><svg class="refresh-btn" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;
}

function renderFooter() { const fd = document.getElementById('footer-links'); const fr = db.filter(r => r.Page === 'Footer' || r.Title === 'LinkedIn' || r.Title === 'Contact'); fd.innerHTML = ''; fr.forEach(r => { let link = r.LinkURL; if(r.Title === 'Contact') link = 'mailto:sahibdsv+site@gmail.com'; if(link) fd.innerHTML += `<a href="${link}" target="_blank" class="fill-anim">${safeHTML(r.Title)}</a>`; }); }
function fetchGitHubStats() { const r = "sahibdsv/sahibdsv.github.io"; fetch(`https://api.github.com/repos/${r}`).then(res => res.json()).then(d => { if(d.pushed_at) { const dateStr = new Date(d.pushed_at).toLocaleDateString(); document.getElementById('version-tag').innerHTML = `<a href="https://github.com/${r}/commits" target="_blank" class="fill-anim">Last Updated: ${dateStr}</a>`; } }).catch(()=>{}); }
function getThumbnail(u) { if(!u) return null; if(u.includes('youtube.com')||u.includes('youtu.be')) { let v = u.split('v=')[1]; if(v&&v.includes('&')) v=v.split('&')[0]; if(!v&&u.includes('youtu.be')) v=u.split('/').pop(); return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; } if(u.endsWith('.mp4')) return null; return u; }
function processText(t) { if(!t) return ''; let clean = safeHTML(t); return clean.replace(/\[\[(.*?)\]\]/g, '<a href="#$1" class="wiki-link fill-anim">$1</a>').replace(/<a /g, '<a class="fill-anim" '); }
function formatDate(s) { if(!s) return ''; const d = new Date(s); if(isNaN(d.getTime())) return s; const mo = d.toLocaleString('default', { month: 'short' }).toUpperCase(); const yr = d.getFullYear(); return `${mo} ${yr}`; }

init();