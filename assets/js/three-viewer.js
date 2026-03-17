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
        window.glbCache = new Map(); // Global parsed GLTF asset cache (Scene, Animations)
        const MAX_CACHE_SIZE = 10;

        function pruneGLBCache() {
            if (window.glbCache.size > MAX_CACHE_SIZE) {
                const oldestKey = window.glbCache.keys().next().value;
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
        window._isGlbScrolling = false;

        let _glbCircularIndex = 0;
        function globalAnimate(now) {
            requestAnimationFrame(globalAnimate);

            if (window._glbRegistry.length === 0) return;

            // Priority 1: User Navigation - Throttling Removed
            // if (window._isGlbScrolling) return;

            // ADAPTIVE BUDGET: If frame took too long last time, tighten budget
            const frameTime = now - window._glbLastFrameTime;
            window._glbLastFrameTime = now;

            // If we're dropping below 50fps (20ms), slash the 3D budget to 4ms
            const budget = frameTime > 20 ? 4 : 8;

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

            for (let i = 0; i < total; i++) {
                const viewer = window._glbRegistry[i];
                // If something is in fullscreen, only that specific viewer is "visible" for rendering
                const isThisFs = fsViewerId && (viewer.canvas.parentElement?.id === fsViewerId);

                if (viewer.isVisible() && (!fsViewerId || isThisFs)) {
                    if (!viewer.hasRenderedState) unrenderedVisible.push(viewer);
                    else renderedVisible.push(viewer);
                } else {
                    hidden.push(viewer);
                }
            }

            // PHASE 1: Render new entrances (NOW SUBJECT TO BUDGET)
            // We only render up to 1 entrance per frame if budget is tight, to avoid 100ms blocks
            let entrancesProcessed = 0;
            for (let i = 0; i < unrenderedVisible.length; i++) {
                if (entrancesProcessed >= 1 && (performance.now() - startTime) > budget) break;
                unrenderedVisible[i].update(now);
                entrancesProcessed++;
            }

            // PHASE 2: Standard Budgeted Rendering
            const remainingBudget = Math.max(0, budget - (performance.now() - startTime));
            const budgetStartTime = performance.now();

            // EXCLUSIVE MODE: If we have a fullscreen model, ONLY render that one.
            // This stops all background cards from "stealing" GPU draw calls.
            if (fsViewerId) {
                const fsViewer = renderedVisible.find(v => v.canvas.parentElement?.id === fsViewerId);
                if (fsViewer) fsViewer.update(now);
            } else {
                // HOME/ARTICLE MODE: Render with budget
                for (let i = 0; i < renderedVisible.length; i++) {
                    const viewer = renderedVisible[i];
                    if (performance.now() - budgetStartTime > remainingBudget) break;
                    viewer.update(now);
                }
            }
        }
        requestAnimationFrame(globalAnimate);


        window.initThreeJSViewer = function initThreeJSViewer(container, glbPath, isCardMode) {
            const canvas = container.querySelector('canvas');

            // Parse custom scale from path (e.g., -scale73)
            let customScale = 1.0;
            const sizeMatch = glbPath.match(/-scale(\d+)/i);
            if (sizeMatch) {
                customScale = parseInt(sizeMatch[1]) / 100;
                if (customScale <= 0) customScale = 1.0; // Safety fallback
                // Strip scale from path so we fetch the actual file
                glbPath = glbPath.replace(sizeMatch[0], '');
            }

            // Setup scene
            const scene = new THREE.Scene();
            // scene.background = null; // Transparent background

            // Setup camera - adjust position for narrower FOV in card mode
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
            // If user says Cards are perfect, we mirror that settings 1:1
            camera.position.set(2.4, 1.6, 2.8); // Standard "Perfect" Card Angle

            camera.lookAt(0, 0, 0); // Point camera at model center

            const renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                alpha: false,
                powerPreference: "high-performance",
                // Mobile GPUs strictly enforce mediump, which severely breaks PBR reflections (banding/voids). 
                // Always use highp for accurate environment mapping.
                precision: "highp"
            });

            // Add this to help with the fill-rate:
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Drop to 1.5 for even more speed
            renderer.setSize(width, height, false);
            // Limit pixel ratio to 2.0 (Industry Gold Standard)
            // 3.0+ offers diminishing returns but doubles/triples GPU load, causing stuttering in fullscreen.
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(navigator.userAgent) || (window.innerWidth < 800 && window.matchMedia("(pointer: coarse)").matches);

            // RESOLUTION CEILING: Never render more than 2560px wide (Quad HD).
            // A 4K monitor (3840px) at 2.0x ratio would try to render 8K (too heavy).
            let dpr = Math.min(window.devicePixelRatio, 2.0);
            const maxWidth = 2560;
            if (width * dpr > maxWidth) dpr = maxWidth / width;

            renderer.setPixelRatio(dpr);
            // THEME-AWARE STABILITY: Contextual viewport colors
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            let clearColor;

            if (isCardMode) {
                clearColor = isLight ? 0xf7f7f9 : 0x111111;
            } else {
                clearColor = isLight ? 0xeeeef2 : 0x050505;
            }
            renderer.setClearColor(clearColor, 1);
            canvas.style.backgroundColor = 'transparent';
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.85; // PREMIUM: Prevents clipping on white materials and preserves highlight detail
            renderer.outputColorSpace = THREE.SRGBColorSpace;

            // CONTEXT LOSS HANDLER: Detect and gracefully try to recover or cleanup
            canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                console.warn('WebGL context lost for:', glbPath);
                // Allow the registry to clean this up naturally
            });

            // UNIFIED LIGHTING: Fix for "Black Metals" and "Dark Reloads"
            // We create a FRESH RoomEnvironment for EACH viewer. Sharing a scene across different 
            // WebGL contexts is risky and can lead to "Dark Viewers" if one context is suspended.
            const roomEnvScene = new RoomEnvironment();
            const pmremGenerator = new THREE.PMREMGenerator(renderer);
            pmremGenerator.compileEquirectangularShader();
            const envMap = pmremGenerator.fromScene(roomEnvScene).texture;
            pmremGenerator.dispose();

            scene.environment = envMap;
            scene.environmentIntensity = 1.6; // Slight bump for better resilience
            scene.backgroundBlurriness = 0.5;
            const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.45); // Improved fill
            scene.add(hemiLight);

            // JEWELRY STORE LIGHTING RIG: High-contrast specialized rig
            [[0xfff5ea, 0.6, [5, 10, 5], scene], [0xeaefff, 0.4, [-5, 2, 5], scene], [0xffffff, 0.9, [-2, 5, -5], scene], [0xffffff, 0.25, [0, 0, 1], camera], [0xffffff, 0.15, [0, -5, 0], scene]].forEach(([c, i, p, parent]) => {
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
                controls.dampingFactor = 0.15;
                controls.enableZoom = false;

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
                    canvas.style.setProperty('touch-action', 'auto', 'important'); // Fixes pull-to-refresh
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

                    // Track interaction with this specific model (Simplified event name)
                    if (window.goatcounter && window.goatcounter.count) {
                        const filename = glbPath.split('/').pop();
                        goatcounter.count({
                            path: '3d-' + filename,
                            title: '3D Interaction: ' + filename,
                            event: true
                        });
                    }
                });

                controls.addEventListener('end', () => resumeAutoRotate());
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

            const setupModel = (gltf) => {
                // SCENE CLONING: Essential to allow multiple viewers for the same model
                model = SkeletonUtils.clone(gltf.scene);

                // ORIENTATION CORRECTION
                if (glbPath.toLowerCase().includes('-z-up')) {
                    model.rotation.x = -Math.PI / 2;
                    model.updateMatrixWorld();
                    autoRotateAngle = 0;
                }

                // 1. CENTER MODEL
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                model.position.sub(center);

                // 2. TEXTURE FILTERING
                const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
                model.traverse((node) => {
                    if (node.isMesh) {
                        if (node.material.map) node.material.map.anisotropy = maxAnisotropy;
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
                    if (!cache) return; // Might have been pruned during load
                    cache.status = 'DONE';
                    cache.data = gltf;
                    cache.callbacks.forEach(cb => cb(gltf));
                    cache.callbacks = [];
                });
            }
            // Visibility tracking for rendering optimization and entrance gating
            let isVisible = false; // Initialize false to force a clean entry check
            const visibilityObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    isVisible = entry.isIntersecting;
                    if (isVisible) triggerEntrance(); // Try to start fade-in on scroll entry
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

                    const multiplier = 1.0 / (customScale || 1.0);
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

                    // PERFORMANCE LOCK:
                    // If the window is large (Desktop/Fullscreen), we cap at 1.5.
                    // This is the "Butter Zone" for performance vs quality.
                    const dpr = width > 1200 ? 1.0 : Math.min(window.devicePixelRatio, 2.0);

                    renderer.setPixelRatio(dpr);
                    renderer.setSize(width, height, false);

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
                    // Cards are now slow (0.0010) to minimize distraction in grids.
                    const baseSpeed = isCardMode ? 0.0010 : 0.0015;
                    const rotationStep = (Math.min(delta, 64) / 16.6) * baseSpeed;

                    if (isCardMode && model) {
                        const modelGroup = model.parent;
                        if (modelGroup && modelGroup.type === 'Group') {
                            autoRotateAngle += rotationStep;
                            modelGroup.rotation.y = autoRotateAngle;
                        }
                    } else if (model && controls && !controls.autoRotate) {
                        // MANUAL ROTATION FOR ARTICLE MODE
                        const modelGroup = model.parent;
                        if (modelGroup && modelGroup.type === 'Group') {
                            if (!isInteracting) {
                                autoRotateAngle += rotationStep;
                                modelGroup.rotation.y = autoRotateAngle;
                            }
                        }
                    }

                    if (controls) {
                        // Match OrbitControls autoRotate speed to the slowed professional standard
                        controls.autoRotateSpeed = 0.5 * (Math.min(delta, 64) / 16.6);
                        controls.update();
                    }
                    renderer.render(scene, camera);

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

                    // Cleanup environment texture to prevent leaks
                    if (scene.environment) scene.environment.dispose();

                    renderer.dispose();
                    // CRITICAL: Explicitly release WebGL context to free the GPU slot immediately.
                    // renderer.dispose() alone does NOT free the context on mobile browsers.
                    try {
                        const gl = renderer.getContext();
                        const ext = gl.getExtension('WEBGL_lose_context');
                        if (ext) {
                            // Defer losing context slightly to avoid flicker if page is still transitioning
                            setTimeout(() => ext.loseContext(), 50);
                        }
                    } catch (e) { /* Context may already be lost */ }
                    scene.clear();
                },
                model: () => model,
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

