        function renderResume() {
            renderNavigation('Professional/Resume');
            const app = document.getElementById('app');
            app.innerHTML = '<div id="resume-view" class="resume-container"></div>';
            const container = document.getElementById('resume-view');

            generateResumeJSONLD(); // SEO

            // Source from RESUME DB (Separate Sheet)
            const resumeData = resumeDb;

            // 1. HEADER
            // 1. HEADER
            const headers = resumeData.filter(r => r.SectionType && r.SectionType.toLowerCase() === 'header');
            if (headers.length > 0) {
                const h = headers[0];
                const parts = h.Title.split('|');
                const name = parts[0].trim();
                const role = parts[1] ? parts[1].trim() : '';

                container.innerHTML += `
                    <div class="resume-header section" style="position:relative;">
                        <button class="btn-pill" onclick="window.print()" style="position:absolute; right:0; top:0; margin:0; font-size:12px; padding:6px 12px; cursor:pointer;">
                            Download PDF
                        </button>
                        <h1 class="fill-anim" style="margin-top:0;">${name}</h1>
                        <div class="resume-sub fill-anim" style="animation-delay:0.1s">${role}</div>
                        <div class="resume-contact" style="gap:0 !important; row-gap:4px !important;">
                            ${(() => {
                        // Split content by pipe, render as individual items with separators
                        const items = (h.Content || '').split('|').map(x => `<span style="white-space:nowrap;">${processText(x.trim())}</span>`);
                        return items.join('<span class="contact-sep" style="margin:0 12px; color:#bbb; user-select:none;">|</span>');
                    })()}
                        </div>
                    </div>`;
            }

            // 2. LAYOUT GRID
            container.innerHTML += `<div class="resume-grid section">
                <div class="resume-left"></div>
                <div class="resume-right"></div>
            </div>`;

            const left = container.querySelector('.resume-left');
            const right = container.querySelector('.resume-right');

            const groups = {};
            resumeData.forEach(r => {
                if (!r.SectionType) return;
                // Normalize to Title Case (e.g. "experience" -> "Experience")
                const raw = r.SectionType.trim().toLowerCase();
                const key = raw.charAt(0).toUpperCase() + raw.slice(1);

                if (!groups[key]) groups[key] = [];
                groups[key].push(r);
            });

            // Helper to render section
            const addSection = (target, title, data, renderer) => {
                if (data && data.length > 0) {
                    target.innerHTML += `<div class="resume-section">
                        ${formatTitle(title, 'h3')}
                        ${data.map(renderer).join('')}
                    </div>`;
                }
            };

            // LEFT COL
            addSection(left, 'Education', groups['Education'], RenderResumeEntry);
            addSection(left, 'Skills', groups['Skills'], RenderResumeSkill);

            // RIGHT COL
            addSection(right, 'Professional Experience', groups['Experience'], RenderResumeEntry);
            addSection(right, 'Engineering Projects', groups['Project'], RenderResumeEntry);
        }

        function RenderResumeEntry(r) {
            // Title logic: "Role | Company"
            let role = r.Title || '';
            let company = '';
            if (role.includes('|')) {
                const p = role.split('|');
                role = p[0].trim();
                company = p[1].trim();
            }

            const link = r.LinkURL ? `<a href="${r.LinkURL}" target="_blank" class="resume-link"><svg viewBox="0 0 24 24" style="width:12px;height:12px;display:inline-block;vertical-align:middle;opacity:0.7;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : '';

            // USE processText for Content to support Markdown
            let c = r.Content || '';

            // STANDARD LOGIC (Applies to both Custom and Main)
            if (c.includes('|')) {
                c = '- ' + c.replace(/\|/g, '\n- ');
            }
            // Auto-Bold Feature: "- Term: Def" -> "- **Term:** Def"
            c = c.replace(/(\n|^)-\s*([^:\n]+?):/g, '$1- **$2:**');

            const content = processText(c);

            // PROCESS TAGS (Chips) - Split for Structure
            let dateHtml = '';
            let otherTagsHtml = '';

            if (r.Tags) {
                const processTag = (t) => {
                    t = t.trim();
                    // Date Logic -> Plain Text
                    if (t.match(/[A-Za-z]{3,}\s+\d{4}/) || t.toLowerCase().includes('present')) {
                        return { type: 'date', html: safeHTML(t) };
                    }

                    // Location/Link Logic -> Plain Link or Text
                    const match = t.match(/^\[(.*?)\]\((.*?)\)$/);
                    if (match) {
                        const label = match[1];
                        const url = match[2];
                        const isMap = /maps\.app\.goo\.gl|google\.com\/maps/i.test(url); // Detect map
                        const icon = isMap
                            ? `<svg class="chip-icon" viewBox="0 0 24 24" style="width:12px; height:12px; margin-right:4px; vertical-align:middle; display:inline-block;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`
                            : `<svg class="chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; margin-right:4px; vertical-align:middle; display:inline-block;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

                        return { type: 'loc', html: `<a href="${url}" target="_blank" style="text-decoration:none; color:inherit; display:flex; align-items:center;">${icon}${safeHTML(label)}</a>` };
                    }
                    // Default Logic -> Plain Text
                    return { type: 'other', html: safeHTML(t) };
                };

                // Semicolon Heuristic: If semicolon is present, use it as primary delimiter to allow commas in text.
                const hasSemicolon = r.Tags.includes(';');
                const splitRegex = hasSemicolon ? /(?:;|\u2022)\s*/ : /(?:;|,|\u2022)\s*/;

                const rawTags = r.Tags.split(splitRegex).filter(t => t.trim());

                // Collect non-date tags to join them with separators later
                const otherTags = [];

                rawTags.forEach(t => {
                    const res = processTag(t);
                    if (res.type === 'date' && !dateHtml) {
                        dateHtml = res.html;
                    } else {
                        otherTags.push(res.html);
                    }
                });

                // Join other tags with ", " to prevent "AllistonON"
                if (otherTags.length > 0) {
                    otherTagsHtml = otherTags.join(', ');
                }
            }

            // Screen View: Stack normally? Or use grid?
            // To keep Screen view consistent with previous "Chips row" look but allow Print split,
            // we will render TWO views? Or use CSS to move them?
            // CSS manipulation is cleanest.
            // Screen: .resume-row-main { display: block } .resume-date-slot { float? or just inside }
            // Actually, let's just make Screen view look good with this structure too.
            // Row 1: Role [Space] Date
            // Row 2: Company [Space] Location

            return `
            <div class="resume-entry" id="res-${r.ID || Math.random().toString(36).substr(2, 9)}">
                <div class="resume-entry-header">
                    <div class="resume-row-main" style="display:flex; justify-content:space-between; align-items:baseline;">
                        <div class="resume-role">${role} ${link}</div>
                        <div class="resume-date-slot">${dateHtml}</div>
                    </div>
                    <div class="resume-row-sub" style="display:flex; justify-content:space-between; align-items:baseline;">
                        ${company ? `<div class="resume-company">${company}</div>` : '<div></div>'}
                        <div class="resume-loc-slot">${otherTagsHtml}</div>
                    </div>
                </div>
                <div class="resume-list text-content">${content}</div>
            </div>`;
        }

        function RenderResumeSkill(r) {
            // Parse: "Category: Item, Item | Category: Item"
            const parts = (r.Content || '').split('|').map(x => x.trim()).filter(x => x);

            let html = '';
            parts.forEach(part => {
                const splitIdx = part.indexOf(':');
                if (splitIdx > -1) {
                    const cat = part.substring(0, splitIdx).trim();
                    const val = part.substring(splitIdx + 1).trim();
                    html += `<div class="resume-skill-row">
                        <span class="resume-skill-cat">${cat}:</span> 
                        <span class="resume-skill-list">${val}</span>
                    </div>`;
                } else {
                    html += `<div class="resume-skill-row"><span class="resume-skill-list">${part}</span></div>`;
                }
            });

            return `
            <div class="resume-skill-block">
                ${r.Title && r.Title !== 'Technical Skills' ? `<div class="resume-skill-title">${r.Title}</div>` : ''}
                ${html}
            </div>`;
        }

        function generateResumeJSONLD() {
            const existing = document.getElementById('json-ld-resume');
            if (existing) existing.remove();

            const resumeRows = resumeDb;
            const headers = resumeRows.filter(r => r.SectionType === 'Header');
            if (headers.length === 0) return;

            const h = headers[0];
            const name = h.Title.split('|')[0].trim();
            const role = h.Title.split('|')[1] ? h.Title.split('|')[1].trim() : "Engineer";

            const schema = {
                "@context": "https://schema.org",
                "@type": "Person",
                "name": name,
                "jobTitle": role,
                "url": "https://sahibvirdee.com/resume",
                "description": `Resume of ${name}, ${role}.`,
                "knowsAbout": resumeRows.filter(r => r.SectionType === 'Skills').map(r => r.Content).join(', ')
            };

            const script = document.createElement('script');
            script.id = 'json-ld-resume';
            script.type = 'application/ld+json';
            script.textContent = JSON.stringify(schema);
            document.head.appendChild(script);
        }

        function detectEmbed(url) {
            url = url.trim();
            // UPDATED: Privacy Enhanced Domain
            const yt = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
            if (yt) return `<div class="embed-wrapper video"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?modestbranding=1&rel=0&origin=${window.location.origin}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;

            if (url.includes('google.com/maps/embed') || url.includes('maps.google.com')) {
                return `<div class="embed-wrapper map"><iframe src="${url}"></iframe></div>`;
            }
            if (url.includes('google.com/maps/place')) {
                return `<div class="embed-wrapper map"><iframe src="${url.replace('/place/', '/embed?pb=')}"></iframe></div>`;
            }

            // DESMOS
            if (url.includes('desmos.com/calculator')) {
                return `<div class="embed-wrapper doc" style="height:500px"><iframe src="${url}?embed" style="width:100%; height:100%; border:0"></iframe></div>`;
            }

            // GOOGLE DRIVE (GENERIC): Convert View -> Preview
            if (url.includes('drive.google.com')) {
                // If it's a file link ending in /view, swap to /preview for embed
                if (url.includes('/view')) url = url.replace('/view', '/preview');
                // If it's pure /open?id=, we might need a different approach, but most sharing links are file/d/.../view
                // Sheets/Docs often use /edit, convert to /preview or /htmlview
                if (url.includes('/edit')) url = url.replace('/edit', '/preview');

                return `<div class="embed-wrapper doc"><iframe src="${url}"></iframe></div>`;
            }

            if (url.includes('docs.google.com') && (url.includes('/spreadsheets/') || url.includes('/document/'))) {
                // Ensure we use preview mode mostly
                if (url.includes('/edit')) url = url.replace('/edit', '/preview');
                return `<div class="embed-wrapper doc"><iframe src="${url}"></iframe></div>`;
            }

            if (url.toLowerCase().endsWith('.pdf')) {
                return `<div class="embed-wrapper doc"><iframe src="${url}"></iframe></div>`;
            }

            // AUDIO
            if (url.match(/\.(mp3|wav|ogg)$/i)) {
                return `<div class="embed-wrapper audio" style="padding:10px;"><audio controls src="${url}" style="width:100%;"></audio></div>`;
            }

            // VIDEO
            if (url.match(/\.(mp4|webm|mov)$/i)) {
                return `<div class="embed-wrapper video"><video controls src="${url}" style="width:100%; height:auto;"></video></div>`;
            }

            if (url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/\d+/)) {
                return `<blockquote class="twitter-tweet" data-theme="dark"><a href="${url}"></a></blockquote>`;
            }

            if (url.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i)) {
                return `<img src="${url}" class="inline-img zoomable" loading="lazy">`;
            }

            if (url.match(/\.(stl|glb|gltf)$/i)) {
                return `<div class="embed-wrapper stl" data-src="${url}"></div>`;
            }

            return `<a href="${url}" target="_blank">${url}</a>`;
        }

        function extractMediaFromContent(text) {
            if (!text) return null;
            const imgMatch = text.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp)/i);
            if (imgMatch) return { type: 'img', url: imgMatch[0] };

            const ytMatch = text.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
            if (ytMatch) return { type: 'yt', url: ytMatch[0], id: ytMatch[1] };

            const stlMatch = text.match(/https?:\/\/\S+\.(?:stl|glb|gltf)/i);
            if (stlMatch) return { type: 'stl', url: stlMatch[0] };

            return null;
        }

        function getCalloutIcon(type) {
            const icons = {
                note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
                info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
                todo: '<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>',
                tip: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
                success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
                question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
                warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
                failure: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
                danger: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
                bug: '<rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/>',
                example: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
                quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>'
            };
            // ALIASES
            const map = {
                abstract: 'note', summary: 'note', tldr: 'note',
                hint: 'tip', important: 'tip',
                check: 'success', done: 'success',
                help: 'question', faq: 'question',
                caution: 'warning', attention: 'warning',
                fail: 'failure', missing: 'failure',
                error: 'danger', cite: 'quote'
            };
            const mapped = map[type] || type;
            return icons[mapped] || icons.note;
        }

