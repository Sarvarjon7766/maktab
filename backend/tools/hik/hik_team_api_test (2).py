import json, ssl, urllib.request, urllib.error
import tkinter as tk
from tkinter import ttk, messagebox

TOKEN = "/api/hccgw/platform/v1/token/get"
CAMERAS = "/api/hccgw/resource/v1/areas/cameras/get"
LIVE = "/api/hccgw/video/v1/live/address/get"

SERVERS = {
    "Custom / qo'lda": "",
    "Singapore / India": "https://isgp.hikcentralconnect.com",
    "Europe": "https://ieu.hikcentralconnect.com",
    "Russia": "https://hikcentralconnectru.com",
    "South America": "https://isa.hikcentralconnect.com",
    "North America": "https://ius.hikcentralconnect.com",
}

class App:
    def __init__(self, root):
        self.root=root
        root.title("Hik-Connect Team OpenAPI Tester")
        root.geometry("1050x700")
        self.token=""
        self.cameras=[]

        f=ttk.Frame(root,padding=12); f.pack(fill="both",expand=True)
        ttk.Label(f,text="Hik-Connect for Teams OpenAPI Tester",
                  font=("Segoe UI",16,"bold")).pack(anchor="w",pady=(0,10))

        b=ttk.LabelFrame(f,text="API ulanish",padding=10); b.pack(fill="x")
        ttk.Label(b,text="Server:").grid(row=0,column=0,sticky="w",padx=5,pady=4)
        self.region=ttk.Combobox(b,values=list(SERVERS),state="readonly",width=25)
        self.region.current(0); self.region.grid(row=0,column=1,sticky="w",padx=5,pady=4)
        self.region.bind("<<ComboboxSelected>>",self.change_server)

        ttk.Label(b,text="Server URL:").grid(row=1,column=0,sticky="w",padx=5,pady=4)
        self.server=ttk.Entry(b,width=75); self.server.grid(row=1,column=1,columnspan=3,sticky="ew",padx=5)

        ttk.Label(b,text="API Key (AK):").grid(row=2,column=0,sticky="w",padx=5,pady=4)
        self.key=ttk.Entry(b,width=60); self.key.grid(row=2,column=1,columnspan=2,sticky="ew",padx=5)

        ttk.Label(b,text="API Secret (SK):").grid(row=3,column=0,sticky="w",padx=5,pady=4)
        self.secret=ttk.Entry(b,width=60,show="*"); self.secret.grid(row=3,column=1,columnspan=2,sticky="ew",padx=5)

        ttk.Label(b,text="Camera Encryption Code:").grid(row=4,column=0,sticky="w",padx=5,pady=4)
        self.enc_code=ttk.Entry(b,width=30,show="*")
        self.enc_code.grid(row=4,column=1,sticky="w",padx=5,pady=4)
        ttk.Label(b,text="(kamera video encryption password)").grid(row=4,column=2,sticky="w",padx=5,pady=4)

        self.show=tk.BooleanVar()
        ttk.Checkbutton(b,text="Secretni ko'rsatish",variable=self.show,
                        command=lambda:self.secret.configure(show="" if self.show.get() else "*")
                        ).grid(row=3,column=3,sticky="w")
        ttk.Button(b,text="1. TOKEN OLISH",command=self.get_token).grid(row=5,column=1,sticky="w",padx=5,pady=8)
        ttk.Button(b,text="2. KAMERALARNI OLISH",command=self.get_cameras).grid(row=5,column=2,sticky="w",padx=5,pady=8)
        b.columnconfigure(1,weight=1)

        s=ttk.LabelFrame(f,text="Token / Server",padding=8); s.pack(fill="x",pady=10)
        ttk.Label(s,text="Access Token:").grid(row=0,column=0,sticky="w")
        self.token_var=tk.StringVar()
        ttk.Entry(s,textvariable=self.token_var,state="readonly").grid(row=0,column=1,sticky="ew",padx=5)
        ttk.Label(s,text="Area Domain:").grid(row=1,column=0,sticky="w")
        self.area=tk.StringVar()
        ttk.Entry(s,textvariable=self.area,state="readonly").grid(row=1,column=1,sticky="ew",padx=5)
        s.columnconfigure(1,weight=1)

        c=ttk.LabelFrame(f,text="Kameralar",padding=6); c.pack(fill="both",expand=True)
        cols=("id","name","serial","online","area")
        self.tree=ttk.Treeview(c,columns=cols,show="headings")
        heads={"id":"Camera ID","name":"Name","serial":"Device Serial","online":"Online","area":"Area"}
        widths={"id":240,"name":180,"serial":190,"online":80,"area":180}
        for x in cols:
            self.tree.heading(x,text=heads[x]); self.tree.column(x,width=widths[x])
        sy=ttk.Scrollbar(c,orient="vertical",command=self.tree.yview)
        self.tree.configure(yscrollcommand=sy.set)
        self.tree.pack(side="left",fill="both",expand=True); sy.pack(side="right",fill="y")

        ttk.Button(f,text="3. TANLANGAN KAMERA UCHUN LIVE URL OLISH",
                   command=self.get_live).pack(anchor="w",pady=8)
        ttk.Button(f,text="4. RTMP URL OLISH",
                   command=self.get_rtmp).pack(anchor="w",pady=4)

        l=ttk.LabelFrame(f,text="Log",padding=5); l.pack(fill="x")
        self.log=tk.Text(l,height=7); self.log.pack(fill="x")
        self.write("Dastur tayyor. API Key, API Secret va Camera Encryption Code ni kiriting.")
        self.write("Serverni bilmasangiz regionlardan birini tanlab TOKEN OLISH ni sinang.")

    def write(self,x):
        self.log.insert("end",x+"\n"); self.log.see("end")

    def change_server(self,e=None):
        self.server.delete(0,"end")
        self.server.insert(0,SERVERS[self.region.get()])

    def req(self,base,path,body=None,token=None):
        url=base.strip().rstrip("/") + path
        data=json.dumps(body).encode() if body is not None else None
        h={"Content-Type":"application/json","Accept":"application/json","User-Agent":"HikTeamOpenAPITest/1.0"}
        if token: h["Token"]=token
        req=urllib.request.Request(url,data=data,headers=h,method="POST")
        try:
            with urllib.request.urlopen(req,timeout=30,context=ssl.create_default_context()) as r:
                return r.status,json.loads(r.read().decode("utf-8","replace"))
        except urllib.error.HTTPError as e:
            raw=e.read().decode("utf-8","replace")
            try: obj=json.loads(raw)
            except: obj={"raw":raw}
            return e.code,obj

    def get_token(self):
        base=self.server.get().strip(); key=self.key.get().strip(); sec=self.secret.get().strip()
        if not base or not key or not sec:
            messagebox.showwarning("Xato","Server URL, API Key va API Secretni to'ldiring."); return
        self.write("Token so'rovi yuborilmoqda...")
        try:
            status,obj=self.req(base,TOKEN,{"appKey":key,"secretKey":sec})
            self.write("HTTP "+str(status)); self.write(json.dumps(obj,ensure_ascii=False,indent=2))
            if str(obj.get("errorCode"))=="0":
                d=obj.get("data",{})
                self.token=d.get("accessToken",""); self.token_var.set(self.token)
                domain=d.get("areaDomain",""); self.area.set(domain)
                if domain:
                    self.server.delete(0,"end"); self.server.insert(0,domain)
                messagebox.showinfo("MUVAFFAQIYAT","Token olindi!\n\nArea Domain: "+domain+"\n\nEndi KAMERALARNI OLISH tugmasini bosing.")
            else:
                messagebox.showerror("Token xatosi",f"HTTP: {status}\nerrorCode: {obj.get('errorCode')}\n{obj.get('message','')}")
        except Exception as e:
            self.write("XATO: "+str(e)); messagebox.showerror("Ulanish xatosi",str(e))

    def get_cameras(self):
        if not self.token:
            messagebox.showwarning("Avval token","Avval TOKEN OLISH ni bosing."); return
        body={"pageIndex":1,"pageSize":500,"filter":{"areaID":"-1","includeSubArea":"1","deviceID":"","deviceSerialNo":""}}
        try:
            status,obj=self.req(self.server.get(),CAMERAS,body,self.token)
            self.write("HTTP "+str(status)); self.write(json.dumps(obj,ensure_ascii=False,indent=2))
            if str(obj.get("errorCode"))!="0":
                messagebox.showerror("Kamera xatosi",f"HTTP: {status}\nerrorCode: {obj.get('errorCode')}\n{obj.get('message','')}"); return
            cams=(obj.get("data") or {}).get("camera",[]) or []
            for x in self.tree.get_children(): self.tree.delete(x)
            self.cameras=cams
            for cam in cams:
                dev=cam.get("device") or {}; di=dev.get("devInfo") or {}
                serial=di.get("serialNo") or di.get("deviceSerial") or dev.get("deviceSerial") or ""
                area=(cam.get("area") or {}).get("name","")
                self.tree.insert("","end",values=(cam.get("id",""),cam.get("name",""),serial,
                    "ONLINE" if str(cam.get("online",""))=="1" else "OFFLINE",area))
            messagebox.showinfo("Tayyor",f"{len(cams)} ta kamera topildi.")
        except Exception as e:
            self.write("XATO: "+str(e)); messagebox.showerror("Xato",str(e))


    def get_rtmp(self):
        """Request RTMP live URL (protocol=3)."""
        if not self.token:
            messagebox.showwarning("RTMP", "Avval 1. TOKEN OLISH ni bosing.")
            return

        sel = self.tree.selection()
        if not sel:
            messagebox.showwarning("RTMP", "Avval kamerani tanlang.")
            return

        vals = self.tree.item(sel[0], "values")
        cid, serial = vals[0], vals[2]
        if not serial:
            messagebox.showerror("RTMP", "Device Serial topilmadi.")
            return

        # Official guide: protocol 3 = RTMP.
        # RTMP does not support stream encryption, so do NOT send code here.
        body = {
            "resourceId": cid,
            "deviceSerial": serial,
            "type": 1,
            "protocol": 3,
            "quality": 1,
            "expireTime": 600
        }

        self.write("RTMP so'rov yuborilmoqda...")
        self.write(json.dumps(body, ensure_ascii=False, indent=2))

        try:
            status, obj = self.req(self.server.get(), LIVE, body, self.token)
            self.write("HTTP " + str(status))
            self.write(json.dumps(obj, ensure_ascii=False, indent=2))

            if str(obj.get("errorCode")) != "0":
                messagebox.showerror(
                    "RTMP xato",
                    f"HTTP: {status}\n"
                    f"errorCode: {obj.get('errorCode')}\n"
                    f"{obj.get('message','')}\n\n"
                    "Agar kamera stream encryption ishlatayotgan bo'lsa, "
                    "RTMP ishlamasligi mumkin."
                )
                return

            url = ((obj.get("data") or {}).get("url")) or ""
            if not url:
                messagebox.showwarning("RTMP", "API RTMP URL qaytarmadi.")
                return

            messagebox.showinfo("RTMP URL", url)
            self.write("RTMP URL: " + url)

        except Exception as e:
            self.write("RTMP XATO: " + repr(e))
            messagebox.showerror("RTMP xato", str(e))

    def get_live(self):
        sel=self.tree.selection()
        if not self.token or not sel:
            messagebox.showwarning("Tanlov","Avval token oling va kamerani tanlang."); return
        v=self.tree.item(sel[0],"values"); cid,serial=v[0],v[2]
        if not serial:
            messagebox.showerror("Xato","Device Serial topilmadi."); return
        body={"resourceId":cid,"deviceSerial":serial,"type":1,"protocol":1}
        enc = self.enc_code.get().strip()
        if enc:
            body["code"] = enc
        try:
            status,obj=self.req(self.server.get(),LIVE,body,self.token)
            self.write("HTTP "+str(status)); self.write(json.dumps(obj,ensure_ascii=False,indent=2))
            if str(obj.get("errorCode"))=="0":
                d=obj.get("data") or {}
                messagebox.showinfo("LIVE URL",d.get("url",json.dumps(d,ensure_ascii=False,indent=2)))
            else:
                messagebox.showerror("Live xatosi",f"HTTP: {status}\nerrorCode: {obj.get('errorCode')}\n{obj.get('message','')}")
        except Exception as e:
            self.write("XATO: "+str(e)); messagebox.showerror("Xato",str(e))

if __name__=="__main__":
    root=tk.Tk()
    try: ttk.Style().theme_use("vista")
    except: pass
    App(root)
    root.mainloop()

