---
category: Projects
date: '2022-05-18'
hierarchy: Projects/MiniRover/VisionSystem
layout: default
tags:
- Computer Vision
- ROS
- Autonomy
title: Computer Vision Module
---

Object detection and path planning using OpenCV and ROS navigation stack.

## Detection Pipeline

YOLOv5 running on Jetson Nano (8 FPS). Detects objects at 2m range. 
<div class="inline-gallery"><img src="https://placehold.co/400/7c2d12/FFF?text=Detection+Demo" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/400/9a3412/FFF?text=Bounding+Boxes" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 Trained on 1,200 labeled images.

## Navigation

A* pathfinding with dynamic obstacle avoidance. 
<div class="inline-gallery"><img src="https://placehold.co/350/c2410c/FFF?text=Path+Visualization" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/ea580c/FFF?text=Costmap" class="inline-img zoomable" loading="lazy" alt="Gallery Image"><img src="https://placehold.co/350/fb923c/FFF?text=Trajectory" class="inline-img zoomable" loading="lazy" alt="Gallery Image"></div>
 ROS MoveBase integration with 2D SLAM mapping.
