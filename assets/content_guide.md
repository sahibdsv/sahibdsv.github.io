# Portfolio Content System - Quick Reference Guide

## 📊 Google Sheet Structure (Simplified!)

Your main Google Sheet needs only **5 columns**:
- **Title** - Entry title or a URL (for external links)
- **Page** - Navigation path (e.g., `Projects/Web`, `Personal/About`)
- **Content** - Main content (supports markdown)
- **Media** - Optional media URL
- **Tags** - Comma-separated tags for filtering
- **Timestamp** - Date in `YYYY-MM-DD` or `YYYYMMDD` format

**That's it!** No SectionType, no LinkURL needed!

---

## 🎯 How It Works (Auto-Detection)

The system automatically decides how to display content:

**Grid Cards** → Short content or preview mode
**Full Article** → When you click into a page with content

**Want external links?** Just put the URL in the Title field!

---

## 📝 Test Sheet Entries

Copy these into your Google Sheet to test all features:

### Example 1: Simple Home Page
```
Title: Welcome to My Portfolio
Page: Home
Content: ## Hi, I'm Sahib

I'm a Mechanical Engineering graduate specializing in design and manufacturing.

Check out my projects below!

Tags: featured
Timestamp: 2024-01-15
```

### Example 2: Project Card with Image
```
Title: Portfolio Website
Page: Projects/Web
Content: A single-file portfolio built with vanilla JavaScript.

**Features:**
- Dynamic content from Google Sheets
- Responsive design
- Fast performance

Media: https://picsum.photos/800/600
Tags: JavaScript, Web Development, Portfolio
Timestamp: 2024-02-01
```

### Example 3: External Link (URL in Title)
```
Title: https://github.com/yourusername/portfolio
Page: Projects/Web
Content: Check out my GitHub repo for the full source code!
Tags: GitHub, Open Source
Timestamp: 2024-02-01
```

### Example 4: Project with YouTube Video
```
Title: 3D Printed Robot Arm
Page: Projects/Engineering
Content: Designed and fabricated a 5-axis robot arm using SolidWorks and 3D printing.

**Key achievements:**
- **Precision**: ±0.5mm repeatability
- **Load capacity**: 2kg
- **Reach**: 500mm

Media: https://www.youtube.com/watch?v=dQw4w9WgXcQ
Tags: CAD, 3D Printing, Robotics, SolidWorks
Timestamp: 2023-11-20
```

### Example 5: GLB 3D Model
```
Title: Engine Component Design
Page: Projects/CAD
Content: Parametric design of a custom engine bracket optimized for weight reduction.

![Design Preview](https://picsum.photos/600/400)

assets/models/MECH2401-RubberbandCar.glb

Tags: SolidWorks, FEA, Manufacturing
Timestamp: 2023-10-15
```

### Example 6: Image Gallery
```
Title: Manufacturing Lab Photos
Page: Personal/Photography
Content: https://picsum.photos/800/600, https://picsum.photos/800/601, https://picsum.photos/800/602
Tags: Photography, Lab Work
Timestamp: 2023-12-01
```

### Example 7: About Me Page
```
Title: About Me
Page: Personal/About
Content: <center>

## Background

</center>

I'm passionate about mechanical design and additive manufacturing.

### Education
- Bachelor of Engineering, Mechanical
- Focus: Design & Manufacturing

### Interests
- CAD modeling
- 3D printing
- Automation
```

---

## 🔧 Content Features

### **Markdown Support**
```
## Headers (H2-H6)
**Bold text**
*Italic text*
`inline code`
[Link text](https://example.com)

- Bullet lists
  - Nested bullets (2 spaces indent)
    - Even deeper (4 spaces)

> Blockquotes
---
Horizontal rules

<center>
Centered text
</center>
```

### **Media Types**

The system supports **three ways** to add media, with automatic detection for convenience:

#### **GLB 3D Models**

**Preferred syntax** (consistent with other media):
```
[GLB Model]: assets/models/your-model.glb
```

Also supported (auto-detection):
```
assets/models/your-model.glb
or
[GLB Model](assets/models/your-model.glb)
```

> 3D models work in both card previews (auto-rotating thumbnail) and article view (fullscreen-capable viewer)

#### **Images**

**With caption** (markdown standard):
```
![My caption text](url-to-image.jpg)
```
> **Why the `!` ?** That's standard markdown! The `!` tells markdown it's an image.  
> Without `!` → `[text](url)` = clickable link  
> With `!` → `![text](url)` = embedded image (text becomes caption + alt text)

**Without caption** (auto-detection):
```
https://picsum.photos/800/600
or
[Image]: https://picsum.photos/800/600
```

#### **Image Galleries**

**Individual captions** (markdown syntax):
```
![Red car](img1.jpg), ![Blue car](img2.jpg), ![Green car](img3.jpg)
```
> Each image gets its own caption below it

**Shared caption** (all images share one caption):
```
img1.jpg, img2.jpg, img3.jpg
[Caption]: This caption applies to all three images above
```
> Great for photo sets where one description covers all

**No captions** (simple comma-separated):
```
url1.jpg, url2.jpg, url3.jpg
```

#### **YouTube Videos**

Auto-detected:
```
https://www.youtube.com/watch?v=VIDEO_ID
or
https://youtu.be/VIDEO_ID
```

### **Tags & Filtering**

Add tags to enable:
- Auto-generated chip filters
- Date-based filtering (click dates)
- Search functionality (`/` or `Cmd/Ctrl+K`)

Special tags:
- `Draft` - Hidden in production (visible on localhost)
- `featured` - Priority sorting in "Recent Activity"

### **Dates & Locations**

In the **Tags** column, you can add:
- Dates: `Jan 2024`, `2024-01`, `20240115`
- Locations: `[Toronto](https://maps.google.com/...)`
- Regular tags: `JavaScript`, `CAD`, etc.

---

## 📄 Resume Page Format

For the resume, use the **Page#Section** format:

```
Page: Professional/Resume#Header
Page: Professional/Resume#Education
Page: Professional/Resume#Experience
Page: Professional/Resume#Skills
Page: Professional/Resume#Projects
```

**Example resume entries:**

### Header
```
Title: Sahib Virdee | Mechanical Engineer
Page: Professional/Resume#Header
Content: sahib@email.com | [LinkedIn](https://linkedin.com/in/yourprofile) | [GitHub](https://github.com/yourusername)
```

### Education
```
Title: Bachelor of Engineering | University Name
Page: Professional/Resume#Education
Content: Focus: Design & Manufacturing | GPA: 3.8/4.0
Tags: Sept 2020 - Apr 2024, [Toronto](https://maps.google.com/...)
```

### Experience
```
Title: Mechanical Design Intern | Company Name
Page: Professional/Resume#Experience
Content: Designed and optimized components | Conducted FEA simulations | Collaborated with manufacturing team
Tags: May 2023 - Aug 2023, [City Name](https://maps.google.com/...)
```

### Skills
```
Title: Technical Skills
Page: Professional/Resume#Skills
Content: CAD Software: SolidWorks, Fusion 360, AutoCAD | Manufacturing: 3D Printing, CNC, Laser Cutting | Programming: Python, MATLAB, JavaScript
```

---

## 🎯 Quick Tips

1. **Navigation hierarchy**: Use `/` in Page field
   - `Projects` → Top level
   - `Projects/Web` → Sub-level
   - `Projects/Web/Portfolio` → Deep nesting

2. **External links**: Put URL directly in Title field to make card clickable

3. **Title as URL**: System auto-detects URLs and embeds media

4. **Read time**: Automatically calculated from Content word count

5. **Search**: Press `/` anywhere to open search overlay

6. **Center-align text**: Use `<center>` tags in markdown

7. **Keyboard shortcuts**:
   - `/` or `Cmd/Ctrl+K` - Open search
   - `Esc` - Close search or return home
   - `Backspace` (in empty search) - Close search

---

## 🚀 Testing Checklist

After adding test entries, verify:
- ✅ Home page shows hero section
- ✅ Navigation generates automatically  
- ✅ Cards display in grid layout
- ✅ Images load and display properly
- ✅ YouTube videos embed correctly
- ✅ GLB viewer works with controls
- ✅ Search finds content (`/` key)
- ✅ Date chips filter by month
- ✅ Tag chips filter content
- ✅ Mobile responsive design

---

## 📍 Current Setup

- **Live Preview**: http://localhost:8000
- **Source File**: `index.html` (single-file architecture)
- **Cache Duration**: 1 hour
- **Force Refresh**: Clear localStorage or wait 1 hour

**Force cache clear**:
```javascript
localStorage.removeItem('sahib_v1_cache');
location.reload();
```

---

## 🎨 Pro Tips

1. **Image optimization**: Use compressed images (WebP format recommended)
2. **GLB models**: Keep under 5MB for fast loading
3. **Content preview**: First ~150 chars shown in cards
4. **Featured content**: Use `featured` tag for priority sorting
5. **Draft mode**: Add `Draft` tag to hide in production

**Happy building! 🚀**
