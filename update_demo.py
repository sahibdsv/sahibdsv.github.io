import re

path = 'assets/scripts/script.js'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# NEW FEATURE DEMO CONTENT (Readable Formatted)
# Note: Parser now correctly handles newlines, so we can use readable format.
new_demo_content = r"""function loadDemoData() {
    renderNavigation(null);
    const app = document.getElementById('app');

    const demoMD = `
# Feature Demo
This page demonstrates the capabilities of the CMS rendering engine.

## 1. Typography & Lists
Standard text can be **bold**, *italic*, or [linked](#). 
We also support finite nested lists (parser fixes applied):

- Item One
  - Nested Item 1.1
    - Nested Item 1.1.1
  - Nested Item 1.2
- Item Two

## 2. Callouts (Minimalist)
> [!info] Information
> Useful details about the ecosystem.

> [!warning] Warning
> Be careful with these settings.

> [!danger] Critical Error
> Something went wrong here.

## 3. Code Blocks
\`\`\`javascript
function helloWorld() {
    console.log("Hello, User!");
    return true;
}
\`\`\`

## 4. Mathematics
**Inline:** $a^2 + b^2 = c^2$

**Block:**
$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

## 5. Media with Captions & Grid
**Side-by-Side (Map + Video):**
[https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.1422937950147!2d-73.9873196845941!3d40.75889497932681!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x89c25855c6480299%3A0x55194ec5a1ae072e!2sTimes+Square!5e0!3m2!1sen!2sus!4v1560412335497!5m2!1sen!2sus, https://www.youtube.com/watch?v=YE7VzlLtp-4]

**Image with Caption:**
![Unsplash Image](https://images.unsplash.com/photo-1549692520-acc6669e2f0c "A beautiful mountain view.")

## 6. Diagrams
\`\`\`mermaid
graph LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Success]
    B -->|No| D[Failure]
\`\`\`

## 7. Charts
[chart:bar:Jan,Feb,Mar:12,19,3:Q1 Sales]

## 8. 3D Models
Interactive WebGL viewer:
https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/stl/binary/pr2_head_pan.stl

## 9. Comparison Sliders
Rain vs Clear (High Contrast):
[compare:https://images.unsplash.com/photo-1515694346937-94d85e41e6f0:https://images.unsplash.com/photo-1500964757637-c85e8a162699]

## 10. Tables
| Feature | Status | Priority |
| :--- | :---: | ---: |
| Markdown | Ready | High |
| Charts | Ready | Med |
`;

    const html = processText(demoMD);

    // WRAP IN ARTICLE MODE FOR CONTROLS (3D Fullscreen, etc.)
    app.innerHTML = `
        <div class="content-container animate-fade article-mode">
            ${html}
        </div>
    `;

    // Post-Render Triggers
    setTimeout(() => {
        if (window.Prism) Prism.highlightAll();
        if (window.MathJax) MathJax.typeset();
        if (window.mermaid) mermaid.init();
        initCharts();
        init3DViewers();
        initComparisons();
        initImageZoomers(); 
    }, 100);
}"""

# REPLACE loadDemoData block
pattern = r"function loadDemoData\(\) \{[\s\S]*?$"
if re.search(pattern, content):
    new_content = re.sub(pattern, new_demo_content, content)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully updated loadDemoData with Readable Content")
else:
    print("Could not find loadDemoData function")
