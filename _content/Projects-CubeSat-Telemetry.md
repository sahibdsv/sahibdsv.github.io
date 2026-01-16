---
category: Projects
date: '2023-11-28'
hierarchy: Projects/CubeSat/Telemetry
layout: default
tags:
- RF
- Communications
- Protocol
title: Communications Subsystem
---

UHF/VHF transceiver design with ground station protocol. 9600 baud downlink.

## Radio Design

Custom patch antenna (435MHz, 2.1dBi gain). Power output: 1W. 
<div class="inline-gallery"><img src="https://placehold.co/400/7c3aed/FFF?text=Antenna+Pattern" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/400/9333ea/FFF?text=PCB+Design" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Link budget: 12dB margin at 400km altitude.

## Protocol Stack

AX.25 packet radio with Reed-Solomon FEC. Beacon interval: 60s. 
<div class="inline-gallery"><img src="https://placehold.co/350/a855f7/FFF?text=Packet+Structure" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/c084fc/FFF?text=Ground+Station" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Successfully decoded at 1200km range during balloon test.
