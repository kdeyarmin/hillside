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
      {
        // Foreground bottle: cap at ~(540,745), base at ~(1240,960), so the body
        // axis runs 17 degrees below horizontal and its centre sits at ~(950,875).
        name: 'front bottle',
        x: 972,
        y: 882,
        width: 268,
        height: 172,
        angle: 17,
        radius: 10,
        paper: '#f1eade',
        logoScale: 0.8,
        curve: 0.14,
        strength: 0.5,
        blur: 12
      },
      {
        // Rear bottle: shoulder ~(1130,330) to base ~(1390,640) — much steeper,
        // and small enough in frame that the tagline line would not resolve, so
        // it takes the badge lockup instead.
        name: 'rear bottle',
        x: 1322,
        y: 474,
        width: 168,
        height: 116,
        angle: 40,
        radius: 7,
        paper: '#f1eade',
        logoScale: 0.8,
        badge: true,
        curve: 0.16,
        strength: 0.5,
        blur: 9
      }
    ]
  },
  {
    name: 'soaps',
    base: 'assets/photography/homemade-soaps.webp',
    out: 'public/images/catalog/homemade-soaps.webp',
    labels: [
      {
        // Kraft face of the third bar, the largest clear run of paper between
        // its top edge and the twine. Stamped, not labelled.
        name: 'third bar',
        x: 878,
        y: 452,
        width: 208,
        height: 162,
        angle: 24,
        badge: true,
        logoScale: 0.92,
        stamp: true
      },
      {
        // Front-left bar, flatter to camera and smaller in frame.
        name: 'left bar',
        x: 178,
        y: 533,
        width: 178,
        height: 100,
        angle: 12,
        badge: true,
        logoScale: 0.92,
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
        // The kraft tag on the ball of twine. It shipped carrying another
        // company's branding, legible at full size on the About page. The band
        // wraps a cylinder, so it is placed by its corners rather than rotated:
        // the top edge is 24 degrees off horizontal, the sides only 4 off
        // vertical. The bottom runs out of frame and is clipped.
        name: 'twine tag',
        quad: {
          topLeft: [1230, 936],
          topRight: [1419, 957],
          bottomLeft: [1256, 1216]
        },
        paper: '#d7caac',
        radius: 0,
        logoScale: 0.44,
        badge: true,
        strength: 0.66,
        blur: 7
      }
    ]
  },
  {
    name: 'carnivorous-plants',
    base: 'assets/photography/carnivorous-plants.webp',
    out: 'public/images/catalog/carnivorous-plants.webp',
    labels: [
      {
        // A nursery tag resting on the soil, upper-left where the bed is clear.
        name: 'soil tag',
        x: 330,
        y: 180,
        width: 300,
        height: 200,
        angle: -11,
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
        // The globe hangs against a seamless white sweep — there is no surface
        // in the frame and no visible cord to tie to, so the glass itself is the
        // only honest object. Treated like the jar and the terrarium: a label
        // adhered to the vessel, curved to the sphere.
        name: 'globe label',
        x: 420,
        y: 870,
        width: 210,
        height: 128,
        angle: -3,
        radius: 8,
        paper: '#f2ebdd',
        logoScale: 0.82,
        badge: true,
        shape: 'plate',
        curve: 0.2,
        strength: 0.52,
        blur: 10,
        shadow: { offset: 4, blur: 6, opacity: 0.3 }
      }
    ]
  },
  {
    name: 'driftwood',
    base: 'assets/photography/driftwood.webp',
    out: 'public/images/catalog/driftwood.webp',
    labels: [
      {
        // Lying across the driftwood in the lower left.
        name: 'brand tag',
        x: 340,
        y: 1030,
        width: 220,
        height: 150,
        angle: 5,
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
    name: 'house-plants',
    base: 'assets/photography/house-plants.webp',
    out: 'public/images/catalog/house-plants.webp',
    labels: [
      {
        // Standing on the sideboard in the gap between two pots.
        name: 'brand tag',
        x: 870,
        y: 878,
        width: 130,
        height: 180,
        angle: -3,
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
    name: 'live-plant-planters',
    base: 'assets/photography/live-plant-planters.webp',
    out: 'public/images/catalog/live-plant-planters.webp',
    labels: [
      {
        // On the shelf above the display.
        name: 'brand tag',
        x: 1240,
        y: 150,
        width: 200,
        height: 140,
        angle: -5,
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
    name: 'moss',
    base: 'assets/photography/moss.webp',
    out: 'public/images/catalog/moss.webp',
    labels: [
      {
        // Lying on the lichened rock face, angled with its fall to the right.
        // The top of the frame is out-of-focus background, so a tag up there had
        // nothing under it; this band of stone is the one surface in focus.
        name: 'stone tag',
        x: 390,
        y: 770,
        width: 250,
        height: 170,
        angle: 12,
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
        // Lying on the surface beside the pots, shot from above.
        name: 'brand tag',
        x: 1330,
        y: 1000,
        width: 240,
        height: 165,
        angle: 10,
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
        // A label on the glass of the terrarium bowl.
        name: 'brand plate',
        x: 300,
        y: 260,
        width: 300,
        height: 200,
        angle: -2,
        radius: 12,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'plate',
        strength: 0.5,
        blur: 15,
        shadow: { offset: 4, blur: 6, opacity: 0.32 }
      }
    ]
  },
  {
    name: 'hillside-hero',
    base: 'assets/photography/hillside-hero.webp',
    out: 'public/images/scenes/hillside-hero.webp',
    labels: [
      {
        // Hung from the eaves plate at (250,668) on the left-hand run, so it
        // falls into the dark blurred aisle behind the benches. Cream paper
        // against that shade is the most legible the mark gets in this frame,
        // and it is the shot the homepage leads with.
        name: 'hanging tag',
        x: 254,
        y: 818,
        width: 230,
        height: 155,
        angle: -4,
        radius: 10,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'tag',
        tie: { to: [250, 668], width: 4 },
        strength: 0.5,
        blur: 14,
        shadow: { offset: 7, blur: 8, opacity: 0.45 }
      }
    ]
  },
  {
    name: 'workshop-table',
    base: 'assets/photography/workshop-table.webp',
    out: 'public/images/scenes/workshop-table.webp',
    labels: [
      {
        // A label on the clear upper panel of the jar.
        name: 'brand plate',
        x: 700,
        y: 390,
        width: 340,
        height: 230,
        angle: -1,
        radius: 12,
        paper: '#f2ebdd',
        logoScale: 0.84,
        badge: true,
        shape: 'plate',
        strength: 0.5,
        blur: 15,
        shadow: { offset: 4, blur: 6, opacity: 0.32 }
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
