# Clash Lanes: Realm Siege (Alpha v4)

Turn-based 3-lane autobattler with alternating unique-card drafting, rotating hand play, class counters, and a 3:00 match clock.

## Run

```bash
npm run generate:assets
npm run start
```

Open: `http://127.0.0.1:5173/`

## Major Systems

- **Draft first**: player and AI alternate picks to draft 6-card decks (global unique picks).
- **Hand combat**: 4-card hand, one card deploy per turn via drag-and-drop.
- **Decision timer**: 14s deploy window, then auto-pass.
- **Summon telegraph**: 1.2s countdown marker appears at the spawn point before deployment lands.
- **Drag targeting UX**: red enemy-half no-drop zone + live landing preview marker while dragging.
- **Longer board presence**: slower movement and extended resolve window keep units active longer.
- **Mana ramp**:
  - minute 1: +2/turn
  - minute 2: +3/turn
  - minute 3: +4/turn
- **Win rules**:
  - lane unlock: destroy a lane's tower to unlock home-base pressure from that lane
  - instant loss if home base is destroyed
  - at timer end: towers alive -> tower HP -> home HP -> draw

## Troop Classes

- Melee
- Ranged
- Air
- Dark (flying ranged casters)
- Light (stealth against ranged/air, can only attack dark+towers)

Counter loop:
- Light > Dark
- Dark > Ranged
- Ranged > Air
- Air > Melee
- Melee > Light

## Controls

- `Drag Card -> Battlefield`: primary deploy flow (mobile + desktop)
- `A/D`: cycle current card
- `Q/W/E`: keyboard lane focus (fallback)
- `1-9`: draft pick or hand select/play
- `Space`: deploy selected card (keyboard fallback)
- `R` / `B`: restart
- `F`: fullscreen
- `Enter`: start/restart from overlay

## Asset Pipeline

Generated sprites are in:
- `assets/arena/arena_overhead_v4.png`
- `assets/sprites/units/*`
- `assets/sprites/structures/*`
- `assets/cards/*`

Regenerate:

```bash
npm run generate:assets
```

## Deterministic Hooks

- `window.render_game_to_text()`
- `window.advanceTime(ms)`
- `window.__gameDebug`

## Debug URLs

- `?autostart=1` start directly in draft
- `?autodemo=1` autoplay draft + battle

## Tests

Simulation smoke:

```bash
npm run test:sim
```

Playwright smoke (requires local `playwright` install):

```bash
npm run test:playwright:smoke
```
