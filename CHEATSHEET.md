# Portfolio Post Cheatsheet

## Sheet Columns

| Column | Purpose | Example |
|--------|---------|---------|
| **Page** | Navigation path | `Projects/AI`, `Professional`, `Footer` |
| **Title** | Post title | `My Project` |
| **Content** | Article body (markdown) | See below |
| **Tags** | Comma-separated | `Featured, AI, 2024` |
| **Media** | Card thumbnail URL | `/assets/images/resume-thumb.jpg` |

---

## How It Works

1. **Cards** = Grid view (auto-derived from your article)
   - Title → from Title column
   - Thumbnail → from Media column (or first image in Content)
   - Description → first ~100 chars of Content

2. **Articles** = What you see when you click a card
   - Full rendered Content with markdown

---

## Page Paths

```
Projects/           → Shows in Projects nav
Projects/SubFolder  → Nested navigation
Professional/       → Shows in Professional nav
Personal            → Personal page (shows quote)
Footer              → Footer links: use [Text](URL)
```

### Resume Format
Use `#section` to specify resume entry type:
```
Professional/Resume#header     → Name + contact info
Professional/Resume#education  → Degrees
Professional/Resume#skills     → Technical skills
Professional/Resume#experience → Work experience
Professional/Resume#projects   → Project entries
```

---

## Content Markdown

### Basics
```
**bold**  *italic*  `code`
[Link Text](https://url.com)
![Image](https://url.jpg)
```

### Headers
```
## Section Header
### Subsection
```

### Lists
```
- Bullet item
1. Numbered item
```

### Code
````
```javascript
const x = 1;
```
````

---

## Tags

| Tag | Effect |
|-----|--------|
| `Featured` | Pins to Home page |
| `Draft` | Hidden from production |
| Any other | Clickable filter chip |

---

## Footer Links

```
Page: Footer
Title: [GitHub](https://github.com/sahibdsv)
```

---

## Tips

- **Thumbnail**: Set Media column, or first image in Content becomes thumbnail
- **Drafts**: Add `Draft` tag to hide from live site
- **Cache**: ~1 hour to see changes (or add `?nocache` to URL)
