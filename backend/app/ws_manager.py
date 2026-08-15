from fastapi import WebSocket
import json
import asyncio
import uuid
import redis.asyncio as redis
from app.config import get_settings

settings = get_settings()


class ConnectionManager:
    """
    WebSocket bağlantı yöneticisi + Redis Pub/Sub.
    Tek worker'da çift broadcast önlenir (worker_id ile).
    """

    def __init__(self):
        self._subs: dict[str, set[WebSocket]] = {}
        self._worker_id = str(uuid.uuid4())[:8]

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

    async def _local_broadcast(self, device_id: str, data: dict):
        subs = self._subs.get(device_id, set()).copy()
        if not subs:
            return
        msg = json.dumps(data, ensure_ascii=False)
        dead = []
        for ws in subs:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.unsubscribe(ws, device_id)

    async def publish_and_broadcast(self, device_id: str, data: dict):
        """Local broadcast + Redis publish (worker_id ile işaretli)."""
        # Local push
        await self._local_broadcast(device_id, data)

        # Redis Pub/Sub — diğer worker'lar için (worker_id ekle ki kendimiz tekrar almayalım)
        try:
            r = redis.from_url(settings.redis_url, decode_responses=True)
            msg = json.dumps({
                "worker_id": self._worker_id,
                "device_id": device_id,
                "data": data,
            }, ensure_ascii=False)
            await r.publish("device_data_channel", msg)
            await r.aclose()
        except Exception:
            pass

    async def start_pubsub_listener(self):
        """Redis Pub/Sub dinleyici — sadece BAŞKA worker'lardan gelen mesajları broadcast eder."""
        while True:
            try:
                r = redis.from_url(settings.redis_url, decode_responses=True)
                pubsub = r.pubsub()
                await pubsub.subscribe("device_data_channel")

                async for message in pubsub.listen():
                    if message["type"] != "message":
                        continue
                    try:
                        payload = json.loads(message["data"])
                        # Kendi mesajımızı atla — çift broadcast önlenir
                        if payload.get("worker_id") == self._worker_id:
                            continue
                        device_id = payload["device_id"]
                        data = payload["data"]
                        await self._local_broadcast(device_id, data)
                    except Exception:
                        pass

            except Exception:
                await asyncio.sleep(1)


manager = ConnectionManager()
