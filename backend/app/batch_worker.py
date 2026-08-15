"""
Batch Worker — Redis buffer'daki verileri toplu olarak PostgreSQL'e yazar.
Her 1 saniyede bir çalışır, 500'er kayıt alır.
Bu sayede 10.000 cihaz aynı anda veri gönderse bile DB yükü düzleşir.
"""
import asyncio
import json
from datetime import datetime
from app.database import AsyncSessionLocal
from app.models import DeviceData
from app.cache import buffer_pop_batch


async def flush_buffer():
    """Buffer'daki verileri PostgreSQL'e toplu yaz."""
    records = await buffer_pop_batch(500)
    if not records:
        return 0

    async with AsyncSessionLocal() as db:
        for r in records:
            db.add(DeviceData(
                device_id=r["device_id"],
                company_id=r.get("company_id"),
                location_id=r.get("location_id"),
                timestamp=r.get("timestamp"),
                type=r.get("type"),
                subtype=r.get("subtype"),
                data_json=r.get("data_json"),
                received_at=datetime.fromisoformat(r["received_at"]) if r.get("received_at") else datetime.now(),
            ))
        await db.commit()

    return len(records)


async def batch_worker_loop():
    """Sürekli çalışan batch worker döngüsü."""
    while True:
        try:
            count = await flush_buffer()
            if count > 0:
                pass  # Log: f"Flushed {count} records"
        except Exception:
            pass  # Log error
        await asyncio.sleep(1)  # Her 1 saniyede bir kontrol et
