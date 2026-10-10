
import json, ssl, urllib.request, urllib.error, threading, os, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import tkinter as tk
from tkinter import ttk, messagebox

TOKEN="/api/hccgw/platform/v1/token/get"
CAMERAS="/api/hccgw/resource/v1/areas/cameras/get"
LIVE="/api/hccgw/video/v1/live/address/get"
SERVER="https://isgp.hikcentralconnect.com"

DEMO=os.path.join(os.environ.get("USERPROFILE",""),"Downloads",
                  "HikConnect_EZUIKit_WASM_Test","demo")
STATE={"streamToken":"","url":"","domain":"https://isgpopen.ezvizlife.com"}

HTML=r"""<!doctype html><html><head><meta charset="utf-8">
<title>Hik-Connect LIVE</title><script src="/ezuikit.js"></script>
<style>html,body{margin:0;background:#111;color:#eee;font:16px Segoe UI}
#s{padding:10px;background:#202428}#video{width:100vw;height:calc(100vh - 45px)}</style>
</head><body><div id="s">Hik-Connect LIVE — <span id="st">...</span></div>
<div id="video"></div><script>
(async()=>{try{
let c=await (await fetch('/config',{cache:'no-store'})).json();
if(c.error) throw Error(c.error);
let p=new EZUIKit.EZUIKitPlayer({
id:'video',accessToken:c.streamToken,url:c.url,template:'pcLive',
width:innerWidth,height:innerHeight-45,staticPath:'/ezuikit_static',
scaleMode:1,language:'en',env:{domain:c.domain},
handleError:e=>{console.error(e);document.getElementById('st').textContent='Player xatosi: '+JSON.stringify(e)}
});
window.p=p;document.getElementById('st').textContent='LIVE';
}catch(e){document.getElementById('st').textContent='XATO: '+e.message}})();
</script></body></html>"""

class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        if self.path in ("/","/player"):
            data=HTML.encode(); self.send_response(200); self.send_header("Content-Type","text/html"); self.end_headers(); self.wfile.write(data); return
        if self.path=="/config":
            data=json.dumps(STATE).encode(); self.send_response(200); self.send_header("Content-Type","application/json"); self.send_header("Cache-Control","no-store"); self.end_headers(); self.wfile.write(data); return
        if self.path=="/ezuikit.js":
            p=os.path.join(DEMO,"ezuikit.js")
            if not os.path.isfile(p): self.send_error(404); return
            self.send_response(200); self.send_header("Content-Type","application/javascript"); self.end_headers()
            self.wfile.write(open(p,"rb").read()); return
        pre="/ezuikit_static/"
        if self.path.startswith(pre):
            root=os.path.abspath(os.path.join(DEMO,"ezuikit_static"))
            p=os.path.abspath(os.path.join(root,self.path[len(pre):].replace("/",os.sep)))
            if not p.startswith(root+os.sep) or not os.path.isfile(p): self.send_error(404); return
            ext=os.path.splitext(p)[1].lower()
            ct={".js":"application/javascript",".wasm":"application/wasm",".css":"text/css",
                ".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml"}.get(ext,"application/octet-stream")
            self.send_response(200); self.send_header("Content-Type",ct); self.end_headers(); self.wfile.write(open(p,"rb").read()); return
        self.send_error(404)

def req(base,path,body,token=None):
    data=json.dumps(body).encode()
    h={"Content-Type":"application/json","Accept":"application/json","User-Agent":"HikTeamLive/1.0"}
    if token: h["Token"]=token
    r=urllib.request.Request(base.rstrip("/")+path,data=data,headers=h,method="POST")
    try:
        with urllib.request.urlopen(r,timeout=30,context=ssl.create_default_context()) as x:
            return x.status,json.loads(x.read().decode("utf-8","replace"))
    except urllib.error.HTTPError as e:
        raw=e.read().decode("utf-8","replace")
        try:o=json.loads(raw)
        except:o={"raw":raw}
        return e.code,o

class App:
    def __init__(self,r):
        self.r=r; self.token=""; self.cams=[]
        r.title("Hik-Connect Team OpenAPI — LIVE"); r.geometry("1050x700")
        f=ttk.Frame(r,padding=12); f.pack(fill="both",expand=True)
        ttk.Label(f,text="Hik-Connect Team OpenAPI — LIVE",font=("Segoe UI",16,"bold")).pack(anchor="w")
        b=ttk.LabelFrame(f,text="API",padding=8); b.pack(fill="x",pady=8)
        ttk.Label(b,text="API Key").grid(row=0,column=0); self.key=ttk.Entry(b,width=60); self.key.grid(row=0,column=1)
        ttk.Label(b,text="API Secret").grid(row=1,column=0); self.sec=ttk.Entry(b,width=60,show="*"); self.sec.grid(row=1,column=1)
        ttk.Label(b,text="Encryption Code").grid(row=2,column=0); self.code=ttk.Entry(b,width=30,show="*"); self.code.grid(row=2,column=1,sticky="w")
        ttk.Button(b,text="1. TOKEN OLISH",command=self.token_get).grid(row=3,column=1,sticky="w",pady=5)
        c=ttk.LabelFrame(f,text="Kameralar",padding=5); c.pack(fill="both",expand=True)
        cols=("id","name","serial","online","area"); self.t=ttk.Treeview(c,columns=cols,show="headings")
        for x,w in zip(cols,(260,220,220,90,160)): self.t.heading(x,text=x.upper()); self.t.column(x,width=w)
        self.t.pack(fill="both",expand=True)
        ttk.Button(f,text="2. KAMERALARNI OLISH",command=self.cameras).pack(anchor="w",pady=5)
        ttk.Button(f,text="3. 🎥 LIVE KO'RISH",command=self.live).pack(anchor="w")
        self.log=tk.Text(f,height=7); self.log.pack(fill="x",pady=5)

    def logw(self,x): self.log.insert("end",x+"\n"); self.log.see("end")
    def token_get(self):
        if not self.key.get().strip() or not self.sec.get().strip():
            messagebox.showwarning("Xato","API Key va API Secretni kiriting."); return
        s,o=req(SERVER,TOKEN,{"appKey":self.key.get().strip(),"secretKey":self.sec.get().strip()})
        self.logw("TOKEN HTTP "+str(s))
        if str(o.get("errorCode"))=="0":
            self.token=(o.get("data") or {}).get("accessToken",""); messagebox.showinfo("OK","Token olindi.")
        else: messagebox.showerror("Token xatosi",json.dumps(o,ensure_ascii=False,indent=2))
    def cameras(self):
        if not self.token: messagebox.showwarning("Xato","Avval TOKEN OLISH."); return
        body={"pageIndex":1,"pageSize":500,"filter":{"areaID":"-1","includeSubArea":"1","deviceID":"","deviceSerialNo":""}}
        s,o=req(SERVER,CAMERAS,body,self.token)
        if str(o.get("errorCode"))!="0": messagebox.showerror("Kamera xatosi",json.dumps(o,ensure_ascii=False,indent=2)); return
        cams=(o.get("data") or {}).get("camera",[]) or []; self.cams=cams
        for i in self.t.get_children(): self.t.delete(i)
        for c in cams:
            d=c.get("device") or {}; di=d.get("devInfo") or {}
            serial=di.get("serialNo") or di.get("deviceSerial") or d.get("deviceSerial") or ""
            area=(c.get("area") or {}).get("name","")
            self.t.insert("", "end",values=(c.get("id",""),c.get("name",""),serial,
                "ONLINE" if str(c.get("online",""))=="1" else "OFFLINE",area))
        messagebox.showinfo("Tayyor",f"{len(cams)} ta kamera topildi.")
    def live(self):
        if not self.token: messagebox.showwarning("LIVE","Avval TOKEN OLISH."); return
        sel=self.t.selection()
        if not sel: messagebox.showwarning("LIVE","Kamerani tanlang."); return
        v=self.t.item(sel[0],"values"); cid,serial=v[0],v[2]
        # Hik-Connect Team has TWO tokens:
        # 1) accessToken = OpenAPI token for REST calls
        # 2) appToken = STREAM token required by EZUIKit/JSDecoder
        # The official Team video demo calls /platform/v1/streamtoken/get
        # immediately before creating EZUIKitPlayer.
        stream_path="/api/hccgw/platform/v1/streamtoken/get"
        try:
            req_stream=urllib.request.Request(
                SERVER.rstrip("/") + stream_path,
                headers={"Accept":"application/json","Token":self.token},
                method="GET")
            with urllib.request.urlopen(req_stream,timeout=30,context=ssl.create_default_context()) as rr:
                so=json.loads(rr.read().decode("utf-8","replace"))
        except urllib.error.HTTPError as e:
            raw=e.read().decode("utf-8","replace")
            try: so=json.loads(raw)
            except: so={"raw":raw}
        if str(so.get("errorCode"))!="0":
            messagebox.showerror("Stream token xato",json.dumps(so,ensure_ascii=False,indent=2)); return
        sd=so.get("data") or {}
        app_token=sd.get("appToken","")
        stream_domain=sd.get("streamAreaDomain","")
        if not app_token or not stream_domain:
            messagebox.showerror("Stream token","appToken yoki streamAreaDomain qaytmadi.\n"+json.dumps(so,ensure_ascii=False,indent=2)); return

        # Official demo uses streamType=1 for live.
        body={"resourceId":cid,"deviceSerial":serial,"type":"1","protocol":"1"}
        code=self.code.get().strip()
        if code:
            body["code"]=code
        s,o=req(SERVER,LIVE,body,self.token)
        if str(o.get("errorCode"))!="0":
            messagebox.showerror("LIVE xato",json.dumps(o,ensure_ascii=False,indent=2)); return
        url=(o.get("data") or {}).get("url","")
        if not url: messagebox.showerror("LIVE","URL qaytmadi."); return

        STATE["streamToken"]=app_token
        STATE["url"]=url
        STATE["domain"]=stream_domain
        self.logw("Stream token olindi.")
        self.logw("Stream domain: "+stream_domain)
        self.logw("LIVE player ochilmoqda...")
        webbrowser.open("http://127.0.0.1:8765/player")

if __name__=="__main__":
    if not (os.path.isfile(os.path.join(DEMO,"ezuikit.js")) and os.path.isdir(os.path.join(DEMO,"ezuikit_static"))):
        print("EZUIKit demo topilmadi. Avval 1_START_HIKCONNECT.bat ni ishga tushiring.")
        input("Enter...")
    else:
        threading.Thread(target=lambda:ThreadingHTTPServer(("127.0.0.1",8765),H).serve_forever(),daemon=True).start()
        root=tk.Tk(); App(root); root.mainloop()

