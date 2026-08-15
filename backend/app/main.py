from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import asyncio
import os

from app.config import get_settings
from app.database import init_db
from app.routes import auth_routes, company_routes, device_data_routes, user_routes, alarm_routes, export_routes, report_routes, esp32_routes, finance_routes
from app.seed import seed_default_users
from app.ws_manager import manager
from app.batch_worker import batch_worker_loop

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    await seed_default_users()

    # Arka plan görevleri başlat
    batch_task = asyncio.create_task(batch_worker_loop())
    pubsub_task = asyncio.create_task(manager.start_pubsub_listener())

    yield

    # Shutdown
    batch_task.cancel()
    pubsub_task.cancel()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route'lar
app.include_router(auth_routes.router)
app.include_router(company_routes.router)
app.include_router(device_data_routes.router)
app.include_router(user_routes.router)
app.include_router(alarm_routes.router)
app.include_router(export_routes.router)
app.include_router(report_routes.router)
app.include_router(esp32_routes.router)
app.include_router(finance_routes.router)


# ── WebSocket — prefix'siz, doğrudan app'e bağlı ─────────────
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws/device/{device_id}")
async def ws_device_live(websocket: WebSocket, device_id: str):
    await manager.subscribe(websocket, device_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.unsubscribe(websocket, device_id)


@app.get("/api/health")
async def health():
    from datetime import datetime
    from app.cache import get_redis
    r = await get_redis()
    redis_ok = r is not None
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "redis": "connected" if redis_ok else "disconnected",
    }


# ── Frontend Statik Dosyalar ──────────────────────────────────
DIST_DIR = settings.dist_dir
LOGO_DIR = os.path.join(DIST_DIR, "logo")
if not os.path.isdir(LOGO_DIR):
    LOGO_DIR = settings.logo_dir

if os.path.isdir(os.path.join(DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

if os.path.isdir(LOGO_DIR):
    app.mount("/logo", StaticFiles(directory=LOGO_DIR), name="logo")


@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    file_path = os.path.join(DIST_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(DIST_DIR, "index.html"))
