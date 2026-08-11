# Brand photography spec

The storefront ships with licensed stock photography (see `docs/image-credits.md`). This document
is the brief for replacing it with The Hillside Gardens' own photography, and the reference for
anyone reshooting or regenerating a single image later. Hand the finished files over and they drop
straight into `public/images/`.

## Deliverables

Thirteen images. Filenames matter — the component resolves artwork by path.

### Category images — `public/images/catalog/`

| File | Subject |
| --- | --- |
| `house-plants.webp` | Leafy indoor plants in ceramic and terracotta pots on a wooden surface |
| `carnivorous-plants.*` | Venus flytraps, sarracenia trumpets and a hanging nepenthes pitcher |
| `live-plant-planters.*` | A planted trough or bowl arrangement, mixed foliage and small blooms |
| `succulents.*` | Echeveria and haworthia rosettes in a shallow stone bowl |
| `air-plants.*` | Tillandsia in hanging glass globes, one resting on driftwood |
| `homemade-soaps.*` | Stacked soap bars, kraft label and twine, dried lavender |
| `moss.*` | Cushion moss mounds on a wooden tray, a rolled sheet of moss |
| `driftwood.*` | Weathered driftwood branches with visible grain, moss tucked in |
| `apothecary.*` | Amber dropper bottle, corked stoneware jar, salve tin, dried herbs |
| `terrarium-supplies.*` | A layered glass terrarium beside tweezers, scoop and a sack of pebbles |

### Scene images — `public/images/scenes/`

| File | Subject | Where it appears |
| --- | --- | --- |
| `hillside-hero.*` | The signature shot — potted plants, a branded kraft pouch, an amber candle and a mug on a wooden bench | Homepage hero, beside the headline |
| `potting-bench.*` | A potting bench mid-repot: plant, terracotta pots, soil, hand tools | Homepage story block, About page |
| `workshop-table.*` | A class table: terrariums in progress, moss, gravel, tweezers, seedlings | Class cards, Classes page |

## Format

- **Aspect ratio 4:3**, delivered at **1600 × 1200** or larger. Everything is downscaled, never upscaled.
- WebP or JPEG. Keep each file under ~400 KB after optimisation; they are committed to the repo.
- Consistent light, palette and depth of field across all thirteen — they appear side by side in a
  grid, so a single mismatched shot is obvious.

## Shoot it, then run one command

`scripts/brand-image.mjs` does the crop, the grade and the export, so a new photograph matches
the existing set without anyone opening an image editor or guessing at settings:

```bash
# A photograph straight off the camera or phone becomes a catalog image
npm run images:brand -- --in ~/shots/tea.jpg --out tea

# The subject sits left of centre and a bit high, so name the point to keep
npm run images:brand -- --in ~/shots/tea.jpg --out tea --focus 0.38,0.44

# Replace an existing image, or write a scene rather than a catalog image
npm run images:brand -- --in ~/shots/bench.jpg --out potting-bench --dir scenes --force

# Check the whole set still hangs together
npm run images:measure
```

The script crops 4:3 around the focal point, resizes to 1600 × 1200, applies the shared grade and
exports WebP, stepping the quality down until the file is under 400 KB. It **refuses a source
smaller than 1600 × 1200** rather than upscaling it, because an upscaled frame beside twelve native
ones is exactly the mismatch this grid exposes.

The grade is not invented — it is measured from the thirteen images already shipping: mean RGB
143.0/141.8/121.2, a warm bias of about +22 red over blue, and mean saturation 0.134. `--measure`
prints those figures for any directory so a new image can be checked against them, and `--grade 0`
exports the straight photograph when a shot already has the look.

## Composition — the safe area

These images are cropped hard by `object-fit: cover` at several different aspect ratios. The numbers
below are measured from the live CSS, not estimated.

- **Tightest crop** is the desktop collection card (376 × 430). On a 4:3 source it shows only the
  **central 66% of the width** — on a 1600px-wide image, x 275 to x 1325. Anything outside that is
  invisible on desktop.
- **Wide banners** (about 16:7) show only the **middle 58% of the height** — y 220 to y 980 on a
  1200px-tall image.
- Net rule: **keep every important object inside the central square.** Use the outer edges for
  background and falloff only.

### Bottom third is for text, not product

Collection cards lay a dark gradient over the image starting at 38% of the card height and
deepening to near-black at the bottom, with the category name and "Shop collection" over it,
aligned bottom-left. So:

- Keep hero product in the **upper 60%**.
- Leave the **bottom-left quiet** — a surface, a shadow, soft falloff. No detail that matters.
- Do not bake any text into the image. The captions are live HTML, and baked-in text collides
  with them. (This was the original bug: the old placeholders had the category name inside the
  SVG, which showed through as ghost text behind the real caption.)

The three scene images have no gradient overlay, so they can carry detail lower in the frame.

## Brand

Palette, from `app/globals.css`:

| Token | Hex |
| --- | --- |
| Forest | `#203f2b` |
| Sage | `#7f8d67` |
| Cream | `#f7f4ec` |
| Gold | `#b9892e` |

Packaging should read as small-batch and natural: kraft pouches, amber glass, corked stoneware,
matte ceramic, unfinished wood, linen. Warm natural window light, soft shadows, shallow depth of
field, uncluttered cream or sage backdrop.

## Getting the logo right

Image generators reliably garble small lettering — the mockup this brief came from rendered
"FAST & RELIABLE SHIPRING". Two ways to avoid shipping a typo on your own packaging:

1. **Preferred — generate blank packaging.** Ask for the kraft pouch, jar label and tin with a
   *blank* cream label panel. The real logo then gets composited onto that panel from
   `public/logo.png`, so the wordmark is pixel-accurate every time.
2. If you do prompt for the logo, keep the leaf-arch mark large and check the wordmark letter by
   letter before accepting the image.

## Prompt starting points

Photorealistic product photography, natural window light from the left, soft shadows, shallow
depth of field, warm cream and sage palette, uncluttered background, nothing in the bottom-left
corner, 4:3. Then per image, for example:

- **hillside-hero** — "Potted herbs and a lavender plant in matte ceramic pots on a weathered wood
  bench, a kraft stand-up pouch of loose leaf tea with a blank cream label panel, an amber glass
  candle jar with a blank label, a stoneware mug, sprigs of fresh lavender lying on the wood."
- **homemade-soaps** — "Three stacked handmade soap bars with visible botanical flecks, wrapped in
  kraft paper with a blank cream label and twine, dried lavender sprigs, pale linen surface."
- **apothecary** — "An amber glass dropper bottle, a corked stoneware jar and a small dark green
  salve tin, all with blank cream labels, beside a tied bundle of dried herbs on a cream surface."
- **terrarium-supplies** — "A tall glass terrarium jar showing distinct layers of gravel, charcoal,
  potting soil and moss with a small fern inside, beside brass planting tweezers, a scoop and an
  open sack of pebbles."

## Integration

Artwork paths are set in one place — the `catalogArtwork` and `variantArtwork` maps in
`components/BrandMockupScene.tsx`. Keeping the same filename means a replacement needs no code
change at all; only the `alt` text has to be updated to describe the new picture. Owner-uploaded photographs from the admin dashboard continue to
take precedence over all of this on a per-product basis.
