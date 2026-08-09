import {db} from '@/lib/db';
import {isAdmin} from '@/lib/admin';

export const runtime='nodejs';
const q=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
export async function GET(){
 if(!await isAdmin())return new Response('Unauthorized',{status:401});
 const orders=await db.order.findMany({where:{status:{in:['PAID','FULFILLED']}},orderBy:{createdAt:'asc'}});
 const header=['Invoice','Name','Company','Address1','Address2','City','State','PostalCode','Country','Email','Phone','Tracking','Status'];
 const rows=orders.map(o=>[o.invoiceNumber,o.customerName,'The Hillside Gardens',o.address1,o.address2,o.city,o.state,o.postalCode,o.country,o.email,o.phone,o.trackingNumber,o.status]);
 const csv=[header,...rows].map(r=>r.map(q).join(',')).join('\r\n');
 return new Response(csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="hillside-shipping.csv"'}})
}
