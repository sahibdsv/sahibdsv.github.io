import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* --- CONFIG --- */
const CONFIG = {
    sheets: {
        main: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv",
        quotes: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=540861260&single=true&output=csv",
        resume: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=1812444133&single=true&output=csv",
        custom: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=1529790368&single=true&output=csv"
    },
    cache_key: 'sahib_v2_cache',
    cache_ttl: 3600000 // 1 Hour
};

/* --- STATE --- */
const State = {
    db: [],
    quotes: [],
    resume: [],
    nav: [],
    models: [], // Active 3D instances
    searchOpen: false
};

/* --- UTILS: MARKDOWN ENGINE --- */
const MD = {
    parse(text) {
        if (!text) return '';
        const lines = text.split(/\n|<br>/);
        let out = [];
        let inBlock = null; // 'code', 'quote', 'list'
        let buffer = [];

        const flush = () => {
            if (inBlock === 'code') {
                out.push(`<pre><code>${buffer.join('\n')}</code></pre>`);
            } else if (inBlock === 'quote') {
                // Check for callout
                const first = buffer[0];
                const match = first.match(/^\[!(.*?)\]/); // [!WARNING]
                if (match) {
                    const type = match[1].toLowerCase();
                    buffer[0] = buffer[0].replace(/^\[!.*?\]\s*/, '');
                    out.push(`<div class="callout" data-type="${type}">${MD.inline(buffer.join('<br>'))}</div>`);
                } else {
                    out.push(`<blockquote>${MD.inline(buffer.join('<br>'))}</blockquote>`);
                }
            }
            buffer = [];
            inBlock = null;
        };

        for (let line of lines) {
            line = line.replace(/^\r/, ''); // Cleanup CR

            // CODE BLOCKS
            if (line.trim().startsWith('```')) {
                if (inBlock === 'code') flush();
                else { flush(); inBlock = 'code'; }
                continue;
            }

            // BLOCKQUOTES
            if (line.startsWith('> ')) {
                if (inBlock !== 'quote') flush();
                inBlock = 'quote';
                buffer.push(line.slice(2));
                continue;
            }

            if (inBlock) {
                if (inBlock === 'code') buffer.push(line);
                else { flush(); out.push(MD.line(line)); }
            } else {
                out.push(MD.line(line));
            }
        }
        flush();
        return out.join('');
    },

    line(l) {
        if (!l.trim()) return '';
        // Horizontal Rule
        if (l.match(/^---|-{3,}$/)) return '<hr>';
        // Headers
        if (l.startsWith('# ')) return `<h1>${l.slice(2)}</h1>`;
        if (l.startsWith('## ')) return `<h2>${l.slice(3)}</h2>`;
        if (l.startsWith('### ')) return `<h3>${l.slice(4)}</h3>`;
        // List Items
        if (l.trim().startsWith('- ')) return `<li>${MD.inline(l.slice(2))}</li>`;

        // Paragraph
        return `<p>${MD.inline(l)}</p>`;
    },

    inline(t) {
        // Bold, Italic, Link, Image, Embeds
        t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/\*(.*?)\*/g, '<em>$1</em>');
        t = t.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Links: [Text](Url)
        t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, txt, url) => {
            if (url.match(/\.(jpg|png|webp)$/i)) return `<img src="${url}" alt="${txt}">`;
            if (url.match(/\.(stl|glb)$/i)) return `<div class="embed-wrapper stl" data-src="${url}"></div>`;
            return `<a href="${url}" target="_blank">${txt}</a>`;
        });

        // Auto-Embeds (Naked URLs)
        // YouTube, Maps, etc. (Simplified)
        return t;
    }
};

/* --- CORE: APP --- */
const App = {
    async init() {
        this.loadCached();
        this.setupRouter();
        await this.refreshData();
        this.render();
    },

    loadCached() {
        try {
            const c = localStorage.getItem(CONFIG.cache_key);
            if (c) {
                const json = JSON.parse(c);
                if (Date.now() - json.ts < CONFIG.cache_ttl) {
                    State.db = json.data.main;
                    State.quotes = json.data.quotes;
                    State.resume = json.data.resume;
                    console.log('Loaded from cache');
                }
            }
        } catch (e) { }
    },

    async refreshData() {
        try {
            const [m, q, r] = await Promise.all([
                this.fetch(CONFIG.sheets.main),
                this.fetch(CONFIG.sheets.quotes),
                this.fetch(CONFIG.sheets.resume)
            ]);
            // clean
            State.db = m.filter(x => x.Title || x.Content);
            State.quotes = q;
            State.resume = r;

            localStorage.setItem(CONFIG.cache_key, JSON.stringify({
                ts: Date.now(),
                data: { main: State.db, quotes: State.quotes, resume: State.resume }
            }));

            this.buildNav();
        } catch (e) { console.error(e); }
    },

    fetch(url) {
        return new Promise((resolve) => {
            Papa.parse(url, {
                download: true, header: true, skipEmptyLines: true,
                complete: (r) => resolve(r.data),
                error: () => resolve([])
            });
        });
    },

    setupRouter() {
        window.addEventListener('hashchange', () => this.render());
        document.getElementById('search-trigger').onclick = () => this.toggleSearch();
        document.getElementById('search-overlay').onclick = (e) => {
            if (e.target.id === 'search-overlay') this.toggleSearch();
        };
        document.getElementById('search-input').oninput = (e) => this.runSearch(e.target.value);
    },

    buildNav() {
        const nav = document.getElementById('nav-container');
        const pages = [...new Set(State.db.filter(x => x.Page && !x.Page.includes('/') && x.Page !== 'Home').map(x => x.Page))];

        // Add hardcoded links
        let html = `<div class="nav-link" onclick="location.hash='Home'">Home</div>`;
        pages.forEach(p => {
            html += `<div class="nav-link" onclick="location.hash='${p}'">${p}</div>`;
        });
        html += `<div class="nav-link" onclick="location.hash='Professional/Resume'">Resume</div>`;
        nav.innerHTML = html;
    },

    render() {
        const hash = location.hash.substring(1) || 'Home';
        const app = document.getElementById('app');

        // reset scrolling
        window.scrollTo(0, 0);
        this.cleanup3D();

        // 1. Resume
        if (hash.includes('Resume')) {
            ResumeRenderer.render(app);
            return;
        }

        // 2. Index
        if (hash === 'Index') {
            app.innerHTML = `<h1>Index</h1><p>Not implemented yet, use search or nav.</p>`;
            return;
        }

        // 3. Page / Feed
        const items = State.db.filter(r => r.Page === hash || r.Page.startsWith(hash + '/'));
        if (items.length === 0) {
            app.innerHTML = `<div style="text-align:center; padding:50px;">
                <h2>404</h2><p>Page not found.</p>
                <button class="btn-pill" onclick="location.hash='Home'">Go Home</button>
            </div>`;
            return;
        }

        let html = `<div class="section-title"><h1>${hash.replace('/', ' / ')}</h1></div><div class="grid">`;
        items.forEach(item => {
            html += this.renderCard(item);
        });
        html += `</div>`;
        app.innerHTML = html;

        this.init3D(app);
    },

    renderCard(item) {
        const img = item.Image ? `<div class="card-img"><img src="${item.Image}" loading="lazy"></div>` : '';
        const tags = item.Tags ? item.Tags.split(',').map(t => `<span class="chip">${t.trim()}</span>`).join('') : '';

        // If it's just a text block (Hero), render differently? 
        // For V2, we force everything into cards or 'full' blocks based on SectionType
        let classes = "card";
        if (item.SectionType === 'Hero') classes += " hero-card";

        return `
        <div class="${classes}" onclick="location.hash = '${item.Page}/${item.Title}'">
            ${img}
            <div class="card-title">${item.Title}</div>
            <div class="card-content">${MD.parse(item.Content || '').slice(0, 150)}...</div>
            <div class="card-meta">${tags}</div>
        </div>`;
    },

    toggleSearch() {
        State.searchOpen = !State.searchOpen;
        const ov = document.getElementById('search-overlay');
        ov.classList.toggle('active', State.searchOpen);
        if (State.searchOpen) document.getElementById('search-input').focus();
    },

    runSearch(q) {
        if (!q) { this.render(); return; }
        const term = q.toLowerCase();
        const hits = State.db.filter(x =>
            (x.Title && x.Title.toLowerCase().includes(term)) ||
            (x.Content && x.Content.toLowerCase().includes(term))
        );
        const app = document.getElementById('app');
        let html = `<div class="section-title"><h2>Search: "${q}"</h2></div><div class="grid">`;
        hits.forEach(h => html += this.renderCard(h));
        html += `</div>`;
        app.innerHTML = html;
    },

    /* --- 3D VIEWER --- */
    init3D(root) {
        const els = root.querySelectorAll('.embed-wrapper.stl');
        els.forEach(el => {
            const url = el.getAttribute('data-src');
            if (url) new Viewer3D(el, url);
        });
    },

    cleanup3D() {
        State.models.forEach(m => m.dispose());
        State.models = [];
    }
};

/* --- VIEWER CLASS --- */
class Viewer3D {
    constructor(container, url) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);

        this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / 300, 0.1, 1000); // approx height
        this.camera.position.set(20, 20, 20);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, 300); // Fixed height for now
        container.innerHTML = '';
        container.appendChild(this.renderer.domElement);

        const light = new THREE.DirectionalLight(0xffffff, 2);
        light.position.set(1, 1, 1);
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0x404040));

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        const loader = new STLLoader();
        loader.load(url, (geo) => {
            const mat = new THREE.MeshStandardMaterial({ color: 0x00ff88, metalness: 0.5, roughness: 0.5 });
            const mesh = new THREE.Mesh(geo, mat);

            // Center
            geo.computeBoundingBox();
            const center = geo.boundingBox.getCenter(new THREE.Vector3());
            mesh.position.sub(center);

            this.scene.add(mesh);
        });

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
        State.models.push(this);
    }

    animate() {
        if (!this.renderer) return;
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.animate);
    }

    dispose() {
        this.renderer.dispose();
        // this.scene.clear();
        this.renderer = null;
    }
}

/* --- RESUME RENDERER --- */
const ResumeRenderer = {
    render(container) {
        const data = State.resume.length ? State.resume : State.db.filter(x => x.Page === 'Professional/Resume');
        // Filter out headers etc
        const headers = data.filter(r => r.SectionType && r.SectionType.toLowerCase() === 'header');
        const exp = data.filter(r => r.SectionType === 'Experience');
        const edu = data.filter(r => r.SectionType === 'Education');

        const headerHTML = headers.map(h => {
            const [name, role] = (h.Title || '').split('|');
            return `<div class="resume-header"><h1>${name}</h1><h3>${role}</h3><p>${MD.inline(h.Content || '')}</p></div>`;
        }).join('');

        const renderSection = (title, items) => {
            if (!items.length) return '';
            return `<div class="resume-section"><h2>${title}</h2>` +
                items.map(i => `
                <div class="resume-entry">
                    <div class="resume-role">
                        <span>${i.Title}</span>
                        <span>${i.Tags || ''}</span>
                    </div>
                    <div class="resume-list">${MD.parse(i.Content || '')}</div>
                </div>
             `).join('') + `</div>`;
        };

        container.innerHTML = `
            <div class="resume-container">
                ${headerHTML}
                <div class="resume-grid">
                     <div class="resume-left">
                        ${renderSection('Education', edu)}
                     </div>
                     <div class="resume-right">
                        ${renderSection('Experience', exp)}
                     </div>
                </div>
            </div>
        `;
    }
};

/* --- BOOT --- */
document.addEventListener('DOMContentLoaded', () => App.init());
