import Stripe from 'stripe';
import {NextResponse} from 'next/server';
import {db} from '@/lib/db';

export const runtime='nodejs';
export async function POST(req:Request){
 const secret=process.env.STRIPE_SECRET_KEY, webhookSecret=process.env.STRIPE_WEBHOOK_SECRET;
 if(!secret||!webhookSecret) return new NextResponse('Stripe not configured',{status:503});
 const stripe=new Stripe(secret); const raw=await req.text(); const signature=req.headers.get('stripe-signature');
 if(!signature) return new NextResponse('Missing signature',{status:400});
 let event:Stripe.Event;
 try{event=stripe.webhooks.constructEvent(raw,signature,webhookSecret)}catch{return new NextResponse('Invalid signature',{status:400})}
 if(event.type==='checkout.session.completed'){
  const session=event.data.object as Stripe.Checkout.Session & Record<string,any>;
  if(session.payment_status==='paid'){
   const existing=await db.order.findUnique({where:{stripeSessionId:session.id}}); if(existing) return NextResponse.json({received:true});
   let requested:{id:string;q:number}[]=[]; try{requested=JSON.parse(session.metadata?.items||'[]')}catch{}
   const dbProducts=await db.product.findMany({where:{slug:{in:requested.map(i=>i.id)}}});
   const details=(session as any).collected_information?.shipping_details||(session as any).shipping_details||{};
   const addr=details.address||session.customer_details?.address||{};
   const name=details.name||session.customer_details?.name||'Customer'; const email=session.customer_details?.email||session.customer_email||'';
   const lineItems=requested.flatMap(i=>{const p=dbProducts.find(x=>x.slug===i.id);return p?[{productId:p.id,name:p.name,quantity:i.q,unitCents:p.priceCents}]:[]});
   const subtotal=lineItems.reduce((n,i)=>n+i.unitCents*i.quantity,0); const total=session.amount_total??subtotal; const tax=(session.total_details?.amount_tax??0); const shipping=Math.max(0,total-subtotal-tax);
   await db.$transaction(async tx=>{
    await tx.order.create({data:{invoiceNumber:session.metadata?.invoiceNumber||`HG-${Date.now()}`,stripeSessionId:session.id,status:'PAID',customerName:name,email,phone:session.customer_details?.phone,address1:addr.line1||'',address2:addr.line2,city:addr.city||'',state:addr.state||'',postalCode:addr.postal_code||'',country:addr.country||'US',subtotalCents:subtotal,shippingCents:shipping,taxCents:tax,totalCents:total,items:{create:lineItems}}});
    for(const i of requested){const p=dbProducts.find(x=>x.slug===i.id);if(p) await tx.product.update({where:{id:p.id},data:{inventory:{decrement:i.q}}})}
   });
  }
 }
 return NextResponse.json({received:true});
}
