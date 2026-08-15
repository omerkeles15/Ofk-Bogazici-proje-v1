from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    # PostgreSQL
    database_url: str = "postgresql+asyncpg://scada:scada123@localhost:5432/scada"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    secret_key: str = "ofk-scada-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480  # 8 saat

    # WebSocket
    ws_broadcast_interval: float = 3.0  # saniye

    # Uygulama
    app_name: str = "OFK SCADA"
    debug: bool = False

    # Frontend dist — Docker'da /app/dist, geliştirmede proje kökü/dist
    dist_dir: str = os.environ.get("DIST_DIR", os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "dist"
    ))
    logo_dir: str = os.environ.get("LOGO_DIR", os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "public", "logo"
    ))

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings():
    return Settings()
