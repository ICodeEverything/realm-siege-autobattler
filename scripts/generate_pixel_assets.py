from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ARENA_DIR = ASSETS / "arena"
UNIT_DIR = ASSETS / "sprites" / "units"
STRUCT_DIR = ASSETS / "sprites" / "structures"
CARD_DIR = ASSETS / "cards"
UI_DIR = ASSETS / "ui"


@dataclass(frozen=True)
class Pal:
    base: Tuple[int, int, int]
    accent: Tuple[int, int, int]
    glow: Tuple[int, int, int]
    shadow: Tuple[int, int, int]


UNIT_PAL: Dict[str, Pal] = {
    "dwarf_brute": Pal((141, 102, 67), (217, 179, 132), (242, 218, 170), (64, 45, 28)),
    "human_warrior": Pal((118, 128, 173), (225, 214, 190), (247, 234, 194), (58, 62, 93)),
    "slime_golem": Pal((69, 152, 97), (142, 222, 153), (188, 251, 184), (38, 78, 50)),
    "elf_archer": Pal((86, 156, 122), (189, 230, 203), (227, 252, 232), (42, 81, 63)),
    "skeleton_juggler": Pal((157, 170, 178), (237, 241, 238), (255, 252, 248), (83, 92, 100)),
    "mage_adept": Pal((107, 99, 177), (196, 183, 255), (230, 215, 255), (61, 51, 112)),
    "sky_bird": Pal((160, 131, 87), (247, 216, 147), (255, 241, 183), (86, 62, 34)),
    "storm_drake": Pal((95, 116, 177), (186, 206, 255), (220, 232, 255), (50, 63, 102)),
    "ember_dragon": Pal((181, 91, 77), (255, 165, 141), (255, 214, 173), (100, 46, 36)),
    "evil_spirit": Pal((89, 72, 156), (194, 165, 255), (232, 208, 255), (47, 31, 94)),
    "corrupted_mage": Pal((110, 69, 140), (225, 158, 255), (245, 208, 255), (63, 35, 84)),
    "cursed_bee": Pal((123, 82, 149), (232, 191, 255), (245, 226, 255), (67, 32, 84)),
    "fire_of_the_good": Pal((187, 118, 58), (255, 218, 142), (255, 241, 194), (110, 59, 23)),
    "ghost_of_king_arthur": Pal((152, 169, 202), (243, 247, 255), (255, 255, 255), (77, 88, 121)),
    "cloaked_hero": Pal((72, 109, 168), (178, 214, 255), (224, 242, 255), (34, 55, 100)),
}


def ensure_dirs() -> None:
    for p in [ARENA_DIR, UNIT_DIR, STRUCT_DIR, CARD_DIR, UI_DIR]:
        p.mkdir(parents=True, exist_ok=True)


def draw_gradient(draw: ImageDraw.ImageDraw, w: int, h: int, top: Tuple[int, int, int], bottom: Tuple[int, int, int]) -> None:
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b, 255))


def make_arena() -> None:
    base_w, base_h = 390, 520
    scale = 2
    w, h = base_w * scale, base_h * scale

    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_gradient(d, w, h, (36, 73, 55), (23, 45, 37))

    lane_centers = [130, 390, 650]
    lane_width = 170

    # Forest masses around lanes.
    for i in range(0, w, 28):
        for j in range(0, h, 28):
            near_lane = any(abs(i - cx) < lane_width * 0.55 for cx in lane_centers)
            if near_lane:
                continue
            shade = 58 + ((i * 11 + j * 7) % 52)
            size = 10 + ((i + j) % 18)
            color = (18, shade, 30 + (shade // 4), 196)
            d.ellipse((i - size, j - size, i + size, j + size), fill=color)

    # Three lane roads.
    for idx, cx in enumerate(lane_centers):
        lane_tint = (122, 103, 78, 215) if idx != 1 else (113, 98, 76, 230)
        border = (161, 143, 112, 210)
        left = cx - lane_width // 2
        right = cx + lane_width // 2
        d.rounded_rectangle((left, 0, right, h), radius=58, fill=lane_tint)
        d.line([(left + 5, 0), (left + 5, h)], fill=border, width=4)
        d.line([(right - 5, 0), (right - 5, h)], fill=border, width=4)

        for y in range(18, h, 44):
            jitter = ((y * 13 + idx * 5) % 9) - 4
            d.line([(cx - 20 + jitter, y), (cx + 16 + jitter, y + 6)], fill=(175, 158, 126, 72), width=2)

    # Mid bridge / river motif.
    river_y = h // 2
    d.rectangle((0, river_y - 24, w, river_y + 24), fill=(62, 95, 116, 170))
    d.rectangle((0, river_y - 2, w, river_y + 2), fill=(209, 233, 241, 180))
    for cx in lane_centers:
        d.rounded_rectangle((cx - 72, river_y - 28, cx + 72, river_y + 28), radius=10, fill=(119, 103, 87, 190), outline=(166, 145, 116, 210), width=3)

    # Outer vignette.
    vignette = Image.new("L", (w, h), 0)
    vd = ImageDraw.Draw(vignette)
    vd.rectangle((0, 0, w - 1, h - 1), outline=192, width=12)
    vignette = vignette.filter(ImageFilter.GaussianBlur(18))
    mask = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mask.putalpha(vignette)
    img = Image.alpha_composite(img, mask)

    out = img.resize((base_w, base_h), Image.Resampling.LANCZOS)
    out.save(ARENA_DIR / "arena_overhead_v4.png")


def draw_crest(draw: ImageDraw.ImageDraw, x: int, y: int, color: Tuple[int, int, int]) -> None:
    draw.polygon([(x, y), (x + 6, y - 10), (x + 12, y), (x + 6, y + 10)], fill=color)


def draw_unit_sigil(draw: ImageDraw.ImageDraw, unit_id: str, x: int, y: int, pal: Pal) -> None:
    dark = pal.shadow
    light = pal.glow
    if unit_id == "dwarf_brute":
        draw.line((x - 4, y, x + 4, y), fill=dark, width=2)
        draw.line((x, y - 4, x, y + 4), fill=light, width=2)
    elif unit_id == "human_warrior":
        draw.polygon([(x, y - 4), (x + 4, y - 1), (x + 2, y + 4), (x - 2, y + 4), (x - 4, y - 1)], fill=light, outline=dark)
    elif unit_id == "slime_golem":
        draw.ellipse((x - 4, y - 3, x + 4, y + 3), fill=light, outline=dark)
    elif unit_id == "elf_archer":
        draw.arc((x - 5, y - 5, x + 5, y + 5), 250, 110, fill=light, width=2)
    elif unit_id == "skeleton_juggler":
        draw.ellipse((x - 4, y - 1, x - 1, y + 2), fill=light, outline=dark)
        draw.ellipse((x + 1, y - 1, x + 4, y + 2), fill=light, outline=dark)
    elif unit_id == "mage_adept":
        draw.line((x, y - 4, x, y + 4), fill=light, width=2)
        draw.line((x - 3, y, x + 3, y), fill=light, width=2)
    elif unit_id == "sky_bird":
        draw.polygon([(x, y - 4), (x + 4, y), (x, y + 4), (x - 4, y)], fill=light, outline=dark)
    elif unit_id == "storm_drake":
        draw.polygon([(x - 4, y + 3), (x, y - 4), (x + 4, y + 3)], fill=light, outline=dark)
    elif unit_id == "ember_dragon":
        draw.polygon([(x - 3, y + 4), (x + 1, y - 4), (x + 4, y + 2), (x, y + 3)], fill=light, outline=dark)
    elif unit_id == "evil_spirit":
        draw.rectangle((x - 3, y - 3, x + 3, y + 3), fill=dark, outline=light)
    elif unit_id == "corrupted_mage":
        draw.line((x - 3, y + 3, x + 3, y - 3), fill=light, width=2)
        draw.line((x - 3, y - 3, x + 3, y + 3), fill=light, width=1)
    elif unit_id == "cursed_bee":
        draw.rectangle((x - 4, y - 2, x + 4, y + 2), fill=light, outline=dark)
        draw.line((x - 1, y - 2, x - 1, y + 2), fill=dark, width=1)
        draw.line((x + 2, y - 2, x + 2, y + 2), fill=dark, width=1)
    elif unit_id == "fire_of_the_good":
        draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=light, outline=dark)
        draw.line((x, y - 6, x, y + 6), fill=light, width=1)
    elif unit_id == "ghost_of_king_arthur":
        draw.polygon([(x - 4, y + 2), (x - 2, y - 4), (x, y), (x + 2, y - 4), (x + 4, y + 2)], fill=light, outline=dark)
    elif unit_id == "cloaked_hero":
        draw.polygon([(x - 4, y + 4), (x, y - 4), (x + 4, y + 4)], fill=light, outline=dark)


def draw_unit(unit_id: str, state: str, frame: int) -> Image.Image:
    pal = UNIT_PAL[unit_id]
    size = 96
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    bob = [0, 1, 0, -1][frame % 4] if state in {"idle", "walk"} else [0, -2, 1][frame % 3]
    swing = 3 if state == "attack" else 0

    d.ellipse((28, 70 + bob, 68, 82 + bob), fill=(10, 18, 24, 115))

    is_air = unit_id in {"sky_bird", "storm_drake", "ember_dragon", "evil_spirit", "corrupted_mage", "cursed_bee"}
    is_ranged = unit_id in {"elf_archer", "skeleton_juggler", "mage_adept", "evil_spirit", "corrupted_mage", "cursed_bee"}
    is_light = unit_id in {"fire_of_the_good", "ghost_of_king_arthur", "cloaked_hero"}
    is_dark = unit_id in {"evil_spirit", "corrupted_mage", "cursed_bee"}
    is_melee = unit_id in {"dwarf_brute", "human_warrior", "slime_golem"}

    # Main body.
    d.rounded_rectangle((34, 34 + bob, 62, 66 + bob), radius=10, fill=pal.base, outline=pal.shadow, width=2)
    d.rounded_rectangle((37, 22 + bob, 59, 40 + bob), radius=8, fill=pal.accent, outline=pal.shadow, width=2)
    d.rectangle((44, 29 + bob, 52, 32 + bob), fill=(248, 236, 210))

    if is_melee:
        d.rounded_rectangle((30, 36 + bob, 66, 48 + bob), radius=6, fill=pal.base, outline=pal.shadow, width=2)
    if is_ranged:
        d.rounded_rectangle((32, 24 + bob, 64, 30 + bob), radius=4, fill=pal.accent, outline=pal.shadow, width=1)

    # Limbs.
    step = [0, 2, -1, 1][frame % 4]
    d.rectangle((36, 62 + bob, 45, 78 + bob + step), fill=pal.shadow)
    d.rectangle((51, 62 + bob, 60, 78 + bob - step), fill=pal.shadow)

    if is_air:
        flap = [0, 4, 1, -2][frame % 4]
        d.polygon([(35, 45 + bob), (17 + flap, 36 + bob), (26 + flap, 56 + bob)], fill=pal.accent, outline=pal.shadow)
        d.polygon([(61, 45 + bob), (79 - flap, 36 + bob), (70 - flap, 56 + bob)], fill=pal.accent, outline=pal.shadow)
        d.polygon([(43, 23 + bob), (48, 12 + bob), (53, 23 + bob)], fill=pal.base)

    if is_ranged:
        d.rectangle((62, 36 + bob - swing, 80, 40 + bob - swing), fill=pal.shadow)
        d.ellipse((76, 32 + bob - swing, 86, 42 + bob - swing), fill=pal.glow, outline=pal.shadow)

    if is_light:
        d.ellipse((31, 18 + bob - swing, 65, 26 + bob - swing), outline=pal.glow, width=3)
        d.ellipse((65, 30 + bob - swing, 77, 42 + bob - swing), fill=(255, 243, 176), outline=pal.shadow)
    if is_dark:
        d.polygon([(30, 60 + bob), (24, 72 + bob), (36, 70 + bob)], fill=(117, 75, 154, 180))
        d.polygon([(66, 60 + bob), (60, 72 + bob), (72, 70 + bob)], fill=(117, 75, 154, 180))

    if unit_id == "slime_golem":
        d.rounded_rectangle((28, 28 + bob, 68, 69 + bob), radius=14, fill=pal.base, outline=pal.shadow, width=2)
        d.ellipse((39, 42 + bob, 45, 48 + bob), fill=(240, 255, 240))
        d.ellipse((52, 42 + bob, 58, 48 + bob), fill=(240, 255, 240))
    elif unit_id in {"dwarf_brute", "human_warrior"}:
        d.rectangle((18, 46 + bob - swing, 34, 50 + bob - swing), fill=pal.shadow)
        d.polygon([(18, 48 + bob - swing), (8, 44 + bob - swing), (8, 52 + bob - swing)], fill=pal.accent)
    elif unit_id == "cloaked_hero":
        draw_crest(d, 69, 28 + bob, pal.glow)

    draw_unit_sigil(d, unit_id, 48, 35 + bob, pal)

    # subtle rim light
    rim = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.ellipse((30, 20 + bob, 66, 60 + bob), outline=(*pal.glow, 90), width=2)
    img = Image.alpha_composite(img, rim)
    return img


def make_units_and_cards() -> None:
    for unit_id in UNIT_PAL:
        for frame in range(4):
            draw_unit(unit_id, "idle", frame).save(UNIT_DIR / f"{unit_id}_idle_{frame}.png")
            draw_unit(unit_id, "walk", frame).save(UNIT_DIR / f"{unit_id}_walk_{frame}.png")
        for frame in range(3):
            draw_unit(unit_id, "attack", frame).save(UNIT_DIR / f"{unit_id}_attack_{frame}.png")

        card = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
        d = ImageDraw.Draw(card)
        pal = UNIT_PAL[unit_id]
        d.rounded_rectangle((2, 2, 126, 126), radius=18, fill=(24, 39, 56, 255), outline=pal.accent, width=4)
        d.rounded_rectangle((10, 10, 118, 88), radius=14, fill=(40, 59, 79, 255))

        spr = draw_unit(unit_id, "idle", 1).resize((86, 86), Image.Resampling.LANCZOS)
        card.alpha_composite(spr, (21, 8))

        d.rounded_rectangle((11, 96, 117, 117), radius=8, fill=(14, 24, 35, 232))
        d.rectangle((17, 101, 111, 106), fill=pal.base)
        d.rectangle((17, 109, 111, 114), fill=pal.accent)
        card.save(CARD_DIR / f"{unit_id}.png")


def make_structure(team: str, tower_type: str, destroyed: bool) -> Image.Image:
    palettes = {
        "player": {
            "tower": ((97, 138, 170), (198, 226, 246), (42, 72, 99), (124, 192, 235)),
            "home": ((90, 109, 168), (207, 223, 255), (41, 58, 101), (130, 161, 230)),
        },
        "enemy": {
            "tower": ((171, 107, 86), (255, 201, 178), (96, 53, 41), (245, 149, 122)),
            "home": ((166, 94, 125), (255, 196, 230), (89, 44, 64), (230, 132, 179)),
        },
    }

    key = "home" if tower_type == "home" else "tower"
    base, top, shadow, banner = palettes[team][key]

    img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((30, 102, 98, 118), fill=(10, 18, 24, 120))

    if destroyed:
        rubble = (82, 89, 96)
        d.polygon([(28, 106), (44, 66), (62, 76), (76, 58), (102, 106)], fill=rubble, outline=(46, 50, 55), width=2)
        d.line((42, 75, 88, 104), fill=(38, 42, 47), width=3)
        d.line((70, 61, 58, 105), fill=(38, 42, 47), width=3)
        return img

    if tower_type == "home":
        d.rounded_rectangle((26, 58, 102, 106), radius=12, fill=base, outline=shadow, width=3)
        d.rectangle((32, 42, 56, 58), fill=base, outline=shadow, width=3)
        d.rectangle((72, 42, 96, 58), fill=base, outline=shadow, width=3)
        d.polygon([(24, 58), (42, 34), (60, 58)], fill=top, outline=shadow)
        d.polygon([(68, 58), (86, 34), (104, 58)], fill=top, outline=shadow)
        d.rectangle((54, 65, 74, 106), fill=(228, 238, 245), outline=shadow, width=2)
        d.polygon([(59, 38), (64, 26), (69, 38)], fill=(248, 220, 132), outline=(120, 89, 36))
    else:
        d.rounded_rectangle((40, 44, 88, 106), radius=14, fill=base, outline=shadow, width=3)
        d.rectangle((36, 34, 92, 48), fill=top, outline=shadow, width=3)
        for x in [38, 50, 62, 74, 86]:
            d.rectangle((x, 27, x + 6, 34), fill=top, outline=shadow)
        d.rectangle((56, 66, 72, 94), fill=(228, 238, 245), outline=shadow, width=2)

    d.polygon([(88, 54), (108, 49), (108, 66), (88, 62)], fill=banner, outline=shadow)
    return img


def make_structures() -> None:
    for team in ["player", "enemy"]:
        for tower_type in ["left", "center", "right", "home"]:
            make_structure(team, tower_type, False).save(STRUCT_DIR / f"{team}_{tower_type}.png")
            make_structure(team, tower_type, True).save(STRUCT_DIR / f"{team}_{tower_type}_destroyed.png")


def make_ui_bits() -> None:
    hud = Image.new("RGBA", (360, 94), (0, 0, 0, 0))
    d = ImageDraw.Draw(hud)
    d.rounded_rectangle((2, 2, 357, 91), radius=18, fill=(11, 27, 40, 224), outline=(172, 203, 202, 185), width=3)
    d.rounded_rectangle((12, 12, 347, 81), radius=12, fill=(29, 48, 66, 226))
    hud.save(UI_DIR / "hud_frame_v4.png")

    btn = Image.new("RGBA", (188, 58), (0, 0, 0, 0))
    bd = ImageDraw.Draw(btn)
    bd.rounded_rectangle((2, 2, 186, 56), radius=14, fill=(45, 79, 96, 229), outline=(194, 221, 202, 195), width=2)
    btn.save(UI_DIR / "btn_primary_v4.png")


def main() -> None:
    ensure_dirs()
    make_arena()
    make_units_and_cards()
    make_structures()
    make_ui_bits()
    print(f"Generated v4 painted assets in {ASSETS}")


if __name__ == "__main__":
    main()
