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
npm run images:brand -- --in <file-or-url> --out <name> [--dir catalog|scenes|gallery]
npm run images:measure     # warmth, saturation, brightness and size across the set
```

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

`patio-containers.webp` was photographed inside somebody else's shop, and four candle brands, a
soap brand, a pot brand and a plant retailer are all readable in it — on a page that is supposed
to be Hillside's own gallery. Adding our mark does not fix that; theirs has to go.

A shot can carry a `patches` array, applied before any label: each entry is a rectangle that gets
a local, feathered blur. A blur rather than a patch of flat colour, because these are cluttered
scenes with real depth of field, so softened printing reads as something behind the plane of focus
while a painted rectangle reads as a redaction. Each box covers the text band and nothing else —
softening a whole jar beside a sharp one is more conspicuous than the label was.

This is a mitigation, not a fix. The frame is still a photograph of another shop's shelves, and it
still does not match its own gallery caption ("Patio color story"). Replacing it with a real patio
container shot is the better answer whenever one exists.

```bash
npm run images:mockup                               # rebuild every branded shot
npm run images:mockup -- --only apothecary --debug  # outline each placement to re-measure
```

The unbranded originals live in `assets/photography/`, outside `public/` so they are never served.
Every run reads from there and rewrites the file in `public/images/catalog/`, so the step is
idempotent — the mark can never be composited onto an already-branded image. Placement geometry is
recorded in `scripts/brand-mockup.config.mjs` rather than re-measured by hand.

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
