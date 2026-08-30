import { CareGuideType, Prisma } from '@prisma/client';

const houseplantImage = '/images/catalog/house-plants.webp';
const foliageImage = '/images/catalog/live-plant-planters.webp';
const pottingImage = '/images/scenes/potting-bench.webp';
const gardenImage = '/images/scenes/hillside-hero.webp';

export const starterCareGuides = [
  {
    plantName: 'Monstera Deliciosa',
    slug: 'monstera-deliciosa',
    guideType: CareGuideType.PLANT,
    category: 'Tropical foliage',
    difficulty: 'Beginner friendly',
    botanical: 'Monstera deliciosa',
    summary:
      'Iconic split foliage that grows best with bright filtered light, steady watering and room to climb.',
    light:
      'Bright, indirect light. Gentle morning sun is usually fine; harsh afternoon sun can scorch leaves.',
    water: 'Water thoroughly when the top 2 inches of soil feel dry, then empty the saucer.',
    humidity: 'Average household humidity is acceptable; 45–65% supports larger, cleaner leaves.',
    soil: 'An airy aroid mix with potting soil, orchid bark and perlite or pumice.',
    feeding: 'Use a balanced fertilizer at half strength about monthly in spring and summer.',
    temperature: '65–85°F; protect from cold drafts and temperatures below about 55°F.',
    petSafety:
      'Contains insoluble calcium oxalates and should be kept away from pets and children who may chew it.',
    tips: 'Rotate the pot every week or two and add a moss pole or sturdy support as the plant matures. Aerial roots may be guided toward the support or soil.',
    symptoms:
      'Yellow lower leaves, brown edges, small unsplit new leaves, leaning growth or long spaces between leaves.',
    causes:
      'Yellowing is often related to wet soil; small or unsplit leaves commonly indicate lower light or lack of climbing support.',
    treatment:
      'Check soil moisture and roots before watering again, improve light gradually, and secure the main stem to a support without tying petioles tightly.',
    prevention:
      'Use a draining pot, avoid watering by calendar alone, wipe leaves periodically and inspect new growth for pests.',
    checklist:
      'Bright indirect light\nWater after the top 2 inches dry\nUse a chunky, well-draining mix\nProvide support for mature growth\nKeep away from chewing pets',
    imageUrl: '/images/catalog/house-plants.webp',
    featured: true,
    sortOrder: 1,
    published: true
  },
  {
    plantName: 'Golden Pothos',
    slug: 'golden-pothos',
    guideType: CareGuideType.PLANT,
    category: 'Trailing plants',
    difficulty: 'Excellent beginner plant',
    botanical: 'Epipremnum aureum',
    summary:
      'A forgiving trailing classic that adapts to many homes and clearly shows when it needs water.',
    light:
      'Low to bright indirect light. Brighter filtered light preserves stronger variegation and fuller growth.',
    water:
      'Let the top 1–2 inches dry, then water fully. Slight leaf softening can be an early thirst signal.',
    humidity: 'Normal household humidity is usually sufficient.',
    soil: 'A standard indoor potting mix amended with perlite for drainage.',
    feeding:
      'Monthly at half strength during active growth; little or no fertilizer is needed in winter.',
    temperature: '60–85°F; avoid cold windows and HVAC blasts.',
    petSafety: 'Toxic if chewed; keep trailing vines out of reach of pets and small children.',
    tips: 'Prune just above a node to encourage branching. Cuttings root easily in water or moist potting mix.',
    symptoms:
      'Yellow leaves, black soft patches, sparse vines, fading variegation or crispy brown areas.',
    causes:
      'Persistent wet soil causes most yellowing; low light creates sparse growth and weaker variegation.',
    treatment:
      'Remove damaged leaves, correct watering, move gradually to brighter indirect light and trim long bare vines.',
    prevention:
      'Use drainage, rotate the plant and check soil rather than relying on a fixed watering day.',
    checklist:
      'Indirect light\nDry the top 1–2 inches between watering\nTrim vines for fullness\nRoot cuttings to fill the pot\nKeep away from chewing pets',
    imageUrl: '/images/catalog/house-plants.webp',
    featured: true,
    sortOrder: 2,
    published: true
  },
  {
    plantName: 'Snake Plant',
    slug: 'snake-plant',
    guideType: CareGuideType.PLANT,
    category: 'Low-maintenance plants',
    difficulty: 'Very easy',
    botanical: 'Dracaena trifasciata',
    summary:
      'Architectural, drought-tolerant and dependable when protected from frequent watering and cold soil.',
    light: 'Tolerates low light but grows best in medium to bright indirect light.',
    water: 'Allow the soil to dry completely or nearly completely before watering again.',
    humidity: 'Average to dry indoor air is appropriate.',
    soil: 'Fast-draining cactus or succulent mix in a pot with a drainage hole.',
    feeding: 'Feed lightly two or three times during spring and summer.',
    temperature: '60–85°F; avoid prolonged cold and wet conditions.',
    petSafety: 'Mildly toxic if eaten and may cause gastrointestinal upset.',
    tips: 'Too much water is the primary risk. A heavy pot and damp soil are reasons to wait, not water.',
    symptoms:
      'Mushy leaf bases, folding leaves, wrinkling, brown dry patches or a plant leaning out of wet soil.',
    causes:
      'Mushy tissue usually means overwatering or cold damage; wrinkling with bone-dry soil indicates thirst.',
    treatment:
      'Remove rotted sections, inspect rhizomes, repot into dry fast-draining mix and delay watering after repotting.',
    prevention:
      'Use a snug draining pot, water less during winter and never leave the pot standing in water.',
    checklist:
      'Let soil dry deeply\nUse succulent-style soil\nChoose a draining pot\nWater less in winter\nProtect from cold drafts',
    imageUrl: '/images/catalog/live-plant-planters.webp',
    featured: true,
    sortOrder: 3,
    published: true
  },
  {
    plantName: 'ZZ Plant',
    slug: 'zz-plant',
    guideType: CareGuideType.PLANT,
    category: 'Low-maintenance plants',
    difficulty: 'Very easy',
    botanical: 'Zamioculcas zamiifolia',
    summary:
      'Glossy, durable foliage with underground rhizomes that store water and reward a hands-off approach.',
    light: 'Low to bright indirect light. Avoid intense direct sun.',
    water:
      'Allow most of the pot to dry before watering. The rhizomes store moisture for long periods.',
    humidity: 'Average household humidity is sufficient.',
    soil: 'A loose, well-draining indoor mix with added perlite or pumice.',
    feeding: 'Every 6–8 weeks during spring and summer at reduced strength.',
    temperature: '60–80°F.',
    petSafety: 'Toxic if chewed; sap may irritate sensitive skin.',
    tips: 'Use a pot with drainage and resist watering because the surface looks dry. Check moisture deeper in the pot.',
    symptoms: 'Yellowing stems, soft rhizomes, drooping from the base or wrinkled leaflets.',
    causes:
      'Yellow stems and soft rhizomes generally point to prolonged wet soil. Wrinkled leaflets with very dry soil may indicate thirst.',
    treatment:
      'Remove rot, allow healthy rhizomes to dry briefly, repot into fresh draining mix and reduce watering frequency.',
    prevention:
      'Use a moisture check several inches deep and avoid oversized pots that stay wet too long.',
    checklist:
      'Indirect light\nDry most of the pot between watering\nUse a draining mix\nAvoid oversized pots\nKeep away from pets',
    imageUrl: '/images/catalog/house-plants.webp',
    sortOrder: 4,
    published: true
  },
  {
    plantName: 'Peace Lily',
    slug: 'peace-lily',
    guideType: CareGuideType.PLANT,
    category: 'Flowering houseplants',
    difficulty: 'Moderate',
    botanical: 'Spathiphyllum',
    summary:
      'Elegant foliage and white blooms with visible thirst signals and a preference for even moisture.',
    light: 'Medium to bright indirect light. More filtered light generally supports more blooms.',
    water: 'Water when the upper inch begins to dry. Keep evenly moist but never waterlogged.',
    humidity: 'Prefers moderate to higher humidity and steady air circulation.',
    soil: 'Rich but well-draining indoor potting mix.',
    feeding: 'Monthly at half strength in spring and summer.',
    temperature: '65–80°F.',
    petSafety: 'Toxic to cats and dogs if chewed.',
    tips: 'Filtered or rainwater may reduce brown tips in homes with hard or heavily treated tap water.',
    symptoms: 'Dramatic drooping, brown tips, yellow lower leaves, no blooms or blackened roots.',
    causes:
      'Drooping may be thirst, root stress or both. Brown tips can come from dry air, salts or inconsistent watering.',
    treatment:
      'Check moisture before watering, flush accumulated salts, trim damaged tips and inspect roots if the plant stays limp in wet soil.',
    prevention:
      'Maintain even moisture, avoid fertilizer buildup and keep the plant away from hot or cold air vents.',
    checklist:
      'Medium-bright indirect light\nKeep lightly moist\nUse filtered water when possible\nProvide moderate humidity\nKeep away from pets',
    imageUrl: houseplantImage,
    sortOrder: 5,
    published: true
  },
  {
    plantName: 'Spider Plant',
    slug: 'spider-plant',
    guideType: CareGuideType.PLANT,
    category: 'Pet-friendlier plants',
    difficulty: 'Easy',
    botanical: 'Chlorophytum comosum',
    summary:
      'Cheerful arching foliage that produces baby plantlets and adapts well to ordinary household conditions.',
    light: 'Medium to bright indirect light. Avoid prolonged harsh sun.',
    water: 'Water when the top inch dries; do not keep continuously soggy.',
    humidity: 'Average humidity works, though slightly higher humidity may reduce dry tips.',
    soil: 'Standard well-draining houseplant mix.',
    feeding: 'Monthly during spring and summer at half strength.',
    temperature: '60–80°F.',
    petSafety:
      'Generally considered non-toxic, although chewing any plant can still cause stomach upset.',
    tips: 'Root plantlets in water or pin them directly into a small pot of moist soil while still attached to the parent.',
    symptoms: 'Brown tips, pale leaves, limp growth or a lack of plantlets.',
    causes:
      'Salt buildup, inconsistent watering and very dry air often cause brown tips. Low light may reduce vigor and plantlet production.',
    treatment:
      'Flush the pot, switch to filtered water if needed, improve indirect light and remove severely damaged leaves.',
    prevention: 'Avoid overfertilizing and keep watering reasonably consistent.',
    checklist:
      'Bright indirect light\nWater when the top inch dries\nFlush salts periodically\nPropagate plantlets easily\nGenerally pet-friendlier',
    imageUrl: '/images/catalog/house-plants.webp',
    sortOrder: 6,
    published: true
  },
  {
    plantName: 'Heartleaf Philodendron',
    slug: 'heartleaf-philodendron',
    guideType: CareGuideType.PLANT,
    category: 'Trailing plants',
    difficulty: 'Easy',
    botanical: 'Philodendron hederaceum',
    summary: 'A soft, fast-growing vine that is easy to trim, train and propagate.',
    light: 'Medium to bright indirect light; tolerates lower light with slower, leggier growth.',
    water: 'Water when the top 1–2 inches dry.',
    humidity: 'Average household humidity is adequate; moderate humidity encourages lush growth.',
    soil: 'Airy, well-draining indoor mix.',
    feeding: 'Monthly in spring and summer at half strength.',
    temperature: '65–85°F.',
    petSafety: 'Toxic if chewed.',
    tips: 'Pin vines back into the pot or plant rooted cuttings around the edge to create a fuller basket.',
    symptoms: 'Long bare vines, small leaves, yellowing, soft stems or brown dry patches.',
    causes:
      'Sparse growth usually indicates low light or lack of pruning; soft yellow growth often points to wet soil.',
    treatment:
      'Prune to healthy nodes, root cuttings, improve light gradually and correct watering.',
    prevention:
      'Rotate regularly, trim before vines become bare and use a potting mix that drains freely.',
    checklist:
      'Medium-bright indirect light\nDry the top 1–2 inches\nPrune for fullness\nPropagate from nodes\nKeep away from pets',
    imageUrl: foliageImage,
    sortOrder: 7,
    published: true
  },
  {
    plantName: 'Fiddle Leaf Fig',
    slug: 'fiddle-leaf-fig',
    guideType: CareGuideType.PLANT,
    category: 'Statement plants',
    difficulty: 'Intermediate',
    botanical: 'Ficus lyrata',
    summary:
      'A dramatic indoor tree that rewards strong light, stable placement and careful watering.',
    light: 'Very bright indirect light with some gentle direct morning sun.',
    water:
      'Water thoroughly when the top 2–3 inches dry. Keep the pattern consistent without leaving soil wet.',
    humidity: 'Moderate humidity with airflow.',
    soil: 'Fast-draining indoor mix with bark and perlite.',
    feeding: 'Monthly in spring and summer with a balanced or foliage fertilizer.',
    temperature: '65–80°F with minimal drafts and temperature swings.',
    petSafety: 'Sap and foliage can irritate pets and people if ingested or handled repeatedly.',
    tips: 'Choose a bright location and avoid moving the plant frequently. Rotate a small amount every week for even growth.',
    symptoms:
      'Brown spots, lower leaf drop, red pinprick marks on new leaves, leaning or slow growth.',
    causes:
      'Dark spreading spots may indicate root stress; crisp tan areas often indicate dryness or sun stress. Small red marks can occur with moisture imbalance during leaf expansion.',
    treatment:
      'Assess soil and roots, improve light, stabilize watering and remove only severely damaged leaves.',
    prevention: 'Use a draining pot, water deeply but less often, and keep conditions stable.',
    checklist:
      'Very bright light\nStable location\nWater after top 2–3 inches dry\nAvoid cold drafts\nInspect roots when spotting spreads',
    imageUrl: houseplantImage,
    sortOrder: 8,
    published: true
  },
  {
    plantName: 'Rubber Plant',
    slug: 'rubber-plant',
    guideType: CareGuideType.PLANT,
    category: 'Statement plants',
    difficulty: 'Easy to moderate',
    botanical: 'Ficus elastica',
    summary:
      'A sturdy indoor tree with polished leaves that responds well to bright light and measured watering.',
    light: 'Bright indirect light; variegated forms need especially strong filtered light.',
    water: 'Water when the top 2 inches dry.',
    humidity: 'Average indoor humidity with airflow.',
    soil: 'Well-draining indoor mix with perlite or bark.',
    feeding: 'Monthly during spring and summer.',
    temperature: '65–85°F.',
    petSafety: 'Milky sap can irritate skin and is toxic if eaten.',
    tips: 'Wipe the broad leaves gently and prune above a node to encourage branching. Wear gloves if sensitive to sap.',
    symptoms: 'Lower leaf drop, yellowing, curling leaves or pale variegation.',
    causes:
      'Sudden environmental changes, wet soil, cold drafts and insufficient light are common triggers.',
    treatment: 'Stabilize placement, adjust watering and increase filtered light gradually.',
    prevention:
      'Avoid moving it repeatedly and protect from cold windows and air-conditioning vents.',
    checklist:
      'Bright indirect light\nWater after top 2 inches dry\nWipe leaves\nProtect from drafts\nHandle sap carefully',
    imageUrl: foliageImage,
    sortOrder: 9,
    published: true
  },
  {
    plantName: 'Chinese Evergreen',
    slug: 'chinese-evergreen',
    guideType: CareGuideType.PLANT,
    category: 'Low-light tolerant plants',
    difficulty: 'Easy',
    botanical: 'Aglaonema species and cultivars',
    summary:
      'Colorful, adaptable foliage that tolerates medium and lower light better than many tropical plants.',
    light:
      'Low to bright indirect light. Variegated and colorful cultivars need brighter filtered light.',
    water: 'Let the top 1–2 inches dry before watering.',
    humidity: 'Average humidity; avoid extremely dry hot air.',
    soil: 'Loose, well-draining indoor mix.',
    feeding: 'Every 4–6 weeks in spring and summer at half strength.',
    temperature: '65–80°F; protect from temperatures below about 60°F.',
    petSafety: 'Toxic if chewed.',
    tips: 'Keep it warm and avoid placing it against a cold winter window.',
    symptoms: 'Yellow leaves, brown patches, drooping or fading color.',
    causes:
      'Wet soil, cold exposure and insufficient light for highly variegated cultivars are common causes.',
    treatment:
      'Warm the location, correct watering and move colorful varieties to brighter indirect light.',
    prevention: 'Use drainage and keep temperatures steady.',
    checklist: 'Indirect light\nLet top soil dry\nKeep warm\nAvoid soggy soil\nKeep away from pets',
    imageUrl: houseplantImage,
    sortOrder: 10,
    published: true
  },
  {
    plantName: 'Calathea and Prayer Plants',
    slug: 'calathea-prayer-plants',
    guideType: CareGuideType.PLANT,
    category: 'Humidity-loving plants',
    difficulty: 'Intermediate',
    botanical: 'Goeppertia, Calathea and Maranta species',
    summary:
      'Patterned foliage plants that prefer gentle light, even moisture, warmth and low-mineral water.',
    light: 'Medium to bright indirect light with no harsh midday sun.',
    water: 'Keep lightly and evenly moist, allowing only the surface to begin drying.',
    humidity: 'Prefer 50% or higher with gentle airflow.',
    soil: 'Moisture-retentive but airy mix with coco coir or peat, bark and perlite.',
    feeding: 'Lightly every 4–6 weeks in the growing season.',
    temperature: '65–80°F and away from drafts.',
    petSafety:
      'Many commonly sold prayer plants are considered non-toxic, but identify the exact plant and confirm before relying on that status.',
    tips: 'Filtered, distilled or rainwater often reduces crispy edges caused by salts and additives in tap water.',
    symptoms: 'Curling leaves, crispy edges, faded pattern, yellowing or spider-mite webbing.',
    causes:
      'Dry soil, low humidity, mineral-heavy water, excess sun and spider mites are common triggers.',
    treatment:
      'Rehydrate evenly, improve humidity and airflow, switch water sources and inspect leaf undersides closely.',
    prevention: 'Avoid complete drying, keep foliage clean and inspect regularly for mites.',
    checklist:
      'Gentle indirect light\nEven moisture\nFiltered water\nHigher humidity\nInspect for spider mites',
    imageUrl: foliageImage,
    sortOrder: 11,
    published: true
  },
  {
    plantName: 'Aloe Vera',
    slug: 'aloe-vera',
    guideType: CareGuideType.PLANT,
    category: 'Succulents',
    difficulty: 'Easy with enough light',
    botanical: 'Aloe vera',
    summary:
      'A sun-loving succulent that needs bright light, a small draining pot and long dry intervals.',
    light:
      'Very bright light with several hours of direct or near-direct sun after gradual acclimation.',
    water: 'Soak thoroughly, then allow the mix to dry completely before watering again.',
    humidity: 'Average to dry air.',
    soil: 'Gritty cactus or succulent mix.',
    feeding: 'Once or twice in spring and summer at low strength.',
    temperature: '60–85°F; protect from frost.',
    petSafety: 'Aloe latex and whole-leaf ingestion can be toxic to pets. Keep out of reach.',
    tips: 'A terracotta pot helps the mix dry. Increase sun gradually to avoid scorch.',
    symptoms:
      'Soft translucent leaves, brown mushy bases, thin curling leaves or stretched pale growth.',
    causes:
      'Softness generally means too much water; thin curling leaves may indicate prolonged dryness; stretching means insufficient light.',
    treatment: 'Remove rot, allow cuts to callus, repot dry and move gradually to stronger light.',
    prevention: 'Use a small draining pot and wait for complete drying.',
    checklist:
      'Very bright light\nDry completely between watering\nUse gritty soil\nChoose a snug pot\nKeep away from pets',
    imageUrl: gardenImage,
    sortOrder: 12,
    published: true
  },
  {
    plantName: 'Jade Plant',
    slug: 'jade-plant',
    guideType: CareGuideType.PLANT,
    category: 'Succulents',
    difficulty: 'Easy with bright light',
    botanical: 'Crassula ovata',
    summary:
      'A long-lived succulent shrub that develops a sturdy form with strong light and restrained watering.',
    light: 'Bright light with several hours of gentle direct sun after acclimation.',
    water: 'Allow the soil to dry fully, then water deeply.',
    humidity: 'Average to dry indoor air.',
    soil: 'Fast-draining succulent mix with mineral grit.',
    feeding: 'Lightly every 6–8 weeks in spring and summer.',
    temperature: '60–80°F; cooler winter nights are acceptable if soil stays dry.',
    petSafety: 'Toxic to cats and dogs if eaten.',
    tips: 'Prune above leaf pairs to encourage branching and rotate for an even, tree-like shape.',
    symptoms: 'Soft leaves, leaf drop, black stems, wrinkling or stretched growth.',
    causes:
      'Wet soil causes soft tissue and drop; inadequate light causes stretching; prolonged drought causes wrinkling.',
    treatment: 'Correct watering, remove rot and improve light gradually.',
    prevention: 'Use a heavy draining pot and avoid frequent small sips of water.',
    checklist:
      'Strong light\nDry fully between watering\nUse succulent mix\nPrune for shape\nKeep away from pets',
    imageUrl: gardenImage,
    sortOrder: 13,
    published: true
  },
  {
    plantName: 'Phalaenopsis Orchid',
    slug: 'phalaenopsis-orchid',
    guideType: CareGuideType.PLANT,
    category: 'Flowering houseplants',
    difficulty: 'Moderate',
    botanical: 'Phalaenopsis hybrids',
    summary:
      'A long-blooming orchid that prefers airy roots, bright filtered light and a complete wet-to-nearly-dry cycle.',
    light: 'Bright indirect light, often near an east window or behind a sheer curtain.',
    water: 'Water when roots turn silvery and the bark is nearly dry; drain completely.',
    humidity: 'Moderate humidity with airflow around roots and leaves.',
    soil: 'Orchid bark or a purpose-made Phalaenopsis mix, never dense potting soil.',
    feeding: 'Weakly every 2–4 weeks during active growth, flushing with plain water regularly.',
    temperature: '65–82°F; a modest nighttime drop can help initiate flower spikes.',
    petSafety:
      'Phalaenopsis orchids are generally considered non-toxic, but discourage chewing and confirm exact plant identification.',
    tips: 'Keep water out of the crown overnight and use a ventilated orchid pot so roots can breathe.',
    symptoms: 'Wrinkled leaves, mushy roots, bud blast, yellow leaves or no rebloom.',
    causes:
      'Root loss can make a plant look thirsty even in wet media. Sudden temperature changes and dry air can cause buds to drop.',
    treatment:
      'Inspect roots, trim hollow or mushy tissue, repot in fresh bark and stabilize conditions.',
    prevention: 'Use airy media, drain fully and avoid ice cubes as a watering method.',
    checklist:
      'Bright filtered light\nWater silvery roots\nUse orchid bark\nKeep crown dry\nProvide airflow',
    imageUrl: houseplantImage,
    sortOrder: 14,
    published: true
  },

  {
    plantName: 'Houseplant Care Basics',
    slug: 'houseplant-care-basics',
    guideType: CareGuideType.GENERAL,
    category: 'Getting started',
    difficulty: 'Start here',
    summary:
      'A practical framework for choosing the right location, watering correctly and noticing trouble before it becomes serious.',
    tips: 'Healthy plant care is mostly observation. Match the plant to the light you actually have, check soil before watering, use drainage and make one change at a time when troubleshooting.',
    checklist:
      'Identify the plant\nObserve the light through a full day\nUse a pot with drainage\nCheck soil before watering\nInspect leaves and stems weekly\nQuarantine new plants\nChange one variable at a time',
    prevention:
      'A short weekly check catches pests, dry soil, standing water and yellowing before the problem spreads.',
    imageUrl: houseplantImage,
    featured: true,
    sortOrder: 101,
    published: true
  },
  {
    plantName: 'Watering Houseplants 101',
    slug: 'watering-houseplants-101',
    guideType: CareGuideType.GENERAL,
    category: 'Watering',
    difficulty: 'Essential skill',
    summary:
      'Learn how to decide when a plant needs water, how to water thoroughly and why a calendar alone is unreliable.',
    water:
      'Insert a finger, wooden skewer or moisture probe to the depth appropriate for the plant. Consider pot weight, leaf firmness and how quickly the mix normally dries.',
    tips: 'When it is time to water, soak the entire root ball until excess drains freely. Discard runoff. Frequent small sips can leave dry pockets and encourage shallow roots.',
    causes:
      'Watering needs change with light, season, pot size, soil, temperature, humidity and root health.',
    prevention:
      'Group plants by moisture needs, learn the weight of a dry versus watered pot, and reduce frequency when light and growth slow.',
    checklist:
      'Check below the surface\nLift the pot\nWater the whole root ball\nLet excess drain\nEmpty saucers\nRecheck before the next watering',
    imageUrl: gardenImage,
    featured: true,
    sortOrder: 102,
    published: true
  },
  {
    plantName: 'Understanding Indoor Light',
    slug: 'understanding-indoor-light',
    guideType: CareGuideType.GENERAL,
    category: 'Light',
    difficulty: 'Essential skill',
    summary:
      'A clear guide to low, medium and bright indirect light, window direction and safe acclimation to direct sun.',
    light:
      'Bright indirect light means a bright room near a window without hours of harsh sun directly striking the leaves. Low light means a plant can survive, not necessarily thrive.',
    tips: 'Watch the actual spot at several times of day. Move plants toward stronger light gradually over one to three weeks to prevent sunburn.',
    symptoms:
      'Low light can cause slow growth, long spaces between leaves, leaning and loss of variegation. Too much direct sun can cause bleached or crisp patches.',
    prevention:
      'Rotate plants, clean windows and leaves, and use a grow light when natural light is consistently inadequate.',
    checklist:
      'Check window direction\nObserve direct sun hours\nMeasure distance from glass\nAcclimate gradually\nRotate regularly\nConsider a grow light',
    imageUrl: foliageImage,
    featured: true,
    sortOrder: 103,
    published: true
  },
  {
    plantName: 'Soil, Drainage and Choosing a Pot',
    slug: 'soil-drainage-and-pots',
    guideType: CareGuideType.GENERAL,
    category: 'Potting',
    difficulty: 'Core skill',
    summary:
      'How soil texture, drainage holes and pot size work together to keep roots supplied with both water and oxygen.',
    soil: 'Most tropical houseplants need a mix that holds some moisture while still containing air. Bark, perlite, pumice and coarse coco chips increase structure and drainage.',
    tips: 'Choose a pot only 1–2 inches wider than the root ball for most plants. Decorative cachepots are fine when the plant remains in a draining inner pot.',
    causes:
      'Oversized pots and dense mixes remain wet too long, which reduces oxygen around roots and raises the risk of rot.',
    prevention:
      'Use drainage holes, match the mix to the plant and avoid packing soil tightly around roots.',
    checklist:
      'Drainage hole present\nPot close to root-ball size\nMix suited to the plant\nAiry amendments included\nNo standing water in cachepot',
    imageUrl: pottingImage,
    featured: true,
    sortOrder: 104,
    published: true
  },
  {
    plantName: 'How and When to Repot',
    slug: 'how-and-when-to-repot',
    guideType: CareGuideType.GENERAL,
    category: 'Potting',
    difficulty: 'Core skill',
    summary:
      'Repot for a reason—not simply because a plant has been in the same container for a certain number of months.',
    tips: 'Repot when roots circle densely, water rushes through without wetting the mix, soil has broken down, roots are unhealthy or the plant is physically unstable. Move up one pot size in most cases.',
    symptoms:
      'Roots emerging heavily from drainage holes, water running straight through, chronic wilting despite proper watering or a top-heavy plant tipping over.',
    treatment:
      'Loosen circling roots gently, remove dead roots, use fresh appropriate mix, water to settle and avoid strong fertilizer for several weeks.',
    prevention:
      'Inspect roots before deciding. Some plants bloom or grow better slightly snug and do not need annual pot enlargement.',
    checklist:
      'Confirm a reason to repot\nChoose one size larger\nPrepare fresh mix\nTrim only dead roots\nKeep the same planting depth\nAllow recovery in stable light',
    imageUrl: pottingImage,
    sortOrder: 105,
    published: true
  },
  {
    plantName: 'Fertilizing Without Overdoing It',
    slug: 'fertilizing-houseplants',
    guideType: CareGuideType.GENERAL,
    category: 'Nutrition',
    difficulty: 'Core skill',
    summary:
      'Feed active growth lightly and consistently while avoiding salt buildup and the temptation to fertilize a stressed plant.',
    feeding:
      'A balanced complete fertilizer at half the label strength is a reasonable starting point for many foliage plants during active growth.',
    tips: 'Fertilizer is not medicine. Correct light, watering and root problems first. Apply to moist soil and flush the pot with plain water periodically.',
    symptoms:
      'White crust on soil, brown tips, sudden wilting after feeding, weak growth or pale new leaves.',
    causes:
      'Excess concentration and salt accumulation can burn roots. Pale growth can also come from low light, damaged roots or unsuitable pH.',
    treatment:
      'Stop feeding, flush the mix thoroughly and resume only after healthy growth returns.',
    prevention: 'Use measured dilution, feed less in winter and never double a missed application.',
    checklist:
      'Feed only active healthy plants\nDilute carefully\nApply to moist soil\nFlush salts periodically\nReduce in winter',
    imageUrl: gardenImage,
    sortOrder: 106,
    published: true
  },
  {
    plantName: 'Humidity, Airflow and Leaf Care',
    slug: 'humidity-airflow-leaf-care',
    guideType: CareGuideType.GENERAL,
    category: 'Environment',
    difficulty: 'Helpful upgrade',
    summary:
      'Humidity helps many tropical plants, but airflow and clean foliage are equally important for healthy indoor growth.',
    humidity:
      'Many common tropical plants are comfortable around 40–60%. Calatheas, ferns and some orchids often appreciate more.',
    tips: 'A room humidifier is more effective than occasional misting. Keep leaves from remaining wet for long periods and provide gentle air movement.',
    symptoms:
      'Crispy edges, tightly curled leaves, slow unfurling, mildew or recurring spider mites.',
    causes:
      'Dry air can contribute to edge damage and mites; stagnant humid air can encourage fungal problems.',
    treatment:
      'Adjust humidity gradually, clean foliage, separate crowded plants and improve gentle circulation.',
    prevention:
      'Use a hygrometer, clean the humidifier and avoid placing plants directly in heater or air-conditioner airflow.',
    checklist:
      'Measure humidity\nUse clean humidifier water\nProvide gentle airflow\nWipe dusty leaves\nAvoid constantly wet foliage',
    imageUrl: foliageImage,
    sortOrder: 107,
    published: true
  },
  {
    plantName: 'Propagation Basics',
    slug: 'houseplant-propagation-basics',
    guideType: CareGuideType.GENERAL,
    category: 'Propagation',
    difficulty: 'Beginner project',
    summary:
      'A starter guide to node cuttings, division, offsets and the conditions that help new roots form.',
    tips: 'The correct method depends on the plant. Vining aroids need a node; snake plants can use leaf sections or division; spider plants make offsets; many succulents need a callused cutting.',
    treatment:
      'Use clean tools, label cuttings, keep the medium lightly moist rather than soaked and provide warm bright indirect light.',
    prevention:
      'Do not move a water-rooted cutting into soil too early. Several branching roots usually adapt better than one short root.',
    checklist:
      'Identify the propagation method\nUse clean sharp tools\nInclude a node when required\nProvide warmth and indirect light\nKeep medium lightly moist\nPot after a usable root system forms',
    imageUrl: pottingImage,
    sortOrder: 108,
    published: true
  },

  {
    plantName: 'Why Are My Plant’s Leaves Turning Yellow?',
    slug: 'yellow-leaves',
    guideType: CareGuideType.PROBLEM,
    category: 'Leaf symptoms',
    difficulty: 'Common issue',
    summary:
      'Yellow leaves are a symptom, not a diagnosis. Use soil moisture, leaf position and the pattern of yellowing to narrow the cause.',
    symptoms:
      'One older lower leaf yellowing occasionally may be normal. Widespread yellowing, soft stems, wet soil, dry crisp tissue or pale new growth require closer attention.',
    causes:
      'Common causes include overwatering, prolonged drought, root damage, low light, cold stress, nutrient imbalance, pests and normal aging.',
    treatment:
      'Check soil and roots before adding water or fertilizer. Correct the most likely environmental cause, remove only fully yellow leaves and watch new growth for improvement.',
    prevention:
      'Use drainage, match watering to soil moisture and light, and avoid changing several conditions at once.',
    tips: 'The leaf pattern matters: lower soft yellow leaves with wet soil often point to excess moisture, while yellowing with crisp dry tissue may point to drought.',
    checklist:
      'Check soil depth\nInspect roots if soil stays wet\nNote which leaves are affected\nInspect for pests\nReview recent temperature or location changes\nWait for new growth before judging recovery',
    imageUrl: foliageImage,
    featured: true,
    sortOrder: 201,
    published: true
  },
  {
    plantName: 'Brown Tips and Crispy Leaf Edges',
    slug: 'brown-tips-crispy-edges',
    guideType: CareGuideType.PROBLEM,
    category: 'Leaf symptoms',
    difficulty: 'Common issue',
    summary:
      'Crispy tips often reflect inconsistent moisture, dry air or mineral buildup rather than a single disease.',
    symptoms: 'Dry brown tips, tan margins, papery patches or edges that slowly spread inward.',
    causes:
      'Inconsistent watering, very dry air, hard-water minerals, fertilizer salts, root crowding, sun scorch and cold or hot drafts are common causes.',
    treatment:
      'Correct watering, flush the pot, improve humidity if appropriate, move away from extreme airflow and trim only dead tissue with clean scissors.',
    prevention:
      'Use consistent care, dilute fertilizer, flush salts and use filtered water for sensitive plants.',
    tips: 'Damaged tissue will not turn green again. Judge success by whether new leaves emerge clean and damage stops spreading.',
    checklist:
      'Check recent watering gaps\nReview fertilizer strength\nFlush accumulated salts\nMeasure humidity\nCheck for direct sun and HVAC airflow\nWatch new leaves',
    imageUrl: foliageImage,
    sortOrder: 202,
    published: true
  },
  {
    plantName: 'Drooping or Wilting Houseplants',
    slug: 'drooping-wilting-houseplants',
    guideType: CareGuideType.PROBLEM,
    category: 'Whole-plant symptoms',
    difficulty: 'Common issue',
    summary:
      'A drooping plant can be thirsty, waterlogged, overheated, root-damaged or simply adjusting—check before watering automatically.',
    symptoms:
      'Limp leaves, collapsed stems, soft growth or a plant that does not recover after watering.',
    causes:
      'Dry soil, saturated oxygen-poor soil, root rot, heat, cold, transplant shock and stem damage can all cause wilting.',
    treatment:
      'Feel the soil deeply. Water thoroughly only when dry; if wet, inspect drainage and roots. Move the plant out of extreme heat or cold and support damaged stems.',
    prevention:
      'Learn the normal weight and moisture pattern of the pot and avoid leaving roots in standing water.',
    tips: 'A thirsty plant often improves within hours after a proper watering. A plant that stays wilted in wet soil needs root inspection, not more water.',
    checklist:
      'Check soil before watering\nLift the pot\nInspect drainage\nReview heat and cold exposure\nCheck roots if wet and wilted\nAllow recovery before fertilizing',
    imageUrl: houseplantImage,
    featured: true,
    sortOrder: 203,
    published: true
  },
  {
    plantName: 'Curling Leaves',
    slug: 'curling-leaves',
    guideType: CareGuideType.PROBLEM,
    category: 'Leaf symptoms',
    difficulty: 'Common issue',
    summary:
      'Leaf curl is a protective response that may be triggered by moisture stress, temperature, light, pests or mineral-heavy water.',
    symptoms:
      'Leaves folding inward, rolling at the edges, cupping upward or failing to unfurl normally.',
    causes:
      'Dry soil, damaged roots, low humidity, excess sun, cold drafts, heat and pests—especially spider mites or thrips—are common causes.',
    treatment:
      'Check soil, inspect both sides of leaves, stabilize temperature, adjust light and improve humidity only when the plant prefers it.',
    prevention:
      'Avoid extreme drying, keep sensitive plants away from vents and inspect new leaves before they fully unfurl.',
    tips: 'Do not diagnose curl from humidity alone. Root and pest problems can look similar and require different treatment.',
    checklist:
      'Check soil moisture\nInspect leaf undersides\nLook inside new growth\nReview sun exposure\nCheck temperature and airflow\nIdentify the plant’s humidity preference',
    imageUrl: foliageImage,
    sortOrder: 204,
    published: true
  },
  {
    plantName: 'Leggy Growth and Small Leaves',
    slug: 'leggy-growth-small-leaves',
    guideType: CareGuideType.PROBLEM,
    category: 'Growth problems',
    difficulty: 'Common issue',
    summary:
      'Long spaces between leaves, leaning stems and smaller new foliage usually mean the plant needs stronger light or support.',
    symptoms:
      'Long internodes, sparse vines, pale growth, leaning toward a window, smaller leaves or loss of variegation.',
    causes:
      'Insufficient light is most common. Some climbing plants also make smaller leaves when allowed to trail without support.',
    treatment:
      'Move gradually to brighter indirect light, add a suitable grow light, prune back bare growth and provide a climbing support when appropriate.',
    prevention:
      'Rotate plants, clean windows and leaves, and position grow lights close enough to be useful without overheating foliage.',
    tips: 'Existing stretched stems will not shorten. Pruning and improved light encourage more compact replacement growth.',
    checklist:
      'Increase light gradually\nRotate the pot\nPrune above healthy nodes\nRoot cuttings to refill the pot\nAdd support for climbing species',
    imageUrl: houseplantImage,
    sortOrder: 205,
    published: true
  },
  {
    plantName: 'Root Rot: Signs, Rescue and Prevention',
    slug: 'root-rot',
    guideType: CareGuideType.PROBLEM,
    category: 'Root problems',
    difficulty: 'Urgent issue',
    summary:
      'Root rot develops when roots remain oxygen-starved and damaged, often in wet dense soil or an oversized container.',
    symptoms:
      'Persistent wilting in wet soil, widespread yellowing, a sour smell, black or brown mushy roots, soft stems or leaves dropping easily.',
    causes:
      'Frequent watering, poor drainage, dense decomposed mix, cold wet soil, an oversized pot or roots already damaged by disease or stress.',
    treatment:
      'Unpot the plant, rinse or loosen soil, remove mushy roots with sterile tools, sanitize the pot, repot into fresh airy mix and water cautiously while new roots form.',
    prevention:
      'Use drainage, choose an appropriate pot size, check moisture below the surface and adjust watering when light or temperature changes.',
    tips: 'Healthy roots are generally firm. Color varies by species, so texture and smell are more reliable than color alone.',
    checklist:
      'Isolate the plant\nInspect roots\nRemove mushy tissue\nSanitize tools and pot\nUse fresh airy mix\nReduce watering during recovery\nPropagate healthy pieces as backup',
    imageUrl: pottingImage,
    featured: true,
    sortOrder: 206,
    published: true
  },
  {
    plantName: 'Fungus Gnats',
    slug: 'fungus-gnats',
    guideType: CareGuideType.PROBLEM,
    category: 'Pests',
    difficulty: 'Manageable pest',
    summary:
      'Small dark flies around moist potting soil are usually fungus gnats. Control requires addressing both adults and soil-dwelling larvae.',
    symptoms:
      'Tiny mosquito-like adults near pots, larvae in the upper soil and recurring activity after watering.',
    causes:
      'Continuously moist organic potting mix supports fungus and larvae. New soil or plants may introduce them.',
    treatment:
      'Allow the surface to dry as the plant permits, use yellow sticky cards for adults and apply a labeled biological larvicide such as Bacillus thuringiensis israelensis according to directions.',
    prevention:
      'Quarantine new plants, avoid chronically wet soil, store potting mix sealed and clean fallen organic debris.',
    tips: 'Sticky cards show whether adults are decreasing but do not eliminate larvae by themselves. Repeat the larval treatment through the life cycle.',
    checklist:
      'Isolate heavily affected pots\nPlace yellow sticky cards\nReduce unnecessary moisture\nTreat larvae with a labeled product\nRepeat as directed\nInspect nearby plants',
    imageUrl: pottingImage,
    featured: true,
    sortOrder: 207,
    published: true
  },
  {
    plantName: 'Spider Mites',
    slug: 'spider-mites',
    guideType: CareGuideType.PROBLEM,
    category: 'Pests',
    difficulty: 'Persistent pest',
    summary:
      'Spider mites are tiny sap-feeding pests that cause stippling, dull foliage and fine webbing, especially in warm dry conditions.',
    symptoms:
      'Fine pale speckling, dusty-looking leaves, webbing at leaf joints, fading color and mites visible as moving dots under magnification.',
    causes:
      'Infested new plants, warm dry air and delayed detection allow populations to grow quickly.',
    treatment:
      'Isolate the plant, rinse foliage thoroughly, remove heavily damaged leaves and apply an appropriately labeled miticide or insecticidal soap with complete coverage and repeated treatment as directed.',
    prevention:
      'Inspect leaf undersides weekly, quarantine new plants, clean dusty foliage and avoid placing susceptible plants in hot dry airflow.',
    tips: 'Many ordinary insecticides do not control mites. Use a product specifically labeled for spider mites and follow the label exactly.',
    checklist:
      'Isolate immediately\nInspect with bright light\nRinse both leaf surfaces\nTreat with a mite-labeled product\nRepeat per label\nCheck all nearby plants',
    imageUrl: foliageImage,
    featured: true,
    sortOrder: 208,
    published: true
  },
  {
    plantName: 'Mealybugs and Scale',
    slug: 'mealybugs-and-scale',
    guideType: CareGuideType.PROBLEM,
    category: 'Pests',
    difficulty: 'Persistent pest',
    summary:
      'Cottony clusters or fixed brown bumps can signal mealybugs or scale insects hiding along stems, leaf joints and roots.',
    symptoms:
      'White cottony material, sticky honeydew, sooty residue, brown shell-like bumps, yellowing and distorted new growth.',
    causes:
      'New plants are the most common source. Dense growth and hidden leaf joints make early infestations easy to miss.',
    treatment:
      'Isolate, remove visible pests with a cotton swab and rubbing alcohol where plant-safe, rinse, prune severe areas and use a labeled horticultural oil, soap or systemic option as appropriate and legal in your area.',
    prevention:
      'Quarantine new plants, inspect stems and leaf axils, and clean tools between plants.',
    tips: 'Test any spray on a small area first. Repeated inspection is necessary because eggs and hidden pests can survive one treatment.',
    checklist:
      'Isolate the plant\nInspect stems and leaf joints\nRemove visible pests\nApply a labeled treatment\nRepeat on schedule\nCheck roots if pests return',
    imageUrl: foliageImage,
    sortOrder: 209,
    published: true
  },
  {
    plantName: 'Mold, Mushrooms or Algae on Potting Soil',
    slug: 'mold-mushrooms-algae-on-soil',
    guideType: CareGuideType.PROBLEM,
    category: 'Soil problems',
    difficulty: 'Usually manageable',
    summary:
      'Surface mold, algae or mushrooms usually indicate moisture and organic matter; the more important question is whether the roots are also staying too wet.',
    symptoms:
      'White fuzzy growth, green film, mushrooms, musty odor or a crust on the soil surface.',
    causes:
      'Wet soil, low airflow, decomposing organic material, contaminated tools or mineral and fertilizer deposits.',
    treatment:
      'Remove surface growth and debris, improve airflow, let the mix dry appropriately and repot if the soil is dense, sour-smelling or roots are unhealthy.',
    prevention:
      'Use clean pots and tools, avoid standing water, provide airflow and do not add household food scraps to indoor pots.',
    tips: 'Many surface fungi are not directly harmful, but they can be a useful warning that the pot stays moist longer than expected.',
    checklist:
      'Check soil depth\nSmell the root zone\nRemove surface growth\nImprove airflow\nReduce unnecessary moisture\nInspect roots if the plant is declining',
    imageUrl: pottingImage,
    sortOrder: 210,
    published: true
  },

  {
    plantName: 'Spring Houseplant Reset',
    slug: 'spring-houseplant-reset',
    guideType: CareGuideType.SEASONAL,
    category: 'Spring',
    difficulty: 'Seasonal checklist',
    summary:
      'Use increasing spring light and new growth as a cue to reassess watering, pruning, feeding, repotting and pest prevention.',
    tips: 'Clean leaves and windows, rotate plants, prune weak growth, inspect roots before repotting and restart fertilizer gradually only when active growth is visible.',
    prevention:
      'Quarantine new spring purchases and inspect the entire collection before moving plants closer together.',
    checklist:
      'Inspect for pests\nClean leaves and windows\nAdjust watering gradually\nPrune weak growth\nRepot only when needed\nRestart fertilizer lightly\nRefresh sticky traps',
    imageUrl: gardenImage,
    sortOrder: 301,
    published: true
  },
  {
    plantName: 'Summer Heat and Vacation Care',
    slug: 'summer-heat-vacation-care',
    guideType: CareGuideType.SEASONAL,
    category: 'Summer',
    difficulty: 'Seasonal checklist',
    summary:
      'Prepare plants for faster drying, stronger sun, air-conditioning and time away without overwatering before a trip.',
    tips: 'Move sensitive plants back from intense glass, water normally before leaving, group compatible plants, close sheer curtains and test any self-watering setup before the trip.',
    symptoms:
      'Rapid drying, sun scorch, collapsed leaves, hot root zones or cold damage from air-conditioning.',
    prevention:
      'Do not leave pots standing in deep water. Ask a helper to check only the plants that truly need attention and leave written instructions.',
    checklist:
      'Check afternoon sun\nMove plants from hot glass\nWater normally before travel\nGroup by moisture needs\nTest watering devices early\nLeave clear instructions\nKeep away from direct AC',
    imageUrl: gardenImage,
    sortOrder: 302,
    published: true
  },
  {
    plantName: 'Fall Transition for Indoor Plants',
    slug: 'fall-houseplant-transition',
    guideType: CareGuideType.SEASONAL,
    category: 'Fall',
    difficulty: 'Seasonal checklist',
    summary:
      'As days shorten, help plants adjust by reducing fertilizer, spacing watering farther apart and inspecting anything moving indoors.',
    tips: 'Wash and quarantine outdoor plants before bringing them inside. Increase indoor light where possible and avoid abrupt exposure to heating vents.',
    prevention:
      'Treat confirmed pests before plants rejoin the indoor collection and clean saucers, pots and leaf debris.',
    checklist:
      'Inspect outdoor plants closely\nQuarantine indoors\nClean pots and foliage\nIncrease available light\nReduce fertilizer\nReassess watering intervals\nMove away from heating vents',
    imageUrl: foliageImage,
    sortOrder: 303,
    published: true
  },
  {
    plantName: 'Winter Houseplant Care',
    slug: 'winter-houseplant-care',
    guideType: CareGuideType.SEASONAL,
    category: 'Winter',
    difficulty: 'Seasonal checklist',
    summary:
      'Lower light and slower growth usually mean less frequent watering, little fertilizer and extra attention to cold glass and dry heated air.',
    tips: 'Move plants to the brightest appropriate location, wipe leaves, rotate regularly and check soil more deeply before watering. Use a grow light when natural light is insufficient.',
    symptoms:
      'Slow growth, lower leaf drop, stretching, cold damage, crispy edges or soil that stays wet much longer than it did in summer.',
    prevention:
      'Keep foliage from touching cold windows, avoid placing plants directly over heat vents and pause routine feeding unless the plant is actively growing under strong light.',
    checklist:
      'Maximize safe light\nWater less often\nPause or reduce fertilizer\nProtect from cold windows\nAvoid direct heat vents\nMonitor humidity and pests\nUse grow lights when needed',
    imageUrl: houseplantImage,
    featured: true,
    sortOrder: 304,
    published: true
  },
  /**
   * Guides for the plants a starter kit is built around, and the shortlists a
   * first-time buyer arrives searching for. These are the entries that give the
   * carnivorous, terrarium and succulent sets something to point at, and the
   * beginner shelf something to hold.
   */
  {
    plantName: 'Venus Flytrap',
    slug: 'venus-flytrap-care',
    guideType: CareGuideType.PLANT,
    category: 'Carnivorous plants',
    difficulty: 'Particular, but not difficult',
    botanical: 'Dionaea muscipula',
    summary:
      'A bog plant from one small corner of the Carolinas. Give it sun, rainwater and a nutrient-free mix and it is straightforward; treat it like a houseplant and it will not last the season.',
    light:
      'As much direct sun as you can give it — four hours minimum, all day if possible. A windowsill flytrap is usually a starving one.',
    water:
      'Stand the pot in an inch of rain, distilled or reverse-osmosis water. Tap water and softened water build up minerals that kill it over a few months.',
    humidity:
      'Not fussy. A sunny windowsill is fine; a sealed terrarium is not, because it cuts the light and holds the winter warmth it needs to lose.',
    soil: 'Nutrient-free only: long-fibered sphagnum with perlite or horticultural sand. Never potting soil, never compost.',
    feeding:
      'Nothing at the roots, ever. Fertilizer burns them. Outdoors it catches its own; indoors, one small insect on one trap every few weeks is plenty.',
    temperature:
      '70–95°F in summer. It needs a cold winter rest at 35–50°F for about three months — a garage or an unheated porch does it.',
    petSafety:
      'Not toxic. The traps cannot hurt a curious pet, though a pet can certainly hurt the traps.',
    tips: 'Do not set the traps off for fun. Each one closes a handful of times in its life and every wasted closure costs the plant energy it has to make back in the sun.',
    symptoms:
      'Traps blackening one after another, traps that no longer close, pale floppy leaves, or a plant that never colours up red inside.',
    causes:
      'Blackening from mineral build-up is the usual culprit, and comes from tap water. Weak floppy growth and no red colour mean not enough sun. Individual traps blackening after catching something is normal ageing.',
    treatment:
      'Switch to rain or distilled water immediately and flush the pot through several times. Move it into full sun over a week or two rather than all at once. Trim dead traps at the leaf, not at the crown.',
    prevention:
      'Rainwater, full sun, nutrient-free mix, and a genuine cold winter rest. Get those four right and there is very little else to do.',
    checklist:
      'Full sun, not a bright windowsill\nRain or distilled water only\nNutrient-free sphagnum mix\nNo fertilizer at the roots\nCold rest in winter\nLeave the traps alone',
    imageUrl: gardenImage,
    featured: true,
    sortOrder: 15,
    published: true
  },
  {
    plantName: 'Air Plants',
    slug: 'air-plant-care',
    guideType: CareGuideType.PLANT,
    category: 'Air plants',
    difficulty: 'Easy once the watering clicks',
    botanical: 'Tillandsia spp.',
    summary:
      'No soil at all. Everything an air plant needs comes in through its leaves, which is why the whole of its care is about how it gets wet and how fast it dries.',
    light:
      'Bright indirect light, or gentle morning sun. The silvery-leaved kinds take more sun than the soft green ones.',
    water:
      'Soak in room-temperature water for 20–30 minutes every week or two, then shake it out and lay it upside down somewhere airy until it is dry to the touch. Misting alone is not enough for most of them.',
    humidity:
      'Whatever your house is. Airflow matters more — a plant that sits wet in a closed vessel rots at the base.',
    soil: 'None. Never pot one, and never let the base sit in water or on wet moss.',
    feeding:
      'A very dilute bromeliad or air-plant fertilizer in the soak water, once a month at most.',
    temperature: '50–90°F. Keep away from heat vents, which dry them out between soaks.',
    petSafety: 'Not toxic, though small ones are exactly the size a cat will bat off a shelf.',
    tips: 'Dry it upside down. Water caught in the centre of the rosette is the single most common way an air plant is lost, and turning it over for an hour solves it.',
    symptoms:
      'Leaves curling inward and going crisp, a base that pulls apart or smells sour, or brown papery tips.',
    causes:
      'Curling and crisping is thirst. A soft collapsing base is rot from water sitting in the centre. Brown tips usually follow dry air with too long between soaks.',
    treatment:
      'For a thirsty plant, soak for a few hours rather than 20 minutes. For a rotting base there is no rescue — save any healthy offsets and start again.',
    prevention:
      'Soak, shake, dry upside down. Keep it out of a closed container unless that container is genuinely open to the air.',
    checklist:
      'Bright indirect light\nSoak weekly, not mist\nShake the water out\nDry upside down\nNever pot in soil',
    imageUrl: foliageImage,
    sortOrder: 16,
    published: true
  },
  {
    plantName: 'Beginner-Friendly Houseplants',
    slug: 'beginner-friendly-houseplants',
    guideType: CareGuideType.BEGINNER,
    category: 'Where to start',
    difficulty: 'Start here',
    summary:
      'If you have killed a plant or two, the plant was probably not the problem. These are the ones that forgive an irregular watering can and a room that is darker than you thought.',
    light: '',
    water: '',
    humidity: '',
    soil: '',
    feeding: '',
    temperature: '',
    tips: 'Buy one plant, not four. Four plants means four different sets of needs learned at once, and the usual result is that all four get watered on the same day whether they wanted it or not. Start with a pothos, a snake plant or a ZZ plant, put it somewhere you walk past every day, and get one plant’s habits into your hands before adding the next.',
    treatment:
      'Golden pothos — trails, roots in a glass of water, and tells you it is thirsty by drooping before it comes to any harm.\nSnake plant — genuinely happy in a dim corner and genuinely happier if you forget it for a month.\nZZ plant — the closest thing to a plastic plant that is alive.\nSpider plant — fast, forgiving, and makes babies you can give away.\nHeartleaf philodendron — a pothos that puts up with even less light.',
    prevention:
      'The two mistakes that account for most first plants: watering on a schedule instead of on the soil, and putting a plant somewhere it looks good rather than somewhere it can see the sky. Check the soil with a finger, and move the plant towards the window before you change anything else.',
    checklist:
      'Buy one, not four\nPut it where you walk past it\nCheck the soil, not the calendar\nMove it towards the light\nWait a month before repotting',
    imageUrl: houseplantImage,
    featured: true,
    sortOrder: 109,
    published: true
  },
  {
    plantName: 'Best Houseplants for Low Light',
    slug: 'best-houseplants-for-low-light',
    guideType: CareGuideType.GENERAL,
    category: 'Choosing a plant',
    difficulty: 'Good to know',
    summary:
      'No houseplant grows in the dark. What these tolerate is a north window, a room a few feet back from the glass, or an office nobody opens the blinds in.',
    light: '',
    water: '',
    humidity: '',
    soil: '',
    feeding: '',
    temperature: '',
    tips: 'Hold your hand a foot above the spot at midday. A soft-edged shadow is low light and workable; no shadow at all is a corner that wants a lamp rather than a plant. The honest shortlist is snake plant, ZZ plant, pothos, heartleaf philodendron, Chinese evergreen and peace lily — in that order, from most forgiving down.',
    treatment:
      'Water less in low light, not more. A plant in a dim corner uses a fraction of the water it would in a window, and the soil that took four days to dry by the glass may take three weeks in the corner. Almost every "low light killed my plant" is actually rot.',
    prevention:
      'Wipe the leaves. Dust on a plant in bright light is cosmetic; dust on a plant in low light is taking a share of the little it gets. And turn the pot a quarter turn whenever you water, or it will lean.',
    checklist:
      'Test the shadow at midday\nChoose from the shortlist\nWater far less than you would in a window\nWipe the leaves\nTurn the pot as you water',
    imageUrl: foliageImage,
    sortOrder: 110,
    published: true
  },
  {
    plantName: 'Pet-Safe Houseplants',
    slug: 'pet-safe-houseplants',
    guideType: CareGuideType.GENERAL,
    category: 'Homes with pets',
    difficulty: 'Good to know',
    summary:
      'A shortlist for a house with a cat that chews. Every plant profile in this library carries its own pet-safety note; this is the version for deciding what to buy in the first place.',
    light: '',
    water: '',
    humidity: '',
    soil: '',
    feeding: '',
    temperature: '',
    tips: 'Generally considered non-toxic: spider plant, parlour palm, calathea and prayer plants, Boston fern, African violet, most true palms and air plants. Best kept out of reach in a chewing household: pothos, philodendron, monstera, peace lily, ZZ plant, snake plant, aloe and dieffenbachia — most of these carry calcium oxalates, which are painful rather than usually dangerous, but painful is reason enough.',
    treatment:
      'If a pet has chewed something, the useful information is what the plant actually is, not what the tag said. Take a photo of the plant and call your veterinarian or the ASPCA poison line — do not wait to see whether symptoms develop.',
    prevention:
      '"Non-toxic" is not the same as "will survive a cat". A spider plant is safe and also irresistible; height and a closed door do more for both of you than the shortlist does. Any plant is worth keeping off the floor in a house with a puppy.',
    checklist:
      'Check the plant’s own profile before you buy\nPut chewable favourites out of reach\nKnow the plant’s real name for the vet\nHeight beats hope',
    imageUrl: houseplantImage,
    sortOrder: 111,
    published: true
  },
  {
    plantName: 'Carnivorous Plant Care',
    slug: 'carnivorous-plant-care',
    guideType: CareGuideType.GENERAL,
    category: 'Carnivorous plants',
    difficulty: 'Particular, but not difficult',
    summary:
      'Flytraps, pitcher plants and sundews all come from nutrient-poor bogs, and every rule that follows comes from that one fact. They are not difficult plants. They are plants with a completely different set of rules.',
    light: '',
    water: '',
    humidity: '',
    soil: '',
    feeding: '',
    temperature: '',
    tips: 'Four rules cover almost all of it. Full sun, not a bright room. Rain or distilled water, never tap. Nutrient-free mix — sphagnum and perlite, never potting soil. No fertilizer at the roots, ever. A plant that is losing traps is nearly always failing one of those four, and it is usually the water.',
    treatment:
      'Sit the pot in a saucer with an inch of water in it and top the saucer up rather than watering from above. Bog plants like wet feet, which is the opposite of everything else in this library. In winter, temperate kinds — flytraps, Sarracenia, many sundews — need a genuine cold rest of about three months, and skipping it is what exhausts a plant over two or three years rather than killing it outright.',
    prevention:
      'Do not feed a carnivorous plant hamburger, and do not fertilize the pot. Indoors, an insect on a trap every few weeks is more than enough; outdoors, it will do its own hunting and do it better than you can.',
    checklist:
      'Full sun\nRain or distilled water only\nSphagnum and perlite, no soil\nNo root fertilizer\nStand the pot in water\nCold rest in winter',
    imageUrl: gardenImage,
    featured: true,
    sortOrder: 112,
    published: true
  },
  {
    plantName: 'Terrarium Care',
    slug: 'terrarium-care',
    guideType: CareGuideType.GENERAL,
    category: 'Terrariums',
    difficulty: 'Easy once it settles',
    summary:
      'A closed terrarium is a small weather system. Built properly it waters itself for months at a time — and the most common way to ruin one is to keep helping it.',
    light: '',
    water: '',
    humidity: '',
    soil: '',
    feeding: '',
    temperature: '',
    tips: 'Build it in layers from the bottom: pea gravel or leca for drainage, a spoonful of horticultural charcoal to keep it sweet, then a few inches of substrate, then moss, then the plants. Bright indirect light only — a closed glass container in direct sun cooks in an afternoon.',
    treatment:
      'Read the glass. Light misting on the inside in the morning that clears by midday is exactly right. Water running down the inside means too much moisture: leave the lid off for a day or two. Completely clear glass for several days means it is too dry, and a light misting — not a pour — is the fix.',
    prevention:
      'Use small, slow, humidity-loving plants: fittonia, moss, small ferns, peperomia, baby tears. Succulents and cacti do not belong in a closed terrarium, whatever the photograph on the internet showed. Prune anything touching the glass, and take out a leaf the moment it goes brown, before it turns to mould.',
    checklist:
      'Drainage layer, charcoal, substrate, moss, plants\nBright indirect light only\nRead the condensation, not the calendar\nNo succulents in a closed jar\nPrune anything touching the glass',
    imageUrl: pottingImage,
    featured: true,
    sortOrder: 113,
    published: true
  },
  {
    plantName: 'Water Requirements for Carnivorous Plants',
    slug: 'water-requirements-carnivorous-plants',
    guideType: CareGuideType.PROBLEM,
    category: 'Carnivorous plants',
    difficulty: 'Common issue',
    summary:
      'The single most common way a healthy flytrap or pitcher plant is lost, and it takes two or three months to show. It is the water.',
    light: '',
    water: '',
    humidity: '',
    soil: '',
    feeding: '',
    temperature: '',
    symptoms:
      'Traps or pitchers blackening one after another over several weeks. New growth smaller than the last. A white crust on the surface of the mix or around the rim of the pot. A plant that was thriving on the shelf at the nursery and has slowly gone downhill at home.',
    causes:
      'Tap water carries dissolved minerals — often 100–300 parts per million. Carnivorous plants evolved in bogs where that figure is close to zero, and they have no way to shed what builds up in the mix. Softened water is worse, not better: it swaps calcium for sodium, which they tolerate even less.',
    treatment:
      'Switch to rainwater, distilled water or reverse-osmosis water today. Flush the pot through several times with it to wash out what has accumulated, then go back to standing the pot in a saucer. If the crust is heavy, repot into fresh nutrient-free mix and flush again. Recovery is measured in months, not days — new growth is the thing to watch, not the old traps.',
    prevention:
      'A rain barrel under a downspout costs nothing and solves it permanently. Failing that, distilled water from the supermarket is a few dollars a gallon and a gallon lasts a small collection weeks. Bottled spring water is not a substitute — it is mineral water by definition.',
    tips: 'If you are unsure, a cheap TDS meter tells you in a second. Under 50 ppm is fine; over 100 is what has been killing the plant.',
    checklist:
      'Stop using tap and softened water\nFlush the pot through\nRepot if there is a mineral crust\nWatch new growth for recovery\nCollect rainwater if you can',
    imageUrl: gardenImage,
    sortOrder: 211,
    published: true
  },
  {
    plantName: 'Succulent Watering',
    slug: 'succulent-watering',
    guideType: CareGuideType.PROBLEM,
    category: 'Succulents',
    difficulty: 'Common issue',
    summary:
      'Almost every succulent that dies indoors dies of kindness. The plant is built to survive drought; it has no defence at all against a pot that stays damp.',
    light: '',
    water: '',
    humidity: '',
    soil: '',
    feeding: '',
    temperature: '',
    symptoms:
      'Lower leaves going soft, translucent and yellow. A stem that has gone brown and mushy at soil level. Leaves dropping at a touch. Or the opposite: leaves thin, wrinkled and curling inward.',
    causes:
      'Soft and translucent is too much water, and it is far more common than the alternative. Thin and wrinkled is genuine thirst, and a succulent will sit in that state for weeks without harm. The trap is that both can look like "something is wrong, I should water it".',
    treatment:
      'Soak the pot thoroughly until water runs from the bottom, then do not touch it again until the mix is dry all the way through — often two to four weeks indoors, longer in winter. For a rotted stem, cut back into clean firm tissue, let the cut callus over for several days, and replant dry.',
    prevention:
      'A gritty cactus mix, a pot with a hole in it, and a pot only slightly larger than the plant. A big pot holds a big volume of wet soil around a small root system, which is the same problem in a different shape. Terracotta helps for the same reason.',
    tips: 'Judge by weight. Lift the pot after a thorough soak and again a fortnight later; the difference is unmistakable, and it is a far better instrument than a finger or a calendar.',
    checklist:
      'Soak thoroughly, then wait for bone dry\nGritty mix, drainage hole, snug pot\nSoft leaves mean too much water\nWrinkled leaves are safe to leave a while\nWater far less in winter',
    imageUrl: gardenImage,
    sortOrder: 212,
    published: true
  }
] satisfies Prisma.CareSheetUncheckedCreateInput[];

/**
 * Re-exported from `lib/care-guides.ts`, which is now the one place these labels
 * are written. Kept here so existing imports keep working without dragging the
 * whole starter library into every page that only wanted a word.
 */
export { careGuideTypeLabel } from './care-guides.ts';
