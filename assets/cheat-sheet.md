# Content Authoring Cheat Sheet

Refer to this guide when adding new rows to the `db` array in `index.html`.

## 1. The Data Structure
Each item in the `db` array represents a content block (Card, Hero, Article, etc.).

```javascript
{
    Page: 'Projects/MyProject',  // Category/Subcategory
    Title: 'My Title',           // Display Title
    SectionType: 'Card',         // Card, Hero, Article, Quote, Chart, Text
    Content: 'Markdown text...', // The main body
    Tags: 'Tag1, Tag2',          // Filterable tags
    Timestamp: '20231027',       // Sortable date (YYYYMMDD)
    LinkURL: 'https://...',      // Optional external link
    Media: 'https://...'         // Optional cover image/video
}
```

## 2. Supported Markdown
Standard formatting works everywhere:
- **Bold**: `**text**` or `***text***` for bold italic
- *Italic*: `*text*`
- `Code`: `` `text` ``
- ~~Strikethrough~~: `~~text~~`
- ==Highlight==: `==text==`
- Lists: `- Item` or `1. Item`
- Math (LaTeX): `$$ \frac{a}{b} $$` or inline `$\pi$`

## 3. Custom Macros (Quick Embeds)
Use these anywhere in the `Content` field.

| Feature | Syntax | Example |
|---|---|---|
| **Buttons** | `{{BTN: Label | URL | Color?}}` | `{{BTN: Launch | # | #ff0000}}` |
| **3D Model** | `{{STL: URL | Color?}}` | `{{STL: model.stl | #fab}}` |
| **Comparison** | `{{COMPARE: BeforeUrl | AfterUrl}}` | `{{COMPARE: old.jpg | new.jpg}}` |
| **Statistic** | `{{STAT: Value | Label}}` | `{{STAT: 99% | Uptime}}` |
| **Location Tag** | `[City, Prov](GoogleMapUrl)` | *(Use in Tags field)* `[Toronto](https://maps...)` |


*Note: `{{3D:...}}` is an alias for `{{STL:...}}`.*

## 4. Smart Callouts (Rich Blocks)
Start a block with `> [!type]` to create rich layouts.

### A. Charts
Use `> [!chart]` to create visualizations.
```text
> [!chart] My Stats
> Type: bar (or pie, doughnut, line, radar)
> Labels: Jan, Feb, Mar
> Values: 10, 20, 30
```

### B. Timeline
Use `> [!timeline]` for history.
```text
> [!timeline]
> 2020 - **Founded**
> Started the company.
> 2023 - **Launched**
> Released v1.0.
```

### C. Gallery (Grid)
Use `> [!gallery]` to auto-grid images.
```text
> [!gallery]
> ![Alt](img1.jpg)
> ![Alt](img2.jpg)
```

### D. Standard Alerts
- `> [!info]`: Blue info box
- `> [!warning]`: Yellow warning box
- `> [!danger]`: Red alert box
- `> [!success]`: Green success box
- `> [!tip]`: Gray tip box

## 5. Metadata Logic
- **YouTube**: Paste a `youtube.com/watch?v=ID` link anywhere to auto-embed.
- **Title Hiding**: If the `Title` is exactly a URL (`https://...`), the title is hidden and the URL is used as the media embed (useful for standalone images/videos).
- **Date Format**: Use `YYYYMMDD` for `Timestamp`. It auto-formats to "DD MON YYYY".
