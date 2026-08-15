from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest
from app.auth import verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

ROLE_REDIRECTS = {
    "admin": "/admin/dashboard",
    "company_manager": "/company/dashboard",
    "location_manager": "/location/dashboard",
    "user": "/user/dashboard",
}


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.username == req.username, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")

    token = create_access_token({"sub": user.id, "role": user.role})

    return {
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.name,
            "role": user.role,
            "companyId": user.company_id,
            "locationId": user.location_id,
        },
        "token": token,
        "redirect": ROLE_REDIRECTS.get(user.role, "/login"),
    }
