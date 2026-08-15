import redis.asyncio as redis
import json
from app.config import get_settings

settings = get_settings()
_redis = None


async def get_redis():
    global _redis
    if _redis is None:
        try:
            _redis = redis.from_url(settings.redis_url, decode_responses=True)
            await _redis.ping()
        except Exception:
            _redis = None
    return _redis


async def cache_get(key: str):
    r = await get_redis()
    if not r:
        return None
    val = await r.get(key)
    return json.loads(val) if val else None


async def cache_set(key: str, data, ttl: int = 5):
    r = await get_redis()
    if not r:
        return
    await r.set(key, json.dumps(data, ensure_ascii=False), ex=ttl)


async def cache_delete(pattern: str):
    r = await get_redis()
    if not r:
        return
    keys = []
    async for key in r.scan_iter(match=pattern):
        keys.append(key)
    if keys:
        await r.delete(*keys)


async def publish(channel: str, data: dict):
    """Redis Pub/Sub ile mesaj yayınla — multi-worker senkronizasyonu için."""
    r = await get_redis()
    if not r:
        return
    await r.publish(channel, json.dumps(data, ensure_ascii=False))


async def buffer_push(device_id: str, record: dict):
    """Veriyi Redis buffer listesine ekle — batch insert için."""
    r = await get_redis()
    if not r:
        return False
    await r.rpush("device_data_buffer", json.dumps(record, ensure_ascii=False))
    return True


async def buffer_pop_batch(count: int = 500):
    """Buffer'dan toplu veri çek."""
    r = await get_redis()
    if not r:
        return []
    pipe = r.pipeline()
    pipe.lrange("device_data_buffer", 0, count - 1)
    pipe.ltrim("device_data_buffer", count, -1)
    results = await pipe.execute()
    return [json.loads(item) for item in results[0]]
