        let active3DContainers = [];

        function cleanup3DResources() {
            active3DContainers.forEach(container => {
                container.innerHTML = '';
                container.classList.remove('loaded', 'ready');
            });
            active3DContainers = [];
        }

        function init3DViewers() {
            const containers = document.querySelectorAll('.embed-wrapper.stl:not(.loaded)');
            if (containers.length === 0) return;

            Promise.all([
                import('three'),
                import('three/addons/loaders/STLLoader.js'),
                import('three/addons/loaders/GLTFLoader.js'),
                import('three/addons/controls/OrbitControls.js')
            ]).then(([THREE, { STLLoader }, { GLTFLoader }, { OrbitControls }]) => {

                const visibilityObserver = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        const container = entry.target;
                        if (entry.isIntersecting) container.setAttribute('data-visible', 'true');
                        else container.setAttribute('data-visible', 'false');
                    });
                });

                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            loadModel(entry.target, THREE, STLLoader, GLTFLoader, OrbitControls);
                            observer.unobserve(entry.target);
                            visibilityObserver.observe(entry.target);
                        }
                    });
                }, { rootMargin: "200px" });

                containers.forEach(c => {
                    observer.observe(c);
                    active3DContainers.push(c);
                });
            });
        }

        function loadModel(container, THREE, STLLoader, GLTFLoader, OrbitControls) {
            if (container.classList.contains('loaded')) return;
            container.classList.add('loaded');

            const url = container.getAttribute('data-src');
            const customColor = container.getAttribute('data-color');
            const ext = url.split('.').pop().toLowerCase();

            const scene = new THREE.Scene();
            scene.background = null;

            const camera = new THREE.PerspectiveCamera(30, container.clientWidth / container.clientHeight, 0.01, 1000);
            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.physicallyCorrectLights = true;

            container.appendChild(renderer.domElement);

            // FIX: STRICTLY CONDITIONALLY RENDER BUTTONS ONLY FOR ARTICLES
            if (container.closest('.article-mode')) {
                const ui = document.createElement('div');
                ui.className = 'stl-controls';
                ui.innerHTML = `
                    <div class="stl-btn" id="btn-full"><svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></div>
                `;
                container.appendChild(ui);

                setTimeout(() => {
                    ui.classList.add('visible');
                    setTimeout(() => ui.classList.remove('visible'), 2000);
                }, 1000);

                const updateFullscreenIcon = () => {
                    const isFull = !!document.fullscreenElement;
                    const path = isFull
                        ? '<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-14v3h3v2h-5V5h2z"/>'
                        : '<path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>';
                    ui.querySelector('#btn-full svg').innerHTML = path;
                };

                ui.querySelector('#btn-full').onclick = () => {
                    if (!document.fullscreenElement) {
                        container.requestFullscreen().then(() => {
                            if (screen.orientation && screen.orientation.lock) {
                                screen.orientation.lock('landscape').catch(e => console.log('Orientation lock failed', e));
                            }
                        }).catch(err => {
                            console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                        });
                    } else {
                        document.exitFullscreen();
                    }
                };

                document.addEventListener('fullscreenchange', () => {
                    updateFullscreenIcon();
                    setTimeout(resizeHandler, 100);
                    // FIXED: Enable zoom only in fullscreen
                    controls.enableZoom = !!document.fullscreenElement;
                });
            }

            // --- IMPROVED LIGHTING SETUP ---
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Increased base brightness
            scene.add(ambientLight);

            const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); // Soft overhead fill
            hemiLight.position.set(0, 20, 0);
            scene.add(hemiLight);

            const keyLight = new THREE.DirectionalLight(0xffffff, 1.2); // Main strong light
            keyLight.position.set(5, 10, 7);
            scene.add(keyLight);

            const fillLight = new THREE.DirectionalLight(0xffffff, 0.8); // Softer fill from opposite side
            fillLight.position.set(-5, 0, -5);
            scene.add(fillLight);

            const rimLight = new THREE.DirectionalLight(0xffffff, 0.5); // Back/Rim light for edge definition
            rimLight.position.set(0, 5, -10);
            scene.add(rimLight);

            const controls = new OrbitControls(camera, renderer.domElement);
            // GRID-LOCKED: Disable damping for 1:1 grab feel
            controls.enableDamping = false;
            controls.rotateSpeed = 0.8;
            controls.enablePan = false;
            controls.autoRotate = true;
            controls.autoRotateSpeed = 2.0;
            // FIXED: Disable scroll zoom to prevent trap
            controls.enableZoom = false;

            let restartTimer;

            controls.addEventListener('start', () => {
                clearTimeout(restartTimer);
                controls.autoRotate = false;
            });
            controls.addEventListener('end', () => {
                restartTimer = setTimeout(() => {
                    controls.autoRotate = true;
                }, 5000);
            });

            const onLoad = (object) => {
                container.classList.add('ready');

                const box = new THREE.Box3().setFromObject(object);
                const center = new THREE.Vector3();
                box.getCenter(center);
                object.position.sub(center);
                scene.add(object);

                if (customColor) {
                    object.traverse((child) => {
                        if (child.isMesh) {
                            child.material = new THREE.MeshPhongMaterial({
                                color: customColor,
                                specular: 0x111111,
                                shininess: 100
                            });
                        }
                    });
                }

                const size = box.getSize(new THREE.Vector3()).length();
                const dist = size / (2 * Math.tan(Math.PI * 30 / 360)) * 0.5;

                camera.position.set(dist, dist * 0.4, dist * 0.8);
                camera.lookAt(0, 0, 0);
                controls.minDistance = size * 0.2;
                controls.maxDistance = size * 5;

                function animate() {
                    if (!container.isConnected) {
                        renderer.dispose();
                        return;
                    }
                    requestAnimationFrame(animate);
                    if (container.getAttribute('data-visible') === 'false') return;
                    controls.update();
                    renderer.render(scene, camera);
                }
                animate();
            };

            const onError = (e) => {
                console.error(e);
                container.innerHTML = '<div style="color:#666; display:flex; justify-content:center; align-items:center; height:100%; font-size:12px;">Failed to load 3D Model</div>';
            };

            if (ext === 'glb' || ext === 'gltf') {
                const loader = new GLTFLoader();
                loader.load(url, (gltf) => onLoad(gltf.scene), undefined, onError);
            } else {
                const loader = new STLLoader();
                loader.load(url, (geometry) => {
                    const mat = new THREE.MeshPhongMaterial({
                        color: customColor || 0xaaaaaa,
                        specular: 0x111111,
                        shininess: 200
                    });
                    const mesh = new THREE.Mesh(geometry, mat);
                    onLoad(mesh);
                }, undefined, onError);
            }

            const resizeHandler = () => {
                if (!container.isConnected) return;
                camera.aspect = container.clientWidth / container.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(container.clientWidth, container.clientHeight);
            };

            window.addEventListener('resize', resizeHandler);
        }


        // --- UTIL FUNCTIONS (Global) ---

