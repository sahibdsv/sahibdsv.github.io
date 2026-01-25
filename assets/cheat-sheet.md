# Content Authoring Cheat Sheet

Refer to this guide when adding new rows to the `db` array in `index.html`.

## 1. The Data Structure
Each item in the `db` array represents a content block.

```javascript
{
    Page: 'Projects/MyProject',  // Category/Subcategory (URL Hash)
    Title: 'My Title',           // Display Title
    SectionType: 'Card',         // Card, Hero, Article, Quote, Chart, Text
    Content: 'Markdown text...', // The main body
    Tags: 'Tag1, Tag2',          // Filterable tags
    Timestamp: '20231027',       // Sortable date (YYYYMMDD)
    LinkURL: 'https://...',      // Optional external link
    Media: 'https://...'         // Optional cover image/video/stl
}
```

## 2. Smart Blocks (Rich Components)
Use `> [!type]` syntax in the `Content` column.

### Buttons 🔘
Create action buttons. You can use **colors** and **lazy links** (no `>` required).
```markdown
> [!button] Default Gray
https://example.com

> [!button-red] Danger Action
mailto:boss@example.com

> [!button-green] Download
assets/resume.pdf
```
**Colors**: `red`, `green`, `blue`, `orange`, `purple`.

### Timelines ⏳
Create vertical history trees. Supports multi-line descriptions.
```markdown
> [!timeline] Career Path
> 2020 - **University**
> Graduated with Honors.
>
> 2024 - **First Job**
> Senior Engineer at Tech Corp.
```

### Charts 📊
Visualize data without external tools.
```markdown
> [!chart] Quarterly Revenue
> Type: bar (or pie, doughnut, line)
> Q1, Q2, Q3, Q4
> 10, 20, 15, 40
```

### 3D Models 🧊
Embed interactive STL/GLB files.
```markdown
> [!model]
> assets/design.stl
> #ff4400 (Optional Color)
```

### Comparisons ↔️
Compare two images with a slider.
```markdown
> [!compare]
> assets/before.jpg
> assets/after.jpg
```

### Galleries 🖼️
Auto-grid images.
```markdown
> [!gallery]
> ![Alt](img1.jpg)
> ![Alt](img2.jpg)
```

## 3. Standard Markdown & Formatting
- **Bold**: `**text**`
- *Italic*: `*text*`
- `Code`: `` `text` ``
- ~~Strike~~: `~~text~~`
- ==Highlight==: `==text==`
- Lists: `- Item` or `1. Item`
- Math: `$$ \frac{a}{b} $$`

## 4. Smart Tags 🏷️
The `Tags` column is smarter than it looks.
- **Filtering**: Clicking a tag filters the view.
- **Location Pins**: Any tag linking to Google Maps gets a 📍 icon.
  `[New York](https://maps.app.goo.gl/...)`
- **Link Tags**: Any other link gets an arrow ↗️ icon.
  `[Docs](https://example.com)`

## 5. Section Types
- **Card** (Default): Standard grid item.
- **Hero**: Full-width header. Shows Title + Content + **Tags** + Date.
- **Article**: Long-form text page.
- **Quote**: Centered blockquote (use `Quote` column for text, `Author` column for author).
- **Text**: Simple text block without card styling.

## 6. Metadata Secrets
- **YouTube**: Paste a URL anywhere to embed.
- **Title Hiding**: Set Title to a URL (`https://...`) to hide the text header and show the media full-size.
- **Date Filter**: Timestamps like `20250101` display as "JAN 2025" in headers.

---

## 7. LLM Generation Guide
*Paste this to AI assistants to generate content:*

**Instructions for AI:**
1.  **Format**: **ALWAYS use a Markdown Table**.
2.  **No Markdown Links**: In columns `LinkURL` and `Media`, use raw URLs.
3.  **Content**: Use `> [!button]` and `> [!timeline]` syntax for rich layouts.

**Example Output:**
| Page | Title | SectionType | Content | Tags | Timestamp |
|---|---|---|---|---|---|
| `Values/Mission` | Our Goal | `Hero` | To build cool things. | `Core` | `20250101` |
| `Projects/App` | My App | `Card` | > [!button-blue] Demo<br>https://demo.com | `Software` | `20250201` |
