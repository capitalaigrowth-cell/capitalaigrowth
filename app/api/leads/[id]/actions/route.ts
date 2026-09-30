import {NextRequest,NextResponse} from "next/server";
import {createServiceClient,createSessionClient} from "@/lib/supabase/server";
import {processBooking} from "@/lib/leads/pipeline";
import {sendSms} from "@/lib/twilio/client";

async function leadForUser(id:string){
 const s=await createSessionClient(); const {data:{user}}=await s.auth.getUser();
 if(!user) return {error:NextResponse.json({error:"Unauthorized"},{status:401})};
 const db=createServiceClient(); const {data,error}=await db.from("leads").select("*").eq("id",id).single();
 if(error||!data)return {error:NextResponse.json({error:"Lead not found"},{status:404})};
 return {lead:data};
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params; const ctx=await leadForUser(id); if(ctx.error)return ctx.error;
 const body=await req.json().catch(()=>({})); const action=String(body.action||"");
 if(action==="call_anna"){
  if(body.consent_to_call!==true)return NextResponse.json({error:"Explicit call consent is required"},{status:400});
  if(!ctx.lead.phone)return NextResponse.json({error:"Lead has no phone number"},{status:400});
  const hook=process.env.MAKE_G6_MASTER_WEBHOOK;
  if(!hook)return NextResponse.json({error:"Master G6 call route is not configured"},{status:503});
  const upstream=await fetch(hook,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
   flow:"new_lead",name:ctx.lead.name||"New YIS Lead",email:ctx.lead.email,phone:ctx.lead.phone,
   company:ctx.lead.business||"",source:"G6 Master Control Room",offer:"G6",language:"English",consent_to_call:true
  })});
  if(!upstream.ok)return NextResponse.json({error:"Master G6 rejected the call request"},{status:502});
  return NextResponse.json({success:true,status:"Anna call initiated via Retell / Master G6"});
 }
 if(action==="sms"){
  if(body.confirm!==true)return NextResponse.json({error:"Confirmation required before sending"},{status:400});
  if(!ctx.lead.phone)return NextResponse.json({error:"Lead has no phone number"},{status:400});
  const message=String(body.message||"").trim(); if(!message)return NextResponse.json({error:"Message required"},{status:400});
  const sid=await sendSms({to:ctx.lead.phone,body:message,lead_id:id});
  return NextResponse.json({success:true,status:"SMS sent",sid});
 }
 if(action==="book"){
  if(body.confirm!==true)return NextResponse.json({error:"Confirmation required before booking"},{status:400});
  const slot=String(body.slot_iso||"").trim(); if(!slot)return NextResponse.json({error:"Booking time required"},{status:400});
  await processBooking({lead:ctx.lead,slot_iso:slot});
  return NextResponse.json({success:true,status:"Booking created",booking_time:slot});
 }
 return NextResponse.json({error:"Unsupported action"},{status:400});
}