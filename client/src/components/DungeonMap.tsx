import { useRef, useCallback, useEffect } from "react";
import {
  HERO_CLASSES,
  type HeroState,
} from "../lib/dungeonConfig";
import type { Hero } from "../hooks/useHeroSocket";

// ─── Canvas Dimensions ────────────────────────────────────────────────────────
// 使用更宽的画布，让地图充满整个区域
const CANVAS_W = 1200;
const CANVAS_H = 720;

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
//  [SANCTUARY]──corridor──[DUNGEON MAIN]──corridor──[BOSS ARENA (large)]
//                               │
//                            corridor
//                               │
//                        [MERCHANT SHOP]
//                               │
//                            corridor
//                               │
//                           [TAVERN]
//
// 新布局：更平衡的房间大小，Boss Arena更大，走廊更宽

const ROOM_SANCTUARY  = { x: 15,  y: 30,  w: 230, h: 190 };
const ROOM_DUNGEON    = { x: 330, y: 30,  w: 250, h: 190 };
const ROOM_BOSS       = { x: 670, y: 10,  w: 510, h: 320 };  // 更大的Boss房间
const ROOM_SHOP       = { x: 330, y: 310, w: 250, h: 160 };
const ROOM_TAVERN     = { x: 330, y: 545, w: 250, h: 110 };

// 走廊（更宽）
const CORR_SAN_DUN    = { x: 245, y: 110, w: 85,  h: 60  };
const CORR_DUN_BOSS   = { x: 580, y: 110, w: 90,  h: 60  };
const CORR_DUN_SHOP   = { x: 395, y: 220, w: 60,  h: 90  };
const CORR_SHOP_TAV   = { x: 395, y: 470, w: 60,  h: 75  };

const DOORS = [
  { x: 245, y: 140, horiz: true  },
  { x: 330, y: 140, horiz: true  },
  { x: 580, y: 140, horiz: true  },
  { x: 670, y: 140, horiz: true  },
  { x: 425, y: 220, horiz: false },
  { x: 425, y: 310, horiz: false },
  { x: 425, y: 470, horiz: false },
  { x: 425, y: 545, horiz: false },
];

const ROOM_RECTS: Record<string, { x: number; y: number; w: number; h: number }> = {
  church:     ROOM_SANCTUARY,
  corridor:   ROOM_DUNGEON,
  boss_arena: ROOM_BOSS,
  shop:       ROOM_SHOP,
  rest_area:  ROOM_TAVERN,
};

// ─── Waypoint Navigation System ──────────────────────────────────────────────

type RoomId = "church" | "corridor" | "boss_arena" | "shop" | "rest_area";

interface Waypoint {
  x: number;
  y: number;
}

// Room center points (where heroes stand when in that room)
const ROOM_CENTERS: Record<RoomId, Waypoint> = {
  church:     { x: ROOM_SANCTUARY.x + ROOM_SANCTUARY.w / 2, y: ROOM_SANCTUARY.y + ROOM_SANCTUARY.h * 0.65 },
  corridor:   { x: ROOM_DUNGEON.x + ROOM_DUNGEON.w / 2,     y: ROOM_DUNGEON.y + ROOM_DUNGEON.h * 0.65 },
  boss_arena: { x: ROOM_BOSS.x + 160,                        y: ROOM_BOSS.y + ROOM_BOSS.h * 0.65 },
  shop:       { x: ROOM_SHOP.x + ROOM_SHOP.w / 2,            y: ROOM_SHOP.y + ROOM_SHOP.h * 0.65 },
  rest_area:  { x: ROOM_TAVERN.x + ROOM_TAVERN.w / 2,        y: ROOM_TAVERN.y + ROOM_TAVERN.h * 0.55 },
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
const HERO_SCALE = 4; // 放大英雄到4x

// ─── Torch / Light Prop ───────────────────────────────────────────────────────

function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number, tall = false) {
  const src = tall ? MV.torch3 : MV.torch0;
  const frameH = tall ? 48 : 16;
  const frame = Math.floor(tick / 7) % 4;
  drawSprite(ctx, src, 16, frameH, frame, x, y, 2.5);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 40 + Math.sin(tick * 0.08) * 6);
  glow.addColorStop(0, `rgba(255,160,40,${0.18 + Math.sin(tick * 0.1) * 0.06})`);
  glow.addColorStop(1, "rgba(255,100,20,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, 45, 0, Math.PI * 2);
  ctx.fill();
}

// ─── NPC Drawing ──────────────────────────────────────────────────────────────

function drawWitch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 8) % 10;
  drawSprite(ctx, MV.witchIdle, 32, 32, frame, x, y, 3);
  // Magic glow
  const mg = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, 35);
  mg.addColorStop(0, `rgba(180,80,255,${0.15 + Math.sin(tick * 0.07) * 0.06})`);
  mg.addColorStop(1, "rgba(100,40,180,0)");
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.arc(x, y + 10, 35, 0, Math.PI * 2);
  ctx.fill();
}

function drawGuardian(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 6) % 12;
  drawSprite(ctx, MV.guardianIdle, 16, 16, frame, x, y, 3);
}

function drawBoss(ctx: CanvasRenderingContext2D, tick: number, heroesInRoom: Hero[]) {
  const bx = ROOM_BOSS.x + ROOM_BOSS.w - 130;
  const by = ROOM_BOSS.y + ROOM_BOSS.h * 0.5;
  const isFighting = heroesInRoom.some(h => h.state === "fighting" || h.state === "casting");

  if (isFighting) {
    const frame = Math.floor(tick / 5) % 10;
    drawSprite(ctx, MV.bossAttack, 48, 48, frame, bx, by, 4);
    // 战斗时红色光晕
    const rg = ctx.createRadialGradient(bx, by, 0, bx, by, 80);
    rg.addColorStop(0, `rgba(255,0,0,${0.1 + Math.sin(tick * 0.1) * 0.05})`);
    rg.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(bx, by, 80, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const frame = Math.floor(tick / 10) % 6;
    drawSprite(ctx, MV.bossIdle, 48, 48, frame, bx, by, 4);
  }

  // Boss name tag
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(bx - 55, by - 80, 110, 18);
  ctx.fillStyle = "#FF4444";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("LORD WIZARD", bx, by - 66);
  ctx.textAlign = "left";

  // Boss HP bar
  const bossHp = isFighting ? 0.5 + Math.sin(tick * 0.03) * 0.2 : 1.0;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(bx - 45, by - 60, 90, 10);
  ctx.fillStyle = bossHp > 0.5 ? "#FF4444" : "#FF8800";
  ctx.fillRect(bx - 44, by - 59, 88 * bossHp, 8);
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
  let scale = HERO_SCALE;
  if (movement.spawnPhase === "spawning") {
    const t = movement.spawnTimer / SPAWN_DURATION;
    alpha = t;
    scale = (HERO_SCALE - 1) + t;
    // Spawn portal effect
    const portalR = 35 * (1 - t);
    const pg = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, portalR);
    pg.addColorStop(0, `rgba(255,220,80,${0.7 * (1 - t)})`);
    pg.addColorStop(0.5, `rgba(200,100,255,${0.5 * (1 - t)})`);
    pg.addColorStop(1, "rgba(100,50,200,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y + 10, portalR, 0, Math.PI * 2);
    ctx.fill();
  } else if (movement.spawnPhase === "despawning") {
    const t = movement.spawnTimer / SPAWN_DURATION;
    alpha = 1 - t;
    scale = HERO_SCALE - t;
    // Despawn portal effect
    const portalR = 35 * t;
    const pg = ctx.createRadialGradient(x, y + 10, 0, x, y + 10, portalR);
    pg.addColorStop(0, `rgba(255,220,80,${0.7 * t})`);
    pg.addColorStop(0.5, `rgba(200,100,255,${0.5 * t})`);
    pg.addColorStop(1, "rgba(100,50,200,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y + 10, portalR, 0, Math.PI * 2);
    ctx.fill();
  }

  if (movement.spawnPhase === "gone") return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Selection ring (更大更明显)
  if (selected) {
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.arc(x, y + 4, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // 金色光晕
    const sg = ctx.createRadialGradient(x, y + 4, 20, x, y + 4, 40);
    sg.addColorStop(0, "rgba(255,215,0,0.15)");
    sg.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x, y + 4, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.ellipse(x, y + 30, 18, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw player sprite (4x scale)
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
      for (let i = 0; i < 5; i++) {
        const angle = tick * 0.09 + (i * Math.PI * 2) / 5;
        const sx2 = x + Math.cos(angle) * 28;
        const sy2 = y + Math.sin(angle) * 16;
        ctx.fillStyle = "#FF4444";
        ctx.globalAlpha = alpha * (0.6 + Math.sin(tick * 0.2 + i) * 0.3);
        ctx.beginPath();
        ctx.arc(sx2, sy2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (state === "casting" || state === "shopping") {
      for (let i = 0; i < 6; i++) {
        const angle = tick * 0.07 + (i * Math.PI * 2) / 6;
        const sx2 = x + Math.cos(angle) * 26;
        const sy2 = y + Math.sin(angle) * 15;
        ctx.fillStyle = state === "casting" ? "#AA44FF" : "#FFAA44";
        ctx.globalAlpha = alpha * (0.7 + Math.sin(tick * 0.15 + i) * 0.25);
        ctx.beginPath();
        ctx.arc(sx2, sy2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (state === "resting") {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#88CCFF";
      ctx.font = "bold 12px monospace";
      ctx.fillText("z", x + 16, y - 18 + Math.sin(tick * 0.05) * 4);
      ctx.fillText("Z", x + 22, y - 26 + Math.sin(tick * 0.05 + 1) * 4);
    }
  }

  ctx.globalAlpha = alpha;

  // Name tag (更大更清晰)
  const classConfig = HERO_CLASSES[hero.heroClass as keyof typeof HERO_CLASSES];
  const nameColor = classConfig?.color || "#FFFFFF";
  const label = hero.name.substring(0, 12);
  const charW = 7;
  const labelW = label.length * charW + 14;
  const labelH = 16;
  const labelX = x - labelW / 2;
  const labelY = y - 52;

  // 名字背景
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, labelW, labelH, 3);
  ctx.fill();

  // 名字边框（类别颜色）
  ctx.strokeStyle = nameColor + "88";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, labelW, labelH, 3);
  ctx.stroke();

  // 名字文字
  ctx.fillStyle = nameColor;
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, labelY + 11);
  ctx.textAlign = "left";

  // 类别 emoji（小图标）
  if (classConfig?.emoji) {
    ctx.font = "9px monospace";
    ctx.fillText(classConfig.emoji, labelX - 12, labelY + 11);
  }

  ctx.restore();
}

// ─── Draw Corridors ──────────────────────────────────────────────────────────

function drawCorridors(ctx: CanvasRenderingContext2D, tick: number) {
  const corridors = [CORR_SAN_DUN, CORR_DUN_BOSS, CORR_DUN_SHOP, CORR_SHOP_TAV];
  for (const c of corridors) {
    drawTiledBg(ctx, MV.bgDungeon, c.x, c.y, c.w, c.h, 0.75);
    ctx.strokeStyle = "#333355";
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  }

  for (const d of DOORS) {
    const img = loadImg(MV.doorScene);
    if (img.complete && img.naturalWidth > 0) {
      if (d.horiz) {
        ctx.drawImage(img, 0, 0, 64, 32, d.x - 18, d.y - 18, 36, 36);
      } else {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0, 64, 32, -18, -18, 36, 36);
        ctx.restore();
      }
    }
  }

  // Torches in corridors
  drawTorch(ctx, CORR_SAN_DUN.x + CORR_SAN_DUN.w / 2, CORR_SAN_DUN.y + 45, tick);
  drawTorch(ctx, CORR_DUN_BOSS.x + CORR_DUN_BOSS.w / 2, CORR_DUN_BOSS.y + 45, tick);
}

// ─── Room Label Helper ────────────────────────────────────────────────────────

function drawRoomLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  rx: number, ry: number,
  cnt: number,
  cntColor: string
) {
  const labelW = text.length * 7.5 + 12;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(rx + 5, ry + 5, labelW, 16);
  ctx.fillStyle = color;
  ctx.font = "bold 10px monospace";
  ctx.fillText(text, rx + 9, ry + 17);

  if (cnt > 0) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(rx + labelW + 8, ry + 5, 26, 16);
    ctx.fillStyle = cntColor;
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${cnt}×`, rx + labelW + 21, ry + 17);
    ctx.textAlign = "left";
  }
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

    const cnt = heroList.filter(h => h.room === "church").length;
    drawRoomLabel(ctx, "⛪ HOLY SANCTUARY", "#AA88FF", r.x, r.y, cnt, "#FFFFFF");

    // Save point / spawn portal
    drawStaticImg(ctx, MV.benchStatic, r.x + r.w / 2 - 28, r.y + r.h / 2 + 10, 56, 56);
    // Portal glow
    const pg = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2 + 38, 0, r.x + r.w / 2, r.y + r.h / 2 + 38, 60);
    pg.addColorStop(0, `rgba(255,220,80,${0.28 + Math.sin(tick * 0.06) * 0.1})`);
    pg.addColorStop(0.6, `rgba(180,100,255,${0.14 + Math.sin(tick * 0.04) * 0.06})`);
    pg.addColorStop(1, "rgba(100,50,200,0)");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y + r.h / 2 + 38, 60, 0, Math.PI * 2);
    ctx.fill();

    // Tapestries
    drawStaticImg(ctx, MV.tapestry, r.x + 8, r.y + 35, 18, 56);
    drawStaticImg(ctx, MV.tapestry, r.x + r.w - 26, r.y + 35, 18, 56);
    drawTorch(ctx, r.x + r.w / 2 - 50, r.y + r.h - 35, tick);
    drawTorch(ctx, r.x + r.w / 2 + 50, r.y + r.h - 35, tick);
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

    const cnt = heroList.filter(h => h.room === "corridor").length;
    drawRoomLabel(ctx, "📜 DUNGEON MAIN", "#88AAFF", r.x, r.y, cnt, "#FFFFFF");

    drawStaticImg(ctx, MV.chain, r.x + 45, r.y, 16, 36);
    drawStaticImg(ctx, MV.chain, r.x + r.w - 61, r.y, 16, 36);
    const guardX = r.x + 70 + Math.floor(Math.sin(tick * 0.02) * 35);
    drawGuardian(ctx, guardX, r.y + r.h - 35, tick);
    drawTorch(ctx, r.x + 18, r.y + 55, tick, true);
    drawTorch(ctx, r.x + r.w - 18, r.y + 55, tick, true);
    drawStaticImg(ctx, MV.skulls, r.x + r.w / 2 - 8, r.y + r.h - 22, 16, 16);
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

    const cnt = heroList.filter(h => h.room === "boss_arena").length;
    drawRoomLabel(ctx, "⚔ BOSS ARENA", "#FF4444", r.x, r.y, cnt, "#FF4444");

    // 更多装饰（更大的房间）
    drawTorch(ctx, r.x + 22, r.y + 65, tick, true);
    drawTorch(ctx, r.x + r.w - 22, r.y + 65, tick, true);
    drawTorch(ctx, r.x + 22, r.y + r.h - 45, tick, true);
    drawTorch(ctx, r.x + r.w - 22, r.y + r.h - 45, tick, true);
    drawTorch(ctx, r.x + r.w / 2, r.y + 65, tick, true);
    drawStaticImg(ctx, MV.painting, r.x + 70, r.y + 12, 36, 36);
    drawStaticImg(ctx, MV.painting, r.x + r.w - 106, r.y + 12, 36, 36);
    drawStaticImg(ctx, MV.tapestry, r.x + 8, r.y + 40, 20, 64);
    drawStaticImg(ctx, MV.tapestry, r.x + r.w - 28, r.y + 40, 20, 64);

    const bossHeroes = heroList.filter(h => h.room === "boss_arena");
    drawBoss(ctx, tick, bossHeroes);
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

    const cnt = heroList.filter(h => h.room === "shop").length;
    drawRoomLabel(ctx, "🏪 MERCHANT SHOP", "#FFAA44", r.x, r.y, cnt, "#FFAA44");

    drawWitch(ctx, r.x + r.w / 2, r.y + r.h / 2 + 15, tick);
    drawStaticImg(ctx, MV.table, r.x + 22, r.y + r.h - 45, 44, 36);
    drawTorch(ctx, r.x + r.w / 2 - 60, r.y + r.h - 25, tick);
    drawTorch(ctx, r.x + r.w / 2 + 60, r.y + r.h - 25, tick);
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

    const resting = heroList.filter(h => h.room === "rest_area");
    drawRoomLabel(ctx, "🍺 TAVERN REST", "#44AA44", r.x, r.y, resting.length, "#44AA44");

    drawStaticImg(ctx, MV.table, r.x + r.w / 2 - 22, r.y + 22, 44, 36);
    drawTorch(ctx, r.x + 22, r.y + 35, tick);
    drawTorch(ctx, r.x + r.w - 22, r.y + 35, tick);

    if (resting.length > 0) {
      const hg = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, 60);
      hg.addColorStop(0, `rgba(80,200,80,${0.22 + Math.sin(tick * 0.06) * 0.08})`);
      hg.addColorStop(1, "rgba(40,120,40,0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h / 2, 60, 0, Math.PI * 2);
      ctx.fill();
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
              const margin = 45;
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
    ctx.fillStyle = "rgba(0,0,0,0.012)";
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
        if (Math.sqrt(dx * dx + dy * dy) < 32) {
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
