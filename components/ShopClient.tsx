'use client';
import {useEffect,useMemo,useState} from 'react';
import {catalog} from '@/lib/catalog';

type Cart=Record<string,number>;
export default function ShopClient(){
 const [cart,setCart]=useState<Cart>({}); const [loading,setLoading]=useState(false);
 useEffect(()=>{try{setCart(JSON.parse(localStorage.getItem('hillside-cart')||'{}'))}catch{}},[]);
 useEffect(()=>{localStorage.setItem('hillside-cart',JSON.stringify(cart))},[cart]);
 const count=Object.values(cart).reduce((a,b)=>a+b,0);
 const total=useMemo(()=>catalog.reduce((sum,p)=>sum+(cart[p.id]||0)*p.price,0),[cart]);
 const add=(id:string)=>setCart(c=>({...c,[id]:(c[id]||0)+1}));
 const checkout=async()=>{setLoading(true);try{const items=Object.entries(cart).map(([id,quantity])=>({id,quantity}));const r=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Checkout failed');location.href=j.url}catch(e){alert(e instanceof Error?e.message:'Checkout failed');setLoading(false)}};
 return <><div className="toolbar"><b>{catalog.length} products</b><div><span className="pill">Cart: {count}</span>{count>0&&<button className="btn" style={{marginLeft:10}} disabled={loading} onClick={checkout}>{loading?'Opening checkout…':`Checkout • $${total.toFixed(2)}`}</button>}</div></div><div className="grid">{catalog.map(p=><article className="card" key={p.id}><img className="photo" src={p.image} alt={p.name}/><div className="cardbody"><span className="pill">{p.type}</span><h3>{p.name}</h3><p>{p.description}</p><p className="price">${p.price.toFixed(2)}</p><button className="btn" onClick={()=>add(p.id)}>Add to cart</button></div></article>)}</div></>
}
