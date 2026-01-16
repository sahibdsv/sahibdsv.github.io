/* assets/js/app.js */

let db = [], quotesDb = [];

/* --- INITIALIZATION --- */
const init = () => {
    // loadData() is defined in api.js
    loadData().then(([m, q]) => {
        db = m.filter(r => r.Title); 
        quotesDb = q;
        
        if(window.location.search) history.replaceState(null, null, window.location.pathname + window.location.hash);
        
        initApp(); 
        renderFooter(db); 
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

function initApp() {
    buildNav(db); 
    handleRouting();
    
    // LISTENERS
    window.addEventListener('hashchange', handleRouting);
    window.addEventListener('search-closed', handleRouting); 

    // GOATCOUNTER
    window.addEventListener('hashchange', function(e) {
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({
                path: location.pathname + location.search + location.hash,
                title: location.hash.substring(1) || 'Home',
                event: false,
            });
        }
    });

    // SCROLL
    window.addEventListener('scroll', () => { 
        const h = document.getElementById('main-header'); 
        const shouldShrink = window.scrollY > 50;
        h.classList.toggle('shrink', shouldShrink);
    });

    // GLOBAL CLICKS
    document.addEventListener('click', (e) => {
        const overlay = document.getElementById('search-overlay');
        const controls = document.getElementById('search-controls');
        // Close search if clicking outside
        if (overlay.classList.contains('active') && !overlay.contains(e.target) && !controls.contains(e.target)) {
            closeSearch();
        }
    });

    document.getElementById('app').addEventListener('click', (e) => {
        // Quote Refresh
        if(e.target.closest('.refresh-btn')) { 
            const quoteContainer = e.target.closest('.layout-quote');
            if(quoteContainer && !quoteContainer.classList.contains('loading')) {
                quoteContainer.classList.add('loading');
                quoteContainer.innerHTML = `<div class="sk-box quote" style="height:100px; width:100%; margin:0 auto;"></div>`;
                setTimeout(() => {
                    renderQuoteCard(quoteContainer, quotesDb);
                    quoteContainer.classList.remove('loading');
                }, 600); 
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
        
        // Chip Clicking
        if(e.target.classList.contains('chip')) { 
            e.stopPropagation();
            if(isSearchOpen()) closeSearch(); 
            const tag = e.target.getAttribute('data-tag');
            const date = e.target.getAttribute('data-date');
            if(date) window.location.hash = 'Filter:' + date;
            else if(tag) window.location.hash = 'Filter:' + tag;
            return; 
        }
        
        // Card Clicking
        const block = e.target.closest('.clickable-block');
        if(block && !e.target.classList.contains('chip')) {
            const link = block.getAttribute('data-link'), target = block.getAttribute('data-target');
            if(link) { 
                if(target === '_blank') window.open(link, '_blank'); 
                else { 
                    window.location.href = link; 
                    if(isSearchOpen()) closeSearch(); 
                } 
            }
        }
    });
}

function handleRouting() { 
    if(isSearchOpen()) return; 
    window.scrollTo(0, 0); 
    let h = window.location.hash.substring(1) || 'Home'; 
    
    if(h === 'Index') { renderIndex(db); return; }
    
    // STATE: Collapse Header for Home, Filter, OR Index
    const shouldCollapse = (h === 'Home' || h.startsWith('Filter:') || h === 'Index');
    document.body.classList.toggle('header-expanded', !shouldCollapse);
    document.getElementById('main-header').classList.toggle('expanded', !shouldCollapse);
    
    // Highlight Nav
    const top = h.split('/')[0]; 
    document.querySelectorAll('#primary-nav .nav-link').forEach(a => { const href = a.getAttribute('href'); if(href) a.classList.toggle('active', href.replace('#', '') === top); }); 
    
    buildSubNav(top, db); 
    
    if(h.startsWith('Filter:')) { renderFiltered(decodeURIComponent(h.split(':')[1]), db); } 
    else { renderPage(h, db); }
}

// Global binding for HTML click handlers
// (Just in case your HTML calls them directly)
window.toggleSearch = toggleSearch;
window.handleSearch = (val) => handleSearch(val, db);
window.resetToHome = resetToHome;
window.closeSearch = closeSearch;

// Start!
init();