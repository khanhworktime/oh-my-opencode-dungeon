import { useRef, useCallback, useEffect } from "react";
import {
  HERO_CLASSES,
  type HeroState,
} from "../lib/dungeonConfig";
import type { Hero } from "../hooks/useHeroSocket";

// ─── Canvas Dimensions ────────────────────────────────────────────────────────

const CANVAS_W = 1100;
const CANVAS_H = 700;

// ─── Metroidvania Sprite Paths ──────────────────────────────────────────────

const MV = {
  // Tilesets (240×160 tileable backgrounds)
  bgDungeon:   "/sprites/mv/tilesets/bg_00_dungeon.png",
  bgBossRoom:  "/sprites/mv/tilesets/bg_00_boss_room.png",
  bgWitchShop: "/sprites/mv/tilesets/bg_00_witch_shop.png",
  bgLibrary:   "/sprites/mv/tilesets/bg_00_library.png",

  // Player character (16px tall sprite sheets)
  playerIdleR:   "/sprites/mv/player/char_idle_right_anim.png",
  playerIdleL:   "/sprites/mv/player/char_idle_left_anim.png",
  playerRunR:    "/sprites/mv/player/char_run_right_anim.png",
  playerRunL:    "/sprites/mv/player/char_run_left_anim.png",
  playerAttackR: "/sprites/mv/player/char_attack_00_right_anim.png",
  playerAttackL: "/sprites/mv/player/char_attack_00_left_anim.png",
  playerDeath:   "/sprites/mv/player/char_death_right_anim.png",

  // Boss
  bossIdle:    "/sprites/mv/boss/lord_wizard_idle_anim.png",
  bossAttack:  "/sprites/mv/boss/lord_wizard_attack_00_right_anim.png",
  bossStatic:  "/sprites/mv/boss/lord_wizard_static.png",

  // Enemies
  guardianIdle:   "/sprites/mv/enemies/guardian_idle_right_anim.png",
  guardianAttack: "/sprites/mv/enemies/guardian_attack_right_anim.png",
  zombieIdle:     "/sprites/mv/enemies/zombie_idle_right_anim.png",

  // NPCs
  witchIdle:   "/sprites/mv/npcs/witch_merchant_idle.png",
  witchStatic: "/sprites/mv/npcs/witch_merchant_static.png",

  // Props
  torch0:  "/sprites/mv/props/light_source_00_anim.png",
  torch1:  "/sprites/mv/props/light_source_01_anim.png",
  torch2:  "/sprites/mv/props/light_source_02_anim.png",
  torch3:  "/sprites/mv/props/light_source_03_anim.png",
  chain:   "/sprites/mv/props/ceiling_chain_00_static.png",
  skulls:  "/sprites/mv/props/skulls_00_static.png",
  table:   "/sprites/mv/props/table_and_chair_static.png",
  painting: "/sprites/mv/props/wall_painting_00_static.png",
  tapestry: "/sprites/mv/props/wall_red_tapestry_static.png",

  // Doors
  doorScene: "/sprites/mv/doors/cross_scene_door_closed.png",
  doorLevel: "/sprites/mv/doors/cross_level_door_closed.png",

  // Save point
  benchStatic: "/sprites/mv/savepoint/goddess_bench_static.png",
  benchAnim:   "/sprites/mv/savepoint/goddess_bench_saving_effect.png",

  // Effects
  hitEffect: "/sprites/mv/effects/hit_effect_anim.png",
};

// ─── Image Cache ──────────────────────────────────────────────────────────────

const imgCache: Record<string, HTMLImageElement> = {};

function loadImg(src: string): HTMLImageElement {
  if (imgCache[src]) return imgCache[src];
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  imgCache[src] = img;
  return img;
}

Object.values(MV).forEach(loadImg);

// ─── Drawing Helpers ──────────────────────────────────────────────────────────

function drawSprite(
  ctx: CanvasRenderingContext2D,
  src: string,
  frameW: number,
  frameH: number,
  frame: number,
  dx: number,
  dy: number,
  scale = 3,
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  const dw = frameW * scale;
  const dh = frameH * scale;
  ctx.drawImage(img, frame * frameW, 0, frameW, frameH, dx - dw / 2, dy - dh / 2, dw, dh);
}

function drawTiledBg(
  ctx: CanvasRenderingContext2D,
  src: string,
  rx: number, ry: number, rw: number, rh: number,
  alpha = 1
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  const tw = img.naturalWidth;
  const th = img.naturalHeight;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  for (let x = rx; x < rx + rw; x += tw) {
    for (let y = ry; y < ry + rh; y += th) {
      ctx.drawImage(img, x, y, tw, th);
    }
  }
  ctx.restore();
}

function drawStaticImg(
  ctx: CanvasRenderingContext2D,
  src: string,
  dx: number, dy: number,
  dw: number, dh: number
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ─── Map Layout ───────────────────────────────────────────────────────────────
//
//  [SANCTUARY]──corridor──[DUNGEON]──corridor──[BOSS ARENA]
//                             │
//                          corridor
//                             │
//                       [MERCHANT SHOP]
//                             │
//                          corridor
//                             │
//                         [TAVERN]

const ROOM_SANCTUARY  = { x: 20,  y: 60,  w: 220, h: 200 };
const ROOM_DUNGEON    = { x: 330, y: 60,  w: 240, h: 200 };
const ROOM_BOSS       = { x: 660, y: 40,  w: 420, h: 300 };
const ROOM_SHOP       = { x: 330, y: 360, w: 240, h: 160 };
const ROOM_TAVERN     = { x: 330, y: 580, w: 240, h: 100 };

const CORR_SAN_DUN    = { x: 240, y: 130, w: 90,  h: 60  };
const CORR_DUN_BOSS   = { x: 570, y: 130, w: 90,  h: 60  };
const CORR_DUN_SHOP   = { x: 390, y: 260, w: 60,  h: 100 };
const CORR_SHOP_TAV   = { x: 390, y: 520, w: 60,  h: 60  };

const DOORS = [
  { x: 240, y: 160, horiz: true  },
  { x: 330, y: 160, horiz: true  },
  { x: 570, y: 160, horiz: true  },
  { x: 660, y: 160, horiz: true  },
  { x: 420, y: 260, horiz: false },
  { x: 420, y: 360, horiz: false },
  { x: 420, y: 520, horiz: false },
  { x: 420, y: 580, horiz: false },
];

const ROOM_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  church:     ROOM_SANCTUARY,
  corridor:   ROOM_DUNGEON,
  boss_arena: ROOM_BOSS,
  shop:       ROOM_SHOP,
  rest_area:  ROOM_TAVERN,
};

// ─── Waypoint Navigation System ──────────────────────────────────────────────
// Each room has a "center" waypoint. Corridors have midpoints.
// Heroes walk along these waypoints to travel between rooms.

type RoomId = "church" | "corridor" | "boss_arena" | "shop" | "rest_area";

interface Waypoint {
  x: number;
  y: number;
}

// Room center points (where heroes stand when in that room)
const ROOM_CENTERS: Record<RoomId, Waypoint> = {
  church:     { x: ROOM_SANCTUARY.x + ROOM_SANCTUARY.w / 2, y: ROOM_SANCTUARY.y + ROOM_SANCTUARY.h * 0.6 },
  corridor:   { x: ROOM_DUNGEON.x + ROOM_DUNGEON.w / 2,     y: ROOM_DUNGEON.y + ROOM_DUNGEON.h * 0.6 },
  boss_arena: { x: ROOM_BOSS.x + 140,                        y: ROOM_BOSS.y + ROOM_BOSS.h * 0.65 },
  shop:       { x: ROOM_SHOP.x + ROOM_SHOP.w / 2,            y: ROOM_SHOP.y + ROOM_SHOP.h * 0.6 },
  rest_area:  { x: ROOM_TAVERN.x + ROOM_TAVERN.w / 2,        y: ROOM_TAVERN.y + ROOM_TAVERN.h * 0.5 },
};

// Corridor midpoints
const CORR_MID_SAN_DUN  = { x: CORR_SAN_DUN.x + CORR_SAN_DUN.w / 2,   y: CORR_SAN_DUN.y + CORR_SAN_DUN.h / 2 };
const CORR_MID_DUN_BOSS = { x: CORR_DUN_BOSS.x + CORR_DUN_BOSS.w / 2, y: CORR_DUN_BOSS.y + CORR_DUN_BOSS.h / 2 };
const CORR_MID_DUN_SHOP = { x: CORR_DUN_SHOP.x + CORR_DUN_SHOP.w / 2, y: CORR_DUN_SHOP.y + CORR_DUN_SHOP.h / 2 };
const CORR_MID_SHOP_TAV = { x: CORR_SHOP_TAV.x + CORR_SHOP_TAV.w / 2, y: CORR_SHOP_TAV.y + CORR_SHOP_TAV.h / 2 };

// Adjacency graph: room → [corridor_mid, neighbor_room]
const PATHS: Record<RoomId, Array<{ via: Waypoint; to: RoomId }>> = {
  church:     [{ via: CORR_MID_SAN_DUN, to: "corridor" }],
  corridor:   [
    { via: CORR_MID_SAN_DUN,  to: "church" },
    { via: CORR_MID_DUN_BOSS, to: "boss_arena" },
    { via: CORR_MID_DUN_SHOP, to: "shop" },
  ],
  boss_arena: [{ via: CORR_MID_DUN_BOSS, to: "corridor" }],
  shop:       [
    { via: CORR_MID_DUN_SHOP, to: "corridor" },
    { via: CORR_MID_SHOP_TAV, to: "rest_area" },
  ],
  rest_area:  [{ via: CORR_MID_SHOP_TAV, to: "shop" }],
};

/**
 * BFS to find path from one room to another.
 * Returns array of waypoints (corridor midpoints + room centers).
 */
function findPath(from: RoomId, to: RoomId): Waypoint[] {
  if (from === to) return [ROOM_CENTERS[to]];

  const visited = new Set<RoomId>([from]);
  const queue: Array<{ room: RoomId; path: Waypoint[] }> = [
    { room: from, path: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of PATHS[current.room] || []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      const newPath = [...current.path, edge.via, ROOM_CENTERS[edge.to]];
      if (edge.to === to) return newPath;
      queue.push({ room: edge.to, path: newPath });
    }
  }

  // Fallback: direct teleport
  return [ROOM_CENTERS[to]];
}

// ─── Hero Movement State ─────────────────────────────────────────────────────

interface HeroMovement {
  currentX: number;
  currentY: number;
  targetRoom: RoomId;
  waypoints: Waypoint[];
  waypointIndex: number;
  isMoving: boolean;
  facingLeft: boolean;
  spawnPhase: "spawning" | "alive" | "despawning" | "gone";
  spawnTimer: number; // 0-60 for spawn/despawn animation
  lastKnownRoom: RoomId;
}

const HERO_SPEED = 2.5; // pixels per frame
const SPAWN_DURATION = 45; // frames for spawn/despawn animation

// ─── Torch / Light Prop ───────────────────────────────────────────────────────

function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, tall = false) {
  const src = tall ? MV.torch3 : MV.torch0;
  const frameH = tall ? 48 : 16;
  const frame = Math.floor(tick / 7) % 4;
  drawSprite(ctx, src, 16, frameH, frame, x, y, 2);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 35 + Math.sin(tick * 0.08) * 5);
  glow.addColorStop(0, `rgba(255,160,40,${0.15 + Math.sin(tick * 0.1) * 0.05})`);
  glow.addColorStop(1, "rgba(255,100,20,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 40, 0, Math.PI * 2);
  ctx.fill();
}

// ─── NPC Drawing ──────────────────────────────────────────────────────────────

function drawWitch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 8) % 10;
  drawSprite(ctx, MV.witchIdle, 32, 32, frame, x, y, 2.5);
  // Magic glow
  const mg = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 30);
  mg.addColorStop(0, `rgba(180,80,255,${0.12 + Math.sin(tick * 0.07) * 0.05})`);
  mg.addColorStop(1, "rgba(100,40,180,0)");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(x, y + 10, 30, 0, Math.PI * 2);
  ctx.fill();
}

function drawGuardian(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 6) % 12;
  drawSprite(ctx, MV.guardianIdle, 16, 16, frame, x, y, 2.5);
}

function drawBoss(ctx: CanvasRenderingContext2D, tick: number, heroesInRoom: Hero[]) {
  const bx = ROOM_BOSS.x + ROOM_BOSS.w - 100;
  const by = ROOM_BOSS.y + ROOM_BOSS.h * 0.5;
  const isFighting = heroesInRoom.some(h => h.state === "fighting" || h.state === "casting");

  if (isFighting) {
    const frame = Math.floor(tick / 5) % 10;
    drawSprite(ctx, MV.bossAttack, 48, 48, frame, bx, by, 3);
  } else {
    const frame = Math.floor(tick / 10) % 6;
    drawSprite(ctx, MV.bossIdle, 48, 48, frame, bx, by, 3);
  }

  // Boss name
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(bx - 50, by - 60, 100, 16);
  ctx.fillStyle = "#FF4444";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("LORD WIZARD", bx, by - 48);
  ctx.textAlign = "left";

  // Boss HP bar
  const bossHp = isFighting ? 0.5 + Math.sin(tick * 0.03) * 0.2 : 1.0;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx - 40, by - 42, 80, 8);
  ctx.fillStyle = bossHp > 0.5 ? "#FF4444" : "#FF8800";
  ctx.fillRect(bx - 39, by - 41, 78 * bossHp, 6);
}

// ─── Player Sprite Selection ─────────────────────────────────────────────────

function getPlayerSprite(state: HeroState, isMoving: boolean, facingLeft: boolean) {
  if (isMoving) {
    return { src: facingLeft ? MV.playerRunL : MV.playerRunR, frameW: 16, frameCount: 8, fps: 12 };
  }
  if (state === "fighting" || state === "casting") {
    return { src: facingLeft ? MV.playerAttackL : MV.playerAttackR, frameW: 16, frameCount: 10, fps: 10 };
  }
  return { src: facingLeft ? MV.playerIdleL : MV.playerIdleR, frameW: 16, frameCount: 6, fps: 6 };
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: Hero,
  movement: HeroMovement,
  tick: number,
  selected: boolean
) {
  const x = Math.round(movement.currentX);
  const y = Math.round(movement.currentY);
  const state = hero.state as HeroState;

  // Spawn/despawn animation
  let alpha = 1;
  let scale = 3;
  if (movement.spawnPhase === "spawning") {
    const t = movement.spawnTimer / SPAWN_DURATION;
    alpha = t;
    scale = 2 + t;
    // Spawn portal effect
    const portalR = 30 * (1 - t);
    const pg = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, portalR);
    pg.addColorStop(0, `rgba(255,220,80,${0.6 * (1 - t)})`);
    pg.addColorStop(0.5, `rgba(200,100,255,${0.4 * (1 - t)})`);
    pg.addColorStop(1, "rgba(100,50,200,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y + 10, portalR, 0, Math.PI * 2);
    ctx.fill();
  } else if (movement.spawnPhase === "despawning") {
    const t = movement.spawnTimer / SPAWN_DURATION;
    alpha = 1 - t;
    scale = 3 - t;
    // Despawn portal effect
    const portalR = 30 * t;
    const pg = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, portalR);
    pg.addColorStop(0, `rgba(255,220,80,${0.6 * t})`);
    pg.addColorStop(0.5, `rgba(200,100,255,${0.4 * t})`);
    pg.addColorStop(1, "rgba(100,50,200,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y + 10, portalR, 0, Math.PI * 2);
    ctx.fill();
  }

  if (movement.spawnPhase === "gone") return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Selection ring
  if (selected) {
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(x, y + 4, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y + 26, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw player sprite
  const { src, frameW, frameCount, fps } = getPlayerSprite(state, movement.isMoving, movement.facingLeft);
  const frame = Math.floor(tick / (60 / fps)) % frameCount;
  const img = loadImg(src);
  if (img.complete && img.naturalWidth > 0) {
    const dw = frameW * scale;
    const dh = 16 * scale;
    ctx.drawImage(img, frame * frameW, 0, frameW, 16, x - dw / 2, y + 8 - dh / 2, dw, dh);
  }

  // State effects
  if (!movement.isMoving) {
    if (state === "fighting") {
      for (let i = 0; i < 4; i++) {
        const angle = tick * 0.09 + (i * Math.PI * 2) / 4;
        const sx2 = x + Math.cos(angle) * 22;
        const sy2 = y + Math.sin(angle) * 14;
        ctx.fillStyle = "#FF4444";
        ctx.globalAlpha = alpha * (0.6 + Math.sin(tick * 0.2 + i) * 0.3);
        ctx.beginPath();
        ctx.arc(sx2, sy2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (state === "casting" || state === "shopping") {
      for (let i = 0; i < 5; i++) {
        const angle = tick * 0.07 + (i * Math.PI * 2) / 5;
        const sx2 = x + Math.cos(angle) * 20;
        const sy2 = y + Math.sin(angle) * 12;
        ctx.fillStyle = state === "casting" ? "#AA44FF" : "#FFAA44";
        ctx.globalAlpha = alpha * (0.7 + Math.sin(tick * 0.15 + i) * 0.25);
        ctx.beginPath();
        ctx.arc(sx2, sy2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (state === "resting") {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#88CCFF";
      ctx.font = "bold 10px monospace";
      ctx.fillText("z", x + 12, y - 16 + Math.sin(tick * 0.05) * 3);
      ctx.fillText("Z", x + 18, y - 23 + Math.sin(tick * 0.05 + 1) * 3);
    }
  }

  ctx.globalAlpha = alpha;

  // Name tag
  const classConfig = HERO_CLASSES[hero.heroClass as keyof typeof HERO_CLASSES];
  const nameColor = classConfig?.color || "#FFFFFF";
  const label = hero.name.substring(0, 10);
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  const labelW = label.length * 6 + 10;
  ctx.fillRect(x - labelW / 2, y - 42, labelW, 14);
  ctx.fillStyle = nameColor;
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y - 31);
  ctx.textAlign = "left";

  ctx.restore();
}

// ─── Draw Corridors ──────────────────────────────────────────────────────────

function drawCorridors(ctx: CanvasRenderingContext2D, tick: number) {
  const corridors = [CORR_SAN_DUN, CORR_DUN_BOSS, CORR_DUN_SHOP, CORR_SHOP_TAV];
  for (const c of corridors) {
    drawTiledBg(ctx, MV.bgDungeon, c.x, c.y, c.w, c.h, 0.7);
    ctx.strokeStyle = "#333355";
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  }

  for (const d of DOORS) {
    const img = loadImg(MV.doorScene);
    if (img.complete && img.naturalWidth > 0) {
      if (d.horiz) {
        ctx.drawImage(img, 0, 0, 64, 32, d.x - 16, d.y - 16, 32, 32);
      } else {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0, 64, 32, -16, -16, 32, 32);
        ctx.restore();
      }
    }
  }

  // Torches in corridors
  drawTorch(ctx, CORR_SAN_DUN.x + CORR_SAN_DUN.w / 2, CORR_SAN_DUN.y + 40, tick);
  drawTorch(ctx, CORR_DUN_BOSS.x + CORR_DUN_BOSS.w / 2, CORR_DUN_BOSS.y + 40, tick);
}

// ─── Draw Rooms ──────────────────────────────────────────────────────────────

function drawRooms(ctx: CanvasRenderingContext2D, heroList: Hero[], tick: number) {
  // ── SANCTUARY (spawn point) ──
  {
    const r = ROOM_SANCTUARY;
    drawTiledBg(ctx, MV.bgLibrary, r.x, r.y, r.w, r.h, 0.9);
    ctx.strokeStyle = "#5522AA";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(70,20,130,0.12)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Room label
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 140, 14);
    ctx.fillStyle = "#AA88FF";
    ctx.font = "bold 9px monospace";
    ctx.fillText("⛪ HOLY SANCTUARY", r.x + 8, r.y + 15);

    // Save point / spawn portal
    drawStaticImg(ctx, MV.benchStatic, r.x + r.w / 2 - 24, r.y + r.h / 2 + 10, 48, 48);
    // Portal glow (always active - this is the spawn point)
    const pg = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2 + 34, 0, r.x + r.w / 2, r.y + r.h / 2 + 34, 50);
    pg.addColorStop(0, `rgba(255,220,80,${0.25 + Math.sin(tick * 0.06) * 0.1})`);
    pg.addColorStop(0.6, `rgba(180,100,255,${0.12 + Math.sin(tick * 0.04) * 0.05})`);
    pg.addColorStop(1, "rgba(100,50,200,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2 + 34, 50, 0, Math.PI * 2);
    ctx.fill();

    // Tapestries
    drawStaticImg(ctx, MV.tapestry, r.x + 8, r.y + 30, 16, 48);
    drawStaticImg(ctx, MV.tapestry, r.x + r.w - 24, r.y + 30, 16, 48);
    drawTorch(ctx, r.x + r.w / 2 - 40, r.y + r.h - 30, tick);
    drawTorch(ctx, r.x + r.w / 2 + 40, r.y + r.h - 30, tick);

    const cnt = heroList.filter(h => h.room === "church").length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }

  // ── DUNGEON MAIN ──
  {
    const r = ROOM_DUNGEON;
    drawTiledBg(ctx, MV.bgDungeon, r.x, r.y, r.w, r.h, 0.85);
    ctx.strokeStyle = "#334466";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(20,30,60,0.15)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 120, 14);
    ctx.fillStyle = "#88AAFF";
    ctx.font = "bold 9px monospace";
    ctx.fillText("📜 DUNGEON MAIN", r.x + 8, r.y + 15);

    drawStaticImg(ctx, MV.chain, r.x + 40, r.y, 16, 32);
    drawStaticImg(ctx, MV.chain, r.x + r.w - 56, r.y, 16, 32);
    const guardX = r.x + 60 + Math.floor(Math.sin(tick * 0.02) * 30);
    drawGuardian(ctx, guardX, r.y + r.h - 30, tick);
    drawTorch(ctx, r.x + 16, r.y + 50, tick, true);
    drawTorch(ctx, r.x + r.w - 16, r.y + 50, tick, true);
    drawStaticImg(ctx, MV.skulls, r.x + r.w / 2 - 8, r.y + r.h - 20, 16, 16);

    const cnt = heroList.filter(h => h.room === "corridor").length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }

  // ── BOSS ARENA ──
  {
    const r = ROOM_BOSS;
    drawTiledBg(ctx, MV.bgBossRoom, r.x, r.y, r.w, r.h, 0.9);
    ctx.strokeStyle = "#660022";
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    const fighting = heroList.filter(h => h.state === "fighting" || h.state === "casting");
    if (fighting.length > 0) {
      ctx.fillStyle = `rgba(120,0,0,${0.1 + Math.sin(tick * 0.1) * 0.05})`;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 100, 14);
    ctx.fillStyle = "#FF4444";
    ctx.font = "bold 9px monospace";
    ctx.fillText("⚔ BOSS ARENA", r.x + 8, r.y + 15);

    drawTorch(ctx, r.x + 20, r.y + 60, tick, true);
    drawTorch(ctx, r.x + r.w - 20, r.y + 60, tick, true);
    drawTorch(ctx, r.x + 20, r.y + r.h - 40, tick, true);
    drawTorch(ctx, r.x + r.w - 20, r.y + r.h - 40, tick, true);
    drawStaticImg(ctx, MV.painting, r.x + 60, r.y + 10, 32, 32);
    drawStaticImg(ctx, MV.painting, r.x + r.w - 92, r.y + 10, 32, 32);

    const bossHeroes = heroList.filter(h => h.room === "boss_arena");
    drawBoss(ctx, tick, bossHeroes);

    const cnt = bossHeroes.length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#FF4444";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }

  // ── MERCHANT SHOP ──
  {
    const r = ROOM_SHOP;
    drawTiledBg(ctx, MV.bgWitchShop, r.x, r.y, r.w, r.h, 0.9);
    ctx.strokeStyle = "#886622";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(80,50,10,0.1)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 130, 14);
    ctx.fillStyle = "#FFAA44";
    ctx.font = "bold 9px monospace";
    ctx.fillText("🏪 MERCHANT SHOP", r.x + 8, r.y + 15);

    drawWitch(ctx, r.x + r.w / 2, r.y + r.h / 2 + 10, tick);
    drawStaticImg(ctx, MV.table, r.x + 20, r.y + r.h - 40, 40, 32);
    drawTorch(ctx, r.x + r.w / 2 - 50, r.y + r.h - 20, tick);
    drawTorch(ctx, r.x + r.w / 2 + 50, r.y + r.h - 20, tick);

    const cnt = heroList.filter(h => h.room === "shop").length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#FFAA44";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }

  // ── TAVERN REST ──
  {
    const r = ROOM_TAVERN;
    drawTiledBg(ctx, MV.bgDungeon, r.x, r.y, r.w, r.h, 0.6);
    ctx.strokeStyle = "#224422";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(20,50,20,0.2)";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(r.x + 4, r.y + 4, 100, 14);
    ctx.fillStyle = "#44AA44";
    ctx.font = "bold 9px monospace";
    ctx.fillText("🍺 TAVERN REST", r.x + 8, r.y + 15);

    drawStaticImg(ctx, MV.table, r.x + r.w / 2 - 20, r.y + 20, 40, 32);
    drawTorch(ctx, r.x + 20, r.y + 30, tick);
    drawTorch(ctx, r.x + r.w - 20, r.y + 30, tick);

    const resting = heroList.filter(h => h.room === "rest_area");
    if (resting.length > 0) {
      const hg = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, 50);
      hg.addColorStop(0, `rgba(80,200,80,${0.2 + Math.sin(tick * 0.06) * 0.08})`);
      hg.addColorStop(1, "rgba(40,120,40,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 50, 0, Math.PI * 2);
      ctx.fill();
    }

    const cnt = resting.length;
    if (cnt > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(r.x + r.w - 28, r.y + 4, 24, 14);
      ctx.fillStyle = "#44AA44";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${cnt}×`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "left";
    }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  heroes: Hero[];
  selectedHeroId: number | null;
  onHeroClick: (id: number) => void;
}

export default function DungeonMap({ heroes, selectedHeroId, onHeroClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tickRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const movementRef = useRef<Map<number, HeroMovement>>(new Map());
  const prevHeroIdsRef = useRef<Set<number>>(new Set());

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    tickRef.current++;
    const tick = tickRef.current;
    const movements = movementRef.current;

    // ── Update hero movement states ──────────────────────────────────────────
    const currentIds = new Set(heroes.map(h => h.id));
    const prevIds = prevHeroIdsRef.current;

    // Detect new heroes → spawn at sanctuary
    for (const hero of heroes) {
      if (!movements.has(hero.id)) {
        const spawnPos = ROOM_CENTERS.church;
        movements.set(hero.id, {
          currentX: spawnPos.x + (Math.random() - 0.5) * 30,
          currentY: spawnPos.y + (Math.random() - 0.5) * 20,
          targetRoom: (hero.room || "church") as RoomId,
          waypoints: [],
          waypointIndex: 0,
          isMoving: false,
          facingLeft: false,
          spawnPhase: "spawning",
          spawnTimer: 0,
          lastKnownRoom: "church",
        });
      }
    }

    // Detect removed heroes → despawn animation back to sanctuary
    for (const prevId of prevIds) {
      if (!currentIds.has(prevId)) {
        const mv = movements.get(prevId);
        if (mv && mv.spawnPhase !== "despawning" && mv.spawnPhase !== "gone") {
          // Start walking back to sanctuary, then despawn
          const path = findPath(mv.lastKnownRoom, "church");
          mv.waypoints = path;
          mv.waypointIndex = 0;
          mv.isMoving = true;
          mv.spawnPhase = "despawning";
          mv.spawnTimer = 0;
        }
      }
    }
    prevHeroIdsRef.current = currentIds;

    // Update each hero's movement
    for (const hero of heroes) {
      const mv = movements.get(hero.id);
      if (!mv) continue;

      const targetRoom = (hero.room || "church") as RoomId;

      // Spawn animation
      if (mv.spawnPhase === "spawning") {
        mv.spawnTimer++;
        if (mv.spawnTimer >= SPAWN_DURATION) {
          mv.spawnPhase = "alive";
          // Now start walking to target room if different from church
          if (targetRoom !== "church") {
            const path = findPath("church", targetRoom);
            mv.waypoints = path;
            mv.waypointIndex = 0;
            mv.isMoving = true;
            mv.targetRoom = targetRoom;
          }
        }
        continue;
      }

      // If target room changed, compute new path
      if (targetRoom !== mv.targetRoom && mv.spawnPhase === "alive") {
        const path = findPath(mv.lastKnownRoom, targetRoom);
        mv.waypoints = path;
        mv.waypointIndex = 0;
        mv.isMoving = true;
        mv.targetRoom = targetRoom;
      }

      // Move along waypoints
      if (mv.isMoving && mv.waypoints.length > 0 && mv.waypointIndex < mv.waypoints.length) {
        const target = mv.waypoints[mv.waypointIndex];
        const dx = target.x - mv.currentX;
        const dy = target.y - mv.currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < HERO_SPEED) {
          mv.currentX = target.x;
          mv.currentY = target.y;
          mv.waypointIndex++;
          if (mv.waypointIndex >= mv.waypoints.length) {
            mv.isMoving = false;
            mv.lastKnownRoom = mv.targetRoom;
            // Spread heroes in room
            const heroesInRoom = heroes.filter(h => h.room === mv.targetRoom);
            const idx = heroesInRoom.findIndex(h => h.id === hero.id);
            const total = heroesInRoom.length;
            if (total > 1 && idx >= 0) {
              const rect = ROOM_RECTS[mv.targetRoom] || ROOM_RECTS["corridor"];
              const margin = 40;
              const usableW = rect.w - margin * 2;
              const cols = Math.min(total, 4);
              const col = idx % cols;
              mv.currentX = rect.x + margin + (cols > 1 ? (col / (cols - 1)) * usableW : usableW / 2);
            }
          }
        } else {
          mv.currentX += (dx / dist) * HERO_SPEED;
          mv.currentY += (dy / dist) * HERO_SPEED;
          mv.facingLeft = dx < 0;
        }
      }
    }

    // Update despawning heroes (not in heroes array anymore)
    for (const [id, mv] of movements) {
      if (currentIds.has(id)) continue;
      if (mv.spawnPhase === "despawning") {
        // Walk back to sanctuary first
        if (mv.isMoving && mv.waypoints.length > 0 && mv.waypointIndex < mv.waypoints.length) {
          const target = mv.waypoints[mv.waypointIndex];
          const dx = target.x - mv.currentX;
          const dy = target.y - mv.currentY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < HERO_SPEED * 2) {
            mv.currentX = target.x;
            mv.currentY = target.y;
            mv.waypointIndex++;
            if (mv.waypointIndex >= mv.waypoints.length) {
              mv.isMoving = false;
            }
          } else {
            mv.currentX += (dx / dist) * HERO_SPEED * 2;
            mv.currentY += (dy / dist) * HERO_SPEED * 2;
            mv.facingLeft = dx < 0;
          }
        } else {
          // Arrived at sanctuary, play despawn animation
          mv.spawnTimer++;
          if (mv.spawnTimer >= SPAWN_DURATION) {
            mv.spawnPhase = "gone";
          }
        }
      }
      if (mv.spawnPhase === "gone") {
        movements.delete(id);
      }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    ctx.fillStyle = "#08080f";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    drawCorridors(ctx, tick);
    drawRooms(ctx, heroes, tick);

    // Draw all heroes (including despawning ones)
    const allMovements = [...movements.entries()];
    for (const [id, mv] of allMovements) {
      const hero = heroes.find(h => h.id === id);
      // For despawning heroes, create a fake hero object
      const heroObj = hero || {
        id,
        name: "???",
        heroClass: "warrior" as const,
        state: "walking" as HeroState,
        room: "church",
        position: { x: mv.currentX, y: mv.currentY },
        activeTools: [],
        subAgentTools: {},
        toolCount: { bash: 0, read: 0, write: 0, web: 0 },
        isWaiting: false,
        skills: [],
        level: 1,
        exp: 0,
        hp: 100,
        maxHp: 100,
        mp: 100,
        maxMp: 100,
      };
      drawHero(ctx, heroObj, mv, tick, id === selectedHeroId);
    }

    // Subtle scanline overlay
    ctx.fillStyle = "rgba(0,0,0,0.015)";
    for (let scanY = 0; scanY < CANVAS_H; scanY += 4) {
      ctx.fillRect(0, scanY, CANVAS_W, 2);
    }

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }, [heroes, selectedHeroId]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drawFrame]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      const movements = movementRef.current;
      for (const hero of heroes) {
        const mv = movements.get(hero.id);
        if (!mv) continue;
        const dx = mv.currentX - mx;
        const dy = mv.currentY - my;
        if (Math.sqrt(dx * dx + dy * dy) < 28) {
          onHeroClick(hero.id);
          return;
        }
      }
    },
    [heroes, onHeroClick]
  );

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onClick={handleClick}
      className="w-full h-full cursor-pointer"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
