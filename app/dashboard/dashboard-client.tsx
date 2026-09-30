"use client";
import {useState} from "react";
import type {Lead} from "@/types";

const systems=[
["Make / Master G6","GREEN","Lead → CRM → Anna → booking → contract → payment → onboarding"],
["Zoho CRM","GREEN","Contacts, pipeline, notes and follow-up"],
["Anna AI / Retell","GREEN","Outbound qualification proven on controlled YIS test"],
["WhatsApp / SMS","AMBER","Connected; post-call follow-up still requires final verification"],
["Calendly + Zoom","AMBER","Connected; genuine end-to-end booking verification pending"],
["DocuSign","GREEN","Connected and contract route configured"],
["Stripe","GREEN","Connected and payment route configured"],
["Systeme.io","GREEN","Nurture and delivery connection available"],
["Marketing G6","BLUE","YouTube connected/tested; Instagram connected; LinkedIn parked"]
];
const prospects=[["Resourceful Recruitment",92],["BLACKROC",90],["Talentpath",87],["ConsultANZ",84],["Majer Recruitment",82]];
const tabs=["Overview","Action Center","Leads & CRM","Client Generation","Marketing","Systems","Revenue"];

export default function DashboardClient({leads,stats}:{leads:Lead[];stats:{leadsThisWeek:number;bookedThisWeek:number;conversionRate:number;totalLeads:number;appUrl:string}}){
 const [tab,setTab]=useState("Overview"); const [selected,setSelected]=useState<Lead|null>(null);
 const [q,setQ]=useState(""); const filtered=leads.filter(l=>(l.name||l.email||l.phone||l.business||"").toLowerCase().includes(q.toLowerCase()));
 return <main className="g6">
  <header className="g6head"><div><b className="logo">G6</b><div><h1>MASTER CONTROL ROOM</h1><p>FIND → TEST → SELL → AUTOMATE → SCALE → REPEAT</p></div></div><div className="live">● LIVE CONTROL</div></header>
  <nav>{tabs.map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</nav>
  <section className="hero"><div><small>NORTH STAR</small><h2>A$1,000,000+ <span>ANNUAL REVENUE</span></h2><p>Target A$83,333/month · Current verified MRR A$0 · Revenue before complexity.</p></div><div className="milestones"><b>$1k</b><i>→</i><b>$5k</b><i>→</i><b>$10k</b><i>→</i><b>$25k</b><i>→</i><b>$50k</b><i>→</i><b>$83k+</b></div></section>
  {tab==="Overview"&&<><div className="stats"><Card k="LIVE LEADS" v={stats.totalLeads}/><Card k="BOOKED THIS WEEK" v={stats.bookedThisWeek}/><Card k="CONVERSION" v={stats.conversionRate+"%"}/><Card k="PILOT MRR" v="A$0"/></div><div className="grid"><Panel title="Revenue Machine"><Flow/></Panel><Panel title="Current Pilot"><p><b>Australian Recruitment & Staffing</b></p><p>Offer: G6 Recruitment Response System</p><p>Price test: A$1,500/month hypothesis</p><div className="gate">OUTSIDE OUTREACH LOCKED</div></Panel></div><Panel title="System Health"><div className="systems">{systems.map(s=><div className="sys" key={s[0]}><b>{s[0]}</b><span className={"pill "+s[1].toLowerCase()}>{s[1]}</span><small>{s[2]}</small></div>)}</div></Panel></>}
  {tab==="Action Center"&&<><Panel title="⚡ G6 Action Center"><p className="muted">Operate the customer journey here. Protected commercial actions remain gated until a real selected lead and required consent/approval exist.</p><div className="formgrid"><select><option>Young & Innovative Solutions</option><option>G6 Recruitment Response System</option><option>Baseline</option></select><input placeholder="Person / lead"/><input placeholder="Company"/><input placeholder="Email"/><input placeholder="Phone"/><select><option>Lead source</option><option>Website</option><option>Facebook</option><option>Referral</option><option>Manual</option></select></div><label className="consent"><input type="checkbox"/> Explicit permission to call with Anna</label><div className="actions"><button disabled>Call with Anna</button><button disabled>Send booking link</button><button disabled>Send contract</button><button disabled>Create payment</button><button disabled>WhatsApp / SMS</button><button disabled>Start onboarding</button></div><p className="warning">Actions are intentionally disabled on the public control surface until the secure production action API and credentials are attached. This prevents accidental real calls, contracts or charges.</p></Panel><Panel title="Journey"><Flow/></Panel></>}
  {tab==="Leads & CRM"&&<Panel title="Leads & CRM"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search live leads..." /><div className="leadlist">{filtered.length?filtered.map(l=><button key={l.id} onClick={()=>setSelected(l)}><b>{l.name||"Unknown"}</b><span>{l.business||l.email||l.phone||"—"}</span><em>{String(l.status).replaceAll("_"," ")}</em></button>):<div className="empty">No connected lead data is available on this deployment yet.</div>}</div>{selected&&<div className="detail"><button onClick={()=>setSelected(null)}>Close</button><h3>{selected.name}</h3><p>{selected.email} · {selected.phone}</p><p>Status: {selected.status}</p></div>}</Panel>}
  {tab==="Client Generation"&&<><div className="grid"><Panel title="Pilot Prospect Queue">{prospects.map(p=><div className="prospect" key={p[0]}><b>{p[0]}</b><span>{p[1]}</span></div>)}</Panel><Panel title="Control Rules"><p>80+ → Priority</p><p>65–79 → Review</p><p>&lt;65 → Park</p><p>Cold research stays out of Anna.</p><p>Engagement + explicit call consent → Master G6.</p><div className="gate">NO REAL PROSPECTS CONTACTED</div></Panel></div></>}
  {tab==="Marketing"&&<><Panel title="Marketing G6"><div className="flow"><b>UPLOAD</b><i>→</i><b>AI CONTENT</b><i>→</i><b>APPROVE</b><i>→</i><b>DISTRIBUTE</b><i>→</i><b>LEADS</b><i>→</i><b>G6</b></div><div className="systems"><div className="sys"><b>YouTube</b><span className="pill green">CONNECTED</span><small>Private upload test verified</small></div><div className="sys"><b>Instagram</b><span className="pill blue">CONNECTED</span><small>Authorization complete; publishing verification remains</small></div><div className="sys"><b>LinkedIn</b><span className="pill amber">PARKED</span><small>Not current priority</small></div></div></Panel></>}
  {tab==="Systems"&&<Panel title="G6 Infrastructure"><div className="systems">{systems.map(s=><div className="sys" key={s[0]}><b>{s[0]}</b><span className={"pill "+s[1].toLowerCase()}>{s[1]}</span><small>{s[2]}</small></div>)}</div></Panel>}
  {tab==="Revenue"&&<><div className="stats"><Card k="1 CLIENT" v="A$1,500"/><Card k="5 CLIENTS" v="A$7,500"/><Card k="10 CLIENTS" v="A$15,000"/><Card k="20 CLIENTS" v="A$30,000"/></div><Panel title="Next Revenue Gate"><h3>Offer/message validation → controlled outreach pilot → first conversation → first paid client</h3><p>The A$1,500/month figure is a test hypothesis, not validated market pricing. The first objective is proof of willingness to pay.</p></Panel></>}
 </main>
}
function Card({k,v}:{k:string,v:string|number}){return <div className="metric"><small>{k}</small><strong>{v}</strong></div>}
function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="panel"><h3>{title}</h3>{children}</section>}
function Flow(){return <div className="flow">{["FIND","QUALIFY","CONSENT","ANNA","BOOK","SELL","PAY","RETAIN"].map((x,i)=><span key={x}><b>{x}</b>{i<7&&<i>→</i>}</span>)}</div>}
