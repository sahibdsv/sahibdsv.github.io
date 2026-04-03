# 🌐 High-Fidelity Portfolio: Master Content Guide

This guide is the "Source of Truth" for formatting and engine tricks. Use these patterns in the CMS (Google Spreadsheet) to trigger advanced UI behaviors.

---

## 🏗️ 1. Content Page Blocks (Google Sheet `Content` Column)

You can build complex pages by placing these specialized blocks on their own lines (with blank lines in between).

### 🏷️ Dynamic API Tags (Curly Braces `{}`)
These tags fetch real-time data from your unified JSON API.

- **`{Random Quote}`**: Injects a randomized Quote Discovery Card.
- **`{Recent Music}`** / **`{Recently Played}`**: Renders a grid of your 3 most recently logged tracks.
- **`{Top Artists}`**, **`{Top Songs}`**, **`{Fresh Favorites}`**: Renders 3-item grids of your listening stats.

### 🧬 High-Fidelity Media (Extension-Based)
Simply write the filename on its own line. **The engine now auto-resolves paths** (no need to type `assets/images/` manually).

- **3D Viewer**: `filename.glb`
  - *Suffix*: `-z-up` (Use if the model's up-axis is Z).
  - *Suffix*: `-scale125` (Scale to 125%—works for any number).
  - *Supports*: Autoplay/Loop for embedded animations.
- **Interactive Map**: `filename.geojson`
  - *Orientation Suffix*: `.geojson-NW` (NW = 315° bearing, S = 180°, etc.).
- **Smart Video/Image**: `filename.mp4` or `filename.jpg`
  - *Suffix*: `-autoplay` (Starts video immediately on scroll-in).
  - *Suffix*: `-loop` (Infinite loop for videos).
  - *Suffix*: `-nocontrols` (Hides video UI).
  - *Suffix*: `-invert` (**Smart Inversion**: The engine auto-detects the image's background brightness and inverts it ONLY when it clashes with the current theme).

### 🛠️ Layout & Logic Blocks
- **`[TOC]`**: Automatically builds a Table of Contents from markdown headers (#, ##) in that entry.
- **`[Label | URL | Color]`**: Renders a high-fidelity CTA button.
  - *Colors*: `Personal`, `Professional`, `Projects`, `Strava`.
- **`[Caption]`**: If placed immediately after a media block, it renders a tight, styled caption.
- **`[[Page Title]]`**: **Internal Wiki Links**. Automatically finds the page in your DB and links to it.

---

## 🖼️ 2. Thumbnail Special Behaviors

The `Thumbnail` column in the spreadsheet can do more than just show an image:

| Special Value | Behavior |
| :--- | :--- |
| **`GLB_VIEWER`** | Uses the `Page` path to find a `.glb` in `assets/models/` and renders it as an interactive 3D thumb. |
| **`MAP_VIEWER`** | Uses the `Page` path to find a `.geojson` in `assets/GPX/` and renders a mini-map thumb. |
| **`GLB_WITH_BG`** | Place a `.glb` filename on line 1 and an image filename on line 2 of the cell. Renders the 3D model over that image. |

---

## 📊 3. Engine Design System

- **Media Fade-In**: All media (images, videos) use a `.media-enter` class. They don't just appear; they fade and "float" up into place once loaded.
- **Case Resilience**: The engine handles `.jpg` vs `.JPG` mismatches, but lowercase is preferred for Linux server compatibility.
- **Atomic History**: Every month, a new `{YYYY-MM}.json` is created in `assets/data/history/`. This prevents "History Bloat" and Git merge conflicts.
- **Fuzzy Search**: Triggered by `/` or `Cmd/Ctrl + K`. It searches across Main Content, Resume, and Music data.

---

## 🤖 4. Note for Writing Agents

1. **Keep it Clean**: Use Markdown in the `Content` column.
2. **Be Intentional with Inversion**: Use `-invert` for logos or diagrams with white backgrounds so they look good in Dark Mode.
3. **Internal Linking**: Heavily use `[[Wiki Links]]` to cross-reference projects.

---
*Created by Pepper Potts (Antigravity)—Last Updated: 2026-04-03*
