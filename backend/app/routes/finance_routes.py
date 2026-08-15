from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from datetime import datetime

from app.database import get_db
from app.models import Company, Location, Device
router = APIRouter(prefix="/api", tags=["finance"])


@router.get("/finance/summary")
async def finance_summary(db: AsyncSession = Depends(get_db)):

    result = await db.execute(
        select(Company).options(
            selectinload(Company.locations).selectinload(Location.devices)
        )
    )
    companies = result.scalars().all()

    company_list = []
    grand_total = 0.0

    for company in companies:
        company_total = 0.0
        active_count = 0
        location_list = []

        for location in company.locations:
            loc_subtotal = 0.0
            device_list = []

            for device in location.devices:
                price = float(device.unit_price) if device.unit_price else 0.0
                is_active = device.status == "online"
                if is_active:
                    loc_subtotal += price
                    active_count += 1

                device_list.append({
                    "id":          device.id,
                    "tagName":     device.tag_name,
                    "deviceType":  device.device_type,
                    "status":      device.status,
                    "unit_price":  price,
                    "billable":    is_active,
                })

            location_list.append({
                "id":       location.id,
                "name":     location.name,
                "devices":  device_list,
                "subtotal": round(loc_subtotal, 2),
            })
            company_total += loc_subtotal

        company_list.append({
            "id":                  company.id,
            "name":                company.display_name,
            "locations":           location_list,
            "total":               round(company_total, 2),
            "active_device_count": active_count,
        })
        grand_total += company_total

    return {
        "companies":   company_list,
        "grand_total": round(grand_total, 2),
        "generated_at": datetime.utcnow().isoformat(),
    }
