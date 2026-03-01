# Asset Pack Evaluation

## Backgrounds (tileable pixel art patterns)
- `bg_00_dungeon.png` - Dark grey stone brick pattern → use for dungeon floor/walls
- `bg_00_boss_room.png` - Purple diamond pattern → use for Boss Arena background
- `bg_00_witch_shop.png` - Purple square pattern → use for Merchant Shop background
- `bg_00_garden.png` - Green garden pattern
- `bg_00_library.png` - Library pattern
- `bg_00_warp_room.png` - Warp room pattern
- `bg_01_boss_room.png` - Alternative boss room
- `dungeon.png` / `garden.png` / `library.png` / `witch_shop.png` - Same as bg_00_* variants

## Characters
- `knight/idle_right.png` - Sprite sheet (8 frames) of knight idle animation
- `knight/char_attack_00_right_anim.gif` - Animated GIF of knight attacking
- `knight/char_idle_left/right_anim.gif` - Animated idle GIFs
- `knight/char_run_left/right_anim.gif` - Animated run GIFs
- `knight/char_resting_static.png` - Static resting pose

## NPCs
- `npcs/witch_merchant_idle.png` - Sprite sheet (8 frames) of witch merchant
- `npcs/witch_merchant_static.png` - Static witch merchant
- `npcs/item_sell_orb.png` - Magic orb item

## Props
- `props/candle.png` - Candle
- `props/torch.png` - Torch
- `props/ceiling_chain_00/01_static.png` - Ceiling chains
- `props/skulls_00_static.png` - Skulls decoration
- `props/goddess_bench_saving_effect.gif` - Animated save point bench
- `props/chair_00/01.png`, `table_and_chair_static.png` - Furniture
- `props/vase_with_plant_00/01/02.png` - Decorative vases
- `props/wall_painting_00/01_static.png` - Wall paintings
- `props/wall_red_tapestry_static.png` - Red tapestry

## Tilesets
- Full tileset PNGs for each room type (boss_room, dungeon, garden, library, warp_room, witch_shop)

## Traps
- `traps/ground_spikes_static.png`
- `traps/wall_spikes_left/right.png`

## Layout
- `assets/default-layout.json` - Predefined dungeon layout configuration

## Usage Plan
1. Move all sprites to client/public/sprites/ (currently in project root /public/)
2. Use tileable backgrounds for each room (boss_arena→bg_00_boss_room, shop→bg_00_witch_shop, dungeon floor→bg_00_dungeon)
3. Use knight sprites for hero rendering (replace pixel-art fallback)
4. Use witch_merchant for shop NPC
5. Use props (torch, candle, chains) as room decorations
6. Sprite sheets need frame extraction: knight idle = 8 frames, witch = 8 frames
