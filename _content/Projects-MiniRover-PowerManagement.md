---
category: Projects
date: '2022-06-02'
hierarchy: Projects/MiniRover/PowerManagement
layout: default
tags:
- Electronics
- PCB
- Power
title: Power Distribution Board
---

Custom PCB with voltage regulation, battery monitoring, and motor drivers.

## Circuit Design

5V/3A and 12V/2A buck converters. H-bridge motor drivers (2A continuous). 
<div class="inline-gallery"><img src="https://placehold.co/450/14532d/FFF?text=Schematic" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/450/15803d/FFF?text=PCB+3D" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Designed in KiCad with 4-layer stackup.

## Battery Monitor

7.4V LiPo with fuel gauge IC (LTC2943). 
<div class="inline-gallery"><img src="https://placehold.co/300/16a34a/FFF?text=Monitor+Display" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/300/22c55e/FFF?text=Charge+Curve" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/300/4ade80/FFF?text=Discharge+Profile" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Low-voltage cutoff at 6.4V to prevent cell damage.
