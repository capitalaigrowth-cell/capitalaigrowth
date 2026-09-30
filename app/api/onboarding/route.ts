import {NextRequest,NextResponse} from "next/server";
import {createSessionClient} from "@/lib/supabase/server";

async function authorised(){
 const s=await createSessionClient(); const {data:{user}}=await s.auth.getUser(); return !!user;
}
export async function GET(req:NextRequest){
 if(!await authorised())return NextResponse.json({error:"Unauthorized"},{status:401});
 const hook=process.env.MAKE_G6_MASTER_WEBHOOK; if(!hook)return NextResponse.json({error:"Master G6 route not configured"},{status:503});
 const q=req.nextUrl.searchParams; const deal=q.get("deal_id"); if(!deal)return NextResponse.json({error:"Zoho Deal ID required"},{status:400});
 const u=new URL(hook); u.searchParams.set("view","onboarding"); u.searchParams.set("deal_id",deal);
 for(const k of ["invoice_id","first_name","last_name","email","phone"]){const v=q.get(k);if(v)u.searchParams.set(k,v)}
 const r=await fetch(u,{cache:"no-store"}); if(!r.ok)return NextResponse.json({error:"Onboarding form unavailable"},{status:502});
 let html=await r.text(); html=html.replace(/action="https:\/\/hook\.eu1\.make\.com\/[^"]+"/g,'action="/api/onboarding"');
 return new NextResponse(html,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
}
export async function POST(req:NextRequest){
 if(!await authorised())return NextResponse.json({error:"Unauthorized"},{status:401});
 const hook=process.env.MAKE_G6_MASTER_WEBHOOK; if(!hook)return NextResponse.json({error:"Master G6 route not configured"},{status:503});
 const form=await req.formData(); const r=await fetch(hook,{method:"POST",body:form});
 return new NextResponse(await r.text(),{status:r.status,headers:{"Content-Type":r.headers.get("content-type")||"text/html; charset=utf-8","Cache-Control":"no-store"}});
}