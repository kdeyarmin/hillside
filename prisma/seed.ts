import { PrismaClient, ProductType } from '@prisma/client';
const db=new PrismaClient();
async function main(){
 const products=[
 {name:'Monstera Deliciosa',slug:'monstera-deliciosa',description:'A bold, easygoing tropical with iconic split leaves.',type:ProductType.PLANT,priceCents:3800,inventory:8,imageUrl:'https://images.unsplash.com/photo-1614594575810-51b862c2d7b6?auto=format&fit=crop&w=900&q=80',featured:true},
 {name:'Golden Pothos',slug:'golden-pothos',description:'A forgiving trailing plant for shelves and hanging planters.',type:ProductType.PLANT,priceCents:2400,inventory:12,imageUrl:'https://images.unsplash.com/photo-1593691509543-c55fb32e5cee?auto=format&fit=crop&w=900&q=80',featured:true},
 {name:'Hillside Calm Tea',slug:'hillside-calm-tea',description:'A soothing loose-leaf botanical blend for slow evenings.',type:ProductType.TEA,priceCents:1600,inventory:20,imageUrl:'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=80',featured:true},
 {name:'Stainless Tea Infuser',slug:'stainless-tea-infuser',description:'A reusable infuser sized for your favorite mug.',type:ProductType.TEA_SUPPLY,priceCents:1200,inventory:24,imageUrl:'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=80'},
 {name:'Garden Herb Soap',slug:'garden-herb-soap',description:'Small-batch handmade soap with a fresh garden-inspired scent.',type:ProductType.SOAP,priceCents:900,inventory:18,imageUrl:'https://images.unsplash.com/photo-1607006483225-3f4b5308f95d?auto=format&fit=crop&w=900&q=80'},
 {name:'Botanical Hand Lotion',slug:'botanical-hand-lotion',description:'Rich everyday moisture with a light botanical finish.',type:ProductType.LOTION,priceCents:1800,inventory:15,imageUrl:'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=80'}];
 for(const p of products) await db.product.upsert({where:{slug:p.slug},update:p,create:p});
 const sheets=[
 ['Monstera Deliciosa','monstera-deliciosa','Monstera deliciosa','Iconic tropical foliage that rewards bright filtered light.','Bright, indirect light','Water when the top 2 inches are dry','Average to high','Airy indoor potting mix','Monthly in spring and summer','65–85°F','Toxic if chewed','Rotate regularly and give mature plants a support pole.'],
 ['Golden Pothos','golden-pothos','Epipremnum aureum','A forgiving trailing classic and an excellent beginner plant.','Low to bright indirect light','Let the top 1–2 inches dry','Average','Well-draining houseplant mix','Monthly during active growth','60–85°F','Toxic if chewed','Trim vines just above a node for fuller growth.'],
 ['Snake Plant','snake-plant','Dracaena trifasciata','Architectural, drought-tolerant and very forgiving.','Low to bright indirect light','Let soil dry fully','Average to dry','Fast-draining succulent-style mix','Lightly, spring and summer','60–85°F','Mildly toxic','The biggest risk is too much water.'],
 ['ZZ Plant','zz-plant','Zamioculcas zamiifolia','Glossy foliage and exceptional tolerance for neglect.','Low to bright indirect light','Allow most of pot to dry','Average','Well-draining mix','Every 6–8 weeks in growing season','60–80°F','Toxic if chewed','Use a pot with drainage and resist frequent watering.'],
 ['Peace Lily','peace-lily','Spathiphyllum','Elegant foliage and white blooms with clear thirst signals.','Medium to bright indirect light','Keep lightly moist, never soggy','Prefers higher humidity','Rich but well-draining mix','Monthly spring through summer','65–80°F','Toxic to pets','Filtered water can reduce brown leaf tips.'],
 ['Spider Plant','spider-plant','Chlorophytum comosum','Easy, cheerful foliage with baby plantlets that are simple to propagate.','Medium to bright indirect light','Water when top inch dries','Average','Standard houseplant mix','Monthly spring and summer','60–80°F','Generally non-toxic','Root plantlets in water or directly in moist soil.']
 ];
 for(const s of sheets) await db.careSheet.upsert({where:{slug:s[1]},update:{},create:{plantName:s[0],slug:s[1],botanical:s[2],summary:s[3],light:s[4],water:s[5],humidity:s[6],soil:s[7],feeding:s[8],temperature:s[9],petSafety:s[10],tips:s[11]}});
}
main().finally(()=>db.$disconnect());
