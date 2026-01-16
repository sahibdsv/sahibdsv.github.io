/* assets/js/ui.js */
import { safeHTML, processText, formatDate, getThumbnail } from './utils.js';
import { init3DViewers } from './viewer.js';

/* --- STATE HELPERS --- */
export function isSearchOpen() {
    return document.getElementById('search-overlay').classList.contains('active');
}

/* --- NAVIGATION & SEARCH --- */
export function toggleSearch() { 
    const overlay = document.getElementById('search-overlay');
    const header = document.getElementById('main-header');
    const isActive = overlay.classList.toggle('active'); 
    header.classList.toggle('search-mode'); 
    
    if(isActive) setTimeout(() => document.getElementById('search-input').focus(), 100);
    else closeSearch(); 
}

export function closeSearch() { 
    const overlay = document.getElementById('search-overlay');
    if(!overlay.classList.contains('active')) return;
    
    overlay.classList.remove('active'); 
    document.getElementById('main-header').classList.remove('search-mode'); 
    document.getElementById('search-input').value = ''; 
    // Dispatch event to let App know search closed
    window.dispatchEvent(new CustomEvent('search-closed'));
}

export function handleSearch(q, db) { 
    if(!q) return; 
    document.body.classList.remove('header-expanded');
    document.getElementById('main-header').classList.remove('expanded');

    const t = q.toLowerCase();
    const res = db.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t))); 
    renderRows(res, `Search results for "${safeHTML(q)}"`, false, true); 
}

export function resetToHome() { 
    closeSearch(); 
    window.location.hash = ''; 
}

export function buildNav(db) { 
    const n = document.getElementById('primary-nav'); if(!n) return; n.innerHTML = ''; 
    const p = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer').map(r => r.Page.split('/')[0]).filter(x => x))].sort(); 
    p.forEach(x => { if(x === 'Home') return; n.innerHTML += `<a href="#${x}" class="nav-link fill-anim" onclick="closeSearch()">${safeHTML(x)}</a>`; }); 
}

export function buildSubNav(top, db) {
    const n = document.getElementById('sub-nav'), b = document.body; if(!n) return; n.innerHTML = ''; b.setAttribute('data-page', top);
    
    const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/').slice(0, 2).join('/')))].sort();
    
    subs.forEach(x => { 
        const name = x.split('/')[1];
        const active = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`); 
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="closeSearch()">${safeHTML(name)}</a>`; 
    });
    setTimeout(() => centerSubNav(true), 100);
}

export function centerSubNav(forceMiddleIfNone) {
    const n = document.getElementById('sub-nav');
    if(!n) return;
    const activeLink = n.querySelector('.active');
    
    if (activeLink) {
        const scrollTarget = activeLink.offsetLeft + (activeLink.offsetWidth / 2) - (n.clientWidth / 2);
        n.scrollTo({ left: scrollTarget, behavior: 'smooth' });
    } else if (forceMiddleIfNone) {
        const middle = (n.scrollWidth - n.clientWidth) / 2;
        n.scrollTo({ left: middle, behavior: 'smooth' });
    }
}

/* --- PAGE RENDERING --- */
export function renderHome(db) { 
    const hr = db.filter(r => r.Page === 'Home');
    const app = document.getElementById('app'); app.innerHTML = ''; 
    renderRows(hr, null, true); 
    
    const recents = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer')
                      .sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0))
                      .slice(0, 6);
    if(recents.length > 0) { renderRows(recents, "Recent Activity", true); } 
}

export function renderIndex(db) {
    document.body.classList.remove('header-expanded');
    document.getElementById('main-header').classList.remove('expanded');
    buildSubNav('Index', db); 
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
            html += `<a href="#${p}" class="index-link fill-anim">${title} ${date ? `<span>${date}</span>` : ''}</a>`;
        });
        html += `</div>`;
        list.innerHTML += html;
    }
}

export function renderFiltered(t, db) { 
    const res = db.filter(r => {
        const dateStr = formatDate(r.Timestamp);
        return (dateStr === t) || (r.Tags && r.Tags.includes(t));
    });
    renderRows(res, `Posts tagged "${safeHTML(t)}"`, false, true); 
}

export function renderPage(p, db) { 
    if(p === 'Home') { renderHome(db); return; } 
    const ex = db.filter(r => r.Page === p); 
    const app = document.getElementById('app'); app.innerHTML = ''; 
    
    const isMainPage = !p.includes('/');
    
    if(ex.length > 0) { renderRows(ex, null, true, false, !isMainPage); } 
    else {
        const childrenPages = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
        if(childrenPages.length === 0) {
            app.innerHTML = `<div class="layout-404"><h1>404</h1><h2>Data Not Found</h2><p>This page doesn't exist in the database yet.</p><a href="#" class="btn-primary" onclick="resetToHome()">Return to Base</a></div>`;
            return; 
        }
    }
    
    if(isMainPage) {
        const childrenPages = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
        if(childrenPages.length > 0) {
            const overviewRows = childrenPages.map(childPage => db.find(r => r.Page === childPage)).filter(r => r);
            renderRows(overviewRows, null, true, true); 
        } 
    }
}

/* --- CORE ROW RENDERER --- */
export function renderRows(rows, title, append, forceGrid, isArticleMode = false) {
    const app = document.getElementById('app'); if(!app) return; 
    
    rows.sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0));

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
             
             if(modelMatch) mediaHtml = mediaHtml.replace('row-media', 'row-media article-mode');
             else if(r.Media) mediaHtml = mediaHtml.replace('row-media', 'row-media article-mode');
             else mediaHtml = ''; 

             let metaHtml = '<div class="article-meta-row"><a href="#Personal/About" class="author-link fill-anim">SAHIB VIRDEE</a>';
             if(r.LinkURL) metaHtml += `<a href="${r.LinkURL}" target="_blank" class="article-link-btn"><svg viewBox="0 0 24 24" style="width:12px;height:12px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`;
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
        
        if(gc) gc.appendChild(d);
    });
    
    if(window.MathJax && window.MathJax.typeset) window.MathJax.typeset();
    setTimeout(init3DViewers, 500);
}

export function renderQuoteCard(c, quotesDb) {
    if(!quotesDb || quotesDb.length === 0) { c.innerHTML = "Quote sheet empty."; return; }
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

export function renderFooter(db) { 
    const fd = document.getElementById('footer-links');
    const fr = db.filter(r => r.Page === 'Footer' || r.Title === 'LinkedIn' || r.Title === 'Contact'); 
    fd.innerHTML = ''; 
    fr.forEach(r => { 
        let link = r.LinkURL;
        if(r.Title === 'Contact') link = 'mailto:sahibdsv+site@gmail.com';
        if(link) fd.innerHTML += `<a href="${link}" target="_blank" class="fill-anim">${safeHTML(r.Title)}</a>`; 
    }); 
    
    fd.innerHTML += `<a href="#Index" class="fill-anim" onclick="closeSearch()">Index</a>`;
    fd.innerHTML += `<a href="https://sahib.goatcounter.com" target="_blank" class="fill-anim">Analytics</a>`;
}

export function fetchGitHubStats() { 
    const r = "sahibdsv/sahibdsv.github.io"; 
    fetch(`https://api.github.com/repos/${r}`).then(res => res.json()).then(d => { 
        if(d.pushed_at) {
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
            document.getElementById('version-tag').innerHTML = `<a href="https://github.com/${r}/commits" target="_blank" class="fill-anim">Last updated ${relTime}</a>`;
        } 
    }).catch(()=>{}); 
}