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

    window.addEventListener('scroll', () => { 
        const h = document.getElementById('main-header'); 
        if(h) h.classList.toggle('shrink', window.scrollY > 50); 
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
    document.body.classList.remove('header-expanded');
    document.getElementById('main-header').classList.remove('expanded');

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
    const n = document.getElementById('sub-nav'), h = document.getElementById('main-header'), b = document.body; if(!n) return; n.innerHTML = ''; b.setAttribute('data-page', top);
    
    const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/').slice(0, 2).join('/')))].sort();
    
    subs.forEach(x => { 
        const name = x.split('/')[1];
        const active = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`); 
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="closeSearch()">${safeHTML(name)}</a>`; 
    });
}

function handleRouting() { 
    if(isSearchActive) return; 
    window.scrollTo(0, 0); 
    let h = window.location.hash.substring(1) || 'Home'; 
    
    if(h === 'Archive') { renderArchive(); return; }
    
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

    // Initialize 3D Viewers
    setTimeout(init3DViewers, 100);
}

function childrenPagesCheck(p) {
    const childrenPages = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
    return childrenPages.length > 0;
}

function renderArchive() {
    const app = document.getElementById('app'); 
    app.innerHTML = '<div class="section layout-hero"><h1 class="fill-anim">Archive</h1><p>Full system index.</p></div><div class="section archive-list"></div>';
    
    const list = app.querySelector('.archive-list');
    const pages = [...new Set(db.map(r => r.Page).filter(p => p && p !== 'Home' && p !== 'Footer'))].sort();
    
    const groups = {};
    pages.forEach(p => {
        const cat = p.split('/')[0];
        if(!groups[cat]) groups[cat] = [];
        groups[cat].push(p);
    });
    
    for(const [cat, items] of Object.entries(groups)) {
        let html = `<div class="archive-group"><h3>${cat}</h3>`;
        items.forEach(p => {
            const row = db.find(r => r.Page === p);
            const date = row && row.Timestamp ? formatDate(row.Timestamp) : '';
            const title = row ? row.Title : p.split('/').pop();
            html += `<a href="#${p}" class="archive-link fill-anim">${title} ${date ? `<span>${date}</span>` : ''}</a>`;
        });
        html += `</div>`;
        list.innerHTML += html;
    }
}

function renderHome() { 
    const hr = db.filter(r => r.Page === 'Home');
    const app = document.getElementById('app'); app.innerHTML = ''; 
    renderRows(hr, null, true); 
    
    const recents = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer')
                      .sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0))
                      .slice(0, 6);
    if(recents.length > 0) { renderRows(recents, "Recent", true); } 
    
    setTimeout(init3DViewers, 100);
}

function renderRows(rows, title, append, forceGrid, isArticleMode = false) {
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
        
        let catClass = '';
        const pLower = r.Page.toLowerCase();
        if(pLower.startsWith('projects')) catClass = 'cat-projects';
        else if(pLower.startsWith('professional')) catClass = 'cat-professional';
        else if(pLower.startsWith('personal')) catClass = 'cat-personal';

        if(!forceGrid && isArticleMode && (!r.SectionType || r.SectionType === 'card')) {
             const d = document.createElement('div'); d.className = 'section layout-text';
             
             let imgHtml = '';
             const thumb = getThumbnail(r.Media);
             if(thumb) imgHtml = `<div class="row-media article-mode"><img src="${thumb}" class="inline-img zoomable" loading="lazy"></div>`;
             
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

             d.innerHTML = `${imgHtml}${safeHTML(r.Title) ? `<h2 class="fill-anim">${safeHTML(r.Title)}</h2>` : ''}${metaHtml}<p>${processText(r.Content)}</p>`;
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
             tags.forEach(t => mh += `<span class="chip" data-tag="${t}">${safeHTML(t)}</span>`); 
             mh += `</div>`;
        }

        const d = document.createElement('div'); d.className = `layout-grid clickable-block ${catClass}`;
        d.setAttribute('data-link', l); d.setAttribute('data-target', target);
        
        d.innerHTML = `${imgH}<h3 class="fill-anim">${safeHTML(r.Title)}</h3><p>${processText(r.Content)}</p>${mh}`;
        
        if(gc) gc.appendChild(d);
    });
    
    if(window.MathJax && window.MathJax.typeset) {
        window.MathJax.typeset();
    }
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
    
    fd.innerHTML += `<a href="#Archive" class="fill-anim" onclick="closeSearch()">Archive</a>`;
    fd.innerHTML += `<a href="https://sahib.goatcounter.com" target="_blank" class="fill-anim">Analytics</a>`;
}

function fetchGitHubStats() { 
    const r = "sahibdsv/sahibdsv.github.io"; 
    fetch(`https://api.github.com/repos/${r}`).then(res => res.json()).then(d => { 
        if(d.pushed_at) {
            const dateStr = new Date(d.pushed_at).toLocaleDateString();
            document.getElementById('version-tag').innerHTML = `<a href="https://github.com/${r}/commits" target="_blank" class="fill-anim">Last Updated: ${dateStr}</a>`;
        } 
    }).catch(()=>{}); 
}

function getThumbnail(u) { if(!u) return null; if(u.includes('youtube.com')||u.includes('youtu.be')) { let v = u.split('v=')[1]; if(v&&v.includes('&')) v=v.split('&')[0]; if(!v&&u.includes('youtu.be')) v=u.split('/').pop(); return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; } if(u.endsWith('.mp4')) return null; return u; }

function processText(t) { 
    if(!t) return ''; 
    let clean = safeHTML(t);
    
    // 3D STL Viewer Shortcode: {{STL: url | #color}}
    // Group 1: URL, Group 2: Color (optional)
    clean = clean.replace(/\{\{STL: (.*?)(?: \| (.*?))?\}\}/g, (match, url, color) => {
        const colorAttr = color ? `data-color="${color.trim()}"` : '';
        return `<div class="embed-wrapper stl" data-src="${url.trim()}" ${colorAttr}></div>`;
    });

    // Embed Shortcodes
    clean = clean.replace(/\{\{MAP: (.*?)\}\}/g, '<div class="embed-wrapper map"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{DOC: (.*?)\}\}/g, '<div class="embed-wrapper doc"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{YOUTUBE: (.*?)\}\}/g, '<div class="embed-wrapper video"><iframe src="$1" allowfullscreen></iframe></div>');
    clean = clean.replace(/\{\{EMBED: (.*?)\}\}/g, '<div class="embed-wrapper"><iframe src="$1"></iframe></div>');

    // Collages
    clean = clean.replace(/\[\[(http.*?,.*?)\]\]/g, (match, content) => {
        const urls = content.split(',').map(u => u.trim());
        const imgs = urls.map(u => `<img src="${u}" class="inline-img zoomable" loading="lazy">`).join('');
        return `<div class="inline-gallery">${imgs}</div>`;
    });

    // Single Images
    clean = clean.replace(/\[\[(http.*?)\]\]/g, `<img src="$1" class="inline-img zoomable" loading="lazy">`);

    return clean.replace(/\[\[(.*?)\]\]/g, '<a href="#$1" class="wiki-link fill-anim">$1</a>')
            .replace(/<a /g, '<a class="fill-anim" '); 
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

// 3D VIEWER LOGIC
function init3DViewers() {
    const containers = document.querySelectorAll('.embed-wrapper.stl:not(.loaded)');
    
    if(containers.length === 0) return;

    // Dynamic import of Three.js modules
    import('three').then((THREE) => {
        import('three/addons/loaders/STLLoader.js').then(({ STLLoader }) => {
            import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
                
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            loadSTL(entry.target, THREE, STLLoader, OrbitControls);
                            observer.unobserve(entry.target);
                        }
                    });
                }, { rootMargin: "200px" });

                containers.forEach(c => observer.observe(c));
            });
        });
    });
}

function loadSTL(container, THREE, STLLoader, OrbitControls) {
    container.classList.add('loaded');
    const url = container.getAttribute('data-src');
    const customColor = container.getAttribute('data-color');
    
    // Scene
    const scene = new THREE.Scene();
    scene.background = null; 

    // Camera
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true; 
    controls.autoRotateSpeed = 2.0;

    // Loader
    const loader = new STLLoader();
    loader.load(url, function (geometry) {
        
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        geometry.center(); 

        // Use custom color if provided, else default grey
        const materialColor = customColor ? customColor : 0xaaaaaa;

        const material = new THREE.MeshPhongMaterial({ 
            color: materialColor, 
            specular: 0x111111, 
            shininess: 200 
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Fit Camera
        const box = geometry.boundingBox;
        const size = box.getSize(new THREE.Vector3()).length();
        const dist = size / (2 * Math.tan(Math.PI * 45 / 360));
        camera.position.set(dist * 0.8, dist * 0.5, dist);
        camera.lookAt(0, 0, 0);

        scene.add(mesh);

        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

    }, undefined, function (error) {
        console.error(error);
        container.innerHTML = '<div style="color:#666; display:flex; justify-content:center; align-items:center; height:100%;">Failed to load 3D Model</div>';
    });

    window.addEventListener('resize', () => {
        if(!container.isConnected) return; 
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

init();