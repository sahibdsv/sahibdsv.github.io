---
category: Projects
date: '2024-09-05'
hierarchy: Projects/SaritEV/ControlFirmware
layout: default
tags:
- Firmware
- Embedded
- CAN
title: Vehicle Control Unit
---

Embedded firmware for motor control, regenerative braking, and CAN bus integration.

## Architecture

STM32F4 microcontroller with dual-core processing. 
<div class="inline-gallery"><img src="https://placehold.co/400/0891b2/FFF?text=Block+Diagram" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/400/06b6d4/FFF?text=PCB+Layout" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 1kHz control loop for FOC motor drive.

## Regen Braking

Captured 18% energy recovery during urban cycle. 
<div class="inline-gallery"><img src="https://placehold.co/350/22d3ee/FFF?text=Efficiency+Curve" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/67e8f9/FFF?text=Torque+Map" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Blended with mechanical brakes via brake-by-wire system.
