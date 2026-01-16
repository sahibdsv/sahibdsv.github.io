/* assets/script.js */

let db = [], quotesDb = [], isSearchActive = false;

// Fallback Config
const FALLBACK_CONFIG = {
    main_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv",
    quotes_sheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=540861260&single=true&output=csv"
};

// --- HELPER FUNCTIONS (Hoisted) ---

function safeHTML(html) {
    if(typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height']
        });
    }
    return html || ''; 
}

function formatDate(s) {
    if(!s || s.length !== 8) return s;
    const d = new Date(`${s.substring(0,4)}-${s.substring(4,6)}-${s.substring(6,8)}`);
    if(isNaN(d.getTime())) return s;
    return d.toLocaleString('default', { month: 'short', year: 'numeric' }).toUpperCase();
}

function getThumbnail(u) { 
    if(!u) return null; 
    if(u.includes('youtu')) { 
        let v = u.split('v=')[1]; 
        if(!v && u.includes('youtu.be')) v = u.split('/').pop();
        if(v && v.includes('&')) v = v.split('&')[0];
        if(v) return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; 
    } 
    return u; 
}

function processText(t) { 
    if(!t) return ''; 
    let clean = safeHTML(t);
    
    // 1. 3D Viewer
    clean = clean.replace(/\{\{\s*(?:3D|STL):\s*(.*?)(?:\s*\|\s*(.*?))?\s*\}\}/gi, (match, url, color) => {
        const colorAttr = color ? `data-color="${color.trim()}"` : '';
        return `<div class="embed-wrapper stl" data-src="${url.trim()}" ${colorAttr}></div>`;
    });

    // 2. Galleries
    clean = clean.replace(/\[\s*(https?:\/\/[^\]]+)\s*\]/gi, (match, content) => {
        const urls = content.split(',').map(u => u.trim());
        const isPureGallery = urls.every(u => u.toLowerCase().startsWith('http'));
        if (!isPureGallery) return match; 
        const imgs = urls.map(u => `<img src="${u}" class="inline-img zoomable" loading="lazy" alt="Gallery Image">`).join('');
        return `<div class="inline-gallery">${imgs}</div>`;
    });

    // 3. Wiki Links
    clean = clean.replace(/\[\[(.*?)\]\]/g, '<a href="#$1" class="wiki-link fill-anim">$1</a>');

    // 4. Embeds
    clean = clean.replace(/\{\{\s*MAP:\s*(.*?)\s*\}\}/gi, '<div class="embed-wrapper map"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{\s*DOC:\s*(.*?)\s*\}\}/gi, '<div class="embed-wrapper doc"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{\s*YOUTUBE:\s*(.*?)\s*\}\}/gi, '<div class="embed-wrapper video"><iframe src="$1" allowfullscreen></iframe></div>');
    clean = clean.replace(/\{\{\s*EMBED:\s*(.*?)\s*\}\}/gi, '<div class="embed-wrapper"><iframe src="$1"></iframe></div>');

    // 5. Links
    clean = clean.replace(/<a /g, '<a class="fill-anim" '); 

    return clean; 
}

// --- 3D VIEWER LOGIC ---
function init3DViewers() {
    const containers = document.querySelectorAll('.embed-wrapper.stl:not(.loaded)');
    if(containers.length === 0) return;

    Promise.all([
        import('three'),
        import('three/addons/loaders/STLLoader.js'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js')
    ]).then(([THREE, { STLLoader }, { GLTFLoader }, { OrbitControls }]) => {
        const visibilityObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const container = entry.target;
                if (entry.isIntersecting) container.setAttribute('data-visible', 'true');
                else container.setAttribute('data-visible', 'false');
            });
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadModel(entry.target, THREE, STLLoader, GLTFLoader, OrbitControls);
                    observer.unobserve(entry.target);
                    visibilityObserver.observe(entry.target);
                }
            });
        }, { rootMargin: "200px" });

        containers.forEach(c => observer.observe(c));
    }).catch(e => console.warn("3D Engine Load Failed:", e));
}

function loadModel(container, THREE, STLLoader, GLTFLoader, OrbitControls) {
    container.classList.add('loaded');
    const url = container.getAttribute('data-src');
    const customColor = container.getAttribute('data-color');
    const ext = url.split('.').pop().toLowerCase();
    
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.physicallyCorrectLights = true; 
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
    controls.enableDamping = true; controls.dampingFactor = 0.05; controls.enablePan = false; controls.autoRotate = true; controls.autoRotateSpeed = 2.0;

    let restartTimer;
    controls.addEventListener('start', () => { clearTimeout(restartTimer); controls.autoRotate = false; });
    controls.addEventListener('end', () => { restartTimer = setTimeout(() => { controls.autoRotate = true; }, 5000); });

    const onLoad = (object) => {
        container.classList.add('ready');
        const box = new THREE.Box3().setFromObject(object);
        const center = new THREE.Vector3();
        box.getCenter(center);
        object.position.sub(center);
        scene.add(object);

        if (customColor) {
            object.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshPhongMaterial({ color: customColor, specular: 0x111111, shininess: 100 });
                }
            });
        }

        const size = box.getSize(new THREE.Vector3()).length();
        const dist = size / (2 * Math.tan(Math.PI * 45 / 360)) * 0.6;
        camera.position.set(dist, dist * 0.4, dist * 0.8);
        camera.lookAt(0, 0, 0);
        controls.minDistance = size * 0.2; 
        controls.maxDistance = size * 5;

        function animate() {
            requestAnimationFrame(animate);
            if (container.getAttribute('data-visible') === 'false') return;
            controls.update();
            renderer.render(scene, camera);
        }
        animate();
    };

    const onError = (e) => {
        console.error(e);
        container.innerHTML = '<div style="color:#666; font-size:12px; height:100%; display:flex; align-items:center; justify-content:center;">Model Error</div>';
    };

    if (ext === 'glb' || ext === 'gltf') {
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => onLoad(gltf.scene), undefined, onError);
    } else {
        const loader = new STLLoader();
        loader.load(url, (geometry) => {
            const mat = new THREE.MeshPhongMaterial({ color: customColor || 0xaaaaaa, specular: 0x111111, shininess: 200 });
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

// --- APP CORE ---

function initApp() {
    buildNav(); 
    handleRouting(); 
    window.addEventListener('hashchange', handleRouting);
    
    window.addEventListener('scroll', () => { 
        const h = document.getElementById('main-header'); 
        if(h) {
            const shouldShrink = window.scrollY > 50;
            h.classList.toggle('shrink', shouldShrink);
        }
    });

    document.addEventListener('click', (e) => {
        if (isSearchActive && !e.target.closest('#search-bubble') && !e.target.closest('#search-trigger')) {
            toggleSearch();
        }
    });

    document.getElementById('app').addEventListener('click', (e) => {
        if(e.target.closest('.refresh-btn')) { 
            const qc = e.target.closest('.layout-quote');
            if(qc && !qc.classList.contains('loading')) {
                qc.classList.add('loading');
                setTimeout(() => { renderQuoteCard(qc); qc.classList.remove('loading'); }, 400); 
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
            if(isSearchActive) toggleSearch(); 
            const tag = e.target.getAttribute('data-tag');
            const date = e.target.getAttribute('data-date');
            if(date) window.location.hash = 'Filter:' + date;
            else if(tag) window.location.hash = 'Filter:' + tag;
            return; 
        }
        
        const block = e.target.closest('.clickable-block');
        if(block && !e.target.classList.contains('chip')) {
            const link = block.getAttribute('data-link');
            if(link) { 
                if(block.getAttribute('data-target') === '_blank') {
                    window.open(link, '_blank');
                } else {
                    window.location.href = link; 
                    if(isSearchActive) toggleSearch(); 
                }
            }
        }
    });
}

function resetToHome() { if(isSearchActive) toggleSearch(); window.location.hash = ''; }

function toggleSearch() { 
    isSearchActive = !isSearchActive;
    const body = document.body;
    const input = document.getElementById('search-input');
    
    if (isSearchActive) {
        body.classList.add('search-active');
        document.getElementById('main-header').classList.add('search-mode');
        setTimeout(() => input.focus(), 100);
    } else {
        body.classList.remove('search-active');
        document.getElementById('main-header').classList.remove('search-mode');
        input.value = '';
        input.blur();
        handleRouting(); // Restore current view
    }
}

function handleSearch(q) { 
    if(!q) return; 
    const t = q.toLowerCase();
    const res = db.filter(r => (r.Title && r.Title.toLowerCase().includes(t)) || (r.Content && r.Content.toLowerCase().includes(t)) || (r.Tags && r.Tags.toLowerCase().includes(t))); 
    renderRows(res, `Search results for "${safeHTML(q)}"`, false, true); 
}

function buildNav() { 
    const n = document.getElementById('primary-nav'); if(!n) return; n.innerHTML = ''; 
    const p = [...new Set(db.filter(r => r.Page && r.Page !== 'Footer').map(r => r.Page.split('/')[0]).filter(x => x))].sort(); 
    p.forEach(x => { if(x === 'Home') return; n.innerHTML += `<a href="#${x}" class="nav-link fill-anim" onclick="if(isSearchActive) toggleSearch()">${safeHTML(x)}</a>`; }); 
}

function buildSecondaryNav(top) {
    const n = document.getElementById('secondary-nav'); if(!n) return false; 
    n.innerHTML = ''; 
    const subs = [...new Set(db.filter(r => r.Page && r.Page.startsWith(top + '/')).map(r => r.Page.split('/').slice(0, 2).join('/')))].sort();
    if (subs.length === 0) return false;
    subs.forEach(x => { 
        const name = x.split('/')[1];
        const active = window.location.hash === `#${x}` || window.location.hash.startsWith(`#${x}/`); 
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="if(isSearchActive) toggleSearch()">${safeHTML(name)}</a>`; 
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
        n.innerHTML += `<a href="#${x}" class="sub-link fill-anim ${active ? 'active' : ''}" onclick="if(isSearchActive) toggleSearch()">${safeHTML(name)}</a>`;
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
    
    // Defer scrolling to prevent "hop" before content loads
    let h = window.location.hash.substring(1) || 'Home'; 
    const parts = h.split('/');
    const top = parts[0]; 
    const sub = parts.length > 1 ? parts[1] : null;

    let hasSec = false, hasTert = false;
    if (h === 'Timeline' || h === 'Index') {
        buildSecondaryNav(top);
    } else {
        hasSec = buildSecondaryNav(top);
        hasTert = buildTertiaryNav(top, sub);
    }

    document.body.classList.remove('rows-2', 'rows-3', 'rows-4');
    if (hasTert) document.body.classList.add('rows-4');
    else if (hasSec || h === 'Index') document.body.classList.add('rows-3');
    else document.body.classList.add('rows-2');

    document.querySelectorAll('#primary-nav .nav-link').forEach(a => { 
        const href = a.getAttribute('href'); 
        if(href) a.classList.toggle('active', href.replace('#', '') === top); 
    }); 

    setTimeout(() => {
        const secEl = document.getElementById('secondary-nav');
        const tertEl = document.getElementById('tertiary-nav');
        if (hasTert) { centerSubNav(tertEl, true); centerSubNav(secEl, false); }
        else if (hasSec) { centerSubNav(secEl, true); }
    }, 100);

    if(h === 'Timeline') renderTimeline();
    else if(h === 'Index') renderIndex();
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
    
    if(ex.length === 0) {
        const children = [...new Set(db.filter(r => r.Page && r.Page.startsWith(p + '/')).map(r => r.Page))];
        if(children.length > 0) {
            const overviewRows = children.map(c => db.find(r => r.Page === c)).filter(r => r);
            renderRows(overviewRows, null, false, true); 
            return;
        }
        document.getElementById('app').innerHTML = `<div class="layout-404"><h1>404</h1><h2>Data Not Found</h2></div>`;
        return;
    }
    renderRows(ex, null, false, false, true); 
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
    renderRows(hr, null, true); 
    
    const recents = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer')
                      .sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0))
                      .slice(0, 6);
    if(recents.length > 0) renderRows(recents, "Recent Activity", true, true, false, true);
}

function createCardHtml(r, overrideCatClass, forcePlaceholder) {
    let contentHtml = processText(r.Content);
    let mediaHtml = '';
    let hasPlaceholder = false;
    const modelMatch = r.Content ? r.Content.match(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/i) : null;
    
    if (modelMatch) {
        const url = modelMatch[1].trim(); const color = modelMatch[2] ? `data-color="${modelMatch[2].trim()}"` : '';
        mediaHtml = `<div class="row-media"><div class="embed-wrapper stl" data-src="${url}" ${color}></div></div>`;
        contentHtml = contentHtml.replace(/<div class="embed-wrapper stl".*?<\/div>/, ''); 
    } else if (r.Media) {
        const thumb = getThumbnail(r.Media);
        if(thumb) mediaHtml = `<div class="row-media"><img src="${thumb}" loading="lazy"></div>`;
    } else {
        hasPlaceholder = true; mediaHtml = `<div class="row-media placeholder"><span>${safeHTML(r.Title)}</span></div>`;
    }
    let catClass = overrideCatClass || '';
    if (!catClass) {
        const pLower = r.Page.toLowerCase();
        if(pLower.startsWith('projects')) catClass = 'cat-projects';
        else if(pLower.startsWith('professional')) catClass = 'cat-professional';
        else if(pLower.startsWith('personal')) catClass = 'cat-personal';
    }
    const link = r.LinkURL || '';
    const target = r.LinkURL && !r.LinkURL.startsWith('#') ? '_blank' : '';
    let l = link || `#${r.Page}`;
    
    // Parse tags safely
    const tags = r.Tags ? r.Tags.split(',').map(x => x.trim()) : [];
    
    let mh = '';
    // FIXED LOGIC: Use tags array length, do not assign inside if
    if(r.Timestamp || tags.length > 0) {
            mh = `<div class="meta-row">`;
            if(r.Timestamp) { let dateVal = formatDate(r.Timestamp); mh += `<span class="chip date" data-date="${dateVal}" data-val="${dateVal}">${dateVal}</span>`; }
            tags.forEach(t => mh += `<span class="chip" data-tag="${t}">${safeHTML(t)}</span>`); 
            mh += `</div>`;
    }
    return `<div class="layout-grid clickable-block ${catClass} ${hasPlaceholder ? 'has-placeholder' : ''}" data-link="${l}" data-target="${target}">${mediaHtml}<h3 class="fill-anim">${safeHTML(r.Title)}</h3><p>${contentHtml}</p>${mh}</div>`;
}

function renderRows(rows, title, append, forceGrid, isArticleMode, preserveOrder) {
    const app = document.getElementById('app');
    if(!preserveOrder) rows.sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0));
    
    let html = title ? `<h2 class="fill-anim" style="text-align:center; margin-bottom:20px;">${title}</h2>` : '';
    let gridItems = '';
    
    rows.forEach(r => {
        if(!forceGrid && (r.SectionType === 'hero' || r.SectionType === 'quote' || r.SectionType === 'text' || isArticleMode)) {
            if(r.SectionType === 'quote') {
                html += `<div class="layout-quote section"><div class="sk-box quote"></div></div>`;
                setTimeout(() => { const q = app.querySelector('.layout-quote:last-child'); if(q) renderQuoteCard(q); }, 50);
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
    
    if(typeof init3DViewers === 'function') setTimeout(init3DViewers, 500);
}

function renderQuoteCard(c) {
    if(!c || quotesDb.length === 0) return;
    const r = quotesDb[Math.floor(Math.random() * quotesDb.length)];
    const text = safeHTML(r.Quote.trim().replace(/^"|"$/g, ''));
    let sizeClass = 'short';
    if(text.length > 230) sizeClass = 'xxl'; else if(text.length > 150) sizeClass = 'xl'; else if(text.length > 100) sizeClass = 'long'; else if(text.length > 50) sizeClass = 'medium';
    c.innerHTML = `<blockquote class="${sizeClass}">"${text}"</blockquote><div class="quote-footer"><div class="author">— ${r.Author}</div></div><svg class="refresh-btn" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;
}

function renderFooter() { 
    const fd = document.getElementById('footer-links');
    if(!fd) return;
    const fr = db.filter(r => r.Page === 'Footer' || r.Title === 'LinkedIn' || r.Title === 'Contact'); 
    fd.innerHTML = ''; 
    fr.forEach(r => { 
        let link = r.LinkURL;
        if(r.Title === 'Contact') link = 'mailto:sahibdsv+site@gmail.com';
        if(link) fd.innerHTML += `<a href="${link}" target="_blank" class="fill-anim">${safeHTML(r.Title)}</a>`; 
    }); 
    fd.innerHTML += `<a href="#Timeline" class="fill-anim" onclick="if(isSearchActive) toggleSearch()">Timeline</a>`;
    fd.innerHTML += `<a href="#Index" class="fill-anim" onclick="if(isSearchActive) toggleSearch()">Index</a>`;
    fd.innerHTML += `<a href="https://sahib.goatcounter.com" target="_blank" class="fill-anim">Analytics</a>`;
}

function fetchGitHubStats() { 
    const r = "sahibdsv/sahibdsv.github.io"; 
    fetch(`https://api.github.com/repos/${r}`).then(res => res.json()).then(d => { 
        if(d.pushed_at) {
            const date = new Date(d.pushed_at);
            const timeAgo = (d) => {
                const s = Math.floor((new Date() - d) / 1000);
                let i = s / 31536000; if (i > 1) return Math.floor(i) + " years ago";
                i = s / 2592000; if (i > 1) return Math.floor(i) + " months ago";
                i = s / 86400; if (i > 1) return Math.floor(i) + " days ago";
                i = s / 3600; if (i > 1) return Math.floor(i) + " hours ago";
                i = s / 60; if (i > 1) return Math.floor(i) + " mins ago";
                return "a few mins ago";
            };
            const relTime = timeAgo(date);
            const vt = document.getElementById('version-tag');
            if(vt) vt.innerHTML = `<a href="https://github.com/${r}/commits" target="_blank" class="fill-anim">Last updated ${relTime}</a>`;
        } 
    }).catch(()=>{}); 
}

// MAIN INIT
const init = () => {
    fetchData().then(([m, q]) => {
        db = m.filter(r => r.Title); 
        quotesDb = q;
        if(window.location.search) history.replaceState(null, null, window.location.pathname + window.location.hash);
        initApp(); renderFooter(); fetchGitHubStats();
        requestAnimationFrame(() => { setTimeout(() => { document.body.classList.remove('no-transition'); }, 50); });
    }).catch(e => {
        console.error("Data Load Error:", e);
        document.getElementById('app').innerHTML = `<div style="text-align:center; padding:50px; color:#666;">Unable to load content.</div>`;
    });
};

async function fetchData() {
    let config = FALLBACK_CONFIG;
    try { const cfgRes = await fetch('assets/config.json'); if (cfgRes.ok) config = await cfgRes.json(); } catch (e) {}
    const [main, quotes] = await Promise.all([fetchCSV(config.main_sheet), fetchCSV(config.quotes_sheet).catch(()=>[])]);
    return [main, quotes];
}

// Run
init();