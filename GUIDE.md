# 🌐 High-Fidelity Portfolio: Master Feature Guide

This guide details all available features, their content requirements, and how to trigger them using the CMS (Google Spreadsheet) or API.

---

## 🏗️ 1. Content Page Blocks (Google Sheet `Content` Column)

You can build complex pages by placing these specialized blocks on their own lines (with blank lines in between).

### 🏷️ Dynamic API Tags (Curly Braces `{}`)
These tags fetch real-time data from your unified JSON API.

- **`{Recently Played}`** or **`{Recent Music}`**: Renders a grid of your 3 most recently logged tracks.
- `{Top Artists}`: Renders a 3-item grid of most-played artists.
- `{Top Songs}`: Renders a 3-item grid of all-time most-played tracks.
- `{Fresh Favorites}`: Renders a 3-item grid of tracks currently in a "replay loop."
- `{Random Quote}`: Injects a randomized Quote Discovery Card from your Quote API. 

### 🧬 High-Fidelity Media (Extension-Based)
Simply write the filename on its own line. No prefix tags needed.

- **3D Viewer**: `filename.glb` (Must be in `assets/models/`)
  - *Suffix*: `-z-up` (Use if the model's up-axis is Z).
  - *Suffix*: `-scale75` (Scale to 75%—works for any number).
- **Interactive Map**: `filename.geojson` (Must be in `assets/GPX/`)
  - *Orientation Suffix*: `.geojson-NW` (NW = 315° bearing, S = 180°, etc.).
- **Smart Video**: `filename.mp4` (Must be in `assets/videos/`)
  - *Suffix*: `-autoplay` (Starts immediately on scroll-in).
  - *Suffix*: `-loop` (Infinite loop).
  - *Suffix*: `-nocontrols` (Hides video UI).
  - *Suffix*: `-invert` (Inverts colors depending on Dark/Light theme).

### 🛠️ Layout & Logic Blocks
- **`[TOC]`** or **`[Title | TOC]`**: Automatically builds a Table of Contents from headers in that entry.
- **`[Label | URL | CTA]`**: Renders a high-fidelity Call-to-Action button.
- **`[Caption]`**: If placed immediately after a media block, it renders a styled caption below it.

---

## 📊 2. Spreadsheet Maintenance Guide

| Sheet Name | Purpose | Column Rules |
| :--- | :--- | :--- |
| **Main Content** | Site structure & pages | Use `Page` for hierarchy (e.g., `Projects/Design`). Use `Type`: `Hero`, `Text`, or `Article`. |
| **Resume** | Professional data | Uses a dynamic `#Hash` system in the `Page` column to section off Education, Skills, and Experience. |
| **Quotes** | Shared API database | Fetched via JSON API. Safe to keep private from public CSV publication. |

---

## 🚀 3. Top-Level Features
- **Fuzzy Search**: Triggered by `/` or `Cmd/Ctrl + K`.
- **Haptic Navigation**: On mobile, nav choices provide vibration feedback.
- **Adaptive 3D Budgeting**: Low-FPS detection pauses background 3D scene rendering to keep the site fluid.
- **OpSec Recency**: Recency is determined by sequence order in the API returns (no timestamps used).

---
*Created by Antigravity—Last Updated: 2026-03-20*
