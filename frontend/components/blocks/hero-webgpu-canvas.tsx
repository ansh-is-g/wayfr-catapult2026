'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function readThemeColor(variableName: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();

  return value || fallback;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }

  material.dispose();
}

function createGlowTexture(coreHex: string, edgeHex: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }

  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, coreHex);
  gradient.addColorStop(0.24, edgeHex);
  gradient.addColorStop(0.62, 'rgba(245,166,35,0.16)');
  gradient.addColorStop(1, 'rgba(245,166,35,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createOrbitLine(radiusX: number, radiusY: number, color: number) {
  const points: THREE.Vector3[] = [];
  const segments = 160;

  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radiusX, Math.sin(angle) * radiusY, 0));
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.28,
  });

  return new THREE.LineLoop(geometry, material);
}

export function WebGPUCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0c0a08, 7, 15);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.2, 6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
      depth: true,
      stencil: false,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const mango = new THREE.Color(readThemeColor('--mango-500', '#F5A623'));
    const mangoSoft = new THREE.Color(readThemeColor('--mango-300', '#FFD28A'));
    const foreground = new THREE.Color(readThemeColor('--foreground', '#F5F0E8'));

    const root = new THREE.Group();
    scene.add(root);

    const glowTexture = createGlowTexture('rgba(255,246,230,0.98)', 'rgba(245,166,35,0.75)');

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.34);
    const hemiLight = new THREE.HemisphereLight(0xfdf4e4, 0x1a1208, 0.9);
    const keyLight = new THREE.DirectionalLight(0xfff0d1, 2.4);
    const rimLight = new THREE.PointLight(mango, 7.5, 14, 2);
    const fillLight = new THREE.PointLight(foreground, 3.6, 12, 2);
    keyLight.position.set(2.8, 2.4, 3.8);
    rimLight.position.set(-2.5, -0.4, 2.8);
    fillLight.position.set(0.2, 1.8, 2.2);
    scene.add(ambientLight, hemiLight, keyLight, rimLight, fillLight);

    const glowBack = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 5.5),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        color: mango,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glowBack.position.set(0, 0.05, -1.7);
    root.add(glowBack);

    const haloFront = new THREE.Mesh(
      new THREE.CircleGeometry(1.95, 80),
      new THREE.MeshBasicMaterial({
        map: glowTexture,
        color: mangoSoft,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    haloFront.position.set(0, 0, -0.7);
    root.add(haloFront);

    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: mango,
      emissive: mango,
      emissiveIntensity: 0.72,
      roughness: 0.18,
      metalness: 0.24,
      transmission: 0.1,
      thickness: 0.8,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });

    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: foreground,
      emissive: mangoSoft,
      emissiveIntensity: 0.26,
      roughness: 0.08,
      metalness: 0.02,
      transmission: 0.68,
      thickness: 1.1,
      transparent: true,
      opacity: 0.92,
    });

    const ringMaterial = new THREE.MeshStandardMaterial({
      color: mangoSoft,
      emissive: mango,
      emissiveIntensity: 0.42,
      roughness: 0.32,
      metalness: 0.18,
    });

    const plateMaterial = new THREE.MeshPhysicalMaterial({
      color: foreground,
      emissive: mango,
      emissiveIntensity: 0.12,
      roughness: 0.12,
      metalness: 0,
      transmission: 0.88,
      thickness: 0.4,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    });

    const shell = new THREE.Mesh(
      new THREE.TorusKnotGeometry(1.02, 0.24, 192, 28),
      shellMaterial
    );
    shell.rotation.set(0.4, -0.6, 0.15);
    root.add(shell);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.68, 2),
      coreMaterial
    );
    root.add(core);

    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(1.62, 0.055, 24, 180),
      ringMaterial
    );
    ringA.rotation.set(1.06, 0.24, 0.18);
    root.add(ringA);

    const ringB = new THREE.Mesh(
      new THREE.TorusGeometry(2.08, 0.032, 20, 180),
      ringMaterial.clone()
    );
    ringB.rotation.set(0.3, 1.14, 0.52);
    (ringB.material as THREE.MeshStandardMaterial).opacity = 0.8;
    (ringB.material as THREE.MeshStandardMaterial).transparent = true;
    root.add(ringB);

    const plateA = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 2.7, 1, 1),
      plateMaterial
    );
    plateA.position.z = -0.3;
    plateA.rotation.set(0.22, -0.32, 0.1);
    root.add(plateA);

    const plateB = new THREE.Mesh(
      new THREE.PlaneGeometry(2.25, 2.25, 1, 1),
      plateMaterial.clone()
    );
    plateB.position.z = 0.65;
    plateB.rotation.set(-0.34, 0.52, -0.12);
    (plateB.material as THREE.MeshPhysicalMaterial).opacity = 0.1;
    root.add(plateB);

    const orbitLineA = createOrbitLine(1.96, 1.18, mango.getHex());
    orbitLineA.rotation.set(0.28, 0.72, 0.1);
    root.add(orbitLineA);

    const orbitLineB = createOrbitLine(1.22, 2.08, mangoSoft.getHex());
    orbitLineB.rotation.set(1.18, -0.18, 0.42);
    root.add(orbitLineB);

    const particlesGeometry = new THREE.BufferGeometry();
    const particleCount = 80;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      const stride = index * 3;
      particlePositions[stride] = (Math.random() - 0.5) * 7.5;
      particlePositions[stride + 1] = (Math.random() - 0.5) * 5;
      particlePositions[stride + 2] = -2.6 - Math.random() * 3.2;
    }
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particlesMaterial = new THREE.PointsMaterial({
      color: mangoSoft,
      size: 0.05,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    let rafId = 0;
    let disposed = false;
    let isVisible = true;
    let pointerX = 0;
    let pointerY = 0;

    const resize = () => {
      const width = mount.clientWidth || window.innerWidth;
      const height = mount.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
      renderer.setSize(width, height, true);
    };

    const animate = (time: number) => {
      if (disposed || !isVisible) return;

      const t = time * 0.001;
      const motionScale = reduceMotion ? 0.22 : 1;
      const targetRotationX = pointerY * 0.14 * motionScale;
      const targetRotationY = pointerX * 0.22 * motionScale;

      root.rotation.x += (targetRotationX - root.rotation.x) * 0.05;
      root.rotation.y += (targetRotationY - root.rotation.y) * 0.05;
      root.position.x += (pointerX * 0.18 * motionScale - root.position.x) * 0.035;
      root.position.y += (pointerY * 0.12 * motionScale - root.position.y) * 0.035;
      root.position.z = Math.sin(t * 0.7) * 0.05 * motionScale;

      shell.rotation.x += 0.0038 * motionScale;
      shell.rotation.y += 0.0048 * motionScale;
      shell.rotation.z += 0.0015 * motionScale;

      core.rotation.x -= 0.0055 * motionScale;
      core.rotation.y += 0.0042 * motionScale;
      core.rotation.z += 0.0026 * motionScale;

      ringA.rotation.z += 0.003 * motionScale;
      ringB.rotation.x -= 0.0022 * motionScale;
      ringB.rotation.y += 0.0018 * motionScale;

      plateA.rotation.z = Math.sin(t * 0.85) * 0.12;
      plateB.rotation.z = -Math.sin(t * 0.72) * 0.16;

      glowBack.material.opacity = 0.56 + Math.sin(t * 1.3) * 0.08;
      haloFront.material.opacity = 0.34 + Math.sin(t * 1.8) * 0.06;
      shellMaterial.emissiveIntensity = 0.64 + Math.sin(t * 1.6) * 0.08;
      ringMaterial.emissiveIntensity = 0.36 + Math.sin(t * 1.1) * 0.06;

      particles.rotation.y += 0.0008 * motionScale;

      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(animate);
    };

    const startLoop = () => {
      if (rafId || !isVisible || disposed) return;
      rafId = window.requestAnimationFrame(animate);
    };

    const stopLoop = () => {
      if (!rafId) return;
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      pointerX = THREE.MathUtils.clamp((x - 0.5) * 2, -1, 1);
      pointerY = THREE.MathUtils.clamp((0.5 - y) * 2, -1, 1);
    };

    const onPointerLeave = () => {
      pointerX = 0;
      pointerY = 0;
    };

    const onVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      if (isVisible) {
        startLoop();
      } else {
        stopLoop();
      }
    };

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = Boolean(entry?.isIntersecting) && document.visibilityState === 'visible';
        if (isVisible) {
          startLoop();
        } else {
          stopLoop();
        }
      },
      { threshold: 0.05 }
    );

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    intersectionObserver.observe(mount);
    mount.addEventListener('pointermove', onPointerMove);
    mount.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);

    resize();
    startLoop();

    return () => {
      disposed = true;
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);

      particlesGeometry.dispose();
      disposeMaterial(particlesMaterial);
      glowTexture.dispose();

      shell.geometry.dispose();
      disposeMaterial(shellMaterial);
      core.geometry.dispose();
      disposeMaterial(coreMaterial);
      ringA.geometry.dispose();
      disposeMaterial(ringMaterial);
      ringB.geometry.dispose();
      disposeMaterial(ringB.material);
      plateA.geometry.dispose();
      disposeMaterial(plateMaterial);
      plateB.geometry.dispose();
      disposeMaterial(plateB.material);
      glowBack.geometry.dispose();
      disposeMaterial(glowBack.material);
      haloFront.geometry.dispose();
      disposeMaterial(haloFront.material);
      orbitLineA.geometry.dispose();
      disposeMaterial(orbitLineA.material);
      orbitLineB.geometry.dispose();
      disposeMaterial(orbitLineB.material);

      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />;
}
