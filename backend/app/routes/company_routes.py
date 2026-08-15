from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
import json
from app.database import get_db
from app.models import Company, Location, Device
from app.schemas import CompanyCreate, CompanyUpdate, LocationCreate, LocationUpdate
from app.schemas import DeviceCreateSchema, DeviceUpdateSchema
from app.cache import cache_get, cache_set, cache_delete
from datetime import datetime

router = APIRouter(prefix="/api", tags=["companies"])
async def _notify_esp32_if_linked(dev: Device, db, force_full: bool = False):
    """Cihaza bağlı ESP32 varsa config güncelle (diff veya full) ve pending_config=True yap."""
    await db.refresh(dev)
    if not dev.esp32_id:
        return
    from app.models import ESP32Device, Location, Company
    from app.diff_engine import build_full_config_payload, build_diff_config_payload

    esp32_r = await db.execute(select(ESP32Device).where(ESP32Device.id == dev.esp32_id))
    esp32 = esp32_r.scalar_one_or_none()
    if not esp32:
        return

    # Firma/Lokasyon adlarını al
    company_name = ""
    location_name = ""
    if dev.location_id:
        loc_r = await db.execute(select(Location).where(Location.id == dev.location_id))
        loc = loc_r.scalar_one_or_none()
        if loc:
            location_name = loc.name
            comp_r = await db.execute(select(Company).where(Company.id == loc.company_id))
            comp = comp_r.scalar_one_or_none()
            if comp:
                company_name = comp.display_name

    # İlk bağlantı veya force_full → full payload
    old_config_json = esp32.config_json
    if not old_config_json or force_full:
        payload = build_full_config_payload(dev, company_name, location_name)
    else:
        # Önceki config'den eski plc_io_config'i çıkar
        try:
            import json as _json
            old_config = _json.loads(old_config_json)
            old_plc_io = old_config.get("plc_io_config")
        except Exception:
            old_plc_io = None

        diff_payload = build_diff_config_payload(dev, old_plc_io)
        if diff_payload is None:
            # Değişen yoksa sadece device_status güncelle
            payload = {"device_id": dev.id, "device_status": dev.status, "diff": False, "no_change": True}
        else:
            payload = {**diff_payload, "device_status": dev.status}

    import json as _json
    esp32.config_json = _json.dumps(payload, ensure_ascii=False)
    esp32.pending_config = True
    await db.commit()




def _company_to_dict(c):
    return {
        "id": c.id,
        "displayName": c.display_name,
        "fullName": c.full_name,
        "managers": c.managers or [],
        "locations": [_location_to_dict(l) for l in (c.locations or [])],
    }


def _location_to_dict(l):
    return {
        "id": l.id,
        "name": l.name,
        "managers": l.managers or [],
        "users": l.users or [],
        "devices": [_device_to_dict(d) for d in (l.devices or [])],
    }


def _device_to_dict(d):
    return {
        "id": d.id,
        "tagName": d.tag_name,
        "deviceType": d.device_type,
        "subtype": d.subtype,
        "unit": d.unit,
        "value": d.value,
        "status": d.status,
        "modbusConfig": d.modbus_config,
        "plcIoConfig": d.plc_io_config,
        "ioTags": d.io_tags,
        "esp32Id": d.esp32_id,
        "unitPrice": float(d.unit_price) if d.unit_price is not None else 0.0,
    }


@router.get("/companies")
async def get_companies(db: AsyncSession = Depends(get_db)):
    cached = await cache_get("companies:all")
    if cached:
        return cached

    from app.models import DeviceData

    result = await db.execute(
        select(Company)
        .options(selectinload(Company.locations).selectinload(Location.devices))
        .order_by(Company.id)
    )
    companies = result.scalars().all()

    # Tüm cihaz ID'lerini topla
    all_device_ids = []
    for c in companies:
        for l in (c.locations or []):
            for d in (l.devices or []):
                all_device_ids.append(d.id)

    # Her cihazın son verisini çek
    latest_map = {}
    for did in all_device_ids:
        latest_q = await db.execute(
            select(DeviceData)
            .where(DeviceData.device_id == did)
            .order_by(DeviceData.timestamp.desc())
            .limit(1)
        )
        row = latest_q.scalar_one_or_none()
        if row and row.data_json:
            latest_map[did] = json.loads(row.data_json)

    def _dev_dict_with_latest(d):
        dd = _device_to_dict(d)
        latest = latest_map.get(d.id)
        if latest:
            dd["value"] = float(latest.get("value", 0)) if latest.get("value") else dd.get("value", 0)
            dd["lastValue"] = latest.get("value")
            dd["lastUnit"] = latest.get("unit")
        return dd

    def _loc_dict_with_latest(l):
        return {
            "id": l.id,
            "name": l.name,
            "managers": l.managers or [],
            "users": l.users or [],
            "devices": [_dev_dict_with_latest(d) for d in (l.devices or [])],
        }

    data = []
    for c in companies:
        data.append({
            "id": c.id,
            "displayName": c.display_name,
            "fullName": c.full_name,
            "managers": c.managers or [],
            "locations": [_loc_dict_with_latest(l) for l in (c.locations or [])],
        })

    await cache_set("companies:all", data, ttl=10)
    return data


@router.post("/companies")
async def add_company(body: CompanyCreate, db: AsyncSession = Depends(get_db)):
    comp = Company(display_name=body.displayName, full_name=body.fullName, managers=body.managers)
    db.add(comp)
    await db.commit()
    await db.refresh(comp)
    await cache_delete("companies:*")
    return {"id": comp.id, "displayName": comp.display_name, "fullName": comp.full_name, "managers": comp.managers, "locations": []}


@router.put("/companies/{company_id}")
async def update_company(company_id: int, body: CompanyUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")
    if body.displayName is not None:
        comp.display_name = body.displayName
    if body.fullName is not None:
        comp.full_name = body.fullName
    if body.managers is not None:
        comp.managers = body.managers
    await db.commit()
    await cache_delete("companies:*")
    return {"id": comp.id, "displayName": comp.display_name, "fullName": comp.full_name, "managers": comp.managers}


@router.delete("/companies/{company_id}")
async def delete_company(company_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Company)
        .options(selectinload(Company.locations).selectinload(Location.devices))
        .where(Company.id == company_id)
    )
    comp = result.scalar_one_or_none()
    if not comp:
        raise HTTPException(404, "Firma bulunamadı")

    # Bağlı tüm cihazların ESP32 linkini temizle
    from app.models import ESP32Device
    device_ids = [d.id for l in (comp.locations or []) for d in (l.devices or [])]
    if device_ids:
        esp32_r = await db.execute(
            select(ESP32Device).where(ESP32Device.device_id.in_(device_ids))
        )
        for esp32 in esp32_r.scalars().all():
            esp32.device_id = None
            esp32.pending_config = False

    await db.delete(comp)
    await db.commit()
    await cache_delete("companies:*")
    await cache_delete("esp32:devices")
    return {"ok": True}


# ── LOCATIONS ─────────────────────────────────────────────────
@router.post("/companies/{company_id}/locations")
async def add_location(company_id: int, body: LocationCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Firma bulunamadı")
    loc = Location(company_id=company_id, name=body.name, managers=body.managers, users=body.users)
    db.add(loc)
    await db.commit()
    await db.refresh(loc)
    await cache_delete("companies:*")
    return {"id": loc.id, "name": loc.name, "managers": loc.managers or [], "users": loc.users or [], "devices": []}


@router.put("/companies/{company_id}/locations/{location_id}")
async def update_location(company_id: int, location_id: int, body: LocationUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Location).where(Location.id == location_id, Location.company_id == company_id))
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(404, "Lokasyon bulunamadı")
    if body.name is not None:
        loc.name = body.name
    if body.managers is not None:
        loc.managers = body.managers
    if body.users is not None:
        loc.users = body.users
    await db.commit()
    await cache_delete("companies:*")
    return {"ok": True}


@router.delete("/companies/{company_id}/locations/{location_id}")
async def delete_location(company_id: int, location_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Location)
        .options(selectinload(Location.devices))
        .where(Location.id == location_id, Location.company_id == company_id)
    )
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(404, "Lokasyon bulunamadı")

    # Bağlı cihazların ESP32 linkini temizle
    from app.models import ESP32Device
    device_ids = [d.id for d in (loc.devices or [])]
    if device_ids:
        esp32_r = await db.execute(
            select(ESP32Device).where(ESP32Device.device_id.in_(device_ids))
        )
        for esp32 in esp32_r.scalars().all():
            esp32.device_id = None
            esp32.pending_config = False

    await db.delete(loc)
    await db.commit()
    await cache_delete("companies:*")
    await cache_delete("esp32:devices")
    return {"ok": True}


# ── DEVICES ───────────────────────────────────────────────────
@router.get("/devices")
async def get_all_devices(db: AsyncSession = Depends(get_db)):
    from app.models import DeviceData
    result = await db.execute(
        select(Device, Location, Company)
        .join(Location, Device.location_id == Location.id)
        .join(Company, Location.company_id == Company.id)
    )
    rows = result.all()

    # Her cihazın son verisini çek
    device_ids = [d.id for d, l, c in rows]
    latest_map = {}
    if device_ids:
        from sqlalchemy import text
        for did in device_ids:
            latest_q = await db.execute(
                select(DeviceData)
                .where(DeviceData.device_id == did)
                .order_by(DeviceData.timestamp.desc())
                .limit(1)
            )
            latest_row = latest_q.scalar_one_or_none()
            if latest_row and latest_row.data_json:
                latest_map[did] = json.loads(latest_row.data_json)

    # ESP32 tag map'ini oluştur
    from app.models import ESP32Device as ESP32Dev
    esp32_r = await db.execute(select(ESP32Dev).where(ESP32Dev.device_id.isnot(None)))
    esp32_map = {e.device_id: e.esp32_tag for e in esp32_r.scalars().all()}

    devices = []
    for d, l, c in rows:
        dev = {
            **_device_to_dict(d),
            "companyId": c.id, "companyName": c.display_name,
            "locationId": l.id, "locationName": l.name,
            "esp32Tag": esp32_map.get(d.id),  # None ise frontend "—" gösterir
        }
        latest = latest_map.get(d.id)
        if latest:
            dev["lastValue"] = latest.get("value")
            dev["lastUnit"] = latest.get("unit")
        devices.append(dev)
    return devices


@router.get("/devices/next-id")
async def peek_next_device_id(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device.id).order_by(Device.id.desc()).limit(1))
    last = result.scalar_one_or_none()
    if last and last.startswith("DEV-"):
        num = int(last.split("-")[1]) + 1
    else:
        num = 1
    return {"nextId": f"DEV-{num:03d}"}


@router.post("/companies/{cid}/locations/{lid}/devices")
async def add_device(cid: int, lid: int, body: DeviceCreateSchema, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device.id).order_by(Device.id.desc()).limit(1))
    last = result.scalar_one_or_none()
    num = int(last.split("-")[1]) + 1 if last and last.startswith("DEV-") else 1
    new_id = f"DEV-{num:03d}"
    dev = Device(
        id=new_id, location_id=lid, tag_name=body.tagName,
        device_type=body.deviceType, subtype=body.subtype, unit=body.unit,
        modbus_config=body.modbusConfig, plc_io_config=body.plcIoConfig,
    )
    db.add(dev)
    await db.commit()
    await db.refresh(dev)
    await cache_delete("companies:*")
    # I/O veya status değişikliği → bağlı ESP32'ye bildir (her zaman full config)
    if body.plcIoConfig is not None or body.status is not None:
        await _notify_esp32_if_linked(dev, db, force_full=True)
    return _device_to_dict(dev)


@router.delete("/companies/{cid}/locations/{lid}/devices/{device_id}")
async def delete_device(cid: int, lid: int, device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404)
    # Cihazla ilgili tüm verileri sil
    from app.models import DeviceData, IOPointHistory, AlarmConfig, AlarmLog
    await db.execute(delete(DeviceData).where(DeviceData.device_id == device_id))
    await db.execute(delete(IOPointHistory).where(IOPointHistory.device_id == device_id))
    await db.execute(delete(AlarmConfig).where(AlarmConfig.device_id == device_id))
    await db.execute(delete(AlarmLog).where(AlarmLog.device_id == device_id))
    # Bağlı ESP32 linkini temizle
    from app.models import ESP32Device
    if dev.esp32_id:
        esp32_r = await db.execute(select(ESP32Device).where(ESP32Device.id == dev.esp32_id))
        esp32 = esp32_r.scalar_one_or_none()
        if esp32:
            esp32.device_id = None
            esp32.pending_config = False

    await db.delete(dev)
    await db.commit()
    await cache_delete("companies:*")
    await cache_delete("esp32:devices")
    return {"ok": True}


@router.post("/companies/{cid}/locations/{lid}/devices/{device_id}/toggle")
async def toggle_device(cid: int, lid: int, device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404, "Cihaz bulunamadı")
    dev.status = "offline" if dev.status == "online" else "online"
    await db.commit()
    await cache_delete("companies:*")
    # Bağlı ESP32'ye yeni config + status bildir
    await _notify_esp32_if_linked(dev, db)
    return {"id": dev.id, "status": dev.status}


@router.put("/companies/{cid}/locations/{lid}/devices/{device_id}")
async def update_device(cid: int, lid: int, device_id: str, body: DeviceUpdateSchema, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Device).where(Device.id == device_id))
    dev = result.scalar_one_or_none()
    if not dev:
        raise HTTPException(404, "Cihaz bulunamadı")
    if body.tagName is not None:
        dev.tag_name = body.tagName
    if body.deviceType is not None:
        dev.device_type = body.deviceType
    if body.subtype is not None:
        dev.subtype = body.subtype
    if body.unit is not None:
        dev.unit = body.unit
    if body.status is not None:
        dev.status = body.status
    if body.modbusConfig is not None:
        dev.modbus_config = body.modbusConfig
    if body.plcIoConfig is not None:
        dev.plc_io_config = body.plcIoConfig
    if body.ioTags is not None:
        dev.io_tags = body.ioTags
    if body.unitPrice is not None:
        dev.unit_price = body.unitPrice
    await db.commit()
    await db.refresh(dev)
    await cache_delete("companies:*")
    # I/O veya status değişikliği → bağlı ESP32'ye bildir (her zaman full config)
    if body.plcIoConfig is not None or body.status is not None:
        await _notify_esp32_if_linked(dev, db, force_full=True)
    return _device_to_dict(dev)
