# Plant care library

The Hillside Gardens includes a searchable education center for plant profiles, general care lessons, common plant problems and seasonal checklists.

## Starter library

The starter content includes:

- 14 common houseplant profiles
- 8 core care lessons
- 10 common-problem and pest guides
- 4 seasonal care checklists

The data is stored in `lib/care-seed-data.ts`. Loading it uses Prisma upserts by slug, so it creates missing starter guides and refreshes matching starter guides without deleting Tammy’s additional custom content.

### Load from the owner dashboard

1. Sign in at `/admin`.
2. Open `/admin/care`.
3. Select **Load / refresh starter guides**.

### Load from Railway or a local terminal

To load only the plant care library:

```bash
npm run db:seed:care
```

To run the normal ecommerce starter seed and then the full plant care seed:

```bash
npm run db:seed
```

## Guide types

- **Plant profile** — light, watering, humidity, soil, feeding, temperature, pet safety and plant-specific troubleshooting.
- **Plant care basics** — educational topics such as watering, light, repotting, fertilizer and propagation.
- **Common issue** — symptoms, likely causes, immediate treatment, prevention and a diagnostic checklist.
- **Seasonal care** — practical spring, summer, fall and winter checklists.

## Care manager

Guides are edited in one place: `/admin/care`. The website content manager at
`/admin/content#care` lists every sheet and can unpublish one, but it no longer
has a second, narrower form — that stub could publish a hollow plant profile
and hide the diagnostic fields the public page actually shows.

The dedicated manager at `/admin/care` allows Tammy to:

- Create and edit all four guide types
- Publish or move a guide to draft
- Feature important guides
- Organize guides by category and display order
- Add plant-specific requirements
- Add symptoms, likely causes, treatments and prevention
- Add one-item-per-line checklists
- Load or refresh the complete starter library

## Public library

The public page at `/care` provides:

- Search across plants, symptoms, categories and guidance
- Filters for plant profiles, care basics, common issues and seasonal care
- A quick-start section for watering, light, soil and yellow leaves
- A symptom-based Plant Doctor section
- Guide-specific detail layouts
- Printable individual guides
- Related-guide recommendations

## Launch checklist

After the code deploys and Railway applies the Prisma schema:

1. Open `/admin/care` and load the starter library.
2. Review the tone and adjust any guidance Tammy wants to personalize.
3. Replace stock photographs with Tammy’s preferred photographs when available.
4. Verify pet-safety language against the exact plant variety being sold.
5. Test search and filters on a phone.
6. Print one plant profile and one problem guide.
7. Confirm the guide URLs appear in `/sitemap.xml`.
