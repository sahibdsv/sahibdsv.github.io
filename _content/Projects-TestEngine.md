---
category: Projects
date: '2026-01-14'
hierarchy: Projects/TestEngine
layout: default
tags:
- Test
- Development
- Engine
title: Engine Capabilities
---

Stress testing the static site generator. Verifying collages, layouts, wiki links, and MathJax rendering.

## Grid Layouts

2-column auto-fit: 
<div class="inline-gallery"><img src="https://placehold.co/500/dc2626/FFF?text=LEFT" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/500/16a34a/FFF?text=RIGHT" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 3-column maintain aspect: 
<div class="inline-gallery"><img src="https://placehold.co/350/2563eb/FFF?text=A" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/7c3aed/FFF?text=B" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/db2777/FFF?text=C" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>


## Aspect Ratios

Checking alignment of mixed dimensions: 
<div class="inline-gallery"><img src="https://placehold.co/450/0891b2/FFF?text=Tall" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/450/059669/FFF?text=Wide" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Grid should align to baseline.

## Consistency

Repeated 3-column structure: 
<div class="inline-gallery"><img src="https://placehold.co/300/7c2d12/FFF?text=1" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/300/9a3412/FFF?text=2" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/300/c2410c/FFF?text=3" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Verifying global grid behavior.

## Mixed Content

Inline gallery test: 
<div class="inline-gallery"><img src="https://placehold.co/400/14532d/FFF?text=Gallery+1" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/400/15803d/FFF?text=Gallery+2" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Verifying link parsing for internal nodes [Projects/FSAE](#Projects/FSAE) and external resources.

## Typography

HTML parsing: <b>Bold</b>, <i>Italic</i>, <u>Underline</u>. Nested: <b>Bold/<i>Italic</i></b>. Link classes: <a href="https://github.com">GitHub</a>.

## MathJax

Inline: \( x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} \) and \( e^{i\pi} + 1 = 0 \). Block: \[ \nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t} \]

## Long Form

Stress testing line-height and readability variables. This text block validates container overflow behavior, word wrapping, and font rendering at standard viewing distances. Color values should adhere to #d4d4d4. Internal links like [Projects/CubeSat](#Projects/CubeSat) must parse within the block.

## Sequence

Consecutive gallery blocks. Block A: 
<div class="inline-gallery"><img src="https://placehold.co/350/831843/FFF?text=A1" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/be123c/FFF?text=A2" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Block B: 
<div class="inline-gallery"><img src="https://placehold.co/350/f43f5e/FFF?text=B1" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/fb7185/FFF?text=B2" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Checks vertical rhythm.
