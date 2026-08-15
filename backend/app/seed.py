from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import User
from app.auth import hash_password

DEFAULT_USERS = [
    {"username": "admin", "password": "admin123", "role": "admin", "name": "Sistem Admini"},
]


async def seed_default_users():
    async with AsyncSessionLocal() as db:
        for u in DEFAULT_USERS:
            result = await db.execute(select(User).where(User.username == u["username"]))
            if result.scalar_one_or_none():
                continue
            user = User(
                username=u["username"],
                password_hash=hash_password(u["password"]),
                name=u["name"],
                role=u["role"],
                company_id=u.get("company_id"),
                location_id=u.get("location_id"),
            )
            db.add(user)
        await db.commit()
