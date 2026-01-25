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

## 3. Smart Blocks (Obsidian Style)
Use blockquotes with `> [!type]` for complex components. This syntax is robust and table-friendly.

**Button**
```markdown
> [!button] Label Text
> https://example.com
```

**3D Model**
```markdown
> [!model]
> assets/model.stl
> #ff4400 (Optional)
```

**Image Comparison**
```markdown
> [!compare]
> assets/before.jpg
> assets/after.jpg
```

**Statistic Block**
```markdown
> [!stat] 99%
> Reliability Score
```

**Location Tags** (For `Tags` column only)
- Use standard markdown link syntax in the `Tags` column: `[City, Province](MapsURL)`

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

## 6. LLM Generation Guide
If asking an AI (ChatGPT, Claude, Gemini) to generate rows for you, paste this section to them:

## 6. LLM Generation Guide
If asking an AI (ChatGPT, Claude, Gemini) to generate rows for you, paste this section to them:

**Instructions for AI:**
1.  **Format**: **ALWAYS use a Markdown Table**. Do not use JSON.
2.  **Links**: **NEVER** render links (e.g., `[Text](url)`). Use **Plain Text URLs** in the `LinkURL` or `Media` columns.
3.  **Order**: Column order does not matter, but `Page` and `Title` should come first.

### Column Constraints & Best Practices

| Column | Content Type | Best Practices & Limitations |
|---|---|---|
| **Page** | `Category/SubPage` | **Required.** Defines the URL hash. Keep it hierarchical (e.g., `Values/Diversity`). |
| **Title** | Text | **Required.** Determines the display header. |
| **SectionType** | Enum | Valid options: `Card` (Default), `Hero` (Big Text), `Article` (Standard), `Quote` (Centered), `Chart` (Data Viz). |
| **Content** | Markdown | **Rich Text.** Supports standard Markdown + Macros (`{{BTN}}`, `> [!chart]`). <br> **Limit:** Keep it under 200 words for Cards. Use Articles for long text. |
| **Tags** | CSV String | `Tag1, Tag2`. <br> **Location Support:** You can add location via `[City](MapUrl)`. |
| **Timestamp** | `YYYYMMDD` | **Sorting Key.** Controls "Recent Activity" order. |
| **LinkURL** | URL | **External Links.** Use this for "Visit Project" buttons. Leave empty if internal only. |
| **Media** | URL | **Cover Asset.** Image (`.jpg`), Video (`youtube.com`), or 3D (`.glb`). |

**Example Output (for AI to mimic):**
| Page | Title | SectionType | Content | Tags | Timestamp |
|---|---|---|---|---|---|
| `Projects/Mars` | Mars Rover | `Card` | A robust rover design for red planet exploration. | `Robotics, Space` | `20251101` |
| `Values/Mission` | Our Mission | `Hero` | To explore strange new worlds. | `Core` | `20250101` |

