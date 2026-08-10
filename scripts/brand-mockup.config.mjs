/**
 * Where the Hillside mark sits in each photograph.
 *
 * Coordinates are in source pixels on the 1600x1200 image, measured off a
 * coordinate grid rather than guessed. `x,y` is the centre of the label, `angle`
 * is clockwise degrees to match the object's axis, and `curve` is how much
 * cylindrical falloff to add across the label's short side.
 *
 * Re-measure with:  node scripts/brand-mockup.mjs --only <name> --debug
 * which writes a .debug.png with every label outlined.
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
  }
];
