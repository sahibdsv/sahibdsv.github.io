---
category: Projects
date: '2022-05-18'
hierarchy: Projects/MiniRover/VisionSystem
layout: default
permalink: /Projects/MiniRover/VisionSystem/
tags:
- Computer Vision
- ROS
- Autonomy
title: Computer Vision Module
---

## Computer Vision Module

Object detection and path planning using OpenCV and ROS navigation stack.

## Detection Pipeline

YOLOv5 running on Jetson Nano (8 FPS). Detects objects at 2m range. [https://placehold.co/400/7c2d12/FFF?text=Detection+Demo, https://placehold.co/400/9a3412/FFF?text=Bounding+Boxes] Trained on 1,200 labeled images.

## Navigation

A* pathfinding with dynamic obstacle avoidance. [https://placehold.co/350/c2410c/FFF?text=Path+Visualization, https://placehold.co/350/ea580c/FFF?text=Costmap, https://placehold.co/350/fb923c/FFF?text=Trajectory] ROS MoveBase integration with 2D SLAM mapping.
