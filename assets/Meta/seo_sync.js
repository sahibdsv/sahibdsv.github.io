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
 * Bulletproof CSV line parser that respects quoted commas
 */
function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(cur.trim());
            cur = '';
        } else {
            cur += char;
        }
    }
    result.push(cur.trim());
    return result;
}

function parseCSV(csvText) {
    if (csvText.trim().toLowerCase().startsWith('<html')) {
        console.error('Error: Received HTML instead of CSV.');
        return [];
    }

    const rows = csvText.split(/\r?\n/).filter(l => l.trim()).map(parseCSVLine);
    if (rows.length < 2) return [];

    const header = rows[0];
    const pageIdx = header.indexOf('Page');
    if (pageIdx === -1) return [];

    const pages = rows.slice(1)
        .map(r => r[pageIdx])
        .filter(p => p &&
            p !== 'Footer' &&
            p !== 'Home' &&
            !p.startsWith('{') &&
            !p.endsWith('}') &&
            !p.startsWith('http') &&
            !p.startsWith('assets/') &&
            !p.startsWith('#')
        );

    return [...new Set(pages)];
}

async function run() {
    console.log('Fetching Google Sheet data...');
    const csvData = await fetchCSV(CONFIG.csvUrl);
    const pages = parseCSV(csvData);

    console.log(`Discovered ${pages.length} valid pages from sheet.`);

    // Default system pages (only add if not in sheet)
    const defaults = ['Professional/Resume', 'Personal/About'];
    const allPaths = ['', ...new Set([...defaults, ...pages])];

    const processedPaths = allPaths.map(p => p.replace(/ /g, '_'));
    const uniquePaths = [...new Set(processedPaths)];

    console.log(`Found ${uniquePaths.length} unique paths for sitemap.`);

    // 1. Sitemap
    const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniquePaths.map(p => `  <url>
    <loc>${CONFIG.baseUrl}/#${p}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${p === '' ? '1.0' : '0.8'}</priority>
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

    // 3. index.html Links
    let indexHtml = fs.readFileSync(CONFIG.indexHtmlPath, 'utf8');
    const startTag = '<!-- SEO_LINK_START -->';
    const endTag = '<!-- SEO_LINK_END -->';

    const linkList = uniquePaths.filter(p => p !== '');
    const seoLinksHtml = `\n<div id="seo-links" style="display:none;" aria-hidden="true">\n${linkList.map(p => `  <a href="#${p}">${p.replace(/_/g, ' ')}</a>`).join('\n')}\n</div>\n`;

    const regex = new RegExp(`${startTag}[\\s\\S]*${endTag}`);
    if (regex.test(indexHtml)) {
        indexHtml = indexHtml.replace(regex, `${startTag}${seoLinksHtml}${endTag}`);
        console.log('index.html SEO links updated.');
    }

    fs.writeFileSync(CONFIG.indexHtmlPath, indexHtml);
}

run().catch(console.error);
