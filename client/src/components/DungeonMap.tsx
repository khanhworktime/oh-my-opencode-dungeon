import { useEffect, useRef, useCallback } from "react";
import {
  ROOMS,
  HERO_CLASSES,
  STATE_COLORS,
  type HeroState,
} from "../lib/dungeonConfig";
import type { Hero } from "../hooks/useHeroSocket";

// ─── Canvas Dimensions ────────────────────────────────────────────────────────

const CANVAS_W = 800;
const CANVAS_H = 600;

// ─── Sprite Paths (served from client/public) ────────────────────────────────

const SPRITES = {
  // Backgrounds (240×160 tileable)
  bgDungeon:    "/sprites/tilesets/bg_00_dungeon.png",
  bgBossRoom:   "/sprites/tilesets/bg_00_boss_room.png",
  bgWitchShop:  "/sprites/tilesets/bg_00_witch_shop.png",
  bgLibrary:    "/sprites/tilesets/bg_00_library.png",

  // Knight character (16px tall sprite sheets)
  knightIdleR:   "/sprites/characters/knight/idle_right.png",   // 96×16 = 6 frames
  knightIdleL:   "/sprites/characters/knight/idle_left.png",
  knightRunR:    "/sprites/characters/knight/run_right.png",    // 128×16 = 8 frames
  knightRunL:    "/sprites/characters/knight/run_left.png",
  knightAttackR: "/sprites/characters/knight/attack_right.png", // 160×16 = 10 frames
  knightAttackL: "/sprites/characters/knight/attack_left.png",
  knightRest:    "/sprites/characters/knight/resting.png",      // 16×16 = 1 frame

  // NPC
  witchMerchant: "/sprites/npcs/witch_merchant_idle.png",       // 320×32 = 10 frames

  // Props
  torch:         "/sprites/props/torch.png",                    // 64×16 = 4 frames
  candle:        "/sprites/props/candle.png",                   // 64×16 = 4 frames
  skulls:        "/sprites/props/skulls_00_static.png",         // 8×8
  tapestry:      "/sprites/props/wall_red_tapestry_static.png", // 16×32
  bench:         "/sprites/props/goddess_bench_saving_effect.gif", // 32×32
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

// Preload all sprites immediately
Object.values(SPRITES).forEach(loadImg);

// ─── Sprite Sheet Drawing ─────────────────────────────────────────────────────

/**
 * Draw a single frame from a horizontal sprite sheet.
 * @param ctx Canvas context
 * @param src Sprite path
 * @param frameW Width of each frame
 * @param frameH Height of each frame (= image height)
 * @param frame Frame index (0-based)
 * @param dx Destination X (center)
 * @param dy Destination Y (center)
 * @param scale Scale factor
 */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  src: string,
  frameW: number,
  frameH: number,
  frame: number,
  dx: number,
  dy: number,
  scale = 3
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  const sw = frameW;
  const sh = frameH;
  const sx = frame * frameW;
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(img, sx, 0, sw, sh, dx - dw / 2, dy - dh / 2, dw, dh);
}

/**
 * Tile a background image to fill a rectangle.
 */
function drawTiledBg(
  ctx: CanvasRenderingContext2D,
  src: string,
  rx: number,
  ry: number,
  rw: number,
  rh: number
) {
  const img = loadImg(src);
  if (!img.complete || img.naturalWidth === 0) return;
  const tw = img.naturalWidth;
  const th = img.naturalHeight;
  ctx.save();
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

// ─── Hero Rendering ───────────────────────────────────────────────────────────

function getKnightSprite(state: HeroState, facingLeft: boolean): { src: string; frameW: number; frameCount: number } {
  if (state === "fighting" || state === "casting") {
    return { src: facingLeft ? SPRITES.knightAttackL : SPRITES.knightAttackR, frameW: 16, frameCount: 10 };
  }
  if (state === "walking") {
    return { src: facingLeft ? SPRITES.knightRunL : SPRITES.knightRunR, frameW: 16, frameCount: 8 };
  }
  if (state === "resting" || state === "hurt") {
    return { src: SPRITES.knightRest, frameW: 16, frameCount: 1 };
  }
  // idle / shopping / corridor
  return { src: facingLeft ? SPRITES.knightIdleL : SPRITES.knightIdleR, frameW: 16, frameCount: 6 };
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  hero: Hero,
  tick: number,
  selected: boolean
) {
  const x = Math.round(hero.position.x);
  const y = Math.round(hero.position.y);
  const state = hero.state as HeroState;

  // Determine facing direction (heroes in shop face left)
  const facingLeft = hero.room === "shop";

  // Sprite animation
  const { src, frameW, frameCount } = getKnightSprite(state, facingLeft);
  // Attack animates at 8fps, run at 10fps, idle at 6fps
  const fps = (state === "fighting" || state === "casting") ? 8 : state === "walking" ? 10 : 6;
  const frame = Math.floor(tick / (60 / fps)) % frameCount;

  // Selection ring
  if (selected) {
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + 4, 22, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 24, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw knight sprite (scale 3×: 16px → 48px tall)
  drawSprite(ctx, src, frameW, 16, frame, x, y + 8, 3);

  // State effects
  if (state === "fighting" || state === "casting") {
    // Sparks around hero
    const sparkCount = 4;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (tick * 0.08 + (i * Math.PI * 2) / sparkCount);
      const sx2 = x + Math.cos(angle) * 20;
      const sy2 = y + Math.sin(angle) * 20;
      ctx.fillStyle = state === "casting" ? "#AA44FF" : "#FF4444";
      ctx.globalAlpha = 0.7 + Math.sin(tick * 0.2 + i) * 0.3;
      ctx.beginPath();
      ctx.arc(sx2, sy2, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (state === "resting") {
    ctx.fillStyle = "#88CCFF";
    ctx.font = "bold 10px monospace";
    ctx.fillText("z", x + 10, y - 16 + Math.sin(tick * 0.05) * 3);
    ctx.fillText("Z", x + 16, y - 22 + Math.sin(tick * 0.05 + 1) * 3);
  }

  // Name tag
  const classConfig = HERO_CLASSES[hero.heroClass as keyof typeof HERO_CLASSES];
  const nameColor = classConfig?.color || "#FFFFFF";
  const label = hero.name.substring(0, 10);

  ctx.fillStyle = "rgba(0,0,0,0.75)";
  const labelW = label.length * 6 + 8;
  ctx.fillRect(x - labelW / 2, y - 38, labelW, 13);

  ctx.fillStyle = nameColor;
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y - 28);
  ctx.textAlign = "left";
}

// ─── NPC Rendering ────────────────────────────────────────────────────────────

function drawWitchMerchant(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 8) % 10;
  drawSprite(ctx, SPRITES.witchMerchant, 32, 32, frame, x, y, 2.5);
}

// ─── Prop Rendering ───────────────────────────────────────────────────────────

function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 6) % 4;
  drawSprite(ctx, SPRITES.torch, 16, 16, frame, x, y, 2);
  // Flicker glow
  const glow = ctx.createRadialGradient(x, y - 4, 0, x, y - 4, 18);
  glow.addColorStop(0, `rgba(255,160,50,${0.25 + Math.sin(tick * 0.3) * 0.1})`);
  glow.addColorStop(1, "rgba(255,100,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y - 4, 18, 0, Math.PI * 2);
  ctx.fill();
}

function drawCandle(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number) {
  const frame = Math.floor(tick / 8) % 4;
  drawSprite(ctx, SPRITES.candle, 16, 16, frame, x, y, 2);
}

// ─── Room Background Rendering ────────────────────────────────────────────────

function drawRooms(ctx: CanvasRenderingContext2D, heroList: Hero[], tick: number) {
  for (const room of Object.values(ROOMS)) {
    const { x, y, width: w, height: h, color, id } = room;

    // Choose background tileset per room
    let bgSrc = SPRITES.bgDungeon;
    if (id === "boss_arena") bgSrc = SPRITES.bgBossRoom;
    else if (id === "shop") bgSrc = SPRITES.bgWitchShop;
    else if (id === "church") bgSrc = SPRITES.bgLibrary;
    else if (id === "rest_area") bgSrc = SPRITES.bgDungeon;

    // Tiled background
    ctx.globalAlpha = 0.85;
    drawTiledBg(ctx, bgSrc, x, y, w, h);
    ctx.globalAlpha = 1;

    // Room border
    ctx.strokeStyle = color + "AA";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Subtle color overlay to distinguish rooms
    ctx.fillStyle = color + "18";
    ctx.fillRect(x, y, w, h);

    // Room label (top-left)
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x + 4, y + 4, room.name.length * 7 + 8, 14);
    ctx.fillStyle = color + "EE";
    ctx.font = "bold 9px monospace";
    ctx.fillText(room.name.toUpperCase(), x + 8, y + 15);

    // Hero count badge
    const roomHeroes = heroList.filter((h) => h.room === id);
    if (roomHeroes.length > 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x + w - 28, y + 4, 24, 14);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${roomHeroes.length}×`, x + w - 6, y + 15);
      ctx.textAlign = "left";
    }

    // ── Room-specific decorations ──────────────────────────────────────────────

    if (id === "boss_arena") {
      // Torches on left and right walls
      drawTorch(ctx, x + 16, y + 40, tick);
      drawTorch(ctx, x + w - 16, y + 40, tick);
      drawTorch(ctx, x + 16, y + h - 40, tick);
      drawTorch(ctx, x + w - 16, y + h - 40, tick);

      // Boss when heroes are fighting
      const fighting = heroList.filter((h) => h.state === "fighting" || h.state === "casting");
      if (fighting.length > 0) {
        const bx = x + w / 2;
        const by = y + h / 2 + 10;

        // Boss glow
        const bg = ctx.createRadialGradient(bx, by, 0, bx, by, 50);
        bg.addColorStop(0, "rgba(255,0,0,0.5)");
        bg.addColorStop(1, "rgba(255,0,0,0)");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(bx, by, 50, 0, Math.PI * 2);
        ctx.fill();

        // Boss pixel art (larger, scarier)
        const pulse = 1 + Math.sin(tick * 0.06) * 0.04;
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(pulse, pulse);

        ctx.fillStyle = "#AA0000";
        ctx.fillRect(-18, -24, 36, 36);
        ctx.fillStyle = "#770000";
        ctx.fillRect(-26, -12, 12, 24);
        ctx.fillRect(14, -12, 12, 24);
        ctx.fillStyle = "#FF3333";
        ctx.fillRect(-12, -36, 24, 16);
        // Eyes
        ctx.fillStyle = "#FFFF00";
        ctx.fillRect(-10, -20, 6, 6);
        ctx.fillRect(4, -20, 6, 6);
        // Pupils
        ctx.fillStyle = "#FF0000";
        ctx.fillRect(-9, -19, 4, 4);
        ctx.fillRect(5, -19, 4, 4);
        // HP bar
        ctx.fillStyle = "#330000";
        ctx.fillRect(-22, 16, 44, 6);
        ctx.fillStyle = "#FF0000";
        const hp = 0.25 + Math.abs(Math.sin(tick * 0.015)) * 0.5;
        ctx.fillRect(-22, 16, 44 * hp, 6);

        ctx.restore();

        ctx.fillStyle = "#FF4444";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("💀 TASK BOSS", bx, by - 48);
        ctx.textAlign = "left";
      }
    }

    if (id === "church") {
      // Candles
      drawCandle(ctx, x + 20, y + h - 30, tick);
      drawCandle(ctx, x + w - 20, y + h - 30, tick);

      // Goddess bench (save point)
      const benchImg = loadImg(SPRITES.bench);
      if (benchImg.complete && benchImg.naturalWidth > 0) {
        ctx.drawImage(benchImg, 0, 0, 32, 32, x + w / 2 - 32, y + h / 2 - 16, 64, 64);
      }

      // Healing glow when heroes resting
      const resting = heroList.filter((h) => h.room === "church");
      if (resting.length > 0) {
        const pg = ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, 40);
        pg.addColorStop(0, "rgba(255,255,100,0.3)");
        pg.addColorStop(1, "rgba(255,255,100,0)");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, 40, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (id === "shop") {
      // Draw witch merchant NPC
      drawWitchMerchant(ctx, x + w / 2, y + h / 2 - 10, tick);

      // Candles on counter
      drawCandle(ctx, x + w / 2 - 30, y + h / 2 + 20, tick);
      drawCandle(ctx, x + w / 2 + 30, y + h / 2 + 20, tick);
    }

    if (id === "rest_area") {
      // Torches
      drawTorch(ctx, x + 20, y + 20, tick);
      drawTorch(ctx, x + w - 20, y + 20, tick);
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

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    tickRef.current++;
    const tick = tickRef.current;

    // Dark base background
    ctx.fillStyle = "#0a0a14";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Draw rooms with tiled backgrounds and decorations
    drawRooms(ctx, heroes, tick);

    // Draw heroes on top
    for (const hero of heroes) {
      drawHero(ctx, hero, tick, hero.id === selectedHeroId);
    }

    // Subtle scanline overlay for CRT feel
    ctx.fillStyle = "rgba(0,0,0,0.025)";
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

      for (const hero of heroes) {
        const dx = hero.position.x - mx;
        const dy = hero.position.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < 24) {
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
