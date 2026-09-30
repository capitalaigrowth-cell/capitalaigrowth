import {NextResponse} from "next/server";
import {createSessionClient} from "@/lib/supabase/server";

export async function GET(){
 const s=await createSessionClient(); const {data:{user}}=await s.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const present=(...keys:string[])=>keys.every(k=>Boolean(process.env[k]));
 return NextResponse.json({
  checked_at:new Date().toISOString(),
  systems:{
   database:{status:present("NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY")?"configured":"missing"},
   master_g6:{status:present("MAKE_G6_MASTER_WEBHOOK")?"configured":"missing"},
   twilio:{status:present("TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_PHONE_NUMBER")?"configured":"missing"},
   google_calendar:{status:present("GOOGLE_SERVICE_ACCOUNT_EMAIL","GOOGLE_PRIVATE_KEY","GOOGLE_CALENDAR_ID")?"configured":"missing"},
   email:{status:present("RESEND_API_KEY")?"configured":"missing"},
   legacy_vapi:{status:present("VAPI_API_KEY")?"configured_legacy":"unused"}
  }
 },{headers:{"Cache-Control":"no-store"}});
}