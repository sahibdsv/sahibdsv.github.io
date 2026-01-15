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
        initApp(); renderFooter(); fetchGitHubStats();
    }).catch(e => {
        console.error("Data Error:", e);
        document.getElementById('app').innerHTML = `<div style="text-align:center; padding:50px; color:#666;">System Offline. Check Connection.</div>`;
    });
};

async function fetchData() {
    let config = FALLBACK_CONFIG;
    try { const r = await fetch('assets/config.json'); if (r.ok) config = await r.json(); } catch (e) {}
    const [main, quotes] = await Promise.all([ fetchCSV(config.main_sheet), fetchCSV(config.quotes_sheet).catch(()=>[]) ]);
    return [main, quotes];
}

function fetchCSV(u) { 
    return new Promise((res, rej) => {
        if(typeof Papa === 'undefined') return rej("PapaParse Missing");
        Papa.parse(u, { download: true, header: true, skipEmptyLines: true, complete: (r) => res(r.data), error: rej });
    });
}

function initApp() {
    handleRouting();
    window.addEventListener('hashchange', handleRouting);
    
    // Sticky Stack Logic: Adjust body padding when header grows/shrinks
    const header = document.getElementById('main-header');
    new ResizeObserver(() => {
        document.body.style.paddingTop = (header.offsetHeight + 10) + 'px';
    }).observe(header);

    // Scroll Compaction
    window.addEventListener('scroll', () => { 
        header.classList.toggle('shrink', window.scrollY > 50);
    });

    // Global Click Handlers
    document.addEventListener('click', (e) => {
        // Close search on click outside
        const overlay = document.getElementById('search-overlay');
        if (overlay.classList.contains('active') && !overlay.contains(e.target) && !e.target.closest('#search-controls')) {
            closeSearch();
        }
        
        // Dynamic Elements
        if(e.target.closest('.refresh-btn')) { refreshQuote(e.target.closest('.layout-quote')); return; }
        if(e.target.classList.contains('zoomable')) { openLightbox(e.target.src); return; }
        
        // Cards
        const block = e.target.closest('.clickable-block');
        if(block && !e.target.classList.contains('chip')) {
            const link = block.getAttribute('data-link');
            if(link) { 
                if(block.getAttribute('data-target') === '_blank') window.open(link, '_blank'); 
                else window.location.href = link;
            }
        }
    });
}

/* --- RECURSIVE NAVIGATION (THE SLIDE RULE) --- */
function handleRouting() {
    if(isSearchActive) return;
    window.scrollTo(0, 0);
    
    let hash = window.location.hash.substring(1) || 'Home';
    
    // Index Mode
    if(hash === 'Index') {
        renderIndex();
        return;
    }

    // Parse Path
    const pathSegments = hash.split('/').filter(x => x);
    
    // Build Nav Stack
    buildRecursiveNav(pathSegments);
    
    // Render Content
    if(hash.startsWith('Filter:')) renderFiltered(decodeURIComponent(hash.split(':')[1]));
    else renderPage(hash);
}

function buildRecursiveNav(activePath) {
    const stack = document.getElementById('nav-stack');
    stack.innerHTML = '';
    const header = document.getElementById('main-header');

    // 1. Determine Theme (Color Cascading)
    header.className = ''; // Reset
    const root = activePath[0] || '';
    if(root.toLowerCase() === 'projects') header.classList.add('theme-projects');
    else if(root.toLowerCase() === 'professional') header.classList.add('theme-prof');
    else if(root.toLowerCase() === 'personal') header.classList.add('theme-personal');

    // 2. Level 0: Roots
    const roots = ['Home', 'Projects', 'Professional', 'Personal'];
    generateNavRow(stack, roots, root, '');

    // 3. Level N: Children
    let currentPath = '';
    for(let i=0; i<activePath.length; i++) {
        const segment = activePath[i];
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const nextActive = activePath[i+1] || '';

        // Find sibling pages for the NEXT level (children of currentPath)
        const children = [...new Set(
            db.filter(r => r.Page && r.Page.startsWith(currentPath + '/'))
              .map(r => r.Page.substring(currentPath.length + 1).split('/')[0])
        )].sort();

        if(children.length > 0) {
            generateNavRow(stack, children, nextActive, currentPath);
        }
    }
}

function generateNavRow(container, items, activeItem, basePath) {
    const row = document.createElement('div');
    row.className = 'nav-row';
    
    items.forEach(name => {
        const link = document.createElement('a');
        link.className = `nav-link ${name === activeItem ? 'active' : ''}`;
        link.href = basePath ? `#${basePath}/${name}` : `#${name}`;
        link.innerText = name;
        row.appendChild(link);
        
        // Smart Center Active Item
        if(name === activeItem) {
            setTimeout(() => {
                const center = link.offsetLeft + (link.offsetWidth / 2) - (row.clientWidth / 2);
                row.scrollTo({ left: center, behavior: 'smooth' });
            }, 100);
        }
    });
    container.appendChild(row);
}

/* --- RENDERING --- */
function renderPage(p) {
    if(p === 'Home') { renderHome(); return; }
    const rows = db.filter(r => r.Page === p);
    const app = document.getElementById('app'); app.innerHTML = '';
    
    if(rows.length > 0) renderRows(rows, null, true, false, true); // Article Mode
    else {
        // Directory check
        const children = db.filter(r => r.Page && r.Page.startsWith(p + '/'));
        if(children.length > 0) {
            // It's a folder, show children previews
            const directChildren = [...new Set(children.map(r => r.Page))];
            const previews = directChildren.map(page => db.find(r => r.Page === page)).filter(x=>x);
            renderRows(previews, null, true, true); // Grid Mode
        } else {
            app.innerHTML = `<div class="layout-404"><h1>404</h1><p>Signal Lost.</p></div>`;
        }
    }
}

function renderHome() {
    const app = document.getElementById('app'); app.innerHTML = '';
    const home = db.filter(r => r.Page === 'Home');
    renderRows(home, null, true);
    
    const recents = db.filter(r => r.Page !== 'Home' && r.Page !== 'Footer')
                      .sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0))
                      .slice(0, 6);
    if(recents.length) renderRows(recents, "Recent Activity", true, true);
}

function renderIndex() {
    // Collapse Header
    const h = document.getElementById('main-header');
    h.className = ''; 
    document.getElementById('nav-stack').innerHTML = ''; // Hide Nav
    
    const app = document.getElementById('app');
    app.innerHTML = '<div class="section layout-hero"><h1>Index</h1></div><div class="section index-list"></div>';
    
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
        if(cat==='Projects') catClass='cat-projects';
        if(cat==='Professional') catClass='cat-professional';
        if(cat==='Personal') catClass='cat-personal';
        
        let html = `<div class="index-group ${catClass}"><h3>${cat}</h3>`;
        items.forEach(p => {
            const r = db.find(x => x.Page === p);
            html += `<a href="#${p}" class="index-link">${r ? r.Title : p.split('/').pop()}</a>`;
        });
        list.innerHTML += html + '</div>';
    }
}

function renderRows(rows, title, append, forceGrid, isArticleMode=false) {
    const app = document.getElementById('app');
    if(title) app.innerHTML += `<h2 style="text-align:center; font-weight:400; color:#888; margin-bottom:20px;">${title}</h2>`;
    
    let container = app.querySelector('.grid-container');
    if(!container || !append) {
        container = document.createElement('div');
        container.className = forceGrid ? 'grid-container section' : 'section';
        app.appendChild(container);
    }

    rows.forEach(r => {
        if(!r.Page || r.Page==='Footer') return;
        
        // PARSE CONTENT
        let contentHtml = processText(r.Content);
        
        // MEDIA LOGIC
        let mediaHtml = '';
        const modelMatch = r.Content ? r.Content.match(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/i) : null;
        
        if(modelMatch) {
            mediaHtml = `<div class="row-media"><div class="embed-wrapper stl" data-src="${modelMatch[1].trim()}" data-color="${modelMatch[2]||''}"></div></div>`;
            contentHtml = contentHtml.replace(/<div class="embed-wrapper stl".*?<\/div>/, ''); // Remove duplications
        } else if(r.Media) {
            mediaHtml = `<div class="row-media"><img src="${getThumbnail(r.Media)}" loading="lazy"></div>`;
        } else if (forceGrid) {
            mediaHtml = `<div class="row-media placeholder"><span>${r.Title}</span></div>`;
        }

        // CLASS LOGIC
        let catClass = '';
        if(r.Page.startsWith('Projects')) catClass = 'cat-projects';
        else if(r.Page.startsWith('Professional')) catClass = 'cat-professional';
        else if(r.Page.startsWith('Personal')) catClass = 'cat-personal';

        if(isArticleMode && !forceGrid && (!r.SectionType || r.SectionType === 'card')) {
            // ARTICLE VIEW
            if(modelMatch || r.Media) mediaHtml = mediaHtml.replace('row-media', 'row-media article-mode');
            else mediaHtml = '';
            
            const d = document.createElement('div'); d.className = 'layout-text';
            d.innerHTML = `${mediaHtml}<h2>${r.Title}</h2>
                           <div class="article-meta-row"><span class="author-link">SAHIB VIRDEE</span></div>
                           <p>${contentHtml}</p>`;
            app.appendChild(d);
        } else if (!forceGrid && r.SectionType === 'quote') {
            // QUOTE VIEW
            const d = document.createElement('div'); d.className = 'layout-quote';
            renderQuoteCard(d);
            app.appendChild(d);
        } else if (!forceGrid && r.SectionType === 'hero') {
            const d = document.createElement('div'); d.className = 'layout-hero';
            d.innerHTML = `<h1>${r.Title}</h1><p>${processText(r.Content)}</p>`;
            app.appendChild(d);
        } else {
            // CARD VIEW
            const d = document.createElement('div');
            d.className = `layout-grid clickable-block ${catClass}`;
            d.setAttribute('data-link', r.LinkURL || `#${r.Page}`);
            d.innerHTML = `${mediaHtml}<h3>${r.Title}</h3><p>${contentHtml}</p>`;
            
            // Meta chips
            let meta = '';
            if(r.Tags) {
                meta = '<div class="meta-row">';
                r.Tags.split(',').forEach(t => meta += `<span class="chip" data-tag="${t.trim()}">${t.trim()}</span>`);
                meta += '</div>';
            }
            d.innerHTML += meta;
            container.appendChild(d);
        }
    });
    
    setTimeout(init3DViewers, 500);
}

/* --- UTILS --- */
function processText(t) {
    if(!t) return '';
    let clean = t; // Assume safe input or sanitize here
    
    // 1. 3D Shortcode
    clean = clean.replace(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/gi, (match, url, color) => 
        `<div class="embed-wrapper stl" data-src="${url.trim()}" data-color="${color ? color.trim() : ''}"></div>`);
    
    // 2. Inline Galleries [url, url]
    clean = clean.replace(/\[\s*(https?:\/\/[^\]]+)\s*\]/gi, (match, content) => {
        const urls = content.split(',').map(u => u.trim());
        if(!urls.every(u => u.startsWith('http'))) return match;
        const imgs = urls.map(u => `<img src="${u}" class="inline-img zoomable">`).join('');
        return `<div class="inline-gallery">${imgs}</div>`;
    });

    // 3. Other Embeds
    clean = clean.replace(/\{\{YOUTUBE: (.*?)\}\}/g, '<div class="embed-wrapper video"><iframe src="$1" allowfullscreen></iframe></div>');
    
    return clean;
}

function renderQuoteCard(c) {
    if(!quotesDb.length) return;
    const q = quotesDb[Math.floor(Math.random() * quotesDb.length)];
    const len = q.Quote.length;
    let size = 'medium';
    if(len < 50) size = 'short';
    if(len > 150) size = 'long';
    
    c.innerHTML = `<blockquote class="${size}">"${q.Quote}"</blockquote>
                   <div class="quote-footer"><div class="author">— ${q.Author}</div>
                   <svg class="refresh-btn" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></div>`;
}

function refreshQuote(c) {
    c.classList.add('loading');
    setTimeout(() => { renderQuoteCard(c); c.classList.remove('loading'); }, 400);
}

function fetchGitHubStats() {
    fetch('https://api.github.com/repos/sahibdsv/sahibdsv.github.io').then(r=>r.json()).then(d => {
        if(d.pushed_at) {
            const s = Math.floor((new Date() - new Date(d.pushed_at)) / 1000);
            let time = "just now";
            if(s>60) time = Math.floor(s/60) + " mins ago";
            if(s>3600) time = Math.floor(s/3600) + " hours ago";
            if(s>86400) time = Math.floor(s/86400) + " days ago";
            document.getElementById('version-tag').innerHTML = `Updated ${time}`;
        }
    }).catch(()=>{});
}

function getThumbnail(u) {
    if(u.includes('youtube') || u.includes('youtu.be')) {
        let v = u.split('v=')[1] || u.split('/').pop();
        return `https://img.youtube.com/vi/${v}/mqdefault.jpg`;
    }
    return u;
}

/* --- 3D ENGINE --- */
function init3DViewers() {
    const containers = document.querySelectorAll('.embed-wrapper.stl:not(.loaded)');
    if(!containers.length) return;

    import('three').then(THREE => {
        import('three/addons/loaders/STLLoader.js').then(({STLLoader}) => {
            import('three/addons/controls/OrbitControls.js').then(({OrbitControls}) => {
                
                const observer = new IntersectionObserver(entries => {
                    entries.forEach(e => {
                        if(e.isIntersecting) {
                            loadModel(e.target, THREE, STLLoader, OrbitControls);
                            observer.unobserve(e.target);
                        }
                    });
                });
                containers.forEach(c => observer.observe(c));
            });
        });
    });
}

function loadModel(c, THREE, STLLoader, OrbitControls) {
    c.classList.add('loaded');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, c.clientWidth/c.clientHeight, 0.1, 1000);
    
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(c.clientWidth, c.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace; // FIX
    c.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.autoRotate = true;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    new STLLoader().load(c.dataset.src, (geo) => {
        const mat = new THREE.MeshPhongMaterial({ color: c.dataset.color || 0x999999, specular: 0x111111 });
        const mesh = new THREE.Mesh(geo, mat);
        
        // Center
        geo.computeBoundingBox();
        const center = geo.boundingBox.getCenter(new THREE.Vector3());
        mesh.position.sub(center);
        scene.add(mesh);

        // Zoom
        const size = geo.boundingBox.getSize(new THREE.Vector3()).length();
        camera.position.set(size, size, size);
        camera.lookAt(0,0,0);

        c.classList.add('ready');
        
        function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
        animate();
    });
}

function resetToHome() { window.location.hash = ''; }
function toggleSearch() { document.getElementById('search-overlay').classList.toggle('active'); document.getElementById('main-header').classList.toggle('search-mode'); }
function closeSearch() { document.getElementById('search-overlay').classList.remove('active'); document.getElementById('main-header').classList.remove('search-mode'); }

init();