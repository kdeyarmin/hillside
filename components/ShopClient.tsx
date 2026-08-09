'use client';
import {useEffect,useMemo,useState} from 'react';

type Product={id:string;slug:string;name:string;description:string;type:string;priceCents:number;inventory:number;imageUrl:string|null};
type Cart=Record<string,number>;
export default function ShopClient({products}:{products:Product[]}){
 const [cart,setCart]=useState<Cart>({}); const [loading,setLoading]=useState(false);
 useEffect(()=>{try{setCart(JSON.parse(localStorage.getItem('hillside-cart')||'{}'))}catch{}},[]);
 useEffect(()=>{localStorage.setItem('hillside-cart',JSON.stringify(cart))},[cart]);
 const count=Object.values(cart).reduce((a,b)=>a+b,0);
 const total=useMemo(()=>products.reduce((sum,p)=>sum+(cart[p.slug]||0)*(p.priceCents/100),0),[cart,products]);
 const add=(slug:string,inventory:number)=>setCart(c=>({...c,[slug]:Math.min(inventory,(c[slug]||0)+1)}));
 const checkout=async()=>{setLoading(true);try{const items=Object.entries(cart).filter(([,quantity])=>quantity>0).map(([id,quantity])=>({id,quantity}));const r=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Checkout failed');location.href=j.url}catch(e){alert(e instanceof Error?e.message:'Checkout failed');setLoading(false)}};
 return <><div className="toolbar"><b>{products.length} products</b><div><span className="pill">Cart: {count}</span>{count>0&&<button className="btn" style={{marginLeft:10}} disabled={loading} onClick={checkout}>{loading?'Opening checkout…':`Checkout • $${total.toFixed(2)}`}</button>}</div></div><div className="grid">{products.map(p=><article className="card" key={p.id}><img className="photo" src={p.imageUrl||'https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=900&q=80'} alt={p.name}/><div className="cardbody"><span className="pill">{p.type.replace('_',' ')}</span><h3>{p.name}</h3><p>{p.description}</p><p className="price">${(p.priceCents/100).toFixed(2)}</p><p style={{fontSize:13,color:'var(--muted)'}}>{p.inventory>0?`${p.inventory} available`:'Sold out'}</p><button className="btn" disabled={p.inventory<=0} onClick={()=>add(p.slug,p.inventory)}>{p.inventory>0?'Add to cart':'Sold out'}</button></div></article>)}</div></>
}
