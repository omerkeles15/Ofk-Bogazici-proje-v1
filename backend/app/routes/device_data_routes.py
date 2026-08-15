from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional
from datetime import datetime
import json

from app.database import get_db
from app.models import DeviceData, Device
from app.schemas import DeviceDataPayload
from app.ws_manager import manager
from app.cache import cache_get, cache_set, cache_delete, buffer_push

router = APIRouter(prefix="/api", tags=["device-data"])


def _expand_compact_plc(compact_data, plc_io_config):
    """Kompakt PLC verisini genişletilmiş formata çevirir."""
    io = plc_io_config or {}
    expanded = {}

    di_str = compact_data.get("DI", "0")
    di_count = (io.get("digitalInputs") or {}).get("count", 0)
    if di_count > 0:
        di_val = int(di_str)
        addrs, group = [], 2
        for i in range(min(8, di_count)):
            addrs.append(f"X{i}")
        while len(addrs) < di_count:
            if group % 10 in (8, 9):
                group += 1
                continue
            for i in range(8):
                if len(addrs) >= di_count:
                    break
                addrs.append(f"X{group * 10 + i}")
            group += 1
        expanded["digitalInputs"] = {a: ("1" if (di_val >> i) & 1 else "0") for i, a in enumerate(addrs)}

    do_str = compact_data.get("DO", "0")
    do_count = (io.get("digitalOutputs") or {}).get("count", 0)
    if do_count > 0:
        do_val = int(do_str)
        addrs, group = [], 2
        for i in range(min(6, do_count)):
            addrs.append(f"Y{i}")
        while len(addrs) < do_count:
            if group % 10 in (8, 9):
                group += 1
                continue
            for i in range(8):
                if len(addrs) >= do_count:
                    break
                addrs.append(f"Y{group * 10 + i}")
            group += 1
        expanded["digitalOutputs"] = {a: ("1" if (do_val >> i) & 1 else "0") for i, a in enumerate(addrs)}

    ai_str = compact_data.get("AI", "")
    ai_cfg = io.get("analogInputs") or []
    if ai_str and ai_cfg:
        vals = ai_str.split(",")
        expanded["analogInputs"] = {f"AI{c.get('channel',i)}": {"value": vals[i].strip() if i < len(vals) else "0", "dataType": c.get("dataType","word")} for i, c in enumerate(ai_cfg)}

    ao_str = compact_data.get("AO", "")
    ao_cfg = io.get("analogOutputs") or []
    if ao_str and ao_cfg:
        vals = ao_str.split(",")
        expanded["analogOutputs"] = {f"AO{c.get('channel',i)}": {"value": vals[i].strip() if i < len(vals) else "0", "dataType": c.get("dataType","word")} for i, c in enumerate(ao_cfg)}

    dr_str = compact_data.get("DR", "")
    dr_cfg = io.get("dataRegister") or {}
    if dr_str:
        vals = dr_str.split(",")
        start = dr_cfg.get("start", 0)
        dt = dr_cfg.get("dataType", "word")
        expanded["dataRegisters"] = {f"D{start+i}": {"value": v.strip(), "dataType": dt} for i, v in enumerate(vals)}

    return expanded


@router.post("/device-data")
async def receive_device_data(payload: DeviceDataPayload, db: AsyncSession = Depends(get_db)):
    """
    IoT cihazdan gelen veri akışı — doğrulama + kayıt + push.
    Kontroller:
    1. Cihaz sistemde kayıtlı mı?
    2. Cihaz aktif mi?
    3. Gelen veri tipi cihaz tipiyle uyuşuyor mu?
    """

    # ── Cihaz doğrulama ──────────────────────────────────────
    result = await db.execute(select(Device).where(Device.id == payload.deviceId))
    device = result.scalar_one_or_none()

    if not device:
        raise HTTPException(404, f"Cihaz '{payload.deviceId}' sistemde kayıtlı değil.")

    if device.status != "online":
        raise HTTPException(403, f"Cihaz '{payload.deviceId}' pasif durumda. Veri kabul edilmiyor.")

    if payload.type and device.device_type and payload.type != device.device_type:
        raise HTTPException(400, f"Tip uyuşmazlığı: Cihaz tipi '{device.device_type}' ama gelen '{payload.type}'.")

    if payload.subtype and device.subtype and payload.subtype != device.subtype:
        raise HTTPException(400, f"Alt tip uyuşmazlığı: Cihaz alt tipi '{device.subtype}' ama gelen '{payload.subtype}'.")

    if device.device_type == "sensor" and payload.data:
        incoming_unit = payload.data.get("unit", "")
        if device.unit and incoming_unit and incoming_unit != device.unit:
            raise HTTPException(400, f"Birim uyuşmazlığı: Cihaz birimi '{device.unit}' ama gelen '{incoming_unit}'.")

    # ── Kompakt PLC formatı kontrolü ve genişletme ─────────
    data_to_store = payload.data
    if device.device_type == "plc" and payload.data and any(k in payload.data for k in ("DI","DO","AI","AO","DR")):
        data_to_store = _expand_compact_plc(payload.data, device.plc_io_config)

    # ── Veriyi kaydet ────────────────────────────────────────
    now = datetime.now().isoformat()

    # Timestamp'ı lokal saate normalize et (UTC offset varsa çevir)
    ts = payload.timestamp or now
    try:
        from datetime import timezone, timedelta
        parsed = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        if parsed.tzinfo is not None:
            local_tz = timezone(timedelta(hours=3))  # Türkiye UTC+3
            ts = parsed.astimezone(local_tz).strftime('%Y-%m-%dT%H:%M:%S.%f')
    except Exception:
        pass

    record = {
        "device_id": payload.deviceId,
        "company_id": payload.companyId,
        "location_id": payload.locationId,
        "timestamp": ts,
        "type": payload.type,
        "subtype": payload.subtype,
        "data_json": json.dumps(data_to_store, ensure_ascii=False) if data_to_store else None,
        "received_at": now,
    }

    # 1. Redis buffer'a ekle (batch insert için)
    buffered = await buffer_push(payload.deviceId, record)

    # Buffer çalışmazsa doğrudan DB'ye yaz (fallback)
    if not buffered:
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as db:
            db.add(DeviceData(**record))
            await db.commit()

    # 2. PLC I/O nokta geçmişi kaydet
    if device.device_type == "plc" and data_to_store:
        from app.models import IOPointHistory
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as io_db:
            for section in ("digitalInputs", "digitalOutputs"):
                for addr, val in (data_to_store.get(section) or {}).items():
                    io_db.add(IOPointHistory(device_id=payload.deviceId, address=addr, value=str(val), timestamp=ts))
            for section in ("analogInputs", "analogOutputs", "dataRegisters"):
                for addr, obj in (data_to_store.get(section) or {}).items():
                    val = obj.get("value", "0") if isinstance(obj, dict) else str(obj)
                    io_db.add(IOPointHistory(device_id=payload.deviceId, address=addr, value=val, timestamp=ts))
            await io_db.commit()

    # 3. Alarm kontrolü
    from app.models import AlarmConfig, AlarmLog
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as alarm_db:
        if device.device_type == "sensor" and data_to_store:
            val_str = data_to_store.get("value") if isinstance(data_to_store, dict) else None
            if val_str:
                try:
                    val = float(val_str)
                    cfg_r = await alarm_db.execute(select(AlarmConfig).where(AlarmConfig.device_id == payload.deviceId, AlarmConfig.address == "value", AlarmConfig.enabled == True))
                    cfg = cfg_r.scalar_one_or_none()
                    if cfg:
                        if cfg.max_value is not None and val > cfg.max_value:
                            alarm_db.add(AlarmLog(device_id=payload.deviceId, address="value", value=val_str, alarm_type="max", limit_value=cfg.max_value, timestamp=ts))
                        if cfg.min_value is not None and val < cfg.min_value:
                            alarm_db.add(AlarmLog(device_id=payload.deviceId, address="value", value=val_str, alarm_type="min", limit_value=cfg.min_value, timestamp=ts))
                except Exception:
                    pass
        if device.device_type == "plc" and data_to_store:
            for section in ("analogInputs", "analogOutputs", "dataRegisters"):
                for addr, obj in (data_to_store.get(section) or {}).items():
                    val_str = obj.get("value", "0") if isinstance(obj, dict) else str(obj)
                    try:
                        val = float(val_str)
                        cfg_r = await alarm_db.execute(select(AlarmConfig).where(AlarmConfig.device_id == payload.deviceId, AlarmConfig.address == addr, AlarmConfig.enabled == True))
                        cfg = cfg_r.scalar_one_or_none()
                        if cfg:
                            if cfg.max_value is not None and val > cfg.max_value:
                                alarm_db.add(AlarmLog(device_id=payload.deviceId, address=addr, value=val_str, alarm_type="max", limit_value=cfg.max_value, timestamp=ts))
                            if cfg.min_value is not None and val < cfg.min_value:
                                alarm_db.add(AlarmLog(device_id=payload.deviceId, address=addr, value=val_str, alarm_type="min", limit_value=cfg.min_value, timestamp=ts))
                    except Exception:
                        pass
        await alarm_db.commit()

    # 4. WebSocket push — anında tüm izleyicilere
    ws_data = {
        "type": "new_data",
        "record": {
            "deviceId": payload.deviceId,
            "companyId": payload.companyId,
            "locationId": payload.locationId,
            "timestamp": ts,
            "type": payload.type,
            "subtype": payload.subtype,
            "data": data_to_store,
            "receivedAt": now,
        },
    }
    await manager.publish_and_broadcast(payload.deviceId, ws_data)

    # Companies cache'ini temizle — son değer güncellensin
    await cache_delete("companies:*")

    return {"ok": True, "receivedAt": now}


@router.get("/device-data/{device_id}")
async def get_device_data(
    device_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    # Cache
    cache_key = f"device:{device_id}:L{limit}:O{offset}:F{from_ts}:T{to_ts}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    where = [DeviceData.device_id == device_id]
    if from_ts:
        where.append(DeviceData.timestamp >= from_ts)
    if to_ts:
        where.append(DeviceData.timestamp <= to_ts)

    filtered_total = (await db.execute(
        select(func.count()).select_from(DeviceData).where(*where)
    )).scalar()

    grand_total = (await db.execute(
        select(func.count()).select_from(DeviceData).where(DeviceData.device_id == device_id)
    )).scalar()

    rows = (await db.execute(
        select(DeviceData).where(*where).order_by(DeviceData.timestamp.desc()).limit(limit).offset(offset)
    )).scalars().all()

    latest_row = (await db.execute(
        select(DeviceData).where(DeviceData.device_id == device_id).order_by(DeviceData.timestamp.desc()).limit(1)
    )).scalar_one_or_none()

    def to_dict(r):
        return {
            "id": r.id,
            "deviceId": r.device_id,
            "companyId": r.company_id,
            "locationId": r.location_id,
            "timestamp": r.timestamp,
            "type": r.type,
            "subtype": r.subtype,
            "data": json.loads(r.data_json) if r.data_json else None,
            "receivedAt": r.received_at.isoformat() if r.received_at else None,
        }

    result = {
        "latest": to_dict(latest_row) if latest_row else None,
        "records": [to_dict(r) for r in rows],
        "total": grand_total,
        "filtered": filtered_total,
        "limit": limit,
        "offset": offset,
    }
    await cache_set(cache_key, result, ttl=3)
    return result


@router.delete("/device-data/{device_id}/history")
async def clear_device_history(
    device_id: str,
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    where = [DeviceData.device_id == device_id]
    if from_ts:
        where.append(DeviceData.timestamp >= from_ts)
    if to_ts:
        where.append(DeviceData.timestamp <= to_ts)
    result = await db.execute(delete(DeviceData).where(*where))
    await db.commit()
    await cache_delete(f"device:{device_id}:*")
    return {"ok": True, "deleted": result.rowcount}


@router.get("/device-data/{device_id}/stats")
async def get_device_stats(device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            func.count().label("total"),
            func.min(DeviceData.received_at).label("first_at"),
            func.max(DeviceData.received_at).label("last_at"),
        ).where(DeviceData.device_id == device_id)
    )
    row = result.one()
    return {
        "total": row.total,
        "firstAt": row.first_at.isoformat() if row.first_at else None,
        "lastAt": row.last_at.isoformat() if row.last_at else None,
    }


# ── I/O Nokta Geçmişi ─────────────────────────────────────────
@router.get("/io-history/{device_id}/{address}")
async def get_io_point_history(
    device_id: str,
    address: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    from app.models import IOPointHistory
    where = [IOPointHistory.device_id == device_id, IOPointHistory.address == address]
    if from_ts:
        where.append(IOPointHistory.timestamp >= from_ts)
    if to_ts:
        where.append(IOPointHistory.timestamp <= to_ts)

    filtered_total = (await db.execute(select(func.count()).select_from(IOPointHistory).where(*where))).scalar()
    grand_total = (await db.execute(select(func.count()).select_from(IOPointHistory).where(
        IOPointHistory.device_id == device_id, IOPointHistory.address == address
    ))).scalar()

    rows = (await db.execute(
        select(IOPointHistory).where(*where).order_by(IOPointHistory.timestamp.desc()).limit(limit).offset(offset)
    )).scalars().all()

    return {
        "records": [{"id": r.id, "value": r.value, "timestamp": r.timestamp, "receivedAt": r.received_at.isoformat() if r.received_at else None} for r in rows],
        "total": grand_total,
        "filtered": filtered_total,
        "limit": limit,
        "offset": offset,
    }

@router.delete("/io-history/{device_id}/{address}")
async def clear_io_point_history(device_id: str, address: str, db: AsyncSession = Depends(get_db)):
    from app.models import IOPointHistory
    result = await db.execute(delete(IOPointHistory).where(IOPointHistory.device_id == device_id, IOPointHistory.address == address))
    await db.commit()
    return {"ok": True, "deleted": result.rowcount}


# WebSocket endpoint kaldırıldı — app/main.py'de tanımlı
