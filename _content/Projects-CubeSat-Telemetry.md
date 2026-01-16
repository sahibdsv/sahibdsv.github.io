---
category: Projects
date: '2023-11-28'
hierarchy: Projects/CubeSat/Telemetry
layout: default
permalink: /Projects/CubeSat/Telemetry/
tags:
- RF
- Communications
- Protocol
title: Communications Subsystem
---

## Communications Subsystem

UHF/VHF transceiver design with ground station protocol. 9600 baud downlink.

## Radio Design

Custom patch antenna (435MHz, 2.1dBi gain). Power output: 1W. [https://placehold.co/400/7c3aed/FFF?text=Antenna+Pattern, https://placehold.co/400/9333ea/FFF?text=PCB+Design] Link budget: 12dB margin at 400km altitude.

## Protocol Stack

AX.25 packet radio with Reed-Solomon FEC. Beacon interval: 60s. [https://placehold.co/350/a855f7/FFF?text=Packet+Structure, https://placehold.co/350/c084fc/FFF?text=Ground+Station] Successfully decoded at 1200km range during balloon test.
