'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {ProductType} from '@prisma/client';
import {db} from '@/lib/db';
import {clearAdminSession,isAdmin,setAdminSession} from '@/lib/admin';

export async function loginAdmin(formData:FormData){const password=String(formData.get('password')||'');if(!process.env.ADMIN_PASSWORD||password!==process.env.ADMIN_PASSWORD)redirect('/admin?error=1');await setAdminSession();redirect('/admin')}
export async function logoutAdmin(){await clearAdminSession();redirect('/admin')}
export async function saveProduct(formData:FormData){if(!await isAdmin())redirect('/admin');const id=String(formData.get('id')||'');const name=String(formData.get('name')||'').trim();const slug=String(formData.get('slug')||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');const description=String(formData.get('description')||'').trim();const priceCents=Math.round(Number(formData.get('price')||0)*100);const inventory=Math.max(0,Number(formData.get('inventory')||0));const type=String(formData.get('type')||'OTHER') as ProductType;const imageUrl=String(formData.get('imageUrl')||'').trim()||null;if(!name||!slug||priceCents<0)return;const data={name,slug,description,priceCents,inventory,type,imageUrl,active:true};if(id)await db.product.update({where:{id},data});else await db.product.create({data});revalidatePath('/admin');revalidatePath('/shop')}
export async function updateOrder(formData:FormData){if(!await isAdmin())redirect('/admin');const id=String(formData.get('id')||'');const trackingNumber=String(formData.get('trackingNumber')||'').trim()||null;const fulfilled=String(formData.get('fulfilled')||'')==='yes';await db.order.update({where:{id},data:{trackingNumber,status:fulfilled?'FULFILLED':'PAID'}});revalidatePath('/admin')}
