import {cookies} from 'next/headers';
import crypto from 'crypto';

const cookieName='hillside-admin';
function token(){const pw=process.env.ADMIN_PASSWORD||'';const secret=process.env.ADMIN_SESSION_SECRET||'';return crypto.createHmac('sha256',secret).update(pw).digest('hex')}
export async function isAdmin(){const jar=await cookies();const value=jar.get(cookieName)?.value||'';const expected=token();if(!value||!expected||value.length!==expected.length)return false;try{return crypto.timingSafeEqual(Buffer.from(value),Buffer.from(expected))}catch{return false}}
export async function setAdminSession(){const jar=await cookies();jar.set(cookieName,token(),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*12})}
export async function clearAdminSession(){const jar=await cookies();jar.delete(cookieName)}
