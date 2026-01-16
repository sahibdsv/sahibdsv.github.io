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
    document.getElementById('app').innerHTML = `
      <div class="layout-404">
        <h1>⚠</h1>
        <h2>${e.message}</h2>
        <p>Please check your internet connection.</p>
      </div>`;
  });
};

const fetchData = async () => {
  try {
    const configResp = await fetch('config.json');
    const config = configResp.ok ? await configResp.json() : FALLBACK_CONFIG;
    const [main, quotes] = await Promise.all([
      Papa.parsePromise(config.main_sheet),
      Papa.parsePromise(config.quotes_sheet)
    ]);
    return [main.data, quotes.data];
  } catch (e) {
    throw new Error('Failed to load data');
  }
};

Papa.parsePromise = (url) => new Promise((resolve, reject) => {
  Papa.parse(url, { download: true, header: true, skipEmptyLines: true, complete: resolve, error: reject });
});

/* ========== HEADER STATE & NAVIGATION ========== */

let currentMainCategory = null;
let currentSecondaryCategory = null;
let currentTertiaryCategory = null;
let lastScrollY = 0;
let scrollDirection = 'down';

const initApp = () => {
  setupHeader();
  setupSearch();
  setupLightbox();
  handleRoute();
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('scroll', handleScroll);
};

const setupHeader = () => {
  const brandName = document.getElementById('brand-name');
  const navLinks = document.querySelectorAll('.nav-link');

  brandName.addEventListener('click', () => {
    window.location.hash = '';
  });

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('href');
      window.location.hash = target;
    });
  });
};

const handleScroll = () => {
  const currentScrollY = window.scrollY;
  const header = document.getElementById('main-header');
  
  // Determine scroll direction
  if (currentScrollY > lastScrollY) {
    scrollDirection = 'down';
  } else {
    scrollDirection = 'up';
  }
  
  // State C: Hide brand row when scrolled down (but NOT on homepage without selection)
  if (currentScrollY > 50 && (currentMainCategory || currentSecondaryCategory)) {
    header.classList.add('hide-brand');
  } else if (currentScrollY < 50) {
    // State D: Show brand row only near absolute top
    header.classList.remove('hide-brand');
  }
  
  lastScrollY = currentScrollY;
  updateDynamicOffset();
};

const updateDynamicOffset = () => {
  const header = document.getElementById('main-header');
  const headerHeight = header.offsetHeight;
  document.body.style.paddingTop = `${headerHeight}px`;
};

const updateHeaderState = () => {
  const header = document.getElementById('main-header');
  const primaryNav = document.getElementById('primary-nav');
  const subNav = document.getElementById('sub-nav');
  const tertiaryNav = document.getElementById('tertiary-nav');
  const navLinks = document.querySelectorAll('.nav-link');

  // Clear active states
  navLinks.forEach(link => link.classList.remove('active'));

  // Update Main nav active state
  if (currentMainCategory) {
    const activeLink = document.querySelector(`.nav-link[href="#${currentMainCategory}"]`);
    if (activeLink) activeLink.classList.add('active');
  }

  // Handle sub-nav (Secondary row)
  if (currentMainCategory && !isSearchActive) {
    populateSecondaryNav();
    subNav.classList.add('active');
  } else {
    subNav.classList.remove('active');
    subNav.innerHTML = '';
  }

  // Handle tertiary-nav (Third row)
  if (currentSecondaryCategory && !isSearchActive) {
    populateTertiaryNav();
  } else {
    tertiaryNav.classList.remove('active');
    tertiaryNav.innerHTML = '';
  }

  // Update dynamic offset after state changes
  setTimeout(updateDynamicOffset, 50);
};

const populateSecondaryNav = () => {
  const subNav = document.getElementById('sub-nav');
  const secondaryItems = [...new Set(
    db.filter(r => r.Category === currentMainCategory && r.Secondary)
      .map(r => r.Secondary)
  )].sort();

  subNav.innerHTML = secondaryItems.map(item => 
    `<a href="#" class="fill-anim sub-nav-link ${currentSecondaryCategory === item ? 'active' : ''}" data-secondary="${item}">${item}</a>`
  ).join('');

  // Attach event listeners
  subNav.querySelectorAll('.sub-nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const secondary = link.dataset.secondary;
      if (currentSecondaryCategory === secondary) {
        currentSecondaryCategory = null;
        currentTertiaryCategory = null;
      } else {
        currentSecondaryCategory = secondary;
        currentTertiaryCategory = null;
      }
      updateHeaderState();
      renderRows();
    });
  });
};

const populateTertiaryNav = () => {
  const tertiaryNav = document.getElementById('tertiary-nav');
  const tertiaryItems = [...new Set(
    db.filter(r => 
      r.Category === currentMainCategory && 
      r.Secondary === currentSecondaryCategory && 
      r.Tertiary
    ).map(r => r.Tertiary)
  )].sort();

  if (tertiaryItems.length === 0) {
    tertiaryNav.classList.remove('active');
    tertiaryNav.innerHTML = '';
    return;
  }

  tertiaryNav.innerHTML = tertiaryItems.map(item => 
    `<a href="#" class="fill-anim tertiary-nav-link ${currentTertiaryCategory === item ? 'active' : ''}" data-tertiary="${item}">${item}</a>`
  ).join('');

  tertiaryNav.classList.add('active');

  // Attach event listeners
  tertiaryNav.querySelectorAll('.tertiary-nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tertiary = link.dataset.tertiary;
      if (currentTertiaryCategory === tertiary) {
        currentTertiaryCategory = null;
      } else {
        currentTertiaryCategory = tertiary;
      }
      updateHeaderState();
      renderRows();
    });
  });
};

/* ========== ROUTING ========== */

const handleRoute = () => {
  const hash = window.location.hash.slice(1);
  const app = document.getElementById('app');

  // Close search
  if (isSearchActive) toggleSearch();

  // Reset filters when changing routes
  currentSecondaryCategory = null;
  currentTertiaryCategory = null;

  if (hash === 'Index') {
    currentMainCategory = null;
    renderIndex();
  } else if (hash === 'Timeline') {
    currentMainCategory = null;
    renderTimeline();
  } else if (['Projects', 'Professional', 'Personal'].includes(hash)) {
    currentMainCategory = hash;
    renderRows();
  } else if (hash && hash !== 'Index' && hash !== 'Timeline') {
    renderArticle(hash);
  } else {
    currentMainCategory = null;
    renderHomepage();
  }

  updateHeaderState();
  app.scrollIntoView({ behavior: 'instant', block: 'start' });
};

/* ========== SEARCH ========== */

const setupSearch = () => {
  const searchIcon = document.querySelector('.search-icon');
  const closeIcon = document.querySelector('.close-icon');
  const searchInput = document.getElementById('search-input');

  searchIcon.addEventListener('click', () => toggleSearch(true));
  closeIcon.addEventListener('click', () => toggleSearch(false));

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query.length > 0) {
      performSearch(query);
    } else {
      handleRoute();
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleSearch(false);
  });
};

const toggleSearch = (open = null) => {
  const header = document.getElementById('main-header');
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');

  isSearchActive = open !== null ? open : !isSearchActive;

  if (isSearchActive) {
    header.classList.add('search-mode');
    overlay.classList.add('active');
    setTimeout(() => input.focus(), 100);
  } else {
    header.classList.remove('search-mode');
    overlay.classList.remove('active');
    input.value = '';
    handleRoute();
  }
};

const performSearch = (query) => {
  const results = db.filter(r => 
    r.Title.toLowerCase().includes(query) ||
    (r.Description && r.Description.toLowerCase().includes(query)) ||
    (r.Tags && r.Tags.toLowerCase().includes(query))
  );

  const app = document.getElementById('app');
  if (results.length === 0) {
    app.innerHTML = `
      <div class="layout-404">
        <h1>🔍</h1>
        <h2>No Results</h2>
        <p>No entries match your query.</p>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="section">
      <div class="layout-hero">
        <h1>Search Results</h1>
        <p>${results.length} result${results.length !== 1 ? 's' : ''} for "${query}"</p>
      </div>
      <div class="grid-container">${results.map(renderCard).join('')}</div>
    </div>`;
  
  attachCardListeners();
};

/* ========== RENDER: HOMEPAGE ========== */

const renderHomepage = () => {
  const app = document.getElementById('app');
  
  // Separate featured and regular cards
  const featured = db.filter(r => r.Tags && r.Tags.toLowerCase().includes('featured'));
  const regular = db.filter(r => !r.Tags || !r.Tags.toLowerCase().includes('featured'));
  
  let html = '';
  
  // Featured section (pinned to top)
  if (featured.length > 0) {
    html += `
      <div class="section">
        <div class="grid-container">${featured.map(renderCard).join('')}</div>
      </div>`;
  }
  
  // Random quote
  if (quotesDb.length > 0) {
    const randomQuote = quotesDb[Math.floor(Math.random() * quotesDb.length)];
    html += renderQuote(randomQuote);
  }
  
  // Regular cards
  if (regular.length > 0) {
    html += `
      <div class="section">
        <div class="grid-container">${regular.map(renderCard).join('')}</div>
      </div>`;
  }

  app.innerHTML = html;
  attachCardListeners();
  attachQuoteListeners();
};

/* ========== RENDER: CATEGORY ROWS ========== */

const renderRows = () => {
  const app = document.getElementById('app');
  
  let filtered = db.filter(r => r.Category === currentMainCategory);
  
  if (currentSecondaryCategory) {
    filtered = filtered.filter(r => r.Secondary === currentSecondaryCategory);
  }
  
  if (currentTertiaryCategory) {
    filtered = filtered.filter(r => r.Tertiary === currentTertiaryCategory);
  }

  if (filtered.length === 0) {
    app.innerHTML = `
      <div class="layout-404">
        <h1>📭</h1>
        <h2>Nothing Here Yet</h2>
        <p>This page doesn't exist in the database yet.</p>
        <a href="#" class="btn-primary">Return to Base</a>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="section">
      <div class="grid-container">${filtered.map(renderCard).join('')}</div>
    </div>`;
  
  attachCardListeners();
};

/* ========== RENDER: INDEX ========== */

const renderIndex = () => {
  const app = document.getElementById('app');
  const categories = ['Projects', 'Professional', 'Personal'];
  
  const indexHTML = categories.map(cat => {
    const items = db.filter(r => r.Category === cat);
    
    // Sort alphabetically
    items.sort((a, b) => a.Title.localeCompare(b.Title));
    
    // Group by Secondary, then Tertiary
    const grouped = {};
    items.forEach(item => {
      const secondary = item.Secondary || 'Other';
      if (!grouped[secondary]) grouped[secondary] = [];
      grouped[secondary].push(item);
    });
    
    const links = Object.entries(grouped).map(([secondary, items]) => {
      return items.map(item => {
        const isTertiary = item.Tertiary ? true : false;
        const slug = item.Slug || item.Title.replace(/\s+/g, '-');
        const date = item.Date ? `<span>${item.Date}</span>` : '';
        return `<a href="#${slug}" class="index-link fill-anim ${isTertiary ? 'tertiary' : ''}" style="--text-base: #999; --text-hover: #fff;">
          ${item.Title}${date}
        </a>`;
      }).join('');
    }).join('');

    return `
      <div class="index-group cat-${cat.toLowerCase()}">
        <h3>${cat}</h3>
        ${links}
      </div>`;
  }).join('');

  app.innerHTML = `
    <div class="section">
      <div class="layout-hero">
        <h1>Index</h1>
        <p>Complete archive of all entries</p>
      </div>
      <div class="index-list">${indexHTML}</div>
    </div>`;
};

/* ========== RENDER: TIMELINE ========== */

const renderTimeline = () => {
  const app = document.getElementById('app');
  
  // Filter items with dates
  const dated = db.filter(r => r.Date).map(r => {
    const [year, month] = r.Date.split('-');
    return { ...r, year, month, monthNum: parseInt(month) };
  });
  
  // Group by year and month
  const grouped = {};
  dated.forEach(item => {
    const key = `${item.year}-${item.month}`;
    if (!grouped[key]) grouped[key] = { year: item.year, month: item.month, monthNum: item.monthNum, items: [] };
    grouped[key].items.push(item);
  });
  
  // Sort by date (newest first)
  const sorted = Object.values(grouped).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.monthNum - a.monthNum;
  });
  
  // Month names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const timelineHTML = sorted.map(group => {
    // Sort items alphabetically within month
    group.items.sort((a, b) => a.Title.localeCompare(b.Title));
    
    return `
      <div class="timeline-month">
        <div class="timeline-date">
          <h3>${monthNames[group.monthNum - 1]}</h3>
          <p>${group.year}</p>
        </div>
        <div class="timeline-cards" data-timeline-cards>
          ${group.items.map(renderCard).join('')}
        </div>
      </div>`;
  }).join('');
  
  app.innerHTML = `
    <div class="section">
      <div class="layout-hero">
        <h1>Timeline</h1>
        <p>Chronological view of all entries</p>
      </div>
      <div class="timeline-container">${timelineHTML}</div>
    </div>`;
  
  attachCardListeners();
  setupTimelineScroll();
};

const setupTimelineScroll = () => {
  const timelineCards = document.querySelectorAll('[data-timeline-cards]');
  
  timelineCards.forEach(container => {
    const checkScroll = () => {
      const isAtEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 5;
      container.classList.toggle('at-end', isAtEnd);
    };
    
    container.addEventListener('scroll', checkScroll);
    checkScroll(); // Initial check
  });
};

/* ========== RENDER: ARTICLE ========== */

const renderArticle = (slug) => {
  const app = document.getElementById('app');
  const row = db.find(r => (r.Slug || r.Title.replace(/\s+/g, '-')) === slug);

  if (!row) {
    app.innerHTML = `
      <div class="layout-404">
        <h1>404</h1>
        <h2>Entry Not Found</h2>
        <p>This page doesn't exist in the database yet.</p>
        <a href="#" class="btn-primary">Return to Base</a>
      </div>`;
    return;
  }

  currentMainCategory = null;

  const media = renderArticleMedia(row);
  const body = parseBodyLayouts(row.Body || '');
  const tags = row.Tags ? row.Tags.split(',').map(t => t.trim()).map(tag => 
    `<span class="chip">${tag}</span>`
  ).join('') : '';

  const metaRow = `
    <div class="article-meta-row">
      ${row.Author ? `<a href="${row.AuthorURL || '#'}" class="author-link" ${row.AuthorURL ? 'target="_blank"' : ''}>${row.Author}</a>` : ''}
      ${row.URL ? `<a href="${row.URL}" class="article-link-btn" target="_blank" title="External Link">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>` : ''}
      <div class="article-tags">${tags}</div>
    </div>`;

  app.innerHTML = `
    <article class="section">
      <div class="layout-hero">
        <h1>${row.Title}</h1>
        ${row.Description ? `<p>${row.Description}</p>` : ''}
        <div class="hero-meta">${metaRow}</div>
      </div>
      ${media}
      ${body}
    </article>`;

  attachArticleListeners();
};

/* ========== RENDER: CARD ========== */

const renderCard = (row) => {
  const slug = row.Slug || row.Title.replace(/\s+/g, '-');
  const cat = row.Category ? row.Category.toLowerCase() : '';
  const media = renderCardMedia(row);
  const tags = row.Tags ? row.Tags.split(',').map(t => t.trim()).slice(0, 3).map(tag => 
    `<span class="chip">${tag}</span>`
  ).join('') : '';
  const date = row.Date ? `<span class="chip date">${row.Date}</span>` : '';

  const isExternal = row.URL && !row.Body;
  const target = isExternal ? '_blank' : '';
  const href = isExternal ? row.URL : `#${slug}`;

  return `
    <div class="layout-grid cat-${cat} clickable-block ${media ? '' : 'has-placeholder'}" 
         data-href="${href}" 
         ${target ? `data-target="${target}"` : ''}>
      ${media}
      <h3 class="fill-anim">${row.Title}</h3>
      ${row.Description ? `<p>${row.Description}</p>` : ''}
      <div class="meta-row">${date}${tags}</div>
    </div>`;
};

const renderCardMedia = (row) => {
  if (row.Image) {
    return `<div class="row-media"><img src="${row.Image}" alt="${row.Title}" loading="lazy"></div>`;
  }
  if (row.Embed && row.Embed.endsWith('.stl')) {
    return `<div class="row-media"><div class="embed-wrapper stl" data-stl="${row.Embed}"></div></div>`;
  }
  if (row.MediaPlaceholder) {
    return `<div class="row-media placeholder"><span>${row.MediaPlaceholder}</span></div>`;
  }
  return '';
};

const renderArticleMedia = (row) => {
  if (row.Image) {
    return `<div class="row-media article-mode"><img src="${row.Image}" alt="${row.Title}"></div>`;
  }
  if (row.Embed) {
    if (row.Embed.includes('youtube.com') || row.Embed.includes('youtu.be')) {
      const videoId = row.Embed.includes('youtu.be') 
        ? row.Embed.split('/').pop() 
        : new URL(row.Embed).searchParams.get('v');
      return `<div class="embed-wrapper video"><iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    if (row.Embed.endsWith('.stl')) {
      return `<div class="row-media article-mode"><div class="embed-wrapper stl" data-stl="${row.Embed}"></div></div>`;
    }
    if (row.Embed.includes('google.com/maps')) {
      return `<div class="embed-wrapper map"><iframe src="${row.Embed}" allowfullscreen loading="lazy"></iframe></div>`;
    }
    return `<div class="embed-wrapper doc"><iframe src="${row.Embed}" loading="lazy"></iframe></div>`;
  }
  return '';
};

/* ========== RENDER: QUOTE ========== */

const renderQuote = (quote) => {
  const text = quote.Quote || '';
  const author = quote.Author || '';
  const url = quote.URL || '';
  
  let sizeClass = 'short';
  if (text.length > 200) sizeClass = 'xxl';
  else if (text.length > 150) sizeClass = 'xl';
  else if (text.length > 100) sizeClass = 'long';
  else if (text.length > 60) sizeClass = 'medium';

  return `
    <div class="section layout-quote" data-quote-index="0">
      <blockquote class="${sizeClass}">"${text}"</blockquote>
      <div class="quote-footer">
        <span class="author">${url ? `<a href="${url}" target="_blank" class="fill-anim">${author}</a>` : author}</span>
      </div>
      <svg class="refresh-btn" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"></polyline>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
      </svg>
    </div>`;
};

const attachQuoteListeners = () => {
  document.querySelectorAll('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const container = btn.closest('.layout-quote');
      const newQuote = quotesDb[Math.floor(Math.random() * quotesDb.length)];
      container.classList.add('loading');
      
      setTimeout(() => {
        const blockquote = container.querySelector('blockquote');
        const author = container.querySelector('.author');
        const text = newQuote.Quote || '';
        const authorName = newQuote.Author || '';
        const url = newQuote.URL || '';
        
        let sizeClass = 'short';
        if (text.length > 200) sizeClass = 'xxl';
        else if (text.length > 150) sizeClass = 'xl';
        else if (text.length > 100) sizeClass = 'long';
        else if (text.length > 60) sizeClass = 'medium';
        
        blockquote.className = sizeClass;
        blockquote.textContent = `"${text}"`;
        author.innerHTML = url ? `<a href="${url}" target="_blank" class="fill-anim">${authorName}</a>` : authorName;
        
        container.classList.remove('loading');
      }, 300);
    });
  });
};

/* ========== BODY PARSER ========== */

const parseBodyLayouts = (body) => {
  if (!body) return '';
  
  const sections = body.split(/\n\s*\n/);
  return sections.map(section => {
    section = section.trim();
    
    // Gallery
    if (section.startsWith('[gallery]')) {
      const urls = section.replace('[gallery]', '').trim().split('\n');
      return `<div class="inline-gallery">${urls.map(url => 
        `<img src="${url.trim()}" class="inline-img zoomable" alt="">`
      ).join('')}</div>`;
    }
    
    // Image
    if (section.startsWith('[image]')) {
      const url = section.replace('[image]', '').trim();
      return `<img src="${url}" class="inline-img zoomable" alt="">`;
    }
    
    // Video
    if (section.startsWith('[video]')) {
      const url = section.replace('[video]', '').trim();
      let videoId = '';
      if (url.includes('youtu.be')) videoId = url.split('/').pop();
      else if (url.includes('youtube.com')) videoId = new URL(url).searchParams.get('v');
      return `<div class="embed-wrapper video"><iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    
    // Map
    if (section.startsWith('[map]')) {
      const url = section.replace('[map]', '').trim();
      return `<div class="embed-wrapper map"><iframe src="${url}" allowfullscreen loading="lazy"></iframe></div>`;
    }
    
    // STL
    if (section.startsWith('[stl]')) {
      const url = section.replace('[stl]', '').trim();
      return `<div class="embed-wrapper stl" data-stl="${url}"></div>`;
    }
    
    // Doc
    if (section.startsWith('[doc]')) {
      const url = section.replace('[doc]', '').trim();
      return `<div class="embed-wrapper doc"><iframe src="${url}" loading="lazy"></iframe></div>`;
    }
    
    // Text block
    return `<div class="layout-text">${parseMarkdown(section)}</div>`;
  }).join('');
};

const parseMarkdown = (text) => {
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  text = text.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
    const slug = title.replace(/\s+/g, '-');
    return `<a href="#${slug}" class="wiki-link fill-anim" style="--text-base: #999; --text-hover: #fff;">${title}</a>`;
  });
  
  text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  text = text.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>.*<\/li>)/s, (match) => {
    if (!match.includes('<ul>')) return `<ol>${match}</ol>`;
    return match;
  });
  
  text = text.split('\n').map(line => {
    line = line.trim();
    if (!line || line.startsWith('<')) return line;
    return `<p>${line}</p>`;
  }).join('');
  
  return text;
};

/* ========== EVENT LISTENERS ========== */

const attachCardListeners = () => {
  document.querySelectorAll('.clickable-block').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip') && !e.target.classList.contains('date')) {
        e.stopPropagation();
        return;
      }
      const href = card.dataset.href;
      const target = card.dataset.target;
      if (target === '_blank') {
        window.open(href, '_blank');
      } else {
        window.location.hash = href.replace('#', '');
      }
    });
  });
  
  load3DModels();
};

const attachArticleListeners = () => {
  document.querySelectorAll('.inline-img.zoomable').forEach(img => {
    img.addEventListener('click', () => {
      const lightbox = document.getElementById('lightbox');
      const lightboxImg = lightbox.querySelector('img');
      lightboxImg.src = img.src;
      lightbox.classList.add('active');
    });
  });
  
  load3DModels();
};

const setupLightbox = () => {
  const lightbox = document.getElementById('lightbox');
  lightbox.addEventListener('click', () => {
    lightbox.classList.remove('active');
  });
};

/* ========== 3D MODEL LOADER ========== */

const load3DModels = () => {
  document.querySelectorAll('.embed-wrapper.stl:not(.loaded)').forEach(container => {
    container.classList.add('loaded');
    const url = container.dataset.stl;
    
    const scene = new THREE.Scene();
    scene.background = null;
    
    const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 1000);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    
    const loader = new THREE.STLLoader();
    loader.load(url, (geometry) => {
      const material = new THREE.MeshPhongMaterial({ 
        color: 0xaaaaaa,
        specular: 0x111111,
        shininess: 50
      });
      const mesh = new THREE.Mesh(geometry, material);
      
      geometry.computeBoundingBox();
      const boundingBox = geometry.boundingBox;
      const center = new THREE.Vector3();
      boundingBox.getCenter(center);
      mesh.position.sub(center);
      
      const size = new THREE.Vector3();
      boundingBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5;
      camera.position.set(cameraZ, cameraZ * 0.5, cameraZ);
      camera.lookAt(0, 0, 0);
      
      scene.add(mesh);
      
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enableZoom = true;
      controls.autoRotate = false;
      
      const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
      
      setTimeout(() => container.classList.add('ready'), 100);
    });
    
    window.addEventListener('resize', () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
  });
};

/* ========== FOOTER ========== */

const renderFooter = () => {
  const versionTag = document.getElementById('version-tag');
  if (versionTag) {
    versionTag.innerHTML = `<span class="fill-anim">v2.0</span>`;
  }
};

const fetchGitHubStats = async () => {
  // Optional: Add GitHub API integration here
};

/* ========== INITIALIZE ========== */

document.addEventListener('DOMContentLoaded', init);
