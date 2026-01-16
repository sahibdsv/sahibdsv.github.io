/* assets/js/viewer.js */

// 3D VIEWER LOGIC (LAZY LOADED)
export function init3DViewers() {
    const containers = document.querySelectorAll('.embed-wrapper.stl:not(.loaded)');
    if(containers.length === 0) return;

    // Dynamic import preserves your lazy loading optimization
    Promise.all([
        import('three'),
        import('three/addons/loaders/STLLoader.js'),
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/controls/OrbitControls.js')
    ]).then(([THREE, { STLLoader }, { GLTFLoader }, { OrbitControls }]) => {
        
        const visibilityObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const container = entry.target;
                if (entry.isIntersecting) {
                    container.setAttribute('data-visible', 'true');
                } else {
                    container.setAttribute('data-visible', 'false');
                }
            });
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadModel(entry.target, THREE, STLLoader, GLTFLoader, OrbitControls, visibilityObserver);
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: "200px" });

        containers.forEach(c => observer.observe(c));
    });
}

function loadModel(container, THREE, STLLoader, GLTFLoader, OrbitControls, visibilityObserver) {
    container.classList.add('loaded');
    // Start tracking visibility for performance
    visibilityObserver.observe(container);
    
    const url = container.getAttribute('data-src');
    const customColor = container.getAttribute('data-color');
    const ext = url.split('.').pop().toLowerCase();
    
    const scene = new THREE.Scene();
    scene.background = null; 

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace; 
    renderer.physicallyCorrectLights = true; 
    
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 10, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xcceeff, 1.0);
    rimLight.position.set(-5, 5, -5);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
    fillLight.position.set(-5, 0, 5);
    scene.add(fillLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false; 
    controls.autoRotate = true; 
    controls.autoRotateSpeed = 2.0;

    let restartTimer;
    controls.addEventListener('start', () => {
        clearTimeout(restartTimer);
        controls.autoRotate = false;
    });
    controls.addEventListener('end', () => {
        restartTimer = setTimeout(() => { controls.autoRotate = true; }, 5000); 
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
        const dist = size / (2 * Math.tan(Math.PI * 45 / 360)) * 0.6; 
        
        camera.position.set(dist, dist * 0.4, dist * 0.8); 
        camera.lookAt(0, 0, 0);
        
        controls.minDistance = size * 0.2; 
        controls.maxDistance = size * 5;

        function animate() {
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

    window.addEventListener('resize', () => {
        if(!container.isConnected) return; 
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}