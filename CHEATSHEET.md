# Portfolio Post Cheatsheet

## Google Sheet Columns

| Column | Purpose | Example |
|--------|---------|---------|
| **Page** | Navigation path | `Projects/AI`, `Personal`, `Footer` |
| **Title** | Post title or markdown link | `My Project` or `[GitHub](https://github.com)` |
| **Content** | Main content (markdown) | See below |
| **Tags** | Comma-separated tags | `Featured, AI, 2024` |
| **Timestamp** | Date for sorting | `2024-01-15` or `20240115` |
| **SectionType** | Layout type | `card`, `hero`, `quote`, `text` |
| **Media** | Card thumbnail URL | `/assets/images/resume-thumb.jpg` |

---

## Page Paths

```
Projects/           → Shows in Projects nav
Projects/SubFolder  → Nested under Projects
Professional/       → Shows in Professional nav  
Personal/           → Shows in Personal nav
Footer              → Footer links only
```

---

## Content Markdown

### Text Formatting
```
**bold**  *italic*  `code`  ~~strikethrough~~
==highlight==  ^superscript^  ~subscript~
```

### Links & Images
```
[Link Text](https://url.com)
![Alt](https://image.url)
![Alt](https://image.url "Caption text")
[[Internal Page Link]]
```

### Headers
```
# H1  ## H2  ### H3
```

### Lists
```
- Item 1
- Item 2
  - Nested item
```

### Code Blocks
````
```javascript
const x = 1;
```
````

### Tables
```
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

---

## Callouts

```
> [!note] Title
> Content here

> [!tip] Pro Tip
> Helpful info

> [!warning] Caution
> Warning message

> [!danger] Critical
> Important alert
```

Types: `note`, `tip`, `warning`, `danger`, `success`, `question`, `quote`

---

## Embeds

### YouTube
Just paste the URL:
```
https://www.youtube.com/watch?v=VIDEO_ID
```

### Image Gallery
```
[https://img1.jpg, https://img2.jpg, https://img3.jpg]
```

### 3D Models
```
{{3D: https://url.stl | #00ff00}}
```

### Comparison Slider
```
[compare:https://before.jpg:https://after.jpg]
```

---

## SectionTypes

| Type | Use For |
|------|---------|
| `card` | Default grid card (auto) |
| `hero` | Large featured section |
| `quote` | Quote block |
| `text` | Plain text section |

---

## Footer Links

In the Sheet, use Page = `Footer` and Title with markdown:
```
Page: Footer
Title: [GitHub](https://github.com/sahibdsv)
```

---

## Tags

- `Featured` → Pins to top of home
- `Draft` → Hidden from production (visible on localhost)
- Any other tag → Clickable filter chip

---

## Tips

1. **Auto-thumbnail**: First image in Content becomes card thumbnail
2. **Date format**: `YYYY-MM-DD` or `YYYYMMDD` both work
3. **Drafts**: Add `Draft` tag to hide from live site
4. **Cache**: Changes take ~1 hour to appear (cache expiry)
5. **Force refresh**: Add `?nocache` to URL or clear localStorage
