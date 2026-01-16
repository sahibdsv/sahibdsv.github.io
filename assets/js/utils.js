/* assets/js/utils.js */

function safeHTML(html) {
    if(typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ADD_TAGS: ['iframe'],
            ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height']
        });
    }
    return html; 
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

function getThumbnail(u) { 
    if(!u) return null; 
    if(u.includes('youtube.com')||u.includes('youtu.be')) { 
        let v = u.split('v=')[1]; 
        if(v&&v.includes('&')) v=v.split('&')[0]; 
        if(!v&&u.includes('youtu.be')) v=u.split('/').pop(); 
        return `https://img.youtube.com/vi/${v}/mqdefault.jpg`; 
    } 
    if(u.endsWith('.mp4')) return null; 
    return u; 
}

function processText(t) { 
    if(!t) return ''; 
    let clean = safeHTML(t);
    
    // 1. UNIVERSAL 3D VIEWER
    clean = clean.replace(/\{\{(?:3D|STL): (.*?)(?: \| (.*?))?\}\}/gi, (match, url, color) => {
        const colorAttr = color ? `data-color="${color.trim()}"` : '';
        return `<div class="embed-wrapper stl" data-src="${url.trim()}" ${colorAttr}></div>`;
    });

    // 2. INLINE IMAGE GALLERIES
    clean = clean.replace(/\[\s*(https?:\/\/[^\]]+)\s*\]/gi, (match, content) => {
        const urls = content.split(',').map(u => u.trim());
        const isPureGallery = urls.every(u => u.toLowerCase().startsWith('http'));
        if (!isPureGallery) return match; 
        const imgs = urls.map(u => `<img src="${u}" class="inline-img zoomable" loading="lazy" alt="Gallery Image">`).join('');
        return `<div class="inline-gallery">${imgs}</div>`;
    });

    // 3. WIKI LINKS
    clean = clean.replace(/\[\[(.*?)\]\]/g, '<a href="#$1" class="wiki-link fill-anim">$1</a>');

    // 4. EMBED SHORTCODES
    clean = clean.replace(/\{\{MAP: (.*?)\}\}/g, '<div class="embed-wrapper map"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{DOC: (.*?)\}\}/g, '<div class="embed-wrapper doc"><iframe src="$1"></iframe></div>');
    clean = clean.replace(/\{\{YOUTUBE: (.*?)\}\}/g, '<div class="embed-wrapper video"><iframe src="$1" allowfullscreen></iframe></div>');
    clean = clean.replace(/\{\{EMBED: (.*?)\}\}/g, '<div class="embed-wrapper"><iframe src="$1"></iframe></div>');

    clean = clean.replace(/<a /g, '<a class="fill-anim" '); 

    return clean; 
}