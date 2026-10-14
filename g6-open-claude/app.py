import os, time, uuid
from typing import Any
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

app = FastAPI(title="G6 Open Claude", version="0.1.0")
AUDIT=[]
APPROVALS={}

PROTECTED=("payment","refund","publish","contract","delete","security","credential","docusign")

class Command(BaseModel):
    text:str
    context:dict[str,Any]={}

class Approval(BaseModel):
    approval_token:str


def classify(text:str):
    low=text.lower()
    protected=any(x in low for x in PROTECTED)
    return {"tier":3 if protected else 1,"protected":protected}

async def make_call(payload:dict):
    url=os.getenv("MAKE_COMMAND_WEBHOOK_URL","").strip()
    if not url:
        return {"status":"adapter_ready","message":"Make command webhook is not configured yet."}
    async with httpx.AsyncClient(timeout=30) as client:
        r=await client.post(url,json=payload)
        r.raise_for_status()
        try:return r.json()
        except:return {"status":"ok","response":r.text[:2000]}

@app.get("/api/health")
def health():
    return {"ok":True,"agent":"G6 Open Claude","make":bool(os.getenv("MAKE_COMMAND_WEBHOOK_URL")),"approvals":len(APPROVALS)}

@app.get("/api/tools")
def tools():
    return {"tools":["make:g6","whatsapp","calendly","crm","docusign","stripe","onboarding","marketing"],"mode":"existing G6 scenarios first"}

@app.post("/api/command")
async def command(c:Command):
    policy=classify(c.text)
    event={"id":str(uuid.uuid4()),"at":time.time(),"command":c.text,"policy":policy}
    if policy["protected"]:
        token=str(uuid.uuid4())
        APPROVALS[token]={**event,"status":"pending"}
        AUDIT.append({**event,"status":"approval_required"})
        return {"status":"approval_required","approval_token":token,"action":c.text,"message":"Exact approval required for this protected action."}
    result=await make_call({"command":c.text,"context":c.context,"source":"g6-open-claude"})
    AUDIT.append({**event,"status":"executed","result":result})
    return {"status":"executed","result":result}

@app.post("/api/approvals/{token}/approve")
async def approve(token:str,a:Approval):
    item=APPROVALS.get(token)
    if not item or a.approval_token!=token: raise HTTPException(404,"Approval not found")
    result=await make_call({"command":item["command"],"approved_action":item["command"],"approval_token":token,"source":"g6-open-claude"})
    item["status"]="approved_executed"; item["result"]=result
    AUDIT.append(item.copy())
    return item

@app.post("/api/approvals/{token}/reject")
def reject(token:str):
    item=APPROVALS.get(token)
    if not item: raise HTTPException(404,"Approval not found")
    item["status"]="rejected"; AUDIT.append(item.copy()); return item

@app.get("/api/approvals")
def approvals(): return list(APPROVALS.values())[-50:]
@app.get("/api/audit")
def audit(): return AUDIT[-100:]

@app.get("/",response_class=HTMLResponse)
def home():
    return '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>G6 Open Claude</title><style>body{margin:0;background:#07090d;color:#eef2f7;font:16px system-ui}main{max-width:900px;margin:auto;padding:28px}.card{background:#111722;border:1px solid #263246;border-radius:18px;padding:22px;margin:16px 0}h1{font-size:32px}.green{color:#5ee6a8}textarea{width:100%;min-height:110px;box-sizing:border-box;background:#090d14;color:white;border:1px solid #33435d;border-radius:12px;padding:14px;font-size:16px}button{background:#e9eef7;color:#111827;border:0;border-radius:10px;padding:12px 16px;margin:8px 8px 0 0;font-weight:700}button.primary{background:#5ee6a8}pre{white-space:pre-wrap;word-break:break-word;color:#b9c6d8}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#5ee6a8;margin-right:8px}</style></head><body><main><h1>G6 Open Claude</h1><p><span class="dot"></span><span class="green">Control layer online</span> · Existing G6/Make automation remains the execution backbone.</p><div class="card"><h2>Ask G6</h2><textarea id="q" placeholder="Tell G6 what to do..."></textarea><button class="primary" onclick="go()">Run command</button><button onclick="talk()">🎙 Speak</button><pre id="out">Ready.</pre></div><div class="card"><b>Approval policy</b><p>Read/research and reversible work can run automatically. Payments, publishing, contracts, deletion and security changes require exact approval.</p></div><script>async function go(){let q=document.getElementById('q').value;out.textContent='Working…';let r=await fetch('/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:q,context:{}})});let j=await r.json();out.textContent=JSON.stringify(j,null,2);if(j.status==='approval_required'){let b=document.createElement('button');b.textContent='Approve exact action';b.onclick=async()=>{let x=await fetch('/api/approvals/'+j.approval_token+'/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({approval_token:j.approval_token})});out.textContent=JSON.stringify(await x.json(),null,2)};out.appendChild(b)}}function talk(){let SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){out.textContent='Voice recognition is not supported in this browser.';return}let r=new SR();r.lang='en-AU';r.onresult=e=>{q.value=e.results[0][0].transcript;go()};r.start()}</script></main></body></html>'''
