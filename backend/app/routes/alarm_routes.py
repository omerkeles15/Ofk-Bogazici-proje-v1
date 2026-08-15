from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional
from datetime import datetime
import json

from app.database import get_db
from app.models import AlarmConfig, AlarmLog, DeviceData, IOPointHistory
from app.schemas import DeviceDataPayload

router = APIRouter(prefix="/api", tags=["alarms"])


class AlarmConfigBody:
    pass

from pydantic import BaseModel

class AlarmConfigSchema(BaseModel):
    minValue: Optional[float] = None
    maxValue: Optional[float] = None
    enabled: Optional[bool] = True


@router.get("/alarm-config/{device_id}/{address}")
async def get_alarm_config(device_id: str, address: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AlarmConfig).where(AlarmConfig.device_id == device_id, AlarmConfig.address == address)
    )
    row = result.scalar_one_or_none()
    if not row:
        return {"deviceId": device_id, "address": address, "minValue": None, "maxValue": None, "enabled": True}
    return {"deviceId": row.device_id, "address": row.address, "minValue": row.min_value, "maxValue": row.max_value, "enabled": row.enabled}


@router.put("/alarm-config/{device_id}/{address}")
async def set_alarm_config(device_id: str, address: str, body: AlarmConfigSchema, db: AsyncSession = Depends(get_db)):
    # Mevcut config'i bul veya oluştur
    result = await db.execute(
        select(AlarmConfig).where(AlarmConfig.device_id == device_id, AlarmConfig.address == address)
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        cfg.min_value = body.minValue
        cfg.max_value = body.maxValue
        cfg.enabled = body.enabled
    else:
        cfg = AlarmConfig(device_id=device_id, address=address, min_value=body.minValue, max_value=body.maxValue, enabled=body.enabled)
        db.add(cfg)
    await db.commit()

    # Mevcut alarm loglarını temizle
    await db.execute(delete(AlarmLog).where(AlarmLog.device_id == device_id, AlarmLog.address == address))
    await db.commit()

    # Geçmiş verileri tarayarak alarm oluştur
    if body.enabled and (body.minValue is not None or body.maxValue is not None):
        if address == "value":
            # Sensör — device_data tablosundan tara
            rows = (await db.execute(
                select(DeviceData).where(DeviceData.device_id == device_id).order_by(DeviceData.timestamp)
            )).scalars().all()
            for r in rows:
                try:
                    data = json.loads(r.data_json) if r.data_json else {}
                    val = float(data.get("value", 0))
                    ts = r.timestamp or (r.received_at.isoformat() if r.received_at else "")
                    if body.maxValue is not None and val > body.maxValue:
                        db.add(AlarmLog(device_id=device_id, address=address, value=str(val), alarm_type="max", limit_value=body.maxValue, timestamp=ts))
                    if body.minValue is not None and val < body.minValue:
                        db.add(AlarmLog(device_id=device_id, address=address, value=str(val), alarm_type="min", limit_value=body.minValue, timestamp=ts))
                except Exception:
                    pass
        else:
            # PLC I/O noktası — io_point_history tablosundan tara
            rows = (await db.execute(
                select(IOPointHistory).where(IOPointHistory.device_id == device_id, IOPointHistory.address == address).order_by(IOPointHistory.timestamp)
            )).scalars().all()
            for r in rows:
                try:
                    val = float(r.value)
                    ts = r.timestamp or (r.received_at.isoformat() if r.received_at else "")
                    if body.maxValue is not None and val > body.maxValue:
                        db.add(AlarmLog(device_id=device_id, address=address, value=r.value, alarm_type="max", limit_value=body.maxValue, timestamp=ts))
                    if body.minValue is not None and val < body.minValue:
                        db.add(AlarmLog(device_id=device_id, address=address, value=r.value, alarm_type="min", limit_value=body.minValue, timestamp=ts))
                except Exception:
                    pass
        await db.commit()

    return {"ok": True}


@router.get("/alarm-logs/{device_id}/{address}")
async def get_alarm_logs(
    device_id: str, address: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
):
    where = [AlarmLog.device_id == device_id, AlarmLog.address == address]
    if from_ts:
        where.append(AlarmLog.timestamp >= from_ts)
    if to_ts:
        where.append(AlarmLog.timestamp <= to_ts)

    filtered = (await db.execute(select(func.count()).select_from(AlarmLog).where(*where))).scalar()
    total = (await db.execute(select(func.count()).select_from(AlarmLog).where(
        AlarmLog.device_id == device_id, AlarmLog.address == address
    ))).scalar()

    rows = (await db.execute(
        select(AlarmLog).where(*where).order_by(AlarmLog.timestamp.desc()).limit(limit).offset(offset)
    )).scalars().all()

    return {
        "records": [{"id": r.id, "value": r.value, "alarmType": r.alarm_type, "limitValue": r.limit_value,
                      "timestamp": r.timestamp, "receivedAt": r.received_at.isoformat() if r.received_at else None} for r in rows],
        "total": total, "filtered": filtered, "limit": limit, "offset": offset,
    }


@router.delete("/alarm-logs/{device_id}/{address}")
async def clear_alarm_logs(device_id: str, address: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(delete(AlarmLog).where(AlarmLog.device_id == device_id, AlarmLog.address == address))
    await db.commit()
    return {"ok": True, "deleted": result.rowcount}
