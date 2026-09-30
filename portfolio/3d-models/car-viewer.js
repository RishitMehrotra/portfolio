/**
 * Blender EEVEE-style 3D Car Viewport
 * Powered by Three.js (r128), FBXLoader, OrbitControls, and EXRLoader
 * Model: 3d-models/models/car .fbx (embedded via car-data.js for zero CORS issues)
 * HDRI: 3d-models/models/minedump_flats_4k.exr (EEVEE image-based lighting)
 */

(function() {
  'use strict';

  let container, canvas, renderer, scene, camera, controls;
  let carModel = null;
  let carPaintMaterials = [];
  let originalMaterials = new Map();
  let clayMaterial = null;
  let wireframeMaterials = new Map();
  let groundPlane, gridHelper, dirLight, fillLight, rimLight, hemiLight;
  let pmremGenerator;
  let exrTexture = null;
  let studioEnvTexture = null;
  let currentShadingMode = 'rendered'; // 'rendered' | 'solid' | 'wireframe'
  let isAutoRotating = true;
  let showHdriBg = false;
  let isInitialized = false;
  let animationFrameId = null;

  // Camera presets
  const CAM_PRESETS = {
    persp: { pos: new THREE.Vector3(3.8, 2.0, 5.0), target: new THREE.Vector3(0, 0.6, 0) },
    front: { pos: new THREE.Vector3(0, 1.2, 6.0), target: new THREE.Vector3(0, 0.6, 0) },
    side:  { pos: new THREE.Vector3(6.5, 1.2, 0), target: new THREE.Vector3(0, 0.6, 0) },
    top:   { pos: new THREE.Vector3(0, 7.5, 0.01), target: new THREE.Vector3(0, 0.4, 0) }
  };

  // Interpolation state for smooth camera transitions
  let camLerp = { active: false, startPos: new THREE.Vector3(), targetPos: new THREE.Vector3(), startTarget: new THREE.Vector3(), endTarget: new THREE.Vector3(), progress: 0 };

  // Base64 to ArrayBuffer helper for zero-CORS instant offline loading
  function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Generate high quality procedural EEVEE studio HDRI environment map
  function createProceduralStudioEnv(renderer) {
    const cvs = document.createElement('canvas');
    cvs.width = 1024;
    cvs.height = 512;
    const ctx = cvs.getContext('2d');

    // Smooth gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
    bgGrad.addColorStop(0.0, '#1c2128');
    bgGrad.addColorStop(0.45, '#12151a');
    bgGrad.addColorStop(0.50, '#1e242c');
    bgGrad.addColorStop(0.55, '#0d0f12');
    bgGrad.addColorStop(1.0, '#060708');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1024, 512);

    // Studio softbox overhead light 1
    const s1 = ctx.createRadialGradient(512, 120, 10, 512, 120, 260);
    s1.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
    s1.addColorStop(0.3, 'rgba(240, 245, 255, 0.65)');
    s1.addColorStop(0.7, 'rgba(200, 220, 255, 0.15)');
    s1.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = s1;
    ctx.fillRect(0, 0, 1024, 300);

    // Studio rim softbox 2 (warm rim reflection)
    const s2 = ctx.createRadialGradient(850, 180, 5, 850, 180, 200);
    s2.addColorStop(0.0, 'rgba(255, 235, 200, 0.85)');
    s2.addColorStop(0.5, 'rgba(201, 168, 76, 0.25)');
    s2.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = s2;
    ctx.fillRect(600, 50, 424, 300);

    // Studio rim softbox 3 (cool fill)
    const s3 = ctx.createRadialGradient(180, 180, 5, 180, 180, 200);
    s3.addColorStop(0.0, 'rgba(210, 235, 255, 0.85)');
    s3.addColorStop(0.5, 'rgba(100, 150, 220, 0.25)');
    s3.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = s3;
    ctx.fillRect(0, 50, 400, 300);

    const texture = new THREE.CanvasTexture(cvs);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  // Initialize the 3D Viewport
  window.initCarViewer = function() {
    container = document.getElementById('carViewerContainer');
    if (!container) return;

    // Avoid duplicate initialization
    if (isInitialized) {
      onWindowResize();
      return;
    }

    const rect = container.getBoundingClientRect();
    const width = rect.width || container.clientWidth || 900;
    const height = container.clientHeight || 560;

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.copy(CAM_PRESETS.persp.pos);

    // 3. Renderer with EEVEE settings
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // Append canvas
    canvas = renderer.domElement;
    canvas.id = 'carViewerCanvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.outline = 'none';
    container.innerHTML = ''; // Clear placeholder
    container.appendChild(canvas);

    // 4. OrbitControls (Blender style navigation)
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2 + 0.02; // Ground limit
    controls.minDistance = 1.2;
    controls.maxDistance = 20;
    controls.target.copy(CAM_PRESETS.persp.target);
    controls.autoRotate = isAutoRotating;
    controls.autoRotateSpeed = 1.4;

    // Stop auto-rotate on user manual drag
    controls.addEventListener('start', function() {
      if (isAutoRotating) {
        setAutoRotate(false);
      }
    });

    // 5. Lighting (EEVEE Realtime Setup)
    setupLights();

    // 6. Ground & Blender Grid
    setupGround();

    // 7. Clay Material for Solid Mode
    clayMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.65,
      metalness: 0.05,
      flatShading: false
    });

    // 8. Setup Environment (Procedural EEVEE Studio IBL first)
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const procTex = createProceduralStudioEnv(renderer);
    studioEnvTexture = pmremGenerator.fromEquirectangular(procTex).texture;
    procTex.dispose();

    scene.environment = studioEnvTexture;

    // 9. Load 4K EXR HDRI in background
    loadHdriExr();

    // 10. Load Car FBX Model
    loadCarFbx();

    // 11. Event Listeners
    window.addEventListener('resize', onWindowResize);

    // Start Animation Loop
    isInitialized = true;
    animate();
  };

  // Setup EEVEE Lighting System
  function setupLights() {
    // Key Sun Light
    dirLight = new THREE.DirectionalLight(0xfff5ea, 2.6);
    dirLight.position.set(6, 9, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.bias = -0.0004;
    dirLight.shadow.normalBias = 0.02;
    dirLight.shadow.radius = 2.5;
    scene.add(dirLight);

    // Cool Fill Light
    fillLight = new THREE.DirectionalLight(0xb5d2ff, 0.9);
    fillLight.position.set(-7, 5, -5);
    scene.add(fillLight);

    // Warm Rim Light
    rimLight = new THREE.DirectionalLight(0xffdfba, 1.4);
    rimLight.position.set(0, 6, -8);
    scene.add(rimLight);

    // Hemisphere Light (sky/ground bounce)
    hemiLight = new THREE.HemisphereLight(0xffffff, 0x18181c, 0.65);
    hemiLight.position.set(0, 15, 0);
    scene.add(hemiLight);
  }

  // Setup Blender 3D Floor Grid & Ground Shadow Catcher
  function setupGround() {
    // Soft shadow receiver plane
    const shadowGeo = new THREE.PlaneGeometry(16, 16);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.52 });
    groundPlane = new THREE.Mesh(shadowGeo, shadowMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.001;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Blender-style 3D Grid
    gridHelper = new THREE.GridHelper(16, 32, 0xC9A84C, 0x242428);
    gridHelper.position.y = -0.002;
    gridHelper.material.opacity = 0.35;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);
  }

  // Load 4K EXR HDRI
  function loadHdriExr() {
    const statusBadge = document.getElementById('hdriStatusBadge');
    if (statusBadge) {
      statusBadge.innerHTML = '<span class="status-pulse"></span> Loading 4K EXR...';
    }

    if (typeof THREE.EXRLoader === 'undefined') {
      console.warn('EXRLoader not found. Retaining EEVEE procedural studio HDRI.');
      if (statusBadge) statusBadge.textContent = 'EEVEE Studio HDRI Active';
      return;
    }

    const exrLoader = new THREE.EXRLoader();
    // Path relative to portfolio.html
    const exrPath = '3d-models/models/minedump_flats_4k.exr';

    exrLoader.load(
      exrPath,
      function(texture) {
        try {
          const exrTarget = pmremGenerator.fromEquirectangular(texture);
          exrTexture = exrTarget.texture;
          texture.dispose();

          if (currentShadingMode === 'rendered') {
            scene.environment = exrTexture;
            if (showHdriBg) {
              scene.background = exrTexture;
            }
          }

          if (statusBadge) {
            statusBadge.className = 'status-pill active-hdri';
            statusBadge.innerHTML = '● 4K EXR HDRI: Minedump Flats';
          }
          console.log('[EEVEE] 4K EXR HDRI successfully compiled and applied.');
        } catch (e) {
          console.warn('[EEVEE] Error compiling EXR target:', e);
        }
      },
      function(xhr) {
        if (xhr.lengthComputable && statusBadge) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          statusBadge.innerHTML = '<span class="status-pulse"></span> HDRI ' + pct + '%';
        }
      },
      function(err) {
        console.log('[EEVEE] Note: EXR loaded with fallback studio IBL (CORS/File restriction). Studio HDRI Active.');
        if (statusBadge) {
          statusBadge.className = 'status-pill studio-hdri';
          statusBadge.innerHTML = '● EEVEE Studio IBL Active';
          statusBadge.title = 'Run start-server.bat to load 96MB EXR locally';
        }
      }
    );
  }

  // Load and calibrate the Car FBX Model
  function loadCarFbx() {
    const loadingOverlay = document.getElementById('carLoadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    if (typeof THREE.FBXLoader === 'undefined') {
      console.error('THREE.FBXLoader is not defined.');
      if (loadingOverlay) loadingOverlay.innerHTML = '<div style="color:#ef4444;">Error: Three.js FBXLoader not loaded.</div>';
      return;
    }

    const fbxLoader = new THREE.FBXLoader();

    // Check if embedded Base64 model is present (zero CORS / zero network delay)
    if (window.CAR_FBX_BASE64 && window.CAR_FBX_BASE64.length > 1000) {
      try {
        const buffer = base64ToArrayBuffer(window.CAR_FBX_BASE64);
        const obj = fbxLoader.parse(buffer, '');
        onCarModelLoaded(obj);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        return;
      } catch (err) {
        console.warn('Error parsing embedded base64 FBX, falling back to direct load:', err);
      }
    }

    // Direct file load fallback
    fbxLoader.load(
      '3d-models/models/car .fbx',
      function(obj) {
        onCarModelLoaded(obj);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
      },
      function(xhr) {
        if (xhr.lengthComputable && loadingOverlay) {
          const pct = Math.round((xhr.loaded / xhr.total) * 100);
          const txt = loadingOverlay.querySelector('.car-loading-text');
          if (txt) txt.textContent = 'Loading Car Model... ' + pct + '%';
        }
      },
      function(err) {
        console.error('Failed to load FBX model directly:', err);
        if (loadingOverlay) {
          loadingOverlay.innerHTML = '<div style="color:#ef4444; text-align:center;">Failed to load car .fbx.<br><small>If opening locally, run start-server.bat</small></div>';
        }
      }
    );
  }

  // Calibrate Model Scale, Materials, and Hierarchy
  function onCarModelLoaded(obj) {
    carModel = obj;
    carPaintMaterials = [];
    originalMaterials.clear();
    wireframeMaterials.clear();

    // 1. Calculate Bounds and Normalize Scale
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const targetDim = 4.2; // Ideal showcase scale
    const scaleFactor = targetDim / (maxDim || 1);
    obj.scale.setScalar(scaleFactor);

    // Recalculate scaled bounds
    bbox.setFromObject(obj);
    bbox.getCenter(center);
    const min = bbox.min;

    // Center horizontally and place wheels exactly on ground (y = 0)
    obj.position.x = -center.x;
    obj.position.y = -min.y;
    obj.position.z = -center.z;

    // 2. Material PBR Calibration (Blender EEVEE Luxury Car Paint & Parts)
    let meshCount = 0;
    let polyCount = 0;

    obj.traverse(function(child) {
      if (child.isMesh) {
        meshCount++;
        if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
          polyCount += child.geometry.attributes.position.count;
        }

        child.castShadow = true;
        child.receiveShadow = true;

        // Upgrade materials to PBR MeshStandardMaterial
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          const newMats = mats.map(function(origMat) {
            const matName = (origMat.name || '').toLowerCase();
            const meshName = (child.name || '').toLowerCase();
            const combined = matName + ' ' + meshName;

            let pbrMat;

            // Glass / Windows
            if (combined.includes('glass') || combined.includes('window') || combined.includes('windshield')) {
              pbrMat = new THREE.MeshPhysicalMaterial({
                color: 0x111115,
                metalness: 0.1,
                roughness: 0.05,
                transmission: 0.85,
                transparent: true,
                opacity: 0.35,
                ior: 1.5,
                name: origMat.name
              });
            }
            // Tires / Rubber
            else if (combined.includes('tire') || combined.includes('tyre') || combined.includes('rubber') || combined.includes('wheel_rubber')) {
              pbrMat = new THREE.MeshStandardMaterial({
                color: 0x18181a,
                metalness: 0.05,
                roughness: 0.85,
                name: origMat.name
              });
            }
            // Chrome / Rims / Metal Accents
            else if (combined.includes('chrome') || combined.includes('rim') || combined.includes('metal') || combined.includes('alloy') || combined.includes('silver')) {
              pbrMat = new THREE.MeshStandardMaterial({
                color: 0xe6e8ea,
                metalness: 0.95,
                roughness: 0.12,
                name: origMat.name
              });
            }
            // Lights
            else if (combined.includes('light') || combined.includes('lamp') || combined.includes('emitter')) {
              pbrMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0xffeeaa,
                emissiveIntensity: 0.8,
                roughness: 0.1,
                metalness: 0.2,
                name: origMat.name
              });
            }
            // Car Body Paint (Default: Luxury Royal Gold to match website theme)
            else {
              pbrMat = new THREE.MeshStandardMaterial({
                color: 0xC9A84C,
                metalness: 0.85,
                roughness: 0.18,
                envMapIntensity: 1.25,
                name: origMat.name
              });
              carPaintMaterials.push(pbrMat);
            }

            return pbrMat;
          });

          child.material = Array.isArray(child.material) ? newMats : newMats[0];
          originalMaterials.set(child, child.material);

          // Create matching wireframe material
          const wf = new THREE.MeshBasicMaterial({
            color: 0xC9A84C,
            wireframe: true,
            transparent: true,
            opacity: 0.4
          });
          wireframeMaterials.set(child, wf);
        }
      }
    });

    // If no specific body mesh matched, treat all standard materials as paint
    if (carPaintMaterials.length === 0) {
      obj.traverse(function(child) {
        if (child.isMesh && child.material) {
          const m = Array.isArray(child.material) ? child.material[0] : child.material;
          carPaintMaterials.push(m);
        }
      });
    }

    scene.add(obj);

    // Update UI Stats
    const statsEl = document.getElementById('carPolyStats');
    if (statsEl) {
      statsEl.textContent = (polyCount > 0 ? (polyCount / 3).toLocaleString() + ' Polys' : meshCount + ' Meshes');
    }

    console.log('[EEVEE] Car FBX model loaded successfully (' + meshCount + ' meshes, ' + polyCount + ' vertices).');
  }

  // Change Car Paint Color
  window.setCarPaintColor = function(hexColor) {
    const color = new THREE.Color(hexColor);
    carPaintMaterials.forEach(function(mat) {
      mat.color.copy(color);
      mat.needsUpdate = true;
    });

    // Update active swatch indicator
    document.querySelectorAll('.paint-swatch').forEach(function(s) {
      s.classList.toggle('active', s.dataset.color.toLowerCase() === hexColor.toLowerCase());
    });
  };

  // Viewport Shading Modes: Rendered (EEVEE) | Solid (Clay) | Wireframe
  window.setShadingMode = function(mode) {
    currentShadingMode = mode;

    document.querySelectorAll('.shading-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.shading === mode);
    });

    if (!carModel) return;

    if (mode === 'rendered') {
      scene.environment = exrTexture || studioEnvTexture;
      if (showHdriBg && exrTexture) scene.background = exrTexture;
      else scene.background = new THREE.Color(0x0a0a0c);

      carModel.traverse(function(child) {
        if (child.isMesh && originalMaterials.has(child)) {
          child.material = originalMaterials.get(child);
        }
      });
    } else if (mode === 'solid') {
      scene.environment = studioEnvTexture;
      scene.background = new THREE.Color(0x18181c);

      carModel.traverse(function(child) {
        if (child.isMesh) {
          child.material = clayMaterial;
        }
      });
    } else if (mode === 'wireframe') {
      scene.environment = null;
      scene.background = new THREE.Color(0x070709);

      carModel.traverse(function(child) {
        if (child.isMesh && wireframeMaterials.has(child)) {
          child.material = wireframeMaterials.get(child);
        }
      });
    }
  };

  // Blender Camera Viewport Presets (with smooth interpolation)
  window.setCameraPreset = function(presetKey) {
    const target = CAM_PRESETS[presetKey];
    if (!target) return;

    // Temporarily disable auto-rotate when user snaps to a view
    setAutoRotate(false);

    camLerp.startPos.copy(camera.position);
    camLerp.targetPos.copy(target.pos);
    camLerp.startTarget.copy(controls.target);
    camLerp.endTarget.copy(target.target);
    camLerp.progress = 0;
    camLerp.active = true;

    document.querySelectorAll('.view-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.view === presetKey);
    });
  };

  // Toggle Auto-Rotation
  window.toggleAutoRotate = function() {
    setAutoRotate(!isAutoRotating);
  };

  function setAutoRotate(enabled) {
    isAutoRotating = enabled;
    if (controls) controls.autoRotate = enabled;
    const btn = document.getElementById('autoRotateBtn');
    if (btn) btn.classList.toggle('active', enabled);
  }

  // Toggle 3D Floor Grid
  window.toggleGrid = function() {
    if (gridHelper) {
      gridHelper.visible = !gridHelper.visible;
      const btn = document.getElementById('gridBtn');
      if (btn) btn.classList.toggle('active', gridHelper.visible);
    }
  };

  // Toggle HDRI Panoramic Background
  window.toggleHdriBg = function() {
    showHdriBg = !showHdriBg;
    if (showHdriBg && exrTexture && currentShadingMode === 'rendered') {
      scene.background = exrTexture;
    } else {
      scene.background = new THREE.Color(currentShadingMode === 'solid' ? 0x18181c : 0x0a0a0c);
    }
    const btn = document.getElementById('hdriBgBtn');
    if (btn) btn.classList.toggle('active', showHdriBg);
  };

  // Set Tone Mapping Exposure
  window.setExposure = function(val) {
    if (renderer) {
      renderer.toneMappingExposure = parseFloat(val);
      const valDisplay = document.getElementById('exposureVal');
      if (valDisplay) valDisplay.textContent = parseFloat(val).toFixed(2);
    }
  };

  // Fullscreen Viewport Toggle
  window.toggleFullscreenViewport = function() {
    const stage = document.getElementById('carViewerStage');
    if (!stage) return;

    if (!document.fullscreenElement) {
      if (stage.requestFullscreen) stage.requestFullscreen();
      else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  // Handle Resize
  function onWindowResize() {
    if (!container || !camera || !renderer) return;
    const rect = container.getBoundingClientRect();
    const width = rect.width || container.clientWidth || 900;
    const height = container.clientHeight || 560;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // Update Blender Orientation Gizmo
  function updateBlenderGizmo() {
    const gizmoGroup = document.getElementById('gizmoGroup');
    if (!gizmoGroup || !camera) return;

    // Derive Euler angles from camera position relative to target
    const v = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const rotY = Math.atan2(v.x, v.z) * (180 / Math.PI);
    const rotX = -Math.asin(v.y) * (180 / Math.PI);

    gizmoGroup.style.transform = 'rotateX(' + rotX.toFixed(1) + 'deg) rotateY(' + rotY.toFixed(1) + 'deg)';
  }

  // Main Render & Animation Loop
  function animate() {
    animationFrameId = requestAnimationFrame(animate);

    // Smooth camera transition if active
    if (camLerp.active) {
      camLerp.progress += 0.055;
      const t = Math.min(camLerp.progress, 1.0);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      camera.position.lerpVectors(camLerp.startPos, camLerp.targetPos, ease);
      controls.target.lerpVectors(camLerp.startTarget, camLerp.endTarget, ease);

      if (t >= 1.0) {
        camLerp.active = false;
      }
    }

    controls.update();
    renderer.render(scene, camera);
    updateBlenderGizmo();
  }

  // Clean-up hook if modal closed
  window.destroyCarViewer = function() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', onWindowResize);
    isInitialized = false;
  };

})();
