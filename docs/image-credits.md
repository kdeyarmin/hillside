# Image credits and provenance

**Every photograph in `public/images/` is generated, not licensed stock.** All sixteen were made
with `gpt-image-1` through `scripts/generate-image.mjs`, put through the same crop and grade as
everything before them, and branded by `scripts/brand-mockup.mjs`. None has a photographer, and
none is a photograph of a real place or of The Hillside Gardens' own stock — see *What these
images are, and are not*.

The set they replaced was Unsplash photography. That history is recorded at the bottom, because
knowing what a file used to be is the thing you want when something looks wrong.

Each image is cropped to 4:3 at 1600×1200 around a per-image focal point, put through one shared
colour grade so the set reads as a single shoot, and exported as WebP under 400 KB. The spec — the
crop, the grade, the budget — lives in `scripts/lib/photo.mjs`, shared by both scripts so they
cannot drift apart. Two copies of a colour grade is how a set stops matching.

```bash
npm run images:generate -- --prompt "..." --out <name> --count 3   # make one
npm run images:brand    -- --in <file-or-url> --out <name>         # bring an existing file to spec
npm run images:mockup                                              # put the mark on all of them
npm run images:measure                                             # warmth, saturation, brightness, size
```

Set average: **warmth 23.6, saturation 0.134, brightness 53.4%, 118 KB**, against targets of 21.8 /
0.134 / 52.6% measured from the original thirteen. Whatever a file's origin, record it below before
committing it.

## Generating a photograph — `scripts/generate-image.mjs`

Licensed stock solves "a photograph exists", not "it is a photograph of the right thing". The
gallery was where that bit hardest: `patio-containers.webp` was captioned *Patio color story* and
showed another shop's indoor shelving, with four candle brands and a soap brand readable in it,
because no frame in the licensed set was a patio.

Output lands in `assets/photography/`, which is where `brand-mockup.config.mjs` reads from, so a
generated frame joins the same two-step flow as every other image: generate, add a `SHOTS` entry,
run the mockup. `--count` writes numbered candidates; picking is most of the work, so generating
three and discarding two is the expected way to use it.

**Credentials.** `GEMINI_API_KEY` or `OPENAI_API_KEY`, read from the environment at run time. They
are build-time tooling — the running app never reads them. The key is handed to curl through a
private config file rather than on the command line, because anything in argv is readable from the
process table.

**Prefer Gemini if you have the choice.** Imagen returns 2K at 4:3, comfortably over the 1600×1200
spec. `gpt-image-1` tops out at 1536×1024, which is 1365×1024 once cropped to 4:3 and therefore
*under* spec — a 1.17× enlargement. Every image in the current set is upscaled by that much. It is
tolerable on a generated frame, which has no real sensor detail to lose, and `--allow-upscale` has
to be passed explicitly so it is never silent.

**Every prompt gets a house style appended** (override with `--style`, disable with `--no-style`).

It specifies *camera*, not colour: daylight, shallow depth of field, a 50mm frame. It deliberately
does **not** ask for the house look. The first version did — "muted warm palette, cream, matte,
editorial" — and the result measured warmth 56.8 / saturation 0.242 against targets of 21.8 /
0.134, visibly sepia beside its neighbours, because the grade was then applied on top of a look the
model had already baked in. One source of the look, and it is the grade.

It also forbids lettering. The mark is composited afterwards from the real logo artwork, and a
model asked for a plant shop will cheerfully invent signage and packaging text — wrong, and a good
way to accidentally reproduce somebody's trademark. No people, for the same reason in a different
register.

**Two shots deliberately override the style to allow blank packaging.** `apothecary` needed empty
cream labels on its bottles and `homemade-soaps` needed unprinted kraft bands, so both were
generated with a `--style` that permits the wrapper while still banning every form of text. Those
blank labels are what the mark is then printed onto, which is why those two are the most convincing
product shots in the set — the paper is genuinely in the photograph, and only the ink is added.

**The grade is per-image, not automatic.** Generate, then measure. Model output ran consistently
warmer than the licensed set, so most of these are exported at `--grade 0`; the ones that are
mostly white flowers, pale timber or bleached wood took the full grade and landed on target.
Re-cropping and re-grading is free because the full-resolution original is kept in
`assets/photography/generated/` (gitignored — several megabytes each), so a colour decision never
costs another generation.

## The images

All sixteen: `gpt-image-1`, 1536×1024 upscaled to 1600×1200, best of 2–3 candidates.

### Category — `public/images/catalog/`

| File | Subject | Grade |
| --- | --- | --- |
| `house-plants.webp` | Five leafy houseplants in pale ceramic pots on a light wood sideboard | 0 |
| `carnivorous-plants.webp` | Venus flytraps in a white ceramic bowl of dark peat, shot from above | 0 |
| `live-plant-planters.webp` | Potted plants in pale stoneware on two white shelves | 1 |
| `succulents.webp` | Six succulents and cacti in terracotta pots, overhead flat lay | 0 |
| `air-plants.webp` | A tillandsia in a hanging glass globe on a wire, plain sweep | 0 |
| `homemade-soaps.webp` | Four soap bars in blank kraft bands on a board with dried lavender | 0 |
| `moss.webp` | Cushion moss and lichen on weathered granite, macro | 0 |
| `driftwood.webp` | Bleached driftwood stacked on shingle | 1 |
| `apothecary.webp` | Two amber bottles with blank cream labels on linen | 0 |
| `terrarium-supplies.webp` | A glass bowl terrarium of succulents, gravel and stones | 0 |

### Scenes — `public/images/scenes/`

| File | Subject | Grade |
| --- | --- | --- |
| `hillside-hero.webp` | A timber-framed greenhouse aisle, benches of potted plants receding | 0 |
| `potting-bench.webp` | Terracotta pots, a ball of jute twine, a seed tray and a trowel | 0 |
| `workshop-table.webp` | A glass jar terrarium part-planted, moss and tools around it | 0 |

### Gallery — `public/images/gallery/`

The gallery is the page that claims to show Hillside's own arrangements, and not one of the
licensed frames filed there was an arrangement: the "layered porch planter" was a shop interior,
the "foliage-first arrangement" was a single rubber plant against a wall, and the "patio color
story" was another shop's shelving. Each is now a photograph of what its caption says.

| File | Subject | Grade |
| --- | --- | --- |
| `porch-planter.webp` | Dracaena, white begonias and variegated ivy on porch boards | 1 |
| `soft-greens.webp` | A foliage-only stone bowl: hosta, asparagus fern, heuchera, creeping jenny | 0 |
| `patio-containers.webp` | Three terracotta containers on a stone patio, one coral geranium repeated | 0 |

The full prompts are the surest way to regenerate something close to one of these, and they live in
git history on the commits that introduced each image rather than being duplicated here, where they
would go stale the moment a frame is replaced.

## Branded product photography — `scripts/brand-mockup.mjs`

**Every photograph in the set carries the Hillside mark, and every mark sits on a real object in
the frame.** That is the rule everything below follows from. A cream rectangle in a clear corner of
a photograph is a watermark however well it is lit, and a shop selling handmade goods should not
look watermarked.

`shape` decides what the mark is printed on:

| `shape` | What it is | Where |
| --- | --- | --- |
| `plate` | a label adhered to a vessel | the workshop jar, the terrarium bowl, pots |
| `tag` | a swing tag: chamfered top corners, a hole punched clean through | resting on soil, stone, driftwood or a bench; hanging on twine |
| `stake` | a card on a spike | pushed into the soil of a pot |
| `stamp` | ink, with no paper of its own | the blank bottle labels and kraft soap bands |

The chamfer and the punched hole are what make a tag readable *as a tag* at thumbnail size —
rounding those corners instead produces a lozenge, which reads as a sticker. The hole is cut out of
the card with an even-odd subpath, so the photograph shows through it.

A tag that hangs takes `tie: { to: [x, y] }`, naming the point on a stem, a beam or a bench edge
that the twine is knotted to. The string is drawn from there to the hole, over the card rather than
under it, because real twine passes through the hole and lies across the top edge. It sags. Without
a tie, a hanging tag is still a floating rectangle.

`stamp` is the one to reach for when the photograph already contains paper. Both apothecary bottles
and two of the soap bands were generated blank, so the mark is composited alone, in multiply, and
the label's own curvature, highlight and shadow read straight through it. Laying a fresh plate over
a label that already exists would double the paper and show a seam.

The mark is never pasted on flat. Each placement is fitted to its object and relit from the
luminance of the pixels it covers, so a bottle's own highlight runs across its label and its shadow
side stays dark. Anything with paper of its own casts a drop shadow built from its own alpha, so
the shadow follows the chamfer and the hole; a stamp is ink in the surface and casts nothing.

Two placement modes, because a rotation is not always enough. Most take `x`/`y`/`angle`. A `quad`
of three corners handles a sheared surface — the soap bands are photographed on faces that recede
from camera, so their top edges climb while their sides stay vertical, and a rotated rectangle
visibly disagrees with the object it is printed on. A placement that runs out of frame is clipped
rather than refused.

**Contrast decides the placement more often than composition does.** Cream paper needs something
darker behind it, and in a set full of pale pots and pale walls that is usually soil, foliage or
terracotta. `live-plant-planters.webp` is the clearest case: its first version had wooden shelving
and terracotta pots, which gave a label superb contrast and made the image the warmest thing in the
set by a wide margin (50.2 against a set average of 26.9). Cooling the scene fixed the colour and
removed every surface a label could read against, so the mark became a stake card standing in front
of the leaves instead.

```bash
npm run images:mockup                               # rebuild every branded shot
npm run images:mockup -- --only apothecary --debug  # outline each placement to re-measure
```

The unbranded originals live in `assets/photography/`, outside `public/` so they are never served.
Every run reads from there and rewrites the file in `public/images/`, so the step is idempotent —
the mark can never be composited onto an already-branded image, and two consecutive runs produce
byte-identical files. Placement geometry is recorded in `scripts/brand-mockup.config.mjs`, measured
off a coordinate grid rather than guessed.

### Removing branding that is not ours

A shot can carry a `patches` array, applied before any label: each entry is a rectangle that gets a
local, feathered blur. A blur rather than flat colour, because cluttered scenes have real depth of
field, so softened printing reads as something behind the plane of focus while a painted rectangle
reads as a redaction. Each box covers the text band and nothing else — softening a whole jar beside
a sharp one is more conspicuous than the label was.

Nothing in the set uses it today. It exists because two licensed frames shipped carrying other
companies' marks: the potting bench had "Juteschnur 225g, Great British Garden Company" legible on
its twine, and `patio-containers.webp` needed twenty patches before its four candle brands, soap
brand, pot brand and plant retailer stopped being readable. Generating both frames removed the
problem at its source. The capability stays because the next borrowed frame may bring it back.

## What these images are, and are not

They are **generated images, not photographs**. Nothing in them was in front of a camera. The
greenhouse is not Hillside's greenhouse, the potting bench is not Tammy's bench, and the plants are
not the plants a customer will receive. They are consistent, brand-marked placeholder artwork —
better than licensed stock in that they depict what each caption claims and contain nobody else's
trademarks, and no closer than licensed stock to being a record of real stock.

For a shop where the customer receives the specific item pictured, the honest end state is Tammy's
own photography, uploaded per product through the admin dashboard — see
`docs/admin-image-uploads.md`. Owner uploads already override these automatically on a per-product
basis, so replacing them is incremental and needs no code change. `npm run images:brand` will bring
a phone photograph to the same crop, grade and budget in one command.

If any of these images is ever used somewhere a viewer could reasonably read it as documentary —
press, a listing that implies a specific plant, anything making a factual claim about the premises
— it should be replaced with a real photograph first.

## What this replaced

Until this branch, everything in `public/images/catalog/` and `public/images/scenes/` came from
[Unsplash](https://unsplash.com) under the [Unsplash License](https://unsplash.com/license). The
files were committed rather than hotlinked, because the build before that pulled them live from
`images.unsplash.com` and several IDs had since been deleted, which is what left broken images on
the storefront.

| File | Unsplash photo it replaced |
| --- | --- |
| `catalog/house-plants.webp` | [photo-1604762524889](https://unsplash.com/photos/1604762524889-3e2fcc145683) |
| `catalog/carnivorous-plants.webp` | [photo-1645577361246](https://unsplash.com/photos/1645577361246-6296c2147126) |
| `catalog/live-plant-planters.webp` | [photo-1613375772563](https://unsplash.com/photos/1613375772563-af532af5cef9) |
| `catalog/succulents.webp` | [photo-1459156212016](https://unsplash.com/photos/1459156212016-c812468e2115) |
| `catalog/air-plants.webp` | [photo-1669655546865](https://unsplash.com/photos/1669655546865-7ca0c89f3c50) |
| `catalog/homemade-soaps.webp` | [photo-1600857544200](https://unsplash.com/photos/1600857544200-b2f666a9a2ec) |
| `catalog/moss.webp` | [photo-1597517697687](https://unsplash.com/photos/1597517697687-acc0c17b2603) |
| `catalog/driftwood.webp` | [photo-1626532893235](https://unsplash.com/photos/1626532893235-267594460d98) |
| `catalog/apothecary.webp` | [photo-1671493234884](https://unsplash.com/photos/1671493234884-b1611bcf3e69) |
| `catalog/terrarium-supplies.webp` | [photo-1416339411116](https://unsplash.com/photos/1416339411116-62e1226aacd8) |
| `scenes/hillside-hero.webp` | [photo-1641816482139](https://unsplash.com/photos/1641816482139-c04a5fe29b90) |
| `scenes/potting-bench.webp` | [photo-1636039479790](https://unsplash.com/photos/1636039479790-be1d880e2b8c) |
| `scenes/workshop-table.webp` | [photo-1781977972837](https://unsplash.com/photos/1781977972837-e3b3f343be0e) |

`scripts/brand-image.mjs` still exists and still works on any file or URL, so returning a licensed
photograph — or a real one — to the set is one command.

## Licences deliberately avoided

Wikimedia Commons has excellent high-resolution botanical photography, but most of it is CC BY-SA.
Compositing the Hillside mark onto a BY-SA image produces a derivative that inherits share-alike,
which is not an acceptable licence for a brand asset. Nothing under BY-SA was used.

## The logo

`public/logo.png` and `public/logo-badge.png` are the owner's own mark, supplied as artwork and
processed only to knock the white background out to transparency and trim the margins.
`logo-badge.png` is the same artwork cropped above the "PLANTS · TEAS · BOTANICALS" tagline, which
is unreadable at the size the on-image badge renders.
