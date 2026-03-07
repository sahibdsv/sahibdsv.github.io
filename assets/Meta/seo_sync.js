const fs = require('fs');
const https = require('https');
const path = require('path');

const CONFIG = {
    csvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT7HtdJsNwYO8TkB4mem_IKZ-D8xNZ9DTAi-jgxpDM2HScpp9Tlz5DGFuBPd9TuMRwP16vUd-5h47Yz/pub?gid=0&single=true&output=csv',
    baseUrl: 'https://sahibvirdee.com',
    indexHtmlPath: path.join(__dirname, '../../index.html'),
    sitemapPath: path.join(__dirname, '../../sitemap.xml'),
    robotsPath: path.join(__dirname, '../../robots.txt')
};

function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        const fetch = (targetUrl) => {
            https.get(targetUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return fetch(res.headers.location);
                }
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        };
        fetch(url);
    });
}

/**
 * Full CSV parser that handles multi-line fields and escaped quotes
 */
function parseFullCSV(text) {
    const p = [[]];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];
        if (char === '"' && inQuotes && next === '"') {
            cur += '"'; i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            p[p.length - 1].push(cur.trim()); cur = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i++;
            p[p.length - 1].push(cur.trim()); cur = '';
            p.push([]);
        } else {
            cur += char;
        }
    }
    if (cur || p[p.length - 1].length) p[p.length - 1].push(cur.trim());
    return p.filter(r => r.length > 1);
}

function cleanContent(text) {
    if (!text) return '';
    return text
        .replace(/[#*`]/g, '') // Strip markdown
        .replace(/<[^>]*>/g, '') // Strip HTML
        .replace(/assets\/\S+/g, '') // Strip asset paths
        .replace(/https?:\/\/\S+/g, '') // Strip URLs
        .replace(/\n\s*\n/g, '\n') // Collapse double newlines
        .trim();
}

async function run() {
    console.log('Fetching Google Sheet data...');
    const csvData = await fetchCSV(CONFIG.csvUrl);
    const rows = parseFullCSV(csvData);

    if (rows.length < 2) {
        console.error('No rows found in sheet.');
        return;
    }

    const header = rows[0];
    const pageIdx = header.indexOf('Page');
    const titleIdx = header.indexOf('Title');
    const contentIdx = header.indexOf('Content');

    if (pageIdx === -1 || contentIdx === -1) {
        console.error('Could not find required columns.');
        return;
    }

    // Map rows to projects
    const entries = rows.slice(1)
        .filter(r => r[pageIdx] && r[pageIdx] !== 'Footer' && r[pageIdx] !== 'Home' && !r[pageIdx].startsWith('{'))
        .map(r => ({
            path: r[pageIdx],
            title: r[titleIdx] || r[pageIdx].split('/').pop(),
            content: cleanContent(r[contentIdx])
        }));

    console.log(`Discovered ${entries.length} valid entries from sheet.`);

    // Default system pages (Resume usually in its own DB, but let's include paths)
    const defaults = [
        { path: 'Professional/Resume', title: 'Resume', content: 'Professional resume and experiences.' },
        { path: 'Personal/About', title: 'About Me', content: 'Information about Sahib Virdee.' }
    ];

    const allEntries = [...defaults, ...entries];
    const uniquePaths = [...new Set(allEntries.map(e => e.path.replace(/ /g, '_')))];

    console.log(`Found ${uniquePaths.length} unique paths for sitemap.`);

    // 1. Sitemap
    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${CONFIG.baseUrl}/#</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
${uniquePaths.filter(p => p !== '').map(p => `  <url>
    <loc>${CONFIG.baseUrl}/#${p}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n')}
</urlset>`;

    fs.writeFileSync(CONFIG.sitemapPath, sitemapContent);
    console.log('Sitemap.xml updated.');

    // 2. Robots.txt
    const robotsContent = `User-agent: *
Allow: /

Sitemap: ${CONFIG.baseUrl}/sitemap.xml`;
    fs.writeFileSync(CONFIG.robotsPath, robotsContent);
    console.log('Robots.txt updated.');

    // 3. index.html Links & Content Injection
    let indexHtml = fs.readFileSync(CONFIG.indexHtmlPath, 'utf8');
    const startTag = '<!-- SEO_LINK_START -->';
    const endTag = '<!-- SEO_LINK_END -->';

    // Build the SEO injection content
    let seoInjection = `\n<div id="seo-content" style="display:none;" aria-hidden="true">\n`;

    // First, provide the discoverable links
    seoInjection += `  <nav id="seo-nav">\n`;
    uniquePaths.forEach(p => {
        const title = p.replace(/_/g, ' ') || 'Home';
        seoInjection += `    <a href="#${p}">${title}</a>\n`;
    });
    seoInjection += `  </nav>\n\n`;

    // Second, provide the actual raw text content for indexing
    allEntries.forEach(entry => {
        const cleanPath = entry.path.replace(/ /g, '_');
        seoInjection += `  <article id="seo-content-${cleanPath}">\n`;
        seoInjection += `    <h2>${entry.title}</h2>\n`;
        seoInjection += `    <p>${entry.content}</p>\n`;
        seoInjection += `  </article>\n\n`;
    });

    seoInjection += `</div>\n`;

    const regex = new RegExp(`${startTag}[\\s\\S]*${endTag}`);
    if (regex.test(indexHtml)) {
        indexHtml = indexHtml.replace(regex, `${startTag}${seoInjection}${endTag}`);
        console.log('index.html SEO links and content updated.');
    }

    fs.writeFileSync(CONFIG.indexHtmlPath, indexHtml);
}

run().catch(console.error);
