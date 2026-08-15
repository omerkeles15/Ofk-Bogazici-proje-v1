from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import json, os, sqlite3, asyncio
from datetime import datetime

app = FastAPI(title="OFK SCADA Backend")

# ── WebSocket Bağlantı Yöneticisi ────────────────────────────
class ConnectionManager:
    def __init__(self):
        # { device_id: set(WebSocket) }
        self._subs: dict[str, set[WebSocket]] = {}

    async def subscribe(self, ws: WebSocket, device_id: str):
        await ws.accept()
        if device_id not in self._subs:
            self._subs[device_id] = set()
        self._subs[device_id].add(ws)

    def unsubscribe(self, ws: WebSocket, device_id: str):
        subs = self._subs.get(device_id)
        if subs:
            subs.discard(ws)
            if not subs:
                del self._subs[device_id]

    async def broadcast(self, device_id: str, data: dict):
        subs = self._subs.get(device_id, set()).copy()
        dead = []
        msg = json.dumps(data, ensure_ascii=False)
        for ws in subs:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unsubscribe(ws, device_id)

ws_manager = ConnectionManager()

DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "dist")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DATA_DIR, "scada.db")
COMPANIES_FILE = os.path.join(DATA_DIR, "companies.json")
USERS_FILE = os.path.join(DATA_DIR, "users.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── SQLite ────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn

def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS device_data (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT    NOT NULL,
            company_id  TEXT,
            location_id TEXT,
            timestamp   TEXT,
            type        TEXT,
            subtype     TEXT,
            data_json   TEXT,
            received_at TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_dd_device    ON device_data(device_id);
        CREATE INDEX IF NOT EXISTS idx_dd_device_ts ON device_data(device_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_dd_device_ra ON device_data(device_id, received_at DESC);

        CREATE TABLE IF NOT EXISTS io_point_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT    NOT NULL,
            address     TEXT    NOT NULL,
            value       TEXT    NOT NULL,
            timestamp   TEXT,
            received_at TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ioph_da ON io_point_history(device_id, address);
        CREATE INDEX IF NOT EXISTS idx_ioph_dat ON io_point_history(device_id, address, timestamp DESC);

        CREATE TABLE IF NOT EXISTS alarm_configs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT NOT NULL,
            address     TEXT NOT NULL,
            min_value   REAL,
            max_value   REAL,
            enabled     INTEGER DEFAULT 1,
            created_at  TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ac_da ON alarm_configs(device_id, address);

        CREATE TABLE IF NOT EXISTS alarm_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT NOT NULL,
            address     TEXT NOT NULL,
            value       TEXT NOT NULL,
            alarm_type  TEXT NOT NULL,
            limit_value REAL,
            timestamp   TEXT,
            received_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_al_da ON alarm_logs(device_id, address);
        CREATE INDEX IF NOT EXISTS idx_al_dat ON alarm_logs(device_id, address, timestamp DESC);
    """)
    conn.close()

init_db()

# ── JSON Helpers ──────────────────────────────────────────────
def _read_json(path, default=None):
    if not os.path.exists(path):
        return default if default is not None else {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def _load_companies():
    return _read_json(COMPANIES_FILE, [])

def _save_companies(data):
    _write_json(COMPANIES_FILE, data)

def _load_users():
    return _read_json(USERS_FILE, [])

def _save_users(data):
    _write_json(USERS_FILE, data)

def _next_device_id(companies):
    ids = []
    for c in companies:
        for loc in c.get("locations", []):
            for d in loc.get("devices", []):
                did = d.get("id", "")
                if did.startswith("DEV-"):
                    try:
                        ids.append(int(did.split("-")[1]))
                    except ValueError:
                        pass
    mx = max(ids) if ids else 0
    return f"DEV-{mx+1:03d}"

# ── Mock Auth ─────────────────────────────────────────────────
MOCK_USERS = [
    {"id": 1, "username": "admin", "password": "admin123", "role": "admin", "name": "Sistem Admini"},
    {"id": 2, "username": "firma1", "password": "firma123", "role": "company_manager", "name": "Ahmet Yılmaz", "companyId": 1},
    {"id": 3, "username": "lokasyon1", "password": "lok123", "role": "location_manager", "name": "Mehmet Demir", "companyId": 1, "locationId": 1},
    {"id": 4, "username": "kullanici1", "password": "kul123", "role": "user", "name": "Ayşe Kaya", "companyId": 1, "locationId": 1},
]
ROLE_REDIRECTS = {
    "admin": "/admin/dashboard",
    "company_manager": "/company/dashboard",
    "location_manager": "/location/dashboard",
    "user": "/user/dashboard",
}

# ── Pydantic Modeller ─────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class CompanyCreate(BaseModel):
    displayName: str
    fullName: str
    managers: list = []

class CompanyUpdate(BaseModel):
    displayName: Optional[str] = None
    fullName: Optional[str] = None
    managers: Optional[list] = None

class LocationCreate(BaseModel):
    name: str
    managers: list = []
    users: list = []

class LocationUpdate(BaseModel):
    name: Optional[str] = None
    managers: Optional[list] = None
    users: Optional[list] = None

class DeviceCreate(BaseModel):
    tagName: str
    deviceType: Optional[str] = None
    subtype: Optional[str] = None
    unit: Optional[str] = ""

class DeviceUpdate(BaseModel):
    tagName: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    status: Optional[str] = None
    deviceType: Optional[str] = None
    subtype: Optional[str] = None

class UserCreate(BaseModel):
    username: str
    name: str
    role: str
    password: Optional[str] = "123456"
    companyId: Optional[int] = None
    locationId: Optional[int] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    companyId: Optional[int] = None
    locationId: Optional[int] = None

class DeviceDataPayload(BaseModel):
    deviceId: str
    companyId: Optional[str] = None
    locationId: Optional[str] = None
    timestamp: Optional[str] = None
    type: Optional[str] = None
    subtype: Optional[str] = None
    data: Optional[dict] = None

# ── AUTH ──────────────────────────────────────────────────────
@app.post("/api/auth/login")
def login(req: LoginRequest):
    user = next((u for u in MOCK_USERS if u["username"] == req.username and u["password"] == req.password), None)
    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    safe = {k: v for k, v in user.items() if k != "password"}
    return {"user": safe, "token": f"mock-token-{user['id']}", "redirect": ROLE_REDIRECTS.get(user["role"], "/login")}

# ── COMPANIES ─────────────────────────────────────────────────
@app.get("/api/companies")
def get_companies():
    return _load_companies()

@app.post("/api/companies")
def add_company(body: CompanyCreate):
    companies = _load_companies()
    max_id = max((c["id"] for c in companies), default=0)
    new = {"id": max_id + 1, "displayName": body.displayName, "fullName": body.fullName, "managers": body.managers, "locations": []}
    companies.append(new)
    _save_companies(companies)
    return new

@app.put("/api/companies/{company_id}")
def update_company(company_id: int, body: CompanyUpdate):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    for k, v in body.dict(exclude_none=True).items():
        comp[k] = v
    _save_companies(companies)
    return comp

@app.delete("/api/companies/{company_id}")
def delete_company(company_id: int):
    companies = _load_companies()
    companies = [c for c in companies if c["id"] != company_id]
    _save_companies(companies)
    return {"ok": True}

# ── LOCATIONS ─────────────────────────────────────────────────
@app.get("/api/companies/{company_id}/locations")
def get_locations(company_id: int):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    return comp.get("locations", [])

@app.post("/api/companies/{company_id}/locations")
def add_location(company_id: int, body: LocationCreate):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    locs = comp.get("locations", [])
    max_id = max((l["id"] for l in locs), default=0)
    new_loc = {"id": max_id + 1, "name": body.name, "managers": body.managers, "users": body.users, "devices": []}
    comp["locations"] = locs + [new_loc]
    _save_companies(companies)
    return new_loc

@app.put("/api/companies/{company_id}/locations/{location_id}")
def update_location(company_id: int, location_id: int, body: LocationUpdate):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    loc = next((l for l in comp.get("locations", []) if l["id"] == location_id), None)
    if not loc:
        raise HTTPException(404, "Lokasyon bulunamadı")
    for k, v in body.dict(exclude_none=True).items():
        loc[k] = v
    _save_companies(companies)
    return loc

@app.delete("/api/companies/{company_id}/locations/{location_id}")
def delete_location(company_id: int, location_id: int):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    comp["locations"] = [l for l in comp.get("locations", []) if l["id"] != location_id]
    _save_companies(companies)
    return {"ok": True}

# ── DEVICES (company/location altında) ────────────────────────
@app.get("/api/companies/{company_id}/locations/{location_id}/devices")
def get_devices(company_id: int, location_id: int):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    loc = next((l for l in comp.get("locations", []) if l["id"] == location_id), None)
    if not loc:
        raise HTTPException(404, "Lokasyon bulunamadı")
    return loc.get("devices", [])

@app.post("/api/companies/{company_id}/locations/{location_id}/devices")
def add_device(company_id: int, location_id: int, body: DeviceCreate):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    loc = next((l for l in comp.get("locations", []) if l["id"] == location_id), None)
    if not loc:
        raise HTTPException(404, "Lokasyon bulunamadı")
    new_id = _next_device_id(companies)
    new_dev = {"id": new_id, "tagName": body.tagName, "deviceType": body.deviceType, "subtype": body.subtype, "unit": body.unit, "value": 0, "timestamp": datetime.now().isoformat(), "status": "offline"}
    loc.setdefault("devices", []).append(new_dev)
    _save_companies(companies)
    return new_dev

@app.put("/api/companies/{company_id}/locations/{location_id}/devices/{device_id}")
def update_device(company_id: int, location_id: int, device_id: str, body: DeviceUpdate):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404)
    loc = next((l for l in comp.get("locations", []) if l["id"] == location_id), None)
    if not loc:
        raise HTTPException(404)
    dev = next((d for d in loc.get("devices", []) if d["id"] == device_id), None)
    if not dev:
        raise HTTPException(404, "Cihaz bulunamadı")
    for k, v in body.dict(exclude_none=True).items():
        dev[k] = v
    dev["timestamp"] = datetime.now().isoformat()
    _save_companies(companies)
    return dev

@app.delete("/api/companies/{company_id}/locations/{location_id}/devices/{device_id}")
def delete_device(company_id: int, location_id: int, device_id: str):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404)
    loc = next((l for l in comp.get("locations", []) if l["id"] == location_id), None)
    if not loc:
        raise HTTPException(404)
    loc["devices"] = [d for d in loc.get("devices", []) if d["id"] != device_id]
    _save_companies(companies)
    return {"ok": True}

@app.post("/api/companies/{company_id}/locations/{location_id}/devices/{device_id}/toggle")
def toggle_device(company_id: int, location_id: int, device_id: str):
    companies = _load_companies()
    comp = next((c for c in companies if c["id"] == company_id), None)
    if not comp:
        raise HTTPException(404)
    loc = next((l for l in comp.get("locations", []) if l["id"] == location_id), None)
    if not loc:
        raise HTTPException(404)
    dev = next((d for d in loc.get("devices", []) if d["id"] == device_id), None)
    if not dev:
        raise HTTPException(404)
    dev["status"] = "offline" if dev["status"] == "online" else "online"
    dev["timestamp"] = datetime.now().isoformat()
    _save_companies(companies)
    return dev

@app.get("/api/devices")
def get_all_devices():
    companies = _load_companies()
    result = []
    for c in companies:
        for loc in c.get("locations", []):
            for d in loc.get("devices", []):
                result.append({**d, "companyId": c["id"], "companyName": c["displayName"], "locationId": loc["id"], "locationName": loc["name"]})
    return result

@app.get("/api/devices/next-id")
def peek_next_device_id():
    return {"nextId": _next_device_id(_load_companies())}

# ══════════════════════════════════════════════════════════════
# DEVICE DATA — SQLite tabanlı, indeksli, sayfalı, filtreli
# ══════════════════════════════════════════════════════════════

def _get_delta_x_addresses(count):
    """Delta DVP X adresleri üret — oktal gruplama kuralı."""
    addrs = []
    if count <= 0:
        return addrs
    for i in range(8):
        if len(addrs) >= count:
            break
        addrs.append(f"X{i}")
    group = 2
    while len(addrs) < count:
        if group % 10 in (8, 9):
            group += 1
            continue
        base = group * 10
        for i in range(8):
            if len(addrs) >= count:
                break
            addrs.append(f"X{base + i}")
        group += 1
    return addrs

def _get_delta_y_addresses(count):
    """Delta DVP Y adresleri üret — oktal gruplama kuralı."""
    addrs = []
    if count <= 0:
        return addrs
    for i in range(6):
        if len(addrs) >= count:
            break
        addrs.append(f"Y{i}")
    group = 2
    while len(addrs) < count:
        if group % 10 in (8, 9):
            group += 1
            continue
        base = group * 10
        for i in range(8):
            if len(addrs) >= count:
                break
            addrs.append(f"Y{base + i}")
        group += 1
    return addrs

def _expand_compact_plc_data(compact_data, device_info):
    """
    Kompakt PLC verisini genişletilmiş formata çevirir.
    Gelen: {"DI":"244","DO":"21","AI":"1024,2048","AO":"512","DR":"100,200,0,..."}
    Dönen: {"digitalInputs":{...},"digitalOutputs":{...},"analogInputs":{...},...}
    """
    io_cfg = device_info.get("plcIoConfig") or {}
    expanded = {}

    # Dijital Girişler — desimal → binary
    di_str = compact_data.get("DI", "0")
    di_count = io_cfg.get("digitalInputs", {}).get("count", 0)
    if di_count > 0:
        di_val = int(di_str)
        x_addrs = _get_delta_x_addresses(di_count)
        di_map = {}
        for i, addr in enumerate(x_addrs):
            di_map[addr] = "1" if (di_val >> i) & 1 else "0"
        expanded["digitalInputs"] = di_map

    # Dijital Çıkışlar — desimal → binary
    do_str = compact_data.get("DO", "0")
    do_count = io_cfg.get("digitalOutputs", {}).get("count", 0)
    if do_count > 0:
        do_val = int(do_str)
        y_addrs = _get_delta_y_addresses(do_count)
        do_map = {}
        for i, addr in enumerate(y_addrs):
            do_map[addr] = "1" if (do_val >> i) & 1 else "0"
        expanded["digitalOutputs"] = do_map

    # Analog Girişler — virgülle ayrılmış dizi
    ai_str = compact_data.get("AI", "")
    ai_cfg = io_cfg.get("analogInputs", [])
    if ai_str and ai_cfg:
        ai_vals = ai_str.split(",")
        ai_map = {}
        for i, cfg in enumerate(ai_cfg):
            val = ai_vals[i].strip() if i < len(ai_vals) else "0"
            ai_map[f"AI{cfg.get('channel', i)}"] = {"value": val, "dataType": cfg.get("dataType", "word")}
        expanded["analogInputs"] = ai_map

    # Analog Çıkışlar — virgülle ayrılmış dizi
    ao_str = compact_data.get("AO", "")
    ao_cfg = io_cfg.get("analogOutputs", [])
    if ao_str and ao_cfg:
        ao_vals = ao_str.split(",")
        ao_map = {}
        for i, cfg in enumerate(ao_cfg):
            val = ao_vals[i].strip() if i < len(ao_vals) else "0"
            ao_map[f"AO{cfg.get('channel', i)}"] = {"value": val, "dataType": cfg.get("dataType", "word")}
        expanded["analogOutputs"] = ao_map

    # Data Register — virgülle ayrılmış dizi
    dr_str = compact_data.get("DR", "")
    dr_cfg = io_cfg.get("dataRegister", {})
    if dr_str and dr_cfg:
        dr_vals = dr_str.split(",")
        dr_start = dr_cfg.get("start", 0)
        dr_type = dr_cfg.get("dataType", "word")
        dr_map = {}
        for i, val in enumerate(dr_vals):
            dr_map[f"D{dr_start + i}"] = {"value": val.strip(), "dataType": dr_type}
        expanded["dataRegisters"] = dr_map

    return expanded

def _is_compact_plc_format(data):
    """Gelen verinin kompakt PLC formatında olup olmadığını kontrol eder."""
    if not data:
        return False
    return any(k in data for k in ("DI", "DO", "AI", "AO", "DR"))

@app.post("/api/device-data")
async def receive_device_data(payload: DeviceDataPayload):
    """IoT cihazdan gelen veriyi doğrular, SQLite'a yazar ve WebSocket ile push yapar."""

    # ── 1. Cihaz doğrulama ────────────────────────────────────
    companies = _load_companies()
    device_info = None
    for c in companies:
        for loc in c.get("locations", []):
            for d in loc.get("devices", []):
                if d.get("id") == payload.deviceId:
                    device_info = d
                    break
            if device_info:
                break
        if device_info:
            break

    # Cihaz bulunamadı
    if not device_info:
        raise HTTPException(
            status_code=404,
            detail=f"Cihaz '{payload.deviceId}' sistemde kayıtlı değil."
        )

    # Cihaz pasif mi?
    if device_info.get("status") != "online":
        raise HTTPException(
            status_code=403,
            detail=f"Cihaz '{payload.deviceId}' pasif durumda. Veri kabul edilmiyor. Önce cihazı aktif edin."
        )

    # Tip uyuşmazlığı kontrolü
    dev_type = device_info.get("deviceType")
    dev_subtype = device_info.get("subtype")

    if payload.type and dev_type and payload.type != dev_type:
        raise HTTPException(
            status_code=400,
            detail=f"Tip uyuşmazlığı: Cihaz '{payload.deviceId}' tipi '{dev_type}' ama gelen veri tipi '{payload.type}'."
        )

    if payload.subtype and dev_subtype and payload.subtype != dev_subtype:
        raise HTTPException(
            status_code=400,
            detail=f"Alt tip uyuşmazlığı: Cihaz '{payload.deviceId}' alt tipi '{dev_subtype}' ama gelen veri alt tipi '{payload.subtype}'."
        )

    # Sensör için birim kontrolü
    if dev_type == "sensor" and payload.data:
        expected_unit = device_info.get("unit", "")
        incoming_unit = payload.data.get("unit", "")
        if expected_unit and incoming_unit and incoming_unit != expected_unit:
            raise HTTPException(
                status_code=400,
                detail=f"Birim uyuşmazlığı: Cihaz '{payload.deviceId}' birimi '{expected_unit}' ama gelen veri birimi '{incoming_unit}'."
            )

    # ── 2. Kompakt PLC formatı kontrolü ve genişletme ───────
    data_to_store = payload.data
    if dev_type == "plc" and payload.data and _is_compact_plc_format(payload.data):
        data_to_store = _expand_compact_plc_data(payload.data, device_info)

    # ── 3. Veriyi kaydet ──────────────────────────────────────
    now = datetime.now().isoformat()

    # Timestamp'ı lokal saate normalize et
    ts = payload.timestamp or now
    try:
        parsed_ts = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        if parsed_ts.tzinfo is not None:
            from datetime import timezone, timedelta
            local_tz = timezone(timedelta(hours=3))
            ts = parsed_ts.astimezone(local_tz).strftime('%Y-%m-%dT%H:%M:%S.%f')
    except Exception:
        pass

    conn = get_db()
    cur = conn.execute(
        """INSERT INTO device_data
           (device_id, company_id, location_id, timestamp, type, subtype, data_json, received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            payload.deviceId,
            payload.companyId,
            payload.locationId,
            ts,
            payload.type,
            payload.subtype,
            json.dumps(data_to_store, ensure_ascii=False) if data_to_store else None,
            now,
        ),
    )
    row_id = cur.lastrowid
    conn.commit()

    # ── 4. Alarm kontrolü ─────────────────────────────────────
    alarm_conn = get_db()
    if dev_type == "sensor" and data_to_store:
        sensor_val = data_to_store.get("value") if isinstance(data_to_store, dict) else None
        if sensor_val:
            _check_and_log_alarms(alarm_conn, payload.deviceId, "value", sensor_val, ts, now)
    if dev_type == "plc" and data_to_store:
        for section in ("analogInputs", "analogOutputs", "dataRegisters"):
            for addr, obj in (data_to_store.get(section) or {}).items():
                val = obj.get("value", "0") if isinstance(obj, dict) else str(obj)
                _check_and_log_alarms(alarm_conn, payload.deviceId, addr, val, ts, now)
    alarm_conn.commit()
    alarm_conn.close()

    # ── 5. PLC I/O nokta geçmişi kaydet ──────────────────────
    if dev_type == "plc" and data_to_store:
        io_conn = get_db()
        io_records = []
        for section in ("digitalInputs", "digitalOutputs"):
            for addr, val in (data_to_store.get(section) or {}).items():
                io_records.append((payload.deviceId, addr, str(val), ts, now))
        for section in ("analogInputs", "analogOutputs", "dataRegisters"):
            for addr, obj in (data_to_store.get(section) or {}).items():
                val = obj.get("value", "0") if isinstance(obj, dict) else str(obj)
                io_records.append((payload.deviceId, addr, val, ts, now))
        if io_records:
            io_conn.executemany(
                "INSERT INTO io_point_history (device_id, address, value, timestamp, received_at) VALUES (?,?,?,?,?)",
                io_records
            )
            io_conn.commit()
        io_conn.close()

    conn.close()

    # WebSocket ile anında push
    await ws_manager.broadcast(payload.deviceId, {
        "type": "new_data",
        "record": {
            "id": row_id,
            "deviceId": payload.deviceId,
            "companyId": payload.companyId,
            "locationId": payload.locationId,
            "timestamp": ts,
            "type": payload.type,
            "subtype": payload.subtype,
            "data": data_to_store,
            "receivedAt": now,
        },
    })

    return {"ok": True, "receivedAt": now}


@app.get("/api/device-data/{device_id}")
def get_device_data(
    device_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
):
    """
    Cihaz verilerini sayfalı ve filtreli döndürür.
    - limit/offset: sayfalama (varsayılan 100)
    - from/to: ISO tarih filtresi (timestamp üzerinden)
    Yanıt: { latest, records, total, limit, offset }
    """
    conn = get_db()

    # Toplam kayıt sayısı (filtreli)
    count_sql = "SELECT COUNT(*) FROM device_data WHERE device_id = ?"
    data_sql = """SELECT id, device_id, company_id, location_id, timestamp,
                         type, subtype, data_json, received_at
                  FROM device_data WHERE device_id = ?"""
    params = [device_id]

    if from_ts:
        count_sql += " AND timestamp >= ?"
        data_sql += " AND timestamp >= ?"
        params.append(from_ts)
    if to_ts:
        count_sql += " AND timestamp <= ?"
        data_sql += " AND timestamp <= ?"
        params.append(to_ts)

    filtered_total = conn.execute(count_sql, params).fetchone()[0]

    # Filtresiz toplam kayıt sayısı
    grand_total = conn.execute(
        "SELECT COUNT(*) FROM device_data WHERE device_id = ?", (device_id,)
    ).fetchone()[0]

    data_sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    rows = conn.execute(data_sql, params + [limit, offset]).fetchall()

    # En son kayıt (filtresiz)
    latest_row = conn.execute(
        "SELECT * FROM device_data WHERE device_id = ? ORDER BY timestamp DESC LIMIT 1",
        (device_id,),
    ).fetchone()

    conn.close()

    def row_to_dict(r):
        d = dict(r)
        d["data"] = json.loads(d.pop("data_json")) if d.get("data_json") else None
        # snake_case -> camelCase
        return {
            "id": d["id"],
            "deviceId": d["device_id"],
            "companyId": d["company_id"],
            "locationId": d["location_id"],
            "timestamp": d["timestamp"],
            "type": d["type"],
            "subtype": d["subtype"],
            "data": d["data"],
            "receivedAt": d["received_at"],
        }

    latest = row_to_dict(latest_row) if latest_row else None
    records = [row_to_dict(r) for r in rows]

    return {
        "latest": latest,
        "records": records,
        "total": grand_total,
        "filtered": filtered_total,
        "limit": limit,
        "offset": offset,
    }


@app.delete("/api/device-data/{device_id}/history")
def clear_device_history(
    device_id: str,
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
):
    """Cihaz geçmişini siler. from/to verilirse sadece o aralığı siler."""
    conn = get_db()
    sql = "DELETE FROM device_data WHERE device_id = ?"
    params = [device_id]
    if from_ts:
        sql += " AND timestamp >= ?"
        params.append(from_ts)
    if to_ts:
        sql += " AND timestamp <= ?"
        params.append(to_ts)
    cur = conn.execute(sql, params)
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    return {"ok": True, "deleted": deleted}


@app.get("/api/device-data/{device_id}/stats")
def get_device_stats(device_id: str):
    """Cihaz veri istatistikleri — toplam kayıt, ilk/son tarih."""
    conn = get_db()
    row = conn.execute(
        """SELECT COUNT(*) as total,
                  MIN(received_at) as first_at,
                  MAX(received_at) as last_at
           FROM device_data WHERE device_id = ?""",
        (device_id,),
    ).fetchone()
    conn.close()
    return {
        "total": row["total"],
        "firstAt": row["first_at"],
        "lastAt": row["last_at"],
    }

# ── USERS ─────────────────────────────────────────────────────
@app.get("/api/users")
def get_users():
    return _load_users()

@app.post("/api/users")
def add_user(body: UserCreate):
    users = _load_users()
    if any(u["username"] == body.username for u in users):
        raise HTTPException(400, f'"{body.username}" kullanıcı adı zaten alınmış')
    new_user = {"id": int(datetime.now().timestamp() * 1000), "username": body.username, "name": body.name, "role": body.role, "companyId": body.companyId, "locationId": body.locationId}
    users.append(new_user)
    _save_users(users)
    return new_user

@app.put("/api/users/{user_id}")
def update_user(user_id: int, body: UserUpdate):
    users = _load_users()
    user = next((u for u in users if u["id"] == user_id), None)
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    for k, v in body.dict(exclude_none=True).items():
        user[k] = v
    _save_users(users)
    return user

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int):
    users = _load_users()
    users = [u for u in users if u["id"] != user_id]
    _save_users(users)
    return {"ok": True}

# ── HEALTH ────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

# ── Frontend Statik Dosyalar ──────────────────────────────────
if os.path.isdir(os.path.join(DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

# Logo klasörü — dist/logo veya public/logo
LOGO_DIR = os.path.join(DIST_DIR, "logo")
if not os.path.isdir(LOGO_DIR):
    LOGO_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "logo")
if os.path.isdir(LOGO_DIR):
    app.mount("/logo", StaticFiles(directory=LOGO_DIR), name="logo")

# ── I/O Nokta Geçmişi API ─────────────────────────────────────
@app.get("/api/io-history/{device_id}/{address}")
def get_io_point_history(
    device_id: str,
    address: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
):
    conn = get_db()
    count_sql = "SELECT COUNT(*) FROM io_point_history WHERE device_id = ? AND address = ?"
    data_sql = "SELECT id, device_id, address, value, timestamp, received_at FROM io_point_history WHERE device_id = ? AND address = ?"
    params = [device_id, address]

    if from_ts:
        count_sql += " AND timestamp >= ?"
        data_sql += " AND timestamp >= ?"
        params.append(from_ts)
    if to_ts:
        count_sql += " AND timestamp <= ?"
        data_sql += " AND timestamp <= ?"
        params.append(to_ts)

    filtered = conn.execute(count_sql, params).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM io_point_history WHERE device_id = ? AND address = ?", (device_id, address)).fetchone()[0]

    data_sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    rows = conn.execute(data_sql, params + [limit, offset]).fetchall()
    conn.close()

    return {
        "records": [{"id": r["id"], "value": r["value"], "timestamp": r["timestamp"], "receivedAt": r["received_at"]} for r in rows],
        "total": total,
        "filtered": filtered,
        "limit": limit,
        "offset": offset,
    }

@app.delete("/api/io-history/{device_id}/{address}")
def clear_io_point_history(device_id: str, address: str):
    conn = get_db()
    cur = conn.execute("DELETE FROM io_point_history WHERE device_id = ? AND address = ?", (device_id, address))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    return {"ok": True, "deleted": deleted}

# ── Alarm API ─────────────────────────────────────────────────
class AlarmConfigBody(BaseModel):
    minValue: Optional[float] = None
    maxValue: Optional[float] = None
    enabled: Optional[bool] = True

@app.get("/api/alarm-config/{device_id}/{address}")
def get_alarm_config(device_id: str, address: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM alarm_configs WHERE device_id=? AND address=?", (device_id, address)).fetchone()
    conn.close()
    if not row:
        return {"deviceId": device_id, "address": address, "minValue": None, "maxValue": None, "enabled": True}
    return {"deviceId": row["device_id"], "address": row["address"], "minValue": row["min_value"], "maxValue": row["max_value"], "enabled": bool(row["enabled"])}

@app.put("/api/alarm-config/{device_id}/{address}")
def set_alarm_config(device_id: str, address: str, body: AlarmConfigBody):
    conn = get_db()
    existing = conn.execute("SELECT id FROM alarm_configs WHERE device_id=? AND address=?", (device_id, address)).fetchone()
    if existing:
        conn.execute("UPDATE alarm_configs SET min_value=?, max_value=?, enabled=? WHERE device_id=? AND address=?",
                     (body.minValue, body.maxValue, 1 if body.enabled else 0, device_id, address))
    else:
        conn.execute("INSERT INTO alarm_configs (device_id, address, min_value, max_value, enabled, created_at) VALUES (?,?,?,?,?,?)",
                     (device_id, address, body.minValue, body.maxValue, 1 if body.enabled else 0, datetime.now().isoformat()))
    conn.commit()

    # Mevcut alarm kayıtlarını temizle ve geçmiş verileri tarayarak yeniden oluştur
    conn.execute("DELETE FROM alarm_logs WHERE device_id=? AND address=?", (device_id, address))

    if body.enabled and (body.minValue is not None or body.maxValue is not None):
        now = datetime.now().isoformat()
        # Sensör verisi için address="value" — device_data tablosundan tara
        if address == "value":
            rows = conn.execute(
                "SELECT data_json, timestamp, received_at FROM device_data WHERE device_id=? ORDER BY timestamp",
                (device_id,)
            ).fetchall()
            for r in rows:
                try:
                    data = json.loads(r["data_json"]) if r["data_json"] else {}
                    val = float(data.get("value", 0))
                    ts = r["timestamp"] or r["received_at"]
                    ra = r["received_at"] or now
                    if body.maxValue is not None and val > body.maxValue:
                        conn.execute("INSERT INTO alarm_logs (device_id,address,value,alarm_type,limit_value,timestamp,received_at) VALUES (?,?,?,?,?,?,?)",
                                     (device_id, address, str(val), "max", body.maxValue, ts, ra))
                    if body.minValue is not None and val < body.minValue:
                        conn.execute("INSERT INTO alarm_logs (device_id,address,value,alarm_type,limit_value,timestamp,received_at) VALUES (?,?,?,?,?,?,?)",
                                     (device_id, address, str(val), "min", body.minValue, ts, ra))
                except Exception:
                    pass
        else:
            # PLC I/O noktası — io_point_history tablosundan tara
            rows = conn.execute(
                "SELECT value, timestamp, received_at FROM io_point_history WHERE device_id=? AND address=? ORDER BY timestamp",
                (device_id, address)
            ).fetchall()
            for r in rows:
                try:
                    val = float(r["value"])
                    ts = r["timestamp"] or r["received_at"]
                    ra = r["received_at"] or now
                    if body.maxValue is not None and val > body.maxValue:
                        conn.execute("INSERT INTO alarm_logs (device_id,address,value,alarm_type,limit_value,timestamp,received_at) VALUES (?,?,?,?,?,?,?)",
                                     (device_id, address, str(val), "max", body.maxValue, ts, ra))
                    if body.minValue is not None and val < body.minValue:
                        conn.execute("INSERT INTO alarm_logs (device_id,address,value,alarm_type,limit_value,timestamp,received_at) VALUES (?,?,?,?,?,?,?)",
                                     (device_id, address, str(val), "min", body.minValue, ts, ra))
                except Exception:
                    pass

    conn.commit()
    conn.close()
    return {"ok": True}

@app.get("/api/alarm-logs/{device_id}/{address}")
def get_alarm_logs(device_id: str, address: str, limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0),
                   from_ts: Optional[str] = Query(None, alias="from"), to_ts: Optional[str] = Query(None, alias="to")):
    conn = get_db()
    sql = "SELECT * FROM alarm_logs WHERE device_id=? AND address=?"
    count_sql = "SELECT COUNT(*) FROM alarm_logs WHERE device_id=? AND address=?"
    params = [device_id, address]
    if from_ts:
        sql += " AND timestamp>=?"
        count_sql += " AND timestamp>=?"
        params.append(from_ts)
    if to_ts:
        sql += " AND timestamp<=?"
        count_sql += " AND timestamp<=?"
        params.append(to_ts)
    filtered = conn.execute(count_sql, params).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM alarm_logs WHERE device_id=? AND address=?", (device_id, address)).fetchone()[0]
    sql += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    rows = conn.execute(sql, params + [limit, offset]).fetchall()
    conn.close()
    return {
        "records": [{"id": r["id"], "value": r["value"], "alarmType": r["alarm_type"], "limitValue": r["limit_value"], "timestamp": r["timestamp"], "receivedAt": r["received_at"]} for r in rows],
        "total": total, "filtered": filtered, "limit": limit, "offset": offset,
    }

@app.delete("/api/alarm-logs/{device_id}/{address}")
def clear_alarm_logs(device_id: str, address: str):
    conn = get_db()
    cur = conn.execute("DELETE FROM alarm_logs WHERE device_id=? AND address=?", (device_id, address))
    conn.commit()
    conn.close()
    return {"ok": True, "deleted": cur.rowcount}

def _check_and_log_alarms(conn, device_id, address, value_str, timestamp, now):
    """Alarm limitlerini kontrol et, aşılmışsa alarm kaydı oluştur."""
    try:
        val = float(value_str)
    except (ValueError, TypeError):
        return
    row = conn.execute("SELECT * FROM alarm_configs WHERE device_id=? AND address=? AND enabled=1", (device_id, address)).fetchone()
    if not row:
        return
    if row["max_value"] is not None and val > row["max_value"]:
        conn.execute("INSERT INTO alarm_logs (device_id, address, value, alarm_type, limit_value, timestamp, received_at) VALUES (?,?,?,?,?,?,?)",
                     (device_id, address, value_str, "max", row["max_value"], timestamp, now))
    if row["min_value"] is not None and val < row["min_value"]:
        conn.execute("INSERT INTO alarm_logs (device_id, address, value, alarm_type, limit_value, timestamp, received_at) VALUES (?,?,?,?,?,?,?)",
                     (device_id, address, value_str, "min", row["min_value"], timestamp, now))

# ── WebSocket — Canlı Veri İzleme ────────────────────────────
@app.websocket("/ws/device/{device_id}")
async def ws_device_live(websocket: WebSocket, device_id: str):
    await ws_manager.subscribe(websocket, device_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.unsubscribe(websocket, device_id)


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    file_path = os.path.join(DIST_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(DIST_DIR, "index.html"))
