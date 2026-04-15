import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('#game');
const levelLabel = document.querySelector('#level');
const xpLabel = document.querySelector('#xp');
const eraLabel = document.querySelector('#era');
const foodLabel = document.querySelector('#currency');
const messageLabel = document.querySelector('#message');
const spawnBtn = document.querySelector('#spawnBtn');
const resetBtn = document.querySelector('#resetBtn');

const STORAGE_KEY = 'epoch-siege-save-v1';
const ERA_DATA = [
  { name: 'Caveman', health: 90, speed: 0.95, color: 0x8f6d3d },
  { name: 'Bronze Age', health: 120, speed: 1.0, color: 0x6d7d4f },
  { name: 'Iron Age', health: 150, speed: 1.1, color: 0x56617b },
  { name: 'Industrial', health: 190, speed: 1.2, color: 0x444b56 },
  { name: 'Modern', health: 240, speed: 1.35, color: 0x325f80 },
];

const initialProgress = {
  level: 1,
  xp: 0,
  food: 120,
  eraIndex: 0,
};

let progress = loadProgress();
let selectedPlacement = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08101a);
scene.fog = new THREE.Fog(0x08101a, 18, 46);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 12, 20);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 9;
controls.maxDistance = 34;
controls.target.set(0, 2.5, 0);

scene.add(new THREE.HemisphereLight(0xd8edff, 0x183028, 1.05));
const directional = new THREE.DirectionalLight(0xf5f0d6, 0.65);
directional.position.set(8, 14, 5);
scene.add(directional);

const starField = new THREE.Mesh(
  new THREE.SphereGeometry(80, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0x0a1220, side: THREE.BackSide }),
);
scene.add(starField);

const planetRadius = 8;
const planet = new THREE.Mesh(
  new THREE.SphereGeometry(planetRadius, 80, 80, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshStandardMaterial({
    color: 0x3f8451,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
  }),
);
planet.rotation.x = Math.PI;
scene.add(planet);

const water = new THREE.Mesh(
  new THREE.SphereGeometry(planetRadius - 0.2, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x1f4f7a, transparent: true, opacity: 0.45 }),
);
water.rotation.x = Math.PI;
scene.add(water);

const relicSites = createRelicSites();
const units = [];
let aiSpawnTimer = 0;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

spawnBtn.addEventListener('click', () => trySpawnPlayerUnit(selectedPlacement));
resetBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  progress = { ...initialProgress };
  updateHud();
  notify('Progress reset to level 1.');
});

window.addEventListener('resize', onResize);
renderer.domElement.addEventListener('pointerdown', onPointerDown);

updateHud();
notify('Defend your side and capture every relic site.');
animate();

function animate() {
  requestAnimationFrame(animate);

  const dt = 0.016;
  aiSpawnTimer += dt;
  if (aiSpawnTimer > Math.max(1.8, 5 - progress.level * 0.3)) {
    aiSpawnTimer = 0;
    spawnAiUnit();
  }

  for (const unit of units) {
    if (unit.health <= 0) {
      scene.remove(unit.group);
      continue;
    }

    const targetSite = findPrioritySite(unit.team);
    if (targetSite) {
      const dir = targetSite.position.clone().sub(unit.group.position);
      const distance = dir.length();
      if (distance > 0.55) {
        dir.normalize();
        unit.group.position.addScaledVector(dir, unit.speed * dt);
        unit.group.position.y = surfaceHeight(unit.group.position) + 0.35;
        unit.group.lookAt(targetSite.position.x, unit.group.position.y, targetSite.position.z);
      } else {
        targetSite.capture[unit.team] += dt * 8;
        targetSite.capture[unit.team === 'player' ? 'ai' : 'player'] = Math.max(
          0,
          targetSite.capture[unit.team === 'player' ? 'ai' : 'player'] - dt * 5,
        );

        if (targetSite.capture[unit.team] >= 100) {
          targetSite.owner = unit.team;
          targetSite.capture.player = unit.team === 'player' ? 100 : 0;
          targetSite.capture.ai = unit.team === 'ai' ? 100 : 0;
          updateSiteColor(targetSite);
        }
      }
    }
  }

  handleCombat(dt);
  evaluateRoundState();
  controls.update();
  renderer.render(scene, camera);
}

function createRelicSites() {
  const sites = [];
  const positions = [
    new THREE.Vector3(-5.3, 0, -1.7),
    new THREE.Vector3(0, 0, 4.8),
    new THREE.Vector3(5.2, 0, -2.2),
  ];

  positions.forEach((position, index) => {
    position.y = surfaceHeight(position) + 0.3;

    const flag = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 1.4, 10),
      new THREE.MeshStandardMaterial({ color: 0xc8ced9 }),
    );
    flag.position.copy(position);

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.35, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x8f7f53 }),
    );
    banner.position.set(position.x + 0.36, position.y + 0.38, position.z);

    scene.add(flag);
    scene.add(banner);

    sites.push({
      id: index,
      position,
      flag,
      banner,
      owner: 'neutral',
      capture: { player: 0, ai: 0 },
    });
  });

  return sites;
}

function createUnit(team, spawnPoint) {
  const era = ERA_DATA[progress.eraIndex];
  const group = new THREE.Group();

  const skinTone = team === 'player' ? 0xb89071 : 0xa17859;
  const accent = team === 'player' ? era.color : 0x9c4040;

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.48, 0.2),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.95 }),
  );
  torso.position.y = 0.62;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 18, 16),
    new THREE.MeshStandardMaterial({ color: skinTone, roughness: 1 }),
  );
  head.position.y = 0.98;

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2b221c, roughness: 1 }),
  );
  hair.position.y = 1.06;

  const leftLeg = limb(0.11, skinTone);
  leftLeg.position.set(-0.1, 0.26, 0);
  const rightLeg = limb(0.11, skinTone);
  rightLeg.position.set(0.1, 0.26, 0);
  const leftArm = limb(0.15, skinTone);
  leftArm.position.set(-0.24, 0.66, 0);
  leftArm.rotation.z = Math.PI * 0.1;
  const rightArm = limb(0.15, skinTone);
  rightArm.position.set(0.24, 0.66, 0);
  rightArm.rotation.z = -Math.PI * 0.1;

  const weapon = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.04, 0.4, 3, 6),
    new THREE.MeshStandardMaterial({ color: team === 'player' ? 0x7d6341 : 0x5a4732 }),
  );
  weapon.position.set(0.33, 0.56, 0);
  weapon.rotation.z = -Math.PI * 0.36;

  group.add(torso, head, hair, leftLeg, rightLeg, leftArm, rightArm, weapon);
  group.position.copy(spawnPoint);

  scene.add(group);

  units.push({
    team,
    group,
    speed: era.speed * (team === 'ai' ? 0.93 + progress.level * 0.02 : 1),
    health: era.health * (team === 'ai' ? 0.9 + progress.level * 0.06 : 1),
    damage: 16 + progress.eraIndex * 5,
  });
}

function limb(length, color) {
  return new THREE.Mesh(
    new THREE.CapsuleGeometry(0.05, length, 3, 6),
    new THREE.MeshStandardMaterial({ color, roughness: 1 }),
  );
}

function onPointerDown(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(planet)[0];
  if (!hit) return;

  selectedPlacement = hit.point.clone();
  selectedPlacement.y = surfaceHeight(selectedPlacement) + 0.35;
  trySpawnPlayerUnit(selectedPlacement);
}

function trySpawnPlayerUnit(point) {
  if (!point) {
    notify('Click a location on your half of the world first.');
    return;
  }

  if (point.z > 0.4) {
    notify('Deploy from your side (southern hemisphere edge).');
    return;
  }

  const cost = 40;
  if (progress.food < cost) {
    notify('Not enough food. Capture relics to gain more.');
    return;
  }

  progress.food -= cost;
  saveProgress();
  updateHud();
  createUnit('player', point);
}

function spawnAiUnit() {
  const x = (Math.random() - 0.5) * 9;
  const z = 3.4 + Math.random() * 2.6;
  const pos = new THREE.Vector3(x, 0, z);
  pos.y = surfaceHeight(pos) + 0.35;
  createUnit('ai', pos);
}

function findPrioritySite(team) {
  const enemy = team === 'player' ? 'ai' : 'player';
  const candidates = relicSites
    .filter((site) => site.owner !== team)
    .sort((a, b) => a.capture[enemy] - b.capture[enemy]);
  return candidates[0];
}

function handleCombat(dt) {
  for (let i = 0; i < units.length; i += 1) {
    const a = units[i];
    if (a.health <= 0) continue;
    for (let j = i + 1; j < units.length; j += 1) {
      const b = units[j];
      if (b.health <= 0 || a.team === b.team) continue;
      const distance = a.group.position.distanceTo(b.group.position);
      if (distance < 0.75) {
        a.health -= b.damage * dt;
        b.health -= a.damage * dt;
      }
    }
  }

  for (let i = units.length - 1; i >= 0; i -= 1) {
    if (units[i].health <= 0) {
      scene.remove(units[i].group);
      units.splice(i, 1);
    }
  }
}

function evaluateRoundState() {
  const playerOwned = relicSites.filter((site) => site.owner === 'player').length;
  const aiOwned = relicSites.filter((site) => site.owner === 'ai').length;

  if (playerOwned === relicSites.length) {
    progress.xp += 30 + progress.level * 5;
    progress.food += 45;

    if (progress.xp >= progress.level * 90) {
      progress.level += 1;
      progress.food += 50;
      progress.eraIndex = Math.min(ERA_DATA.length - 1, Math.floor((progress.level - 1) / 2));
      notify(`Level up! Welcome to level ${progress.level}.`);
    }

    resetBattlefield('player');
    saveProgress();
    updateHud();
  } else if (aiOwned === relicSites.length) {
    progress.food = Math.max(80, progress.food - 35);
    notify('The AI captured everything. Try another push.');
    resetBattlefield('ai');
    saveProgress();
    updateHud();
  }

  const foodIncome = 0.005 + playerOwned * 0.01;
  progress.food = Math.min(350, progress.food + foodIncome);
  foodLabel.textContent = `Food: ${Math.floor(progress.food)}`;
}

function resetBattlefield(winner) {
  for (const unit of units) {
    scene.remove(unit.group);
  }
  units.length = 0;

  relicSites.forEach((site) => {
    site.owner = 'neutral';
    site.capture.player = 0;
    site.capture.ai = 0;
    updateSiteColor(site);
  });

  notify(winner === 'player' ? 'Victory! New battle started.' : 'Defeat. Battle reset.');
}

function updateSiteColor(site) {
  if (site.owner === 'player') {
    site.banner.material.color.setHex(0x3fa7ff);
  } else if (site.owner === 'ai') {
    site.banner.material.color.setHex(0xcc4b4b);
  } else {
    site.banner.material.color.setHex(0x8f7f53);
  }
}

function surfaceHeight(position) {
  const horizontal = Math.sqrt(position.x ** 2 + position.z ** 2);
  return Math.sqrt(Math.max(0, planetRadius ** 2 - horizontal ** 2)) - planetRadius + 0.2;
}

function updateHud() {
  const era = ERA_DATA[progress.eraIndex];
  levelLabel.textContent = `Level: ${progress.level}`;
  xpLabel.textContent = `XP: ${Math.floor(progress.xp)}`;
  eraLabel.textContent = `Era: ${era.name}`;
  foodLabel.textContent = `Food: ${Math.floor(progress.food)}`;
}

function notify(text) {
  messageLabel.textContent = text;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...initialProgress };
    const data = JSON.parse(raw);
    return {
      level: Math.max(1, data.level ?? 1),
      xp: Math.max(0, data.xp ?? 0),
      food: Math.max(60, data.food ?? 120),
      eraIndex: Math.max(0, Math.min(ERA_DATA.length - 1, data.eraIndex ?? 0)),
    };
  } catch {
    return { ...initialProgress };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
