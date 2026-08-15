from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserUpdate
from app.auth import hash_password

router = APIRouter(prefix="/api", tags=["users"])


def _user_to_dict(u):
    return {
        "id": u.id,
        "username": u.username,
        "name": u.name,
        "role": u.role,
        "companyId": u.company_id,
        "locationId": u.location_id,
    }


@router.get("/users")
async def get_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.is_active == True).order_by(User.id))
    return [_user_to_dict(u) for u in result.scalars().all()]


@router.post("/users")
async def add_user(body: UserCreate, db: AsyncSession = Depends(get_db)):
    exists = await db.execute(select(User).where(User.username == body.username, User.is_active == True))
    if exists.scalar_one_or_none():
        raise HTTPException(400, f'"{body.username}" kullanıcı adı zaten alınmış')
    user = User(
        username=body.username,
        password_hash=hash_password(body.password or "123456"),
        name=body.name,
        role=body.role,
        company_id=body.companyId,
        location_id=body.locationId,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _user_to_dict(user)


@router.put("/users/{user_id}")
async def update_user(user_id: int, body: UserUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        user.role = body.role
    if body.companyId is not None:
        user.company_id = body.companyId
    if body.locationId is not None:
        user.location_id = body.locationId
    await db.commit()
    return _user_to_dict(user)


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    await db.delete(user)
    await db.commit()
    return {"ok": True}
