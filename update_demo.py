import re

path = 'assets/scripts/script.js'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# EXPANDED DEMO CONTENT
new_demo_content = r"""function loadDemoData() {
    renderNavigation(null);
    const app = document.getElementById('app');

    const demoMD = `
# Feature Demo & Stress Test
[TOC]

This page demonstrates the capabilities of the CMS rendering engine including **[Stress Tests](#)** and **[Chaos Checks](#)**.

## 1. Typography & Chaos
Standard text can be **bold**, *italic*, or [linked](#). 
We also support [Linked **Bold** Text](#) and [**Bold Linked** Text](#).
Heck, even \`[Code Link](#)\` should work?

## 2. Layout Stress (Auto-Grid)
**5-Column Image Grid:**
[https://images.unsplash.com/photo-1550745165-9bc0b252726f, https://images.unsplash.com/photo-1549692520-acc6669e2f0c, https://images.unsplash.com/photo-1515694346937-94d85e41e6f0, https://images.unsplash.com/photo-1544979590-37e9b47cd705, https://images.unsplash.com/photo-1505118380757-91f5f5632de0]

## 3. Deep Tables (With Links)
| ID | [Link](#) | Status | Description |
| :--- | :--- | :---: | --- |
| 001 | [Project A](#) | **Active** | Core infrastructure |
| 002 | [Project B](#) | *Pending* | Client side API |
| 003 | [Project C](#) | Delayed | [See Report](#) |
| 004 | [Project D](#) | Done | Legacy system |
| 005 | [Project E](#) | **Active** | New features |
| 006 | [Project F](#) | -- | TBD |

## 4. Callouts & Ordering
> [!danger] [Critical Error](#)
> This callout is **Critical** and has a link in the title.
> It should appear *before* the code block below.

## 5. Code Blocks
\`\`\`javascript
// This block should be below the Critical Error
function testChaos() {
    return "Complete";
}
\`\`\`

## 6. Mathematics
**Inline:** $E = mc^2$ inside text.
**Block (Trim Test):**
$$
\\sum_{i=0}^n i^2 = \\frac{(n^2+n)(2n+1)}{6}
$$

## 7. Diagrams (Mermaid)
\`\`\`mermaid
graph LR
    A[Start] --> B{Decision}
    B -->|Yes| C[[Success](#)]
    B -->|No| D[Failure]
    click C "#" "Link Test"
\`\`\`

## 7. Charts (Variety)
**Bar Chart:**
[chart:bar:Q1,Q2,Q3,Q4:120,150,180,220:Annual Growth]

**Doughnut Chart:**
[chart:doughnut:Direct,Referral,Social:55,30,15:Traffic Source]

## 8. Media & Captions (Overlap Test)
![Wide Image](https://images.unsplash.com/photo-1472214103451-9374bd1c798e "Standard Caption Test [With Link](#)")

## 9. 3D Models (Scroll Trap Test)
Mobile users should be able to scroll past this without getting trapped.
{{3D: https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/stl/binary/pr2_head_pan.stl | #00ff00}}

## 10. Comparison Sliders
Rain vs Clear:
[compare:https://images.unsplash.com/photo-1515694346937-94d85e41e6f0:https://images.unsplash.com/photo-1500964757637-c85e8a162699]
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
    print("Successfully updated loadDemoData with Expanded Test Suite")
else:
    print("Could not find loadDemoData function")
