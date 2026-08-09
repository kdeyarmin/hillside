import {NextResponse} from 'next/server';
import Stripe from 'stripe';
import {db} from '@/lib/db';

export const runtime='nodejs';
export async function POST(req:Request){
 try{
  if(!process.env.STRIPE_SECRET_KEY) return NextResponse.json({error:'Stripe is not configured yet.'},{status:503});
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  const body=await req.json();
  const requested=(Array.isArray(body.items)?body.items:[]).map((x:{id:string;quantity:number})=>({id:String(x.id),q:Math.max(1,Math.min(20,Number(x.quantity)||1))}));
  const products=await db.product.findMany({where:{active:true,slug:{in:requested.map(i=>i.id)}}});
  const items=requested.flatMap(i=>{const p=products.find(v=>v.slug===i.id);if(!p||p.inventory<=0)return[];return[{p,q:Math.min(i.q,p.inventory)}]});
  if(!items.length) return NextResponse.json({error:'Your cart is empty or the selected items are sold out.'},{status:400});
  const invoiceNumber=`HG-${Date.now().toString().slice(-8)}`;
  const site=process.env.NEXT_PUBLIC_SITE_URL||new URL(req.url).origin;
  const session=await stripe.checkout.sessions.create({
   mode:'payment',
   line_items:items.map(({p,q})=>({quantity:q,price_data:{currency:'usd',unit_amount:p.priceCents,product_data:{name:p.name,description:p.description||undefined}}})),
   success_url:`${site}/order/success?session_id={CHECKOUT_SESSION_ID}`,
   cancel_url:`${site}/shop`,
   billing_address_collection:'auto',
   shipping_address_collection:{allowed_countries:['US']},
   phone_number_collection:{enabled:true},
   invoice_creation:{enabled:true},
   metadata:{invoiceNumber,items:JSON.stringify(items.map(({p,q})=>({id:p.slug,q})))},
   allow_promotion_codes:true
  });
  return NextResponse.json({url:session.url});
 }catch(e){console.error(e);return NextResponse.json({error:'Unable to start checkout.'},{status:500})}
}
