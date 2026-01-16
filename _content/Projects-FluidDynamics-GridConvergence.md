---
category: Projects
date: '2023-09-22'
hierarchy: Projects/FluidDynamics/GridConvergence
layout: default
tags:
- Verification
- GCI
- Mesh
title: Mesh Independence Study
---

Richardson extrapolation and GCI analysis for CFD solution verification.

## Methodology

Three mesh levels: 500K, 2M, 8M cells. 
<div class="inline-gallery"><img src="https://placehold.co/400/0891b2/FFF?text=Coarse+Mesh" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/400/06b6d4/FFF?text=Medium+Mesh" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Refinement ratio: 1.5 in all directions.

## Convergence Results

GCI for exit Mach: 1.2%. Asymptotic convergence confirmed. 
<div class="inline-gallery"><img src="https://placehold.co/350/22d3ee/FFF?text=Convergence+Plot" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/67e8f9/FFF?text=Error+Distribution" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Adopted 2M mesh for production runs.
