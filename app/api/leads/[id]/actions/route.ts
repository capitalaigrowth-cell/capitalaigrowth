import {NextRequest,NextResponse} from "next/server";
import {createServiceClient,createSessionClient} from "@/lib/supabase/server";
import {initiateVapiCall} from "@/lib/leads/pipeline";
async function leadForUser(id:string){
 const s=await createSessionClient(); const {data:{user}}=await s.auth.getUser();
 if(!user) return {error:NextResponse.json({error:"Unauthorized"},{status:401})};
 const db=createServiceClient(); const {data,error}=await db.from("leads").select("*").eq("id",id).single();
 if(error||!data)return {error:NextResponse.json({error:"Lead not found"},{status:404})};
 return {lead:data};
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params; const ctx=await leadForUser(id); if(ctx.error)return ctx.error;
 const body=await req.json().catch(()=>({}));
 if(String(body.action||"")!=="call_anna")return NextResponse.json({error:"Unsupported action"},{status:400});
 if(body.consent_to_call!==true)return NextResponse.json({error:"Explicit call consent is required"},{status:400});
 if(!ctx.lead.phone)return NextResponse.json({error:"Lead has no phone number"},{status:400});
 await initiateVapiCall(ctx.lead);
 return NextResponse.json({success:true,status:"Call initiated"});
}