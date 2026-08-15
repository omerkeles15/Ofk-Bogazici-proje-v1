from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from typing import Optional
import json

from app.database import get_db
from app.models import ESP32Device, Device, Location, Company
from app.schemas import (
    ESP32RegisterRequest, ESP32RegisterResponse,
    ESP32HeartbeatRequest, ESP32LinkRequest, ESP32LinkResponse,
)
from app.cache import cache_get, cache_set, cache_delete
from app.diff_engine import build_full_config_payload, build_diff_config_payload

router = APIRouter(prefix="/api", tags=["esp32"])

CACHE_KEY = "esp32:devices"
CACHE_TTL = 10


def compute_status(last_seen: Optional[datetime]) -> str:
    if last_seen is None:
        return "offline"
    now = datetime.utcnow()
    naive = last_seen.replace(tzinfo=None) if last_seen.tzinfo is not None else last_seen
    delta = (now - naive).total_seconds()
    if delta < 10:
        return "connected"
    elif delta < 30:
        return "waiting"
    return "offline"


# ── Register ─────────────────────────────────────────────────

@router.post("/esp32/register", response_model=ESP32RegisterResponse)
async def register_esp32(body: ESP32RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ESP32Device).where(ESP32Device.mac_address == body.mac_address)
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Aynı MAC, farklı tag → conflict işaretle
        if existing.esp32_tag != body.esp32_tag:
            existing.conflict = True
        existing.last_seen = datetime.utcnow()
        # company_id/location_id güncelle (provisioning değiştiyse)
        if body.company_id is not None:
            existing.company_id = body.company_id
        if body.location_id is not None:
            existing.location_id = body.location_id
        await db.commit()
        await cache_delete(CACHE_KEY)
        return ESP32RegisterResponse(esp32_id=existing.id, status="exists")

    # Yeni kayıt
    device = ESP32Device(
        esp32_tag=body.esp32_tag,
        device_type=body.device_type,
        model=body.model,
        mac_address=body.mac_address,
        firmware_version=body.firmware_version,
        status="connected",
        last_seen=datetime.utcnow(),
        company_id=body.company_id,
        location_id=body.location_id,
        conflict=False,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    await cache_delete(CACHE_KEY)
    return ESP32RegisterResponse(esp32_id=device.id, status="registered")


# ── Heartbeat ─────────────────────────────────────────────────

@router.post("/esp32/heartbeat")
async def heartbeat_esp32(body: ESP32HeartbeatRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ESP32Device).where(ESP32Device.id == body.esp32_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="ESP32 cihazı bulunamadı")

    now = datetime.utcnow()
    device.last_seen = now
    if body.ip_address is not None:
        device.ip_address = body.ip_address
    if body.firmware_version is not None:
        device.firmware_version = body.firmware_version

    status = compute_status(now)
    device.status = status

    response: dict = {"status": status}

    # ── Config ACK: ESP32 config'i aldığını bildirdi → teslim onaylandı ──
    if body.config_ack:
        device.pending_config = False

    # ── Device Status ACK: ESP32 hangi status'u aldığını bildiriyor ──
    if body.device_status_ack:
        # Bağlı Device'ın güncel status'uyla karşılaştır
        if device.device_id:
            from app.models import Device as ScadaDevice
            dev_r = await db.execute(
                select(ScadaDevice).where(ScadaDevice.id == device.device_id)
            )
            scada_dev = dev_r.scalar_one_or_none()
            if scada_dev:
                expected = scada_dev.status  # "online" veya "offline"
                received = body.device_status_ack
                if received != expected:
                    # ESP32 yanlış status'u aldı → tekrar gönder
                    device.pending_config = True
                    # config_json'daki device_status'ı güncelle
                    if device.config_json:
                        try:
                            cfg = json.loads(device.config_json)
                            cfg["device_status"] = expected
                            device.config_json = json.dumps(cfg, ensure_ascii=False)
                        except Exception:
                            pass

    # ── Bekleyen config var → gönder, ACK gelmeden pending_config=True KALSIN ──
    if not body.config_ack and device.pending_config and device.config_json:
        try:
            config_data = json.loads(device.config_json)
            response["config"] = config_data
        except Exception:
            response["config"] = None
        # pending_config=True KALIYOR — ACK beklenecek

    await db.commit()
    await cache_delete(CACHE_KEY)
    return response


# ── Link ──────────────────────────────────────────────────────

@router.post("/esp32/link", response_model=ESP32LinkResponse)
async def link_esp32_to_device(body: ESP32LinkRequest, db: AsyncSession = Depends(get_db)):
    esp32_r = await db.execute(select(ESP32Device).where(ESP32Device.id == body.esp32_id))
    esp32 = esp32_r.scalar_one_or_none()
    if not esp32:
        raise HTTPException(status_code=404, detail="ESP32 cihazı bulunamadı")

    device_r = await db.execute(select(Device).where(Device.id == body.device_id))
    device = device_r.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Cihaz bulunamadı")

    # ESP32 zaten başka bir cihaza bağlıysa reddet
    if esp32.device_id and esp32.device_id != body.device_id:
        raise HTTPException(
            status_code=409,
            detail=f"Bu ESP32 zaten '{esp32.device_id}' cihazına bağlı. Önce mevcut bağlantıyı kaldırın."
        )

    # Eski bağlantıyı temizle
    if esp32.device_id and esp32.device_id != body.device_id:
        old_dev_r = await db.execute(select(Device).where(Device.id == esp32.device_id))
        old_dev = old_dev_r.scalar_one_or_none()
        if old_dev:
            old_dev.esp32_id = None

    if device.esp32_id and device.esp32_id != body.esp32_id:
        old_esp_r = await db.execute(select(ESP32Device).where(ESP32Device.id == device.esp32_id))
        old_esp = old_esp_r.scalar_one_or_none()
        if old_esp:
            old_esp.device_id = None

    # Firma/Lokasyon adlarını al (full config için)
    company_name = ""
    location_name = ""
    if device.location_id:
        loc_r = await db.execute(select(Location).where(Location.id == device.location_id))
        loc = loc_r.scalar_one_or_none()
        if loc:
            location_name = loc.name
            comp_r = await db.execute(select(Company).where(Company.id == loc.company_id))
            comp = comp_r.scalar_one_or_none()
            if comp:
                company_name = comp.display_name

    # İlk bağlantı → full config
    config_payload = build_full_config_payload(device, company_name, location_name)
    esp32.device_id      = body.device_id
    esp32.pending_config = True
    esp32.config_json    = json.dumps(config_payload, ensure_ascii=False)
    device.esp32_id      = body.esp32_id

    # ESP32'nin company/location bilgisini Device'tan güncelle (Bağlı Cihazlar tablosu için)
    if device.location_id:
        esp32.location_id = device.location_id
        loc_r2 = await db.execute(select(Location).where(Location.id == device.location_id))
        loc2 = loc_r2.scalar_one_or_none()
        if loc2:
            esp32.company_id = loc2.company_id

    await db.commit()
    await cache_delete(CACHE_KEY)
    return ESP32LinkResponse(status="linked", esp32_id=body.esp32_id, device_id=body.device_id)


# ── Delete ────────────────────────────────────────────────────

@router.delete("/esp32/{esp32_id}")
async def delete_esp32(esp32_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ESP32Device).where(ESP32Device.id == esp32_id))
    esp32 = result.scalar_one_or_none()
    if not esp32:
        raise HTTPException(status_code=404, detail="ESP32 cihazı bulunamadı")

    # Bağlı Device'ın esp32_id'sini temizle
    if esp32.device_id:
        dev_r = await db.execute(select(Device).where(Device.id == esp32.device_id))
        dev = dev_r.scalar_one_or_none()
        if dev:
            dev.esp32_id = None

    await db.delete(esp32)
    await db.commit()
    await cache_delete(CACHE_KEY)
    return {"status": "deleted", "id": esp32_id}


# ── Tag Güncelleme ────────────────────────────────────────────

@router.patch("/esp32/{esp32_id}/tag")
async def update_esp32_tag(esp32_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    new_tag = body.get("esp32_tag", "").strip()
    if not new_tag:
        raise HTTPException(status_code=422, detail="esp32_tag boş olamaz")

    result = await db.execute(select(ESP32Device).where(ESP32Device.id == esp32_id))
    esp32 = result.scalar_one_or_none()
    if not esp32:
        raise HTTPException(status_code=404, detail="ESP32 cihazı bulunamadı")

    esp32.esp32_tag = new_tag
    esp32.conflict = False  # Manuel tag güncellemesi conflict'i temizler

    # Bağlı Device varsa full config yeniden gönder
    if esp32.device_id:
        dev_r = await db.execute(select(Device).where(Device.id == esp32.device_id))
        dev = dev_r.scalar_one_or_none()
        if dev:
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
            payload = build_full_config_payload(dev, company_name, location_name)
            esp32.config_json = json.dumps(payload, ensure_ascii=False)
            esp32.pending_config = True

    await db.commit()
    await cache_delete(CACHE_KEY)
    return {"status": "updated", "esp32_tag": new_tag}


# ── Devices List ──────────────────────────────────────────────

@router.get("/esp32/devices")
async def get_esp32_devices(db: AsyncSession = Depends(get_db)):
    cached = await cache_get(CACHE_KEY)
    if cached:
        return cached

    result = await db.execute(select(ESP32Device).order_by(ESP32Device.id))
    devices = result.scalars().all()

    data = []
    for d in devices:
        current_status = compute_status(d.last_seen)
        data.append({
            "id":               d.id,
            "esp32_tag":        d.esp32_tag,
            "device_type":      d.device_type,
            "model":            d.model,
            "mac_address":      d.mac_address,
            "ip_address":       d.ip_address,
            "firmware_version": d.firmware_version,
            "status":           current_status,
            "device_id":        d.device_id,
            "pending_config":   d.pending_config,
            "company_id":       d.company_id,
            "location_id":      d.location_id,
            "conflict":         d.conflict,
            "last_seen":        d.last_seen.isoformat() if d.last_seen else None,
            "created_at":       d.created_at.isoformat() if d.created_at else "",
        })

    await cache_set(CACHE_KEY, data, ttl=CACHE_TTL)
    return data
