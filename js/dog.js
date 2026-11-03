import * as THREE from 'three';
import { watchQuality } from './quality.js';
import { buildSheetModel } from './sheet3d.js';

// Where the head separates from the body, in the model's own height
const NECK_Y = -0.24;

export function createDog(canvas, { isSmall }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);

  const key = new THREE.DirectionalLight(0xfff2e2, 2.4);
  key.position.set(2.5, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 15 });
  key.shadow.radius = 6;
  scene.add(key);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffd9c0, 1.6));

  const cream = new THREE.MeshStandardMaterial({ color: 0xfff4e4, roughness: 0.7 });

  const dog = new THREE.Group();
  const head = new THREE.Group();
  head.position.set(0, NECK_Y, 0.05);
  dog.add(head);
  scene.add(dog);

  // The toy is shaped from the turnaround sheet. The head is the same mesh cut at the neck, so it can turn.
  buildSheetModel({
    src: 'assets/img/L-10.webp', sideFacesRight: false, tolerance: 7, power: 2.4, limbDepth: 1.4, step: isSmall ? 0.03 : 0.022,
  }).then((model) => {
    const { mesh, material } = model;
    material.uniforms.uCutAbove.value = NECK_Y + 0.05;
    material.uniforms.uCutBelow.value = -0.93;
    mesh.castShadow = true;
    dog.add(mesh);

    const headMaterial = material.clone();
    headMaterial.uniforms.uMap.value = material.uniforms.uMap.value;
    headMaterial.uniforms.uAppear = material.uniforms.uAppear;
    headMaterial.uniforms.uCutAbove.value = 99;
    headMaterial.uniforms.uCutBelow.value = NECK_Y;
    const headMesh = new THREE.Mesh(mesh.geometry, headMaterial);
    headMesh.position.set(0, -NECK_Y, -0.05);
    headMesh.castShadow = true;
    head.add(headMesh);
  });

  // Clinic props
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(1.02, 0.42, 0.72, 48, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.62, roughness: 0.3, side: THREE.DoubleSide }),
  );
  cone.rotation.x = Math.PI / 2;
  cone.position.set(0, 0.32, 0.12);
  head.add(cone);

  const bandage = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.038, 12, 32), cream);
    wrap.rotation.x = Math.PI / 2 + (i % 2 ? 0.14 : -0.14);
    wrap.position.y = -0.62 - i * 0.07;
    bandage.add(wrap);
  }
  bandage.position.set(0.23, 0, 0.22);
  dog.add(bandage);

  const bone = new THREE.Group();
  bone.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 8, 16), cream));
  for (const [x, y] of [[-0.065, 0.3], [0.065, 0.3], [-0.065, -0.3], [0.065, -0.3]]) {
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), cream);
    end.position.set(x, y, 0);
    bone.add(end);
  }
  bone.rotation.z = Math.PI / 2.3;
  scene.add(bone);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.ShadowMaterial({ color: 0x5c1d12, opacity: 0.26 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const state = {
    x: 0, y: -0.3, rotY: 0.35, camZ: 11,
    wag: 1, cone: 0, bandage: 0, bone: 0, hop: 0,
    ear: 0, teeth: 0, heart: 0, paw: 0,
  };
  const pointer = { x: 0.06, y: 0.05, sx: 0, sy: 0, used: false };
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
    pointer.used = true;
  }, { passive: true });

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  watchQuality(renderer, resize);

  // Where the exam labels point, as [part, x, y, z]
  const spotAt = {
    ear: [head, 0.46, 0.95, 0],
    teeth: [head, 0.16, 0.14, 0.62],
    heart: [dog, -0.3, -0.32, 0.5],
    paw: [dog, -0.32, -0.92, 0.36],
  };
  const v = new THREE.Vector3();
  let spots = [];

  function frame(time) {
    // Without a mouse the dog looks around on its own
    const lookX = pointer.used ? pointer.x : Math.sin(time * 0.5) * 0.3;
    const lookY = pointer.used ? pointer.y : Math.sin(time * 0.37) * 0.1;
    pointer.sx += (lookX - pointer.sx) * 0.08;
    pointer.sy += (lookY - pointer.sy) * 0.08;

    const hop = state.hop * Math.abs(Math.sin(time * 4.2)) * 0.28;
    dog.position.set(state.x, state.y + hop, 0);
    ground.position.y = state.y - 0.94;
    ground.position.x = state.x;
    dog.rotation.y = state.rotY + pointer.sx * 0.5;
    // A happy dog wiggles all over
    dog.rotation.z = Math.sin(time * (6 + state.wag * 8)) * 0.012 * state.wag;

    head.rotation.y = pointer.sx * 0.5;
    head.rotation.x = pointer.sy * 0.3;
    head.rotation.z = Math.sin(time * 0.9) * 0.025;

    cone.visible = state.cone > 0.01;
    cone.scale.setScalar(Math.max(0.01, state.cone));

    bandage.visible = state.bandage > 0.01;
    bandage.scale.set(Math.max(0.01, state.bandage), 1, Math.max(0.01, state.bandage));

    bone.visible = state.bone > 0.01;
    bone.scale.setScalar(Math.max(0.01, state.bone));
    bone.position.set(state.x + 0.05, state.y + 1.42 + Math.sin(time * 3) * 0.06, 0.9);
    bone.rotation.y = time * 0.9;

    camera.position.z = state.camZ;
    camera.position.y = 0;
    renderer.render(scene, camera);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const { el, name } of spots) {
      const [part, x, y, z] = spotAt[name];
      v.set(x, y, z);
      part.localToWorld(v);
      v.project(camera);
      el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
      el.style.opacity = state[name];
    }
  }

  return {
    state,
    frame,
    setSpots(els) {
      spots = els.map((el) => ({ el, name: el.dataset.spot }));
    },
  };
}
