        // Three.js GLB 3D Model Viewer
        import * as THREE from 'three';
        import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
        import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
        import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

        // Global Rendering Orchestrator
        window._glbLastFrameTime = 0;
        window._glbTimeBudget = 8; // ms per frame for rendering
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(navigator.userAgent) || (window.innerWidth < 800 && window.matchMedia("(pointer: coarse)").matches);
        window.glbCache = new Map(); // Global parsed GLTF asset cache (Scene, Animations)
        const MAX_CACHE_SIZE = 10;

        // CONCURRENCY LIMITER: Only allow 2 GLBs to initialize/parse at once
        window._glbParserQueue = [];
        window._glbInitActiveCount = 0;
        const MAX_CONCURRENT_INIT = 2;

        function processGLBInitQueue() {
            if (window._glbInitActiveCount >= MAX_CONCURRENT_INIT || window._glbParserQueue.length === 0) return;

            const next = window._glbParserQueue.shift();
            window._glbInitActiveCount++;
            next().finally(() => {
                window._glbInitActiveCount--;
                processGLBInitQueue();
            });
        }

        function pruneGLBCache() {
            if (window.glbCache.size > MAX_CACHE_SIZE) {
                const oldestKey = window.glbCache.keys().next().value;
                const cached = window.glbCache.get(oldestKey);
                // VRAM CLEANUP: When pruning from cache, ensure we dispose textures/geometries
                if (cached && cached.data) {
                    cached.data.scene.traverse(node => {
                        if (node.isMesh) {
                            if (node.geometry) node.geometry.dispose();
                            if (node.material) {
                                if (node.material.map) node.material.map.dispose();
                                node.material.dispose();
                            }
                        }
                    });
                }
                console.log('Pruning 3D Cache:', oldestKey);
                window.glbCache.delete(oldestKey);
            }
        }

        // WEBGL CONTEXT CLEANUP: Critical for mobile/webview stability.
        // Prevents zombie contexts from accumulating when switching pages.
        window._glbRegistry = []; // Global registry of active viewer instances
        window._glbViewers = {}; // Map of viewer IDs to instances for direct access
        window.cleanupStale3DViewers = function () {
            if (!window._glbRegistry) return;

            // 1. Dispose viewers whose canvases are no longer in the DOM
            window._glbRegistry = window._glbRegistry.filter(viewer => {
                if (viewer.canvas && !document.body.contains(viewer.canvas)) {
                    if (viewer.cleanup) viewer.cleanup();
                    return false;
                }
                return true;
            });

            // 2. Sync GLB Viewers map — remove orphaned IDs
            Object.keys(window._glbViewers).forEach(id => {
                if (!document.getElementById(id)) delete window._glbViewers[id];
            });

            // 3. Flush orphaned queue items (containers that no longer exist)
            window._glbInitQueue = window._glbInitQueue.filter(item => document.getElementById(item.uniqueId));

            // 4. Reset processing flag so new items can kick off the queue
            window._isProcessingGlbQueue = false;
        };

        // SCROLL THROTTLING REMOVED per user request

        let _glbCircularIndex = 0;
        function globalAnimate(now) {
            requestAnimationFrame(globalAnimate);

            if (window._glbRegistry.length === 0) return;

            // Priority 1: User Navigation - Throttling Removed

            // ADAPTIVE BUDGET: If frame took too long last time, tighten budget
            const frameTime = now - window._glbLastFrameTime;
            window._glbLastFrameTime = now;

            // If we're dropping below 50fps (20ms), slash the 3D budget to 3ms
            const budget = frameTime > 20 ? 3 : 6; 

            const startTime = performance.now();
            const total = window._glbRegistry.length;

            // SEGMENTATION: 
            // 1. Unrendered & Visible (Must render NOW to trigger entrance)
            // 2. Rendered & Visible (Standard updates)
            // 3. Hidden (Background/paused)

            const unrenderedVisible = [];
            const renderedVisible = [];
            const hidden = [];

            // FULLSCREEN OPTIMIZATION: If any model is in fullscreen, we skip all other rendering
            const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            const fsViewerId = fsEl?.id;
            
            let interactingViewer = null;

            for (let i = 0; i < total; i++) {
                const viewer = window._glbRegistry[i];
                // If something is in fullscreen, only that specific viewer is "visible" for rendering
                const isThisFs = fsViewerId && (viewer.canvas.parentElement?.id === fsViewerId);

                if (viewer.isVisible() && (!fsViewerId || isThisFs)) {
                    if (viewer.isInteracting?.()) interactingViewer = viewer;
                    
                    if (!viewer.hasRenderedState) unrenderedVisible.push(viewer);
                    else renderedVisible.push(viewer);
                } else {
                    hidden.push(viewer);
                }
            }

            // PHASE 0: Priority Interaction
            // If the user is actively dragging a model, we render it IMMEDIATELY and FIRST.
            // This bypasses budgeting to ensure the interaction feels snappy.
            if (interactingViewer) {
                interactingViewer.update(now);
            }

            // PHASE 1: Render new entrances (NOW SUBJECT TO BUDGET)
            // We only render up to 1 entrance per frame if budget is tight, to avoid 100ms blocks
            let entrancesProcessed = 0;
            for (let i = 0; i < unrenderedVisible.length; i++) {
                const viewer = unrenderedVisible[i];
                if (viewer === interactingViewer) continue; // Already rendered
                
                if (entrancesProcessed >= 1 && (performance.now() - startTime) > budget) break;
                viewer.update(now);
                entrancesProcessed++;
            }

            // PHASE 2: Standard Budgeted Rendering
            const remainingBudget = Math.max(0, budget - (performance.now() - startTime));
            const budgetStartTime = performance.now();

            // EXCLUSIVE MODE: If we have a fullscreen model, ONLY render that one.
            if (fsViewerId) {
                const fsViewer = renderedVisible.find(v => v.canvas.parentElement?.id === fsViewerId);
                if (fsViewer && fsViewer !== interactingViewer) fsViewer.update(now);
            } else {
                // HOME/ARTICLE MODE: Render with budget
                // If we are interacting, we might want to skip background cards to keep interaction buttery
                const isHeavyInteraction = interactingViewer && !isMobile;
                
                // TIME-SLICING: Only render a fraction of background cards per frame.
                // Because we keep quality (DPR) high so they look crisp,
                // we drop their framerate to ~20fps to save GPU fill-rate.
                _glbCircularIndex++;
                
                for (let i = 0; i < renderedVisible.length; i++) {
                    const viewer = renderedVisible[i];
                    if (viewer === interactingViewer) continue; // Already rendered
                    
                    if (isHeavyInteraction && i % 2 === 0) continue; // Throttle background cards during drag
                    
                    // CARD THROTTLE: If it's a card, only update its render 1 out of every 4 frames (~15fps)
                    // This dramatically reduces CPU/GPU overhead when multiple cards are scrolling.
                    if (viewer.isCardMode && (i + _glbCircularIndex) % 4 !== 0) continue;
                    
                    if (performance.now() - budgetStartTime > remainingBudget) break;
                    viewer.update(now);
                }
            }
        }
        requestAnimationFrame(globalAnimate);


        window.initThreeJSViewer = function initThreeJSViewer(container, glbPath, isCardMode) {
            const canvas = container.querySelector('canvas');
            const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true }) || canvas.getContext('2d');

            // --- SHARED RENDERER INITIALIZATION ---
            if (!window._sharedWebGLRenderer) {
                const offscreenCanvas = document.createElement('canvas');
                window._sharedWebGLRenderer = new THREE.WebGLRenderer({
                    canvas: offscreenCanvas,
                    antialias: true,
                    alpha: true,
                    powerPreference: "high-performance",
                    precision: "highp"
                });
                
                window._sharedWebGLRenderer.setClearColor(0x000000, 0);
                window._sharedWebGLRenderer.toneMapping = THREE.ACESFilmicToneMapping;
                window._sharedWebGLRenderer.toneMappingExposure = 0.85; // PREMIUM: Prevents clipping on white materials to preserve part seams                window._sharedWebGLRenderer.outputColorSpace = THREE.SRGBColorSpace;
                
                offscreenCanvas.addEventListener('webglcontextlost', (e) => {
                    e.preventDefault();
                    console.warn('Global WebGL context lost!');
                });
            }

            const renderer = window._sharedWebGLRenderer;

            // ORIENTATION & SCALE EXTRACTION
            // We strip these from the path so we reach the real .glb file, but keep flags.
            const lowerPath = glbPath.toLowerCase();
            const isModelZUp = lowerPath.includes('-z-up');
            
            // Parse custom scale from path (e.g., -scale73)
            let customScale = 1.0;
            const sizeMatch = glbPath.match(/-scale(\d+)/i);
            if (sizeMatch) {
                customScale = parseInt(sizeMatch[1]) / 100;
                if (customScale <= 0) customScale = 1.0; // Safety fallback
            }

            // CLEAN URL: Strip ALL behavior tags before calling the loader or cache
            glbPath = glbPath.replace(/-(?:z-up|scale\d+|autoplay|thumb|loop|noloop|nocontrols|invert)/gi, '');

            // Setup scene
            const scene = new THREE.Scene();

            // Setup camera - cache dimensions to avoid layout thrashing in rAF
            let width = container.clientWidth || 100;
            let height = container.clientHeight || 100;

            const camera = new THREE.PerspectiveCamera(
                15, // CAD-Precision: Low FOV (Telephoto) eliminated parallax for an orthographic look
                width / height,
                0.01, // Near-Plane Precision: Prevents clipping on heroic close-ups
                1000
            );
            // UNIFIED CAMERA: Enforce exact same perspective for Cards and Article
            camera.position.set(2.4, 1.6, 2.8); 
            camera.lookAt(0, 0, 0); 

            // RESOLUTION THROTTLING: 
            // Cards use 0.75x DPR on mobile and 1.0x on desktop to preserve fill-rate.
            // Article view uses up to 1.5x for balanced heroics.
            const targetDpr = isCardMode ? (isMobile ? 0.75 : 1.0) : 1.5;
            let dpr = Math.min(window.devicePixelRatio, targetDpr);
            const maxWidth = 2560;
            if (width * dpr > maxWidth) dpr = maxWidth / width;

            // Setup local 2D canvas for blitting
            canvas.style.backgroundColor = 'transparent';
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            canvas.style.width = width + 'px';
            canvas.style.height = height + 'px';

            // PREMIUM STUDIO LIGHTING RIG: 
            // Crucial for CAD geometries without baked ambient occlusion. 
            // This provides contrasting gradients (warm vs cool) across flat planes and seams
            // so identical colored parts can be visually separated.
            const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.0); // Natural outdoor gradient
            scene.add(hemiLight);

            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Prevents pitch black shadows
            scene.add(ambientLight);

            // Key light (Warm Front/Top), Rim light (Cool Back/Underside)
            [[0xfff5ea, 1.4, [5, 10, 5], scene], [0xddeeff, 1.0, [-5, 5, -5], scene]].forEach(([c, i, p, parent]) => {
                const l = new THREE.DirectionalLight(c, i);
                l.position.set(...p);
                parent.add(l);
            });

            scene.add(camera);

            // LOCAL INTERACTION STATE: Track interaction per-viewer to pause efficiently
            let isInteracting = false;
            // Setup controls (only for interactive mode)
            let controls = null;
            let autoRotateTimeout = null;
            if (!isCardMode) {
                controls = new OrbitControls(camera, canvas);
                controls.enableDamping = true;
                controls.dampingFactor = 0.08; // LOWERED for snappier interaction
                controls.rotateSpeed = 1.2; // BUMPED for snappier interaction
                controls.enableZoom = false;

                // JS-based cursor management to avoid CSS conflicts
                canvas.style.cursor = 'grab';

                // We employ a pure "Mobile Device Detection" (No Hover + Coarse Pointer)
                // This ensures touch-capable laptops with trackpads STILL get desktop pan.
                const isTrueMobile = window.matchMedia("(pointer: coarse) and (hover: none)").matches;
                if (!isTrueMobile) {
                    controls.enableRotate = true;
                    controls.enablePan = true;
                    controls.screenSpacePanning = true;
                    // Explicitly tell Three.js to use the Right Mouse Button (2) for panning
                    controls.mouseButtons = {
                        LEFT: THREE.MOUSE.ROTATE,
                        MIDDLE: THREE.MOUSE.DOLLY,
                        RIGHT: THREE.MOUSE.PAN
                    };
                    // Kill the browser menu on the canvas so it doesn't block the pan
                    canvas.addEventListener('contextmenu', e => e.preventDefault(), false);
                } else {
                    controls.enableRotate = false;
                    controls.enablePan = false;
                    controls.enabled = false; // Prevents generic event.preventDefault() hooks
                    canvas.style.setProperty('touch-action', 'auto'); // Fixes pull-to-refresh
                    canvas.style.cursor = 'auto';
                }

                controls.autoRotate = false;
                controls.autoRotateSpeed = 0;
                controls.minPolarAngle = 0;
                controls.maxPolarAngle = Math.PI;

                const resumeAutoRotate = () => {
                    if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
                    autoRotateTimeout = setTimeout(() => {
                        isInteracting = false;
                        if (controls) controls.autoRotate = false;
                    }, 5000);
                };

                controls.addEventListener('start', () => {
                    isInteracting = true;
                    if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
                    canvas.style.cursor = 'grabbing';
                });

                controls.addEventListener('end', () => {
                    resumeAutoRotate();
                    canvas.style.cursor = isTrueMobile ? 'auto' : 'grab';
                });
            }

            // Load model using SHARED Singleton Loader
            // This prevents re-initializing Draco WASM workers for every single card (Huge perf win)
            if (!window._sharedGLTFLoader) {
                const loader = new GLTFLoader();
                const dracoLoader = new DRACOLoader();
                dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
                loader.setDRACOLoader(dracoLoader);
                window._sharedGLTFLoader = loader;
            }

            let model = null;
            let autoRotateAngle = Math.PI; // Start at 180deg to face "Front" from CAD
            let isModelReady = false; // GATED: Only true when GLB is fully processed
            let hasRendered = false; // GATED: Only true when the first 3D frame has been painted
            // HOISTED: Must be declared before cache check because cached models
            // call setupModel synchronously, which references viewerInstance.
            let viewerInstance = null;

            const triggerEntrance = () => {
                // FIDELITY GATE: Entrance only triggers when geometry is ready AND the first frame is painted
                // Guard: viewerInstance might not exist yet if model was cached (synchronous setupModel)
                if (!isModelReady || !hasRendered || !viewerInstance) return;
                if (viewerInstance.loaded) return;

                container.classList.add('loaded');
                viewerInstance.loaded = true;
                const overlay = container.querySelector('.loader-overlay');
                if (overlay) overlay.remove();
            };

            const initTask = async () => {
                return new Promise((resolve) => {
                    const setupModel = (gltf) => {
                        // SCENE CLONING: Essential to allow multiple viewers for the same model
                        model = SkeletonUtils.clone(gltf.scene);

                        // ORIENTATION CORRECTION
                        if (isModelZUp) {
                            model.rotation.x = -Math.PI / 2;
                            model.updateMatrixWorld();
                            autoRotateAngle = 0;
                        }

                        // 1. CENTER MODEL
                        const box = new THREE.Box3().setFromObject(model);
                        const center = box.getCenter(new THREE.Vector3());
                        model.position.sub(center);

                        // 2. TEXTURE FILTERING & ECO-MODE
                        // For cards, we use lower anisotropy to save GPU fill-rate.
                        const maxAnisotropy = isCardMode ? 2 : renderer.capabilities.getMaxAnisotropy();
                        model.traverse((node) => {
                            if (node.isMesh && node.material) {
                                // We clone all materials so we can alter them safely
                                node.material = node.material.clone();

                                if (node.material.map) node.material.map.anisotropy = maxAnisotropy;

                                // FAKE SHEEN FOR MAXIMUM PERFORMANCE:
                                // Instead of a heavy Environment Map (which caused scrolling lag),
                                // we drop metalness and force an incredibly low roughness (like polished plastic).
                                // Combined with Directional Lights, this creates a sharp, bright specular highlight
                                // that looks exactly like shiny metal but without the BRDF overhead.
                                if (node.material.metalness !== undefined && node.material.metalness > 0.0) {
                                    node.material.metalness = 0.1; // Minimal real metal calculation
                                    node.material.roughness = 0.05; // Chrome-like smoothness for the specular ping
                                    // Removed the artificial color boost to preserve shading contrast!
                                }

                                if (isCardMode) {
                                    if (node.material.roughness !== undefined) {
                                        node.material.roughness = Math.max(0.15, node.material.roughness);
                                    }
                                }
                                node.material.needsUpdate = true;
                            }
                        });

                        // Wrap model in a group for rotation
                        const modelGroup = new THREE.Group();
                        modelGroup.add(model);
                        scene.add(modelGroup);

                        if (viewerInstance) viewerInstance.fitStage();
                        isModelReady = true;
                        triggerEntrance();
                        resolve();
                    };

                    // ASSET CACHE: Check if model is already loaded/parsing
                    // CRITICAL: Use setTimeout(0) for cached models to defer setupModel
                    // until AFTER viewerInstance is assigned. Without this, fitStage()
                    // and triggerEntrance() can't access viewerInstance.
                    if (window.glbCache.has(glbPath)) {
                        const cached = window.glbCache.get(glbPath);
                        if (cached.status === 'DONE') {
                            setTimeout(() => setupModel(cached.data), 0);
                        } else {
                            cached.callbacks.push(setupModel);
                        }
                    } else {
                        window.glbCache.set(glbPath, { status: 'LOADING', data: null, callbacks: [setupModel] });
                        pruneGLBCache();

                        window._sharedGLTFLoader.load(glbPath, (gltf) => {
                            const cache = window.glbCache.get(glbPath);
                            if (!cache) return resolve(); // Might have been pruned during load
                            cache.status = 'DONE';
                            cache.data = gltf;
                            cache.callbacks.forEach(cb => cb(gltf));
                            cache.callbacks = [];
                        });
                    }
                });
            };

            // Queue the initialization
            window._glbParserQueue.push(initTask);
            processGLBInitQueue();

            // Visibility tracking with HIBERNATION
            let isVisible = false; // Initialize false to force a clean entry check
            let isHibernating = false;
            let hibernateTimeout = null;

            const visibilityObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    isVisible = entry.isIntersecting;
                    
                    if (isVisible) {
                        if (hibernateTimeout) {
                            clearTimeout(hibernateTimeout);
                            hibernateTimeout = null;
                        }
                        if (isHibernating) {
                            isHibernating = false;
                            if (model && !scene.children.includes(model.parent)) {
                                scene.add(model.parent);
                            }
                        }
                        triggerEntrance(); // Try to start fade-in on scroll entry
                    } else {
                        // VRAM GUARD: Hibernate after 2 seconds of being off-screen to save VRAM/GPU cycles
                        if (hibernateTimeout) clearTimeout(hibernateTimeout);
                        hibernateTimeout = setTimeout(() => {
                            if (!isVisible && model && !isHibernating) {
                                isHibernating = true;
                                scene.remove(model.parent); // Removes from GPU render tree
                            }
                        }, 2000);
                    }
                });
            }, { threshold: 0.01 }); // Relaxed threshold for mobile/small screens
            visibilityObserver.observe(container);

            // Viewer logic moved into an update function for the orchestrator
            let lastFrameTime = 0;

            viewerInstance = {
                scene,
                camera,
                renderer,
                controls,
                canvas,
                isInteracting: () => isInteracting,
                fitStage: () => {
                    // Root Fix: Use Bounding Sphere instead of Box3 (AABB)
                    // Bounding Sphere radius is rotationally invariant, eliminating "breathing".
                    if (!viewerInstance._modelRadius) {
                        if (!model) return;
                        const box = new THREE.Box3().setFromObject(model);
                        const sphere = box.getBoundingSphere(new THREE.Sphere());
                        viewerInstance._modelRadius = sphere.radius;
                    }
                    const radius = viewerInstance._modelRadius;
                    const vFOV = camera.fov * (Math.PI / 180);
                    const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * camera.aspect);

                    // BOTTLENECK-BASED SAFETY (Option A):
                    // 1. Find the "Boss Bottleneck" - the axis requiring the most distance for a 100% fit.
                    // 2. Start from that safety point and zoom in exactly 15% for consistent heroics.
                    const distVertical = radius / Math.tan(vFOV / 2);
                    const distHorizontal = radius / Math.tan(hFOV / 2);

                    const baseMultiplier = isCardMode ? 1.0 : 0.66; // ~1.5x larger in articles
                    const multiplier = baseMultiplier / (customScale || 1.0);
                    const cameraDist = Math.max(distVertical, distHorizontal) * multiplier;

                    const dir = new THREE.Vector3(2.4, 1.6, 2.8).normalize();
                    camera.position.copy(dir.multiplyScalar(cameraDist));
                    camera.lookAt(0, 0, 0);
                    if (controls) controls.target.set(0, 0, 0);
                },
                onResize: () => {
                    const newW = container.clientWidth;
                    const newH = container.clientHeight;
                    if (newH === 0) return;

                    width = newW;
                    height = newH;
                    camera.aspect = width / height;
                    camera.updateProjectionMatrix();

                    // PERFORMANCE LOCK: Dynamic resolution based on view mode
                    const isFs = container.classList.contains('fullscreen');
                    const dprThreshold = isFs ? 1.0 : (isCardMode ? 1.0 : 1.25);
                    const newDpr = Math.min(window.devicePixelRatio, dprThreshold);
                    viewerInstance._dpr = newDpr; // Store locally for the shared renderer

                    // Update local 2D canvas size
                    canvas.width = width * newDpr;
                    canvas.height = height * newDpr;
                    canvas.style.width = width + 'px';
                    canvas.style.height = height + 'px';

                    if (viewerInstance.fitStage) viewerInstance.fitStage();
                },
                update: (now) => {
                    if (!isVisible) return false;

                    // Stabilized Delta: Prevents "teleporting" jumps during heavy load
                    let delta = lastFrameTime ? (now - lastFrameTime) : 16.6;
                    lastFrameTime = now;

                    // Cap delta at 50ms to prevent huge jumps if browser stutters
                    delta = Math.min(delta, 50);

                    // PROFESSIONAL MOTION: Slower, more subtle rotation for a premium feel
                    const baseSpeed = isCardMode ? 0.0010 : 0.0015;
                    const rotationStep = (Math.min(delta, 64) / 16.6) * baseSpeed;

                    if (isCardMode && model) {
                        const modelGroup = model.parent;
                        if (modelGroup && modelGroup.type === 'Group') {
                            autoRotateAngle += rotationStep;
                            modelGroup.rotation.y = autoRotateAngle;
                        }
                    } else if (model && controls && !controls.autoRotate) {
                        const modelGroup = model.parent;
                        if (modelGroup && modelGroup.type === 'Group') {
                            if (!isInteracting) {
                                autoRotateAngle += rotationStep;
                                modelGroup.rotation.y = autoRotateAngle;
                            }
                        }
                    }

                    if (controls) {
                        controls.autoRotateSpeed = 0.5 * (Math.min(delta, 64) / 16.6);
                        controls.update();
                    }
                    
                    // MASTER BUFFER STRATEGY:
                    // Instead of resizing the renderer (slow), we ensure the shared renderer 
                    // is "at least" big enough, and then we render into a specific viewport.
                    const curDpr = viewerInstance._dpr || dpr;
                    const targetW = Math.floor(width * curDpr);
                    const targetH = Math.floor(height * curDpr);
                    
                    const currentRendererCanvas = renderer.domElement;
                    if (currentRendererCanvas.width < targetW || currentRendererCanvas.height < targetH) {
                        // Only grow the buffer, never shrink it in the loop. 
                        // This eliminates 99% of GPU memory re-allocations.
                        const growW = Math.max(currentRendererCanvas.width, targetW);
                        const growH = Math.max(currentRendererCanvas.height, targetH);
                        renderer.setPixelRatio(1); // We manage DPR manually via target dimensions
                        renderer.setSize(growW, growH, false);
                    }
                    
                    // 1. Setup Viewport (Only render into the top-left sub-rectangle of the master buffer)
                    renderer.setViewport(0, 0, targetW, targetH);
                    renderer.setScissor(0, 0, targetW, targetH);
                    renderer.setScissorTest(true);
                    
                    // 2. Render 3D scene
                    renderer.render(scene, camera);
                    
                    // 3. Copy pixels from the specific sub-rect of the master buffer
                    // Note: WebGL coordinates are bottom-up, but drawImage expects top-down.
                    // Because we are rendering into a sub-viewport at (0, 0), and our 
                    // master buffer might be larger, we must copy correctly.
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(
                        renderer.domElement, 
                        0, currentRendererCanvas.height - targetH, targetW, targetH, // Source (WebGL is bottom-up)
                        0, 0, canvas.width, canvas.height // Destination
                    );

                    // Mark as rendered so the entrance gate can open
                    if (!hasRendered) {
                        hasRendered = true;
                        viewerInstance.hasRenderedState = true;
                        triggerEntrance();
                    }

                    return true;
                },
                isVisible: () => isVisible,
                cleanup: () => {
                    visibilityObserver.disconnect();
                    window._glbRegistry = window._glbRegistry.filter(v => v !== viewerInstance);

                    // We no longer dispose the renderer or environment map here since they are globally shared.
                    scene.clear();
                },
                model: () => model,
                isCardMode,
                customScale, // Store parsed scale for fitStage
                loaded: false,
                hasRenderedState: false
            };

            // Register with the global orchestrator
            window._glbRegistry.push(viewerInstance);

            // SAFETY NET: Force entrance after 5s if normal gates never open.
            // This prevents permanent "Loading 3D" from context loss or other edge cases.
            setTimeout(() => {
                if (!viewerInstance.loaded) {
                    container.classList.add('loaded');
                    viewerInstance.loaded = true;
                    const overlay = container.querySelector('.loader-overlay');
                    if (overlay) overlay.remove();
                }
            }, 5000);

            return viewerInstance;
        }

