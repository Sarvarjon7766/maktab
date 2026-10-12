# -*- coding: utf-8 -*-
"""
gui_app.py

isup-service/adapters moduliga asoslangan oddiy tkinter GUI.
Forensic/debug konsol, byte-level comparator kabi narsalar yo'q —
faqat: kameraga ulanish -> xodim qo'shish (Ism, Familiya, Lavozim, Rasm).

JOYLASHUV (muhim!):
    Desktop\isup-service\
        isup-service\        <-- avvalgi zipdan chiqqan (adapters/, service.py)
        run_example.py
        gui_app.py            <-- BU FAYL shu yerga qo'yiladi

Ishga tushirish:
    pip install -r requirements.txt
    python gui_app.py
"""

from __future__ import annotations

import logging
import os
import sys
import threading
from pathlib import Path
from tkinter import (
    Tk, Frame, LabelFrame, Label, Entry, Button, StringVar, Text,
    filedialog, messagebox, END, DISABLED, NORMAL, ttk,
)

from PIL import Image, ImageTk

sys.path.insert(0, str(Path(__file__).parent / "isup-service"))

from adapters import (  # noqa: E402
    AdapterProtocol,
    DeviceCredentials,
    FaceRecord,
    UserRecord,
    VerifyMode,
)
from service import DeviceSyncService  # noqa: E402

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("gui_app")


class App:
    def __init__(self, root: Tk):
        self.root = root
        self.root.title("Hikvision Xodimlar Boshqaruvi")
        self.root.geometry("560x760")

        self.sync_service = DeviceSyncService()
        self.device_id: str | None = None
        self.connected = False
        self.selected_photo_path: str | None = None
        self.photo_preview_ref: ImageTk.PhotoImage | None = None

        self._build_ui()

    # ------------------------------------------------------------------
    def _build_ui(self) -> None:
        # --- Ulanish ---
        conn = LabelFrame(self.root, text="🔌 Kameraga ulanish", padx=10, pady=10)
        conn.pack(fill="x", padx=10, pady=5)

        self.ip_var = StringVar()
        self.port_var = StringVar(value="80")
        self.user_var = StringVar(value="admin")
        self.pass_var = StringVar()

        self._row(conn, 0, "IP manzil:", self.ip_var)
        self._row(conn, 1, "Port:", self.port_var)
        self._row(conn, 2, "Username:", self.user_var)
        self._row(conn, 3, "Parol:", self.pass_var, show="*")

        self.connect_btn = Button(conn, text="Ulanish", command=self._connect)
        self.connect_btn.grid(row=4, column=0, columnspan=2, pady=8, sticky="ew")

        self.status_label = Label(conn, text="⭕ Ulanmagan", fg="red")
        self.status_label.grid(row=5, column=0, columnspan=2)

        # --- Xodim ma'lumotlari ---
        emp = LabelFrame(self.root, text="👤 Xodim ma'lumotlari", padx=10, pady=10)
        emp.pack(fill="x", padx=10, pady=5)

        self.emp_id_var = StringVar()
        self.first_name_var = StringVar()
        self.last_name_var = StringVar()
        self.position_var = StringVar()
        self.gender_var = StringVar(value="male")

        self._row(emp, 0, "Employee ID:", self.emp_id_var)
        self._row(emp, 1, "Ism:", self.first_name_var)
        self._row(emp, 2, "Familiya:", self.last_name_var)
        self._row(emp, 3, "Lavozim (mahalliy eslatma):", self.position_var)

        Label(emp, text="Jins:").grid(row=4, column=0, sticky="w", pady=3)
        gender_box = ttk.Combobox(emp, textvariable=self.gender_var, values=["male", "female"],
                                   state="readonly", width=27)
        gender_box.grid(row=4, column=1, pady=3, sticky="ew")

        Label(emp, text="Rasm:").grid(row=5, column=0, sticky="w", pady=3)
        photo_row = Frame(emp)
        photo_row.grid(row=5, column=1, sticky="ew")
        self.photo_path_label = Label(photo_row, text="(tanlanmagan)", anchor="w")
        self.photo_path_label.pack(side="left", fill="x", expand=True)
        Button(photo_row, text="📁 Tanlash", command=self._select_photo).pack(side="right")

        self.preview_label = Label(emp, text="Rasm ko'rinishi", relief="groove", width=20, height=8)
        self.preview_label.grid(row=6, column=0, columnspan=2, pady=8)

        emp.grid_columnconfigure(1, weight=1)
        conn.grid_columnconfigure(1, weight=1)

        # --- Tugmalar ---
        btns = Frame(self.root)
        btns.pack(fill="x", padx=10, pady=5)
        self.add_btn = Button(btns, text="➕ Xodim qo'shish", command=self._add_employee, state=DISABLED)
        self.add_btn.pack(side="left", expand=True, fill="x", padx=3)
        Button(btns, text="🧹 Tozalash", command=self._clear_fields).pack(side="left", expand=True, fill="x", padx=3)

        # --- Log ---
        log_frame = LabelFrame(self.root, text="📝 Jurnal", padx=5, pady=5)
        log_frame.pack(fill="both", expand=True, padx=10, pady=5)
        self.log_text = Text(log_frame, height=10, state=DISABLED)
        self.log_text.pack(fill="both", expand=True)

    @staticmethod
    def _row(parent, row: int, label: str, var: StringVar, show: str | None = None) -> None:
        Label(parent, text=label).grid(row=row, column=0, sticky="w", pady=3)
        Entry(parent, textvariable=var, show=show or "").grid(row=row, column=1, pady=3, sticky="ew")

    # ------------------------------------------------------------------
    def log(self, message: str) -> None:
        def _write():
            self.log_text.config(state=NORMAL)
            self.log_text.insert(END, message + "\n")
            self.log_text.see(END)
            self.log_text.config(state=DISABLED)
        self.root.after(0, _write)
        logger.info(message)

    # ------------------------------------------------------------------
    def _connect(self) -> None:
        ip = self.ip_var.get().strip()
        password = self.pass_var.get().strip()
        if not ip or not password:
            messagebox.showerror("Xatolik", "IP va parolni kiriting")
            return

        self.connect_btn.config(state=DISABLED)
        self.log(f"🔗 Ulanmoqda: {ip}:{self.port_var.get()}")

        def worker():
            try:
                creds = DeviceCredentials(
                    ip=ip,
                    port=int(self.port_var.get().strip() or 80),
                    username=self.user_var.get().strip() or "admin",
                    password=password,
                )
                info = self.sync_service.register_device(
                    device_id=ip, creds=creds, preferred_protocol=AdapterProtocol.ISUP_SDK,
                )
                self.device_id = ip
                self.connected = True
                self.log(f"✅ Ulandi. Model: {info.model}, Firmware: {info.firmware_version}, "
                          f"Protokol: {info.protocol.value}")
                self.root.after(0, lambda: self.status_label.config(text="✅ Ulangan", fg="green"))
                self.root.after(0, lambda: self.add_btn.config(state=NORMAL))
            except Exception as exc:  # noqa: BLE001
                self.log(f"❌ Ulanish xatolik: {exc}")
                self.root.after(0, lambda: messagebox.showerror("Ulanish xatoligi", str(exc)))
            finally:
                self.root.after(0, lambda: self.connect_btn.config(state=NORMAL))

        threading.Thread(target=worker, daemon=True).start()

    # ------------------------------------------------------------------
    def _select_photo(self) -> None:
        path = filedialog.askopenfilename(
            title="Rasm tanlash",
            filetypes=[("Rasm fayllar", "*.jpg *.jpeg *.png *.bmp"), ("Barcha fayllar", "*.*")],
        )
        if not path:
            return
        self.selected_photo_path = path
        self.photo_path_label.config(text=os.path.basename(path))
        try:
            img = Image.open(path)
            img.thumbnail((180, 180), Image.Resampling.LANCZOS)
            photo = ImageTk.PhotoImage(img)
            self.preview_label.config(image=photo, text="")
            self.preview_label.image = photo
            self.photo_preview_ref = photo
        except Exception as exc:  # noqa: BLE001
            self.log(f"❌ Rasm ko'rsatishda xatolik: {exc}")

    # ------------------------------------------------------------------
    def _add_employee(self) -> None:
        if not self.connected or not self.device_id:
            messagebox.showwarning("Ogohlantirish", "Avval kameraga ulaning")
            return

        emp_id = self.emp_id_var.get().strip()
        first_name = self.first_name_var.get().strip()
        last_name = self.last_name_var.get().strip()
        position = self.position_var.get().strip()

        if not emp_id or not first_name or not last_name:
            messagebox.showerror("Xatolik", "Employee ID, Ism va Familiya kiritilishi shart")
            return
        if not self.selected_photo_path:
            messagebox.showerror("Xatolik", "Rasm tanlanmagan")
            return

        full_name = f"{first_name} {last_name}"
        self.add_btn.config(state=DISABLED)
        self.log(f"➕ Xodim qo'shilmoqda: {emp_id} - {full_name}" + (f" ({position})" if position else ""))

        def worker():
            try:
                user = UserRecord(
                    employee_no=emp_id,
                    name=full_name,
                    gender=self.gender_var.get(),
                    user_type="normal",
                    verify_mode=VerifyMode.FACE,
                    extra={"position": position} if position else {},
                )
                result = self.sync_service.sync_user_to_device(self.device_id, user)
                if result.status.value != "success":
                    raise RuntimeError(f"{result.status_code} / {result.error_message}")
                self.log("✅ Xodim yaratildi (server tomonida)")

                face = FaceRecord(
                    employee_no=emp_id,
                    image_bytes=Path(self.selected_photo_path).read_bytes(),
                )
                face_result = self.sync_service.sync_face_to_device(self.device_id, face)
                if face_result.status.value != "success":
                    raise RuntimeError(f"{face_result.status_code} / {face_result.error_message}")

                self.log("✅ Yuz rasmi yuklandi. Xodim to'liq qo'shildi.")
                self.root.after(0, lambda: messagebox.showinfo("Muvaffaqiyat", f"{full_name} muvaffaqiyatli qo'shildi"))
                self.root.after(0, self._clear_fields)
            except Exception as exc:  # noqa: BLE001
                self.log(f"❌ Xatolik: {exc}")
                self.root.after(0, lambda: messagebox.showerror("Xatolik", str(exc)))
            finally:
                self.root.after(0, lambda: self.add_btn.config(state=NORMAL))

        threading.Thread(target=worker, daemon=True).start()

    # ------------------------------------------------------------------
    def _clear_fields(self) -> None:
        self.emp_id_var.set("")
        self.first_name_var.set("")
        self.last_name_var.set("")
        self.position_var.set("")
        self.gender_var.set("male")
        self.selected_photo_path = None
        self.photo_path_label.config(text="(tanlanmagan)")
        self.preview_label.config(image="", text="Rasm ko'rinishi")
        self.photo_preview_ref = None


def main() -> None:
    root = Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()

