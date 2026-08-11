/**
 * Where the Hillside mark sits in each photograph.
 *
 * Coordinates are in source pixels on the 1600x1200 image, measured off a
 * coordinate grid rather than guessed. `x,y` is the centre of the label, `angle`
 * is clockwise degrees, and `curve` is cylindrical falloff across the short side.
 * A `quad` of three corners is used instead where the surface is sheared.
 *
 * `shape` decides what kind of object the mark is printed on:
 *   plate  a label stuck to a vessel -- bottle, jar, glass
 *   tag    a swing tag with a punched hole, resting on or tied to something
 *   stake  a tag on a spike, pushed into soil
 *
 * Every placement lands on a real object in the frame. A mark floating on empty
 * background reads as a watermark, which is not what a shop selling handmade
 * goods should look like.
 *
 * Re-measure with:  node scripts/brand-mockup.mjs --only <name> --debug
 */
export const SHOTS = [
  {
    name: 'apothecary',
    base: 'assets/photography/apothecary.webp',
    out: 'public/images/catalog/apothecary.webp',
    labels: [
      // Both bottles were generated carrying blank cream labels, so there is no
      // paper to add — only ink to print on paper that is already in the
      // photograph. That is what `stamp` does: it composites the mark alone, in
      // multiply, so the label's own curvature, highlight and shadow read
      // straight through it. Laying a fresh plate over a label that already
      // exists would double the paper and show a seam.
      {
        // Upright bottle. Label runs x 372-660, y 466-838 on the glass.
        name: 'upright bottle',
        x: 516,
        y: 648,
        width: 288,
        height: 372,
        angle: 0,
        badge: true,
        logoScale: 0.78,
        stamp: true
      },
      {
        // The bottle on its side. Its label is sheared by the roll of the glass
        // — the top edge runs 12 degrees below horizontal while the left edge
        // leans the other way — so it takes three corners rather than an angle.
        name: 'lying bottle',
        quad: {
          topLeft: [978, 572],
          topRight: [1318, 648],
          bottomLeft: [912, 792]
        },
        badge: true,
        logoScale: 0.8,
        stamp: true
      }
    ]
  },
  {
    name: 'soaps',
    base: 'assets/photography/homemade-soaps.webp',
    out: 'public/images/catalog/homemade-soaps.webp',
    labels: [
      // The kraft bands wrap the bars and are photographed on their left faces,
      // which recede from camera — the band's top edge climbs to the right while
      // its sides stay vertical. A rotation cannot express that, so both take
      // three corners.
      {
        name: 'second bar',
        quad: {
          topLeft: [472, 428],
          topRight: [668, 392],
          bottomLeft: [472, 596]
        },
        badge: true,
        logoScale: 0.86,
        stamp: true
      },
      {
        name: 'bottom bar',
        quad: {
          topLeft: [472, 786],
          topRight: [668, 754],
          bottomLeft: [472, 944]
        },
        badge: true,
        logoScale: 0.86,
        stamp: true
      }
    ]
  },
  {
    name: 'bench',
    base: 'assets/photography/potting-bench.webp',
    out: 'public/images/scenes/potting-bench.webp',
    labels: [
      {
        // Tied to the ball of jute twine and leaning against it on the bench
        // boards. The frame this replaced carried another company's twine label
        // — "Juteschnur 225g, Great British Garden Company" — legible at full
        // size on the About page. Generating the bench removed the label and the
        // company along with it; the tag is now ours because everything is.
        name: 'twine tag',
        x: 700,
        y: 665,
        width: 200,
        height: 138,
        angle: -6,
        radius: 10,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'tag',
        tie: { to: [745, 545], width: 4 },
        strength: 0.5,
        blur: 13,
        shadow: { offset: 7, blur: 8, opacity: 0.45 }
      }
    ]
  },
  {
    name: 'carnivorous-plants',
    base: 'assets/photography/carnivorous-plants.webp',
    out: 'public/images/catalog/carnivorous-plants.webp',
    labels: [
      {
        // A nursery tag resting on the peat, lower-left below the traps where
        // the bed is clear. Dark soil under cream paper is the strongest
        // contrast in the frame.
        name: 'soil tag',
        x: 272,
        y: 828,
        width: 210,
        height: 144,
        angle: -14,
        radius: 9,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'tag',
        strength: 0.5,
        blur: 16,
        shadow: { offset: 9, blur: 9, opacity: 0.5 }
      }
    ]
  },
  {
    name: 'air-plants',
    base: 'assets/photography/air-plants.webp',
    out: 'public/images/catalog/air-plants.webp',
    labels: [
      {
        // The frame this replaced had a globe with no visible means of support,
        // so its mark had to be a label stuck on the glass. This one is
        // generated hanging from a wire through a glass loop, which is what a
        // shop actually sells — so the tag ties to the loop and hangs in front
        // of the globe, the way it would on the shelf.
        name: 'hanging tag',
        x: 786,
        y: 376,
        width: 190,
        height: 128,
        angle: 5,
        radius: 9,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'tag',
        tie: { to: [788, 215], width: 4 },
        strength: 0.5,
        blur: 10,
        // The background here is a pale seamless sweep, so the shadow is doing
        // most of the work of separating cream paper from cream wall.
        shadow: { offset: 8, blur: 9, opacity: 0.42 }
      }
    ]
  },
  {
    name: 'driftwood',
    base: 'assets/photography/driftwood.webp',
    out: 'public/images/catalog/driftwood.webp',
    labels: [
      {
        // Lying across the long lower log. Bleached wood and pale shingle make
        // this the lowest-contrast frame in the set, so the shadow is carrying
        // the separation rather than the tone difference.
        name: 'brand tag',
        x: 600,
        y: 950,
        width: 200,
        height: 138,
        angle: -3,
        radius: 10,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'tag',
        strength: 0.5,
        blur: 13,
        shadow: { offset: 9, blur: 10, opacity: 0.55 }
      }
    ]
  },
  {
    name: 'house-plants',
    base: 'assets/photography/house-plants.webp',
    out: 'public/images/catalog/house-plants.webp',
    labels: [
      {
        // On the second pot. The pots are a mid grey-beige, which is the only
        // thing in the frame darker than the paper — the wall and the sideboard
        // are both lighter than cream.
        name: 'pot label',
        x: 555,
        y: 855,
        width: 152,
        height: 92,
        angle: 0,
        radius: 6,
        paper: '#f2ebdd',
        logoScale: 0.82,
        badge: true,
        shape: 'plate',
        curve: 0.2,
        strength: 0.6,
        blur: 8,
        shadow: { offset: 3, blur: 5, opacity: 0.3 }
      }
    ]
  },
  {
    name: 'live-plant-planters',
    base: 'assets/photography/live-plant-planters.webp',
    out: 'public/images/catalog/live-plant-planters.webp',
    labels: [
      {
        // A stake card pushed into the soil of the lower-left pot, standing
        // against its leaves.
        //
        // The first version of this frame had wooden shelves and terracotta
        // pots, which gave a label superb contrast and made the image the
        // warmest thing in the set by a wide margin (50.2 against a set average
        // of 26.9). Cooling the scene fixed the colour and removed every surface
        // a cream label could read against — the pots, the shelves and the wall
        // are now all lighter than the paper. The dark foliage is the only thing
        // left that is darker, so the mark stands in front of it instead of
        // lying on a pot.
        name: 'soil stake',
        x: 200,
        y: 860,
        width: 152,
        height: 150,
        angle: -3,
        radius: 6,
        paper: '#f2ebdd',
        logoScale: 0.86,
        badge: true,
        shape: 'stake',
        strength: 0.55,
        blur: 10,
        shadow: { offset: 5, blur: 7, opacity: 0.4 }
      }
    ]
  },
  {
    name: 'moss',
    base: 'assets/photography/moss.webp',
    out: 'public/images/catalog/moss.webp',
    labels: [
      {
        // Lying on the lichened rock face, angled with its fall to the right.
        // The top of the frame is out-of-focus background, so a tag up there had
        // nothing under it; this band of stone is the one surface in focus.
        name: 'stone tag',
        x: 640,
        y: 960,
        width: 215,
        height: 148,
        angle: 8,
        radius: 10,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'tag',
        strength: 0.5,
        // Lichen is the busiest texture in the set; a softer blur prints it
        // straight through the paper.
        blur: 18,
        shadow: { offset: 9, blur: 10, opacity: 0.5 }
      }
    ]
  },
  {
    name: 'succulents',
    base: 'assets/photography/succulents.webp',
    out: 'public/images/catalog/succulents.webp',
    labels: [
      {
        // Lying on the surface in the gap the grid leaves at centre right,
        // shot from above with the pots.
        name: 'brand tag',
        x: 1010,
        y: 620,
        width: 210,
        height: 145,
        angle: -16,
        radius: 10,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'tag',
        strength: 0.5,
        blur: 15,
        shadow: { offset: 7, blur: 8, opacity: 0.48 }
      }
    ]
  },
  {
    name: 'terrarium-supplies',
    base: 'assets/photography/terrarium-supplies.webp',
    out: 'public/images/catalog/terrarium-supplies.webp',
    labels: [
      {
        // On the glass, low and left, where the gravel and the big pebble sit
        // behind it. Higher up the bowl the background is the pale wall and
        // cream paper has nothing to read against.
        name: 'bowl label',
        x: 395,
        y: 720,
        width: 180,
        height: 106,
        angle: 0,
        radius: 7,
        paper: '#f2ebdd',
        logoScale: 0.82,
        badge: true,
        shape: 'plate',
        curve: 0.26,
        strength: 0.58,
        blur: 9,
        shadow: { offset: 4, blur: 6, opacity: 0.3 }
      }
    ]
  },
  {
    name: 'hillside-hero',
    base: 'assets/photography/hillside-hero.webp',
    out: 'public/images/scenes/hillside-hero.webp',
    labels: [
      {
        // Hung from the front edge of the left-hand bench at (300,850), so it
        // falls into the shade under the bench — the darkest ground in the
        // frame, and the most legible the mark gets here.
        //
        // It stays on the left on purpose: the homepage renders this variant
        // with `badge`, and `.editorial-hero-image .brand-photo-badge` pins that
        // overlay to the bottom right. A mark composited there would collide
        // with it.
        name: 'hanging tag',
        x: 304,
        y: 960,
        width: 185,
        height: 125,
        angle: -5,
        radius: 10,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'tag',
        tie: { to: [300, 850], width: 4 },
        strength: 0.5,
        blur: 13,
        shadow: { offset: 6, blur: 8, opacity: 0.45 }
      }
    ]
  },
  {
    name: 'workshop-table',
    base: 'assets/photography/workshop-table.webp',
    out: 'public/images/scenes/workshop-table.webp',
    labels: [
      {
        // On the clear glass above the moss line. Everything below y≈540 inside
        // the jar is planting, so this is the only run of glass a label can
        // read against.
        name: 'jar label',
        x: 800,
        y: 395,
        width: 195,
        height: 116,
        angle: 0,
        radius: 7,
        paper: '#f2ebdd',
        logoScale: 0.82,
        badge: true,
        shape: 'plate',
        curve: 0.22,
        strength: 0.58,
        blur: 9,
        shadow: { offset: 4, blur: 6, opacity: 0.3 }
      }
    ]
  },
  {
    name: 'patio-containers',
    base: 'assets/photography/patio-containers.webp',
    out: 'public/images/gallery/patio-containers.webp',
    // Generated rather than licensed, which is why this shot carries no
    // `patches`. The frame it replaced was photographed inside another shop —
    // four candle brands, a soap brand, a pot brand and a plant retailer all
    // readable on our own gallery page — and had to have each wordmark blurred
    // out one at a time. A frame made for the purpose has nothing to remove, and
    // it actually matches its caption ("Patio color story"), which a picture of
    // indoor shelving never did.
    labels: [
      {
        // On the front of the large terracotta pot, below the leaf line and
        // above where the body curves away.
        name: 'pot label',
        x: 452,
        y: 902,
        width: 208,
        height: 122,
        angle: 0,
        radius: 7,
        paper: '#f2ebdd',
        logoScale: 0.82,
        badge: true,
        shape: 'plate',
        // The pot is lit hard from the right, so a strong cylinder falloff
        // darkens both edges at once and the label reads as grey metal rather
        // than paper. The relight already carries the pot's own shading.
        curve: 0.1,
        strength: 0.62,
        blur: 9,
        shadow: { offset: 4, blur: 6, opacity: 0.3 }
      }
    ]
  },
  {
    name: 'porch-planter',
    base: 'assets/photography/porch-planter.webp',
    out: 'public/images/gallery/porch-planter.webp',
    labels: [
      {
        // On the charcoal pot, left of where the ivy falls. The darkest vessel
        // in the set, so cream paper reads on it at any size.
        name: 'pot label',
        x: 652,
        y: 958,
        width: 158,
        height: 96,
        angle: 0,
        radius: 6,
        paper: '#f2ebdd',
        logoScale: 0.82,
        badge: true,
        shape: 'plate',
        curve: 0.14,
        strength: 0.6,
        blur: 8,
        shadow: { offset: 3, blur: 5, opacity: 0.28 }
      }
    ]
  },
  {
    name: 'soft-greens',
    base: 'assets/photography/soft-greens.webp',
    out: 'public/images/gallery/soft-greens.webp',
    labels: [
      {
        // On the front of the stone bowl. The frame this replaced was a single
        // rubber plant against a bare wall — no surface anywhere in it — and
        // needed a tag tied to the stem to sit anywhere believable. A bowl has a
        // face, so this is a label again.
        name: 'bowl label',
        x: 858,
        y: 952,
        width: 200,
        height: 118,
        angle: 0,
        radius: 7,
        paper: '#f2ebdd',
        logoScale: 0.82,
        badge: true,
        shape: 'plate',
        curve: 0.2,
        strength: 0.58,
        blur: 9,
        shadow: { offset: 4, blur: 6, opacity: 0.3 }
      }
    ]
  }
];
