# Image credits and licensing

Every photograph in `public/images/catalog/` and `public/images/scenes/` comes from
[Unsplash](https://unsplash.com) under the [Unsplash License](https://unsplash.com/license):
free to use commercially, no permission or attribution required. Attribution is listed here
anyway so the provenance of each file is traceable, and so a single image can be replaced
without guessing where it came from.

Each source is downloaded, cropped to 4:3 at 1600×1200 around a per-image focal point, put
through one shared colour grade so the set reads as a single shoot, and exported as WebP. The
files are committed rather than hotlinked — the previous build pulled images live from
`images.unsplash.com`, and several of those IDs have since been deleted, which is what left
broken images on the storefront.

That process is now `scripts/brand-image.mjs`, so replacing or adding an image is one command
rather than a manual edit that has to be matched by eye:

```bash
npm run images:brand -- --in <file-or-url> --out <name> [--dir catalog|scenes|gallery|assets]
npm run images:measure     # warmth, saturation, brightness and size across the set
```

The spec itself — the crop, the grade, the size budget — lives in `scripts/lib/photo.mjs`, shared
with the generator below so both produce identically graded files. Two copies of a colour grade is
how a set stops matching.

Whatever the source, add it to the tables below with its licence before committing.

## Category photography — `public/images/catalog/`

| File | Unsplash photo |
| --- | --- |
| `house-plants.webp` | [photo-1604762524889](https://unsplash.com/photos/1604762524889-3e2fcc145683) |
| `carnivorous-plants.webp` | [photo-1645577361246](https://unsplash.com/photos/1645577361246-6296c2147126) |
| `live-plant-planters.webp` | [photo-1613375772563](https://unsplash.com/photos/1613375772563-af532af5cef9) |
| `succulents.webp` | [photo-1459156212016](https://unsplash.com/photos/1459156212016-c812468e2115) |
| `air-plants.webp` | [photo-1669655546865](https://unsplash.com/photos/1669655546865-7ca0c89f3c50) |
| `homemade-soaps.webp` | [photo-1600857544200](https://unsplash.com/photos/1600857544200-b2f666a9a2ec) |
| `moss.webp` | [photo-1597517697687](https://unsplash.com/photos/1597517697687-acc0c17b2603) |
| `driftwood.webp` | [photo-1626532893235](https://unsplash.com/photos/1626532893235-267594460d98) |
| `apothecary.webp` | [photo-1671493234884](https://unsplash.com/photos/1671493234884-b1611bcf3e69) |
| `terrarium-supplies.webp` | [photo-1416339411116](https://unsplash.com/photos/1416339411116-62e1226aacd8) |

## Scene photography — `public/images/scenes/`

| File | Unsplash photo |
| --- | --- |
| `hillside-hero.webp` | [photo-1641816482139](https://unsplash.com/photos/1641816482139-c04a5fe29b90) |
| `potting-bench.webp` | [photo-1636039479790](https://unsplash.com/photos/1636039479790-be1d880e2b8c) |
| `workshop-table.webp` | [photo-1781977972837](https://unsplash.com/photos/1781977972837-e3b3f343be0e) |

## Branded product photography

**Every photograph in the set carries the Hillside mark**, in one of two ways.

Where the shot contains packaging, the mark goes on it: a printed label on the amber bottles, an
inked stamp on the kraft soap wraps, a tag on the ball of twine. This is the ordinary
product-mockup technique, and it is why the logo was supplied as transparent artwork.

The rest — moss on a rock, driftwood, a close-up of leaves — contain no packaging to print on, so
they take a shop tag. `scripts/brand-place.mjs` scores candidate positions on local detail,
exposure and distance from the subject and prints a config block to paste in; the numbers then
stay explicit in `brand-mockup.config.mjs` so they can be nudged by hand, which every one of them
has been.

**Every mark sits on an object in the frame.** That is the rule the rest of this follows from. A
cream rectangle in a clear corner of a photograph is a watermark however well it is lit, and a
shop selling handmade goods should not look watermarked. So each placement is a thing: a label
adhered to a bottle, a jar or a glass globe; a stamp inked into kraft; a tag lying on stone or
soil; a tag hanging on twine from a stem or a greenhouse beam.

The twine tag on the potting bench is not only branding. That stock photograph shipped with
**another company's label on it** — "Juteschnur 225g, Great British Garden Company" — legible at
full size on the homepage story block and the About page, which is a poor look on a page about
Tammy's own bench.

`shape` decides what the mark is printed on:

| `shape` | What it is | Where it is used |
| --- | --- | --- |
| `plate` | a label adhered to a vessel | amber bottles, the workshop jar, the terrarium bowl, the air-plant globe, a pot |
| `tag` | a swing tag: chamfered top corners, a hole punched clean through | anything resting on a surface or hanging |
| `stake` | a card on a spike | soil |

The chamfer and the punched hole are what make a tag readable as a tag at thumbnail size —
rounding those corners instead produces a lozenge, which reads as a sticker. The hole is cut out
of the card with an even-odd subpath, so the photograph shows through it.

A tag that hangs takes `tie: { to: [x, y] }`, naming the point on a stem or a beam that the twine
is knotted to. The string is drawn from there to the hole, over the card rather than under it,
because real twine passes through the hole and lies across the top edge. It sags. Without a tie
a hanging tag is still a floating rectangle, so shots with no surface to rest one on — the rubber
plant, the greenhouse — use it.

The mark is not pasted on flat. Each placement is fitted to its object and then relit from the
luminance of the pixels it covers, so the bottle's own highlight runs across the label and its
shadow side stays dark. The soap stamps are composited in multiply, so the kraft grain reads
through the ink the way it would on absorbent paper. Anything with paper of its own casts a drop
shadow built from its own alpha, so the shadow follows the chamfer and the hole; a stamp is ink in
the surface and casts nothing.

Two placement modes, because a rotation is not always enough. Most take `x`/`y`/`angle`. The
twine tag takes a `quad` of three corners: it is a band wrapping a cylinder, so its top edge sits
24 degrees off horizontal while its sides are only 4 degrees off vertical, and a rotated rectangle
visibly disagrees with the object it is printed on. A placement that runs out of frame, as that
tag does, is clipped rather than refused.

### Removing other shops' branding

A shot can carry a `patches` array, applied before any label: each entry is a rectangle that gets
a local, feathered blur. A blur rather than a patch of flat colour, because these are cluttered
scenes with real depth of field, so softened printing reads as something behind the plane of focus
while a painted rectangle reads as a redaction. Each box covers the text band and nothing else —
softening a whole jar beside a sharp one is more conspicuous than the label was.

It exists because `patio-containers.webp` used to be a photograph taken inside somebody else's
shop, with four candle brands, a soap brand, a pot brand and a plant retailer all readable on our
own gallery page. Twenty patches made those illegible, and the frame was still a picture of another
shop's shelving filed under the caption *Patio color story*. It has since been replaced by a
generated photograph, so nothing in the set currently needs patching — but the capability stays,
because the next licensed frame may.

```bash
npm run images:mockup                               # rebuild every branded shot
npm run images:mockup -- --only apothecary --debug  # outline each placement to re-measure
```

The unbranded originals live in `assets/photography/`, outside `public/` so they are never served.
Every run reads from there and rewrites the file in `public/images/catalog/`, so the step is
idempotent — the mark can never be composited onto an already-branded image. Placement geometry is
recorded in `scripts/brand-mockup.config.mjs` rather than re-measured by hand.

## Generating a photograph — `scripts/generate-image.mjs`

Licensed stock solves "a photograph exists" and not "it is a photograph of the right thing". The
gallery is where that bit: `patio-containers.webp` was captioned *Patio color story* and showed a
shop's indoor shelving, because no frame in the licensed set was a patio. Generating one closes the
gap from the other end — make the photograph, then brand it.

```bash
npm run images:generate -- --prompt "A cedar patio planter on a stone terrace" --out patio --count 4
```

Output lands in `assets/photography/`, which is where `brand-mockup.config.mjs` reads from, so a
generated frame joins the same two-step flow as every other image: generate, add a `SHOTS` entry,
run the mockup. `--count` writes numbered candidates so you can pick one; picking is most of the
work, so generating four and discarding three is the expected way to use it.

**Credentials.** `GEMINI_API_KEY` or `OPENAI_API_KEY`, read from the environment at run time. They
are build-time tooling — the running app never reads them. The key is handed to curl through a
private config file rather than on the command line, because anything in argv is readable from the
process table.

**Prefer Gemini.** Imagen returns 2K at 4:3, comfortably over the 1600×1200 spec. `gpt-image-1`
tops out at 1536×1024, which is *under* spec once cropped to 4:3, so it needs `--allow-upscale`
and produces a softer frame than the rest of the set. The script says so rather than quietly
upscaling.

**Every prompt gets a house style appended** (override with `--style`, disable with `--no-style`).
It aims at the look the grade was measured from, and it forbids lettering — the mark is composited
afterwards from the real logo artwork, and a model asked for a plant shop will invent signage and
packaging text, which is both wrong and a good way to accidentally reproduce somebody's trademark.
No people, for the same reason in a different register.

**Generated images must be listed as generated.** Everything else in this document is licensed
photography with a traceable source; a generated frame has neither a photographer nor a licence,
and recording it as though it did would make the rest of these tables untrustworthy. Add it to the
table below with the model and the prompt.

### Generated images

All three gallery images are generated. The gallery is the page that claims to show Hillside's own
arrangements, and not one of the licensed frames filed there was an arrangement: the "layered porch
planter" was a shop interior, the "foliage-first arrangement" was a single rubber plant against a
wall, and the "patio color story" was another shop's indoor shelving. Each is now a photograph of
what its caption says.

| File | Model | Prompt | Notes |
| --- | --- | --- | --- |
| `gallery/patio-containers.webp` | `gpt-image-1` | "A group of three weathered terracotta and cream containers arranged on a sunlit pale stone patio, planted with a repeated palette of soft coral geranium, sage-grey dichondra trailing over the rims, and airy white cosmos. Bright open overcast daylight, pale limestone paving, light airy background, generous negative space" | Best of 3. `--grade 0` (warmth 32.3 / sat 0.216 ungraded). |
| `gallery/porch-planter.webp` | `gpt-image-1` | "A large layered porch planter on painted wooden porch boards beside a column: a tall upright dracaena spike at the back, mounded white begonias and soft grey licorice plant in the middle, and variegated ivy spilling over the front rim. Bright shaded daylight, painted porch railing softly out of focus behind" | Best of 2. `--grade 1`; measured 20.2 / 0.085 / 52.3%, the closest match to the set targets of anything in it. |
| `gallery/soft-greens.webp` | `gpt-image-1` | "A foliage-only container arrangement in a wide shallow stone bowl, built entirely from greens and textures with no flowers: a soft blue-green hosta, feathery asparagus fern, silver-veined heuchera and creeping jenny trailing over the edge. Set on a garden table in bright shaded daylight, plain soft background" | Best of 2. `--grade 0`. |

All three are upscaled from 1536×1024. Two things about these rows are worth keeping in mind for
the next one.

**They are upscaled.** `gpt-image-1` maxes out at 1536×1024, which is 1365×1024 once cropped to
4:3 and therefore under the 1600×1200 spec — a 1.17× enlargement. Tolerable on a generated frame,
which has no real sensor detail to lose, and it is why `--allow-upscale` has to be passed
explicitly. Gemini's Imagen returns 2K at 4:3 and needs none of this.

**The grade is per-image, not automatic.** Two of the three are exported ungraded. The patio shot
came out of the model at warmth 32.3 / saturation 0.216 — already the same territory as `moss.webp`
(31.9 / 0.221) — and the full grade pushed it to 44.0 / 0.301, warmer and more saturated than
anything else in the set; coral geraniums on pale stone are simply a warm subject. The porch
planter, mostly white flowers and grey timber, took the full grade and landed at 20.2 / 0.085 /
52.3%, almost exactly on target.

So the rule is: generate, then measure. The grade exists to pull disparate photographs together,
not to warm one that already sits in range. Being able to re-crop and re-grade from the kept
original in `assets/photography/generated/` — rather than paying to generate again — is the whole
reason the raw is kept. `npm run images:measure` prints the comparison.

## What these images are, and are not

They are real photographs of real plants and goods, licensed for commercial use, now carrying the
real Hillside mark. They are still **not** photographs of The Hillside Gardens' own stock — the
bottles and soap in them belong to the original photographers. For a shop where the customer
receives the specific item pictured, the honest end state is Tammy's own photography, uploaded
per product through the admin dashboard — see `docs/admin-image-uploads.md`. Owner uploads
already override these automatically on a per-product basis, so replacing them is incremental
and needs no code change.

## Licences deliberately avoided

Wikimedia Commons has excellent high-resolution botanical photography, but most of it is
CC BY-SA. Compositing the Hillside mark onto a BY-SA image produces a derivative that inherits
share-alike, which is not an acceptable licence for a brand asset. Nothing under BY-SA was used.

## The logo

`public/logo.png` and `public/logo-badge.png` are the owner's own mark, supplied as artwork and
processed only to knock the white background out to transparency and trim the margins.
`logo-badge.png` is the same artwork cropped above the "PLANTS · TEAS · BOTANICALS" tagline,
which is unreadable at the size the on-image badge renders.
