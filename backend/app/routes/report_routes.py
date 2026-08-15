from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
import json, math

from app.database import get_db
from app.models import Company, Location, Device, DeviceData, IOPointHistory, AlarmConfig, AlarmLog
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/report/{device_id}", response_class=HTMLResponse)
async def generate_report(device_id: str, db: AsyncSession = Depends(get_db)):
    """Cihaz günlük raporu — HTML formatında, yazdırılabilir."""

    # Bugünün başlangıcı
    now = datetime.now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    day_end = now.isoformat()

    # Cihaz bilgisi
    dev_r = await db.execute(
        select(Device, Location, Company)
        .join(Location, Device.location_id == Location.id)
        .join(Company, Location.company_id == Company.id)
        .where(Device.id == device_id)
    )
    row = dev_r.first()
    if not row:
        return HTMLResponse("<h1>Cihaz bulunamadı</h1>", status_code=404)

    device, location, company = row

    html_parts = []
    html_parts.append(f"""<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SCADA Rapor — {device_id}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;padding:32px;max-width:900px;margin:0 auto;background:#f9fafb}}
.header{{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;padding:32px;border-radius:16px;margin-bottom:24px}}
.header h1{{font-size:24px;margin-bottom:4px}}
.header p{{opacity:0.8;font-size:13px}}
.card{{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}}
.card h2{{font-size:16px;color:#1e3a5f;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e5e7eb}}
.stat-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}}
.stat{{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center}}
.stat .label{{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}}
.stat .value{{font-size:22px;font-weight:700;color:#1f2937;margin-top:4px}}
.stat .sub{{font-size:11px;color:#9ca3af;margin-top:2px}}
.alarm-badge{{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}}
.alarm-max{{background:#fef2f2;color:#dc2626}}
.alarm-min{{background:#eff6ff;color:#2563eb}}
table{{width:100%;border-collapse:collapse;font-size:12px}}
th{{background:#f1f5f9;padding:8px 12px;text-align:left;font-weight:600;color:#475569;border-bottom:2px solid #e5e7eb}}
td{{padding:8px 12px;border-bottom:1px solid #f1f5f9}}
tr:hover td{{background:#f8fafc}}
.section-title{{font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px}}
.footer{{text-align:center;padding:24px;color:#9ca3af;font-size:11px}}
.no-print{{margin-bottom:16px}}
@media print{{.no-print{{display:none}}body{{padding:16px}}}}
</style></head><body>
<div class="no-print" style="display:flex;gap:8px;margin-bottom:16px">
<button onclick="window.print()" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px">🖨 Yazdır</button>
<button onclick="window.close()" style="padding:8px 20px;background:#e5e7eb;color:#374151;border:none;border-radius:8px;cursor:pointer;font-size:13px">Kapat</button>
</div>
<div class="header">
<h1>📊 SCADA Günlük Rapor</h1>
<p>{company.display_name} · {location.name} · {device_id}</p>
<p>Rapor Tarihi: {now.strftime('%d.%m.%Y %H:%M')} · Dönem: {now.strftime('%d.%m.%Y')} 00:00 — {now.strftime('%H:%M')}</p>
</div>
<div class="card">
<h2>Cihaz Bilgileri</h2>
<div class="stat-grid">
<div class="stat"><div class="label">Device ID</div><div class="value" style="font-size:16px">{device.id}</div></div>
<div class="stat"><div class="label">Tag</div><div class="value" style="font-size:14px">{device.tag_name}</div></div>
<div class="stat"><div class="label">Tip</div><div class="value" style="font-size:14px">{(device.device_type or '').upper()}</div><div class="sub">{device.subtype or ''}</div></div>
<div class="stat"><div class="label">Durum</div><div class="value" style="font-size:14px;color:{'#16a34a' if device.status=='online' else '#dc2626'}">{'Aktif' if device.status=='online' else 'Pasif'}</div></div>
</div></div>""")

    if device.device_type == "sensor":
        # Sensör raporu
        rows = (await db.execute(
            select(DeviceData).where(DeviceData.device_id == device_id, DeviceData.timestamp >= day_start).order_by(DeviceData.timestamp)
        )).scalars().all()

        values = []
        for r in rows:
            try:
                d = json.loads(r.data_json) if r.data_json else {}
                values.append({"val": float(d.get("value", 0)), "ts": r.timestamp})
            except:
                pass

        total = len(values)
        if total > 0:
            vals = [v["val"] for v in values]
            mn, mx, avg = min(vals), max(vals), sum(vals) / len(vals)
            mn_ts = next(v["ts"] for v in values if v["val"] == mn)
            mx_ts = next(v["ts"] for v in values if v["val"] == mx)
            std = math.sqrt(sum((v - avg) ** 2 for v in vals) / len(vals))

            # Alarm bilgisi
            alarm_r = await db.execute(select(AlarmConfig).where(AlarmConfig.device_id == device_id, AlarmConfig.address == "value"))
            alarm_cfg = alarm_r.scalar_one_or_none()
            alarm_count = 0
            max_alarms = min_alarms = 0
            if alarm_cfg:
                al_r = await db.execute(select(func.count()).select_from(AlarmLog).where(
                    AlarmLog.device_id == device_id, AlarmLog.address == "value", AlarmLog.timestamp >= day_start))
                alarm_count = al_r.scalar()
                max_r = await db.execute(select(func.count()).select_from(AlarmLog).where(
                    AlarmLog.device_id == device_id, AlarmLog.address == "value", AlarmLog.alarm_type == "max", AlarmLog.timestamp >= day_start))
                max_alarms = max_r.scalar()
                min_r = await db.execute(select(func.count()).select_from(AlarmLog).where(
                    AlarmLog.device_id == device_id, AlarmLog.address == "value", AlarmLog.alarm_type == "min", AlarmLog.timestamp >= day_start))
                min_alarms = min_r.scalar()

            html_parts.append(f"""<div class="card"><h2>📈 Günlük Veri Özeti — {device.unit or ''}</h2>
<div class="stat-grid">
<div class="stat"><div class="label">Toplam Kayıt</div><div class="value">{total:,}</div></div>
<div class="stat"><div class="label">Minimum</div><div class="value">{mn:.2f}</div><div class="sub">{mn_ts[-8:] if mn_ts else ''}</div></div>
<div class="stat"><div class="label">Maksimum</div><div class="value">{mx:.2f}</div><div class="sub">{mx_ts[-8:] if mx_ts else ''}</div></div>
<div class="stat"><div class="label">Ortalama</div><div class="value">{avg:.2f}</div></div>
<div class="stat"><div class="label">Değişim Aralığı</div><div class="value">{mx - mn:.2f}</div></div>
<div class="stat"><div class="label">Std. Sapma</div><div class="value">{std:.2f}</div></div>
</div>""")
            if alarm_cfg:
                html_parts.append(f"""<div class="section-title">⚠ Alarm Özeti</div>
<div class="stat-grid">
<div class="stat"><div class="label">Toplam Alarm</div><div class="value" style="color:#dc2626">{alarm_count}</div></div>
<div class="stat"><div class="label">Maks Alarm (&gt;{alarm_cfg.max_value or '—'})</div><div class="value">{max_alarms}</div></div>
<div class="stat"><div class="label">Min Alarm (&lt;{alarm_cfg.min_value or '—'})</div><div class="value">{min_alarms}</div></div>
<div class="stat"><div class="label">Alarm Oranı</div><div class="value">{alarm_count/total*100:.2f}%</div></div>
</div>""")
            html_parts.append("</div>")
        else:
            html_parts.append('<div class="card"><p style="text-align:center;color:#9ca3af;padding:24px">Bugün veri kaydı yok</p></div>')

    else:
        # PLC raporu
        io_cfg = device.plc_io_config or {}
        io_tags = device.io_tags or {}

        # Tüm adresleri bul
        addr_r = await db.execute(
            select(IOPointHistory.address).where(IOPointHistory.device_id == device_id, IOPointHistory.timestamp >= day_start).distinct()
        )
        addresses = sorted([r[0] for r in addr_r.all()])

        # Dijital noktalar
        digital_addrs = [a for a in addresses if a.startswith("X") or a.startswith("Y")]
        analog_addrs = [a for a in addresses if a.startswith("AI") or a.startswith("AO")]
        register_addrs = [a for a in addresses if a.startswith("D")]

        if digital_addrs:
            html_parts.append('<div class="card"><h2>🔘 Dijital Giriş/Çıkış Özeti</h2><table><thead><tr><th>Adres</th><th>Tag</th><th>Kayıt</th><th>Durum Değişikliği</th><th>Son Durum</th></tr></thead><tbody>')
            for addr in digital_addrs:
                rows = (await db.execute(
                    select(IOPointHistory).where(IOPointHistory.device_id == device_id, IOPointHistory.address == addr, IOPointHistory.timestamp >= day_start).order_by(IOPointHistory.timestamp)
                )).scalars().all()
                total = len(rows)
                changes = sum(1 for i in range(1, len(rows)) if rows[i].value != rows[i-1].value)
                last_val = rows[-1].value if rows else "—"
                tag = io_tags.get(addr, "")
                color = "#16a34a" if last_val == "1" else "#dc2626"
                status = "ON" if last_val == "1" else "OFF"
                html_parts.append(f'<tr><td><b>{addr}</b></td><td>{tag}</td><td>{total:,}</td><td>{changes}</td><td style="color:{color};font-weight:600">{status}</td></tr>')
            html_parts.append('</tbody></table></div>')

        for group_name, group_addrs, icon in [("Analog Giriş/Çıkış", analog_addrs, "📊"), ("Data Register", register_addrs, "📋")]:
            if not group_addrs:
                continue
            html_parts.append(f'<div class="card"><h2>{icon} {group_name} Özeti</h2><table><thead><tr><th>Adres</th><th>Tag</th><th>Kayıt</th><th>Min</th><th>Max</th><th>Ort</th><th>Aralık</th><th>Alarm</th></tr></thead><tbody>')
            for addr in group_addrs:
                rows = (await db.execute(
                    select(IOPointHistory).where(IOPointHistory.device_id == device_id, IOPointHistory.address == addr, IOPointHistory.timestamp >= day_start).order_by(IOPointHistory.timestamp)
                )).scalars().all()
                vals = []
                for r in rows:
                    try:
                        vals.append(float(r.value))
                    except:
                        pass
                total = len(vals)
                tag = io_tags.get(addr, "")
                if total > 0:
                    mn, mx, avg = min(vals), max(vals), sum(vals)/len(vals)
                    # Alarm sayısı
                    al_r = await db.execute(select(func.count()).select_from(AlarmLog).where(
                        AlarmLog.device_id == device_id, AlarmLog.address == addr, AlarmLog.timestamp >= day_start))
                    al_count = al_r.scalar()
                    alarm_html = f'<span class="alarm-badge alarm-max">⚠ {al_count}</span>' if al_count > 0 else '<span style="color:#9ca3af">0</span>'
                    html_parts.append(f'<tr><td><b>{addr}</b></td><td>{tag}</td><td>{total:,}</td><td>{mn:.1f}</td><td>{mx:.1f}</td><td>{avg:.1f}</td><td>{mx-mn:.1f}</td><td>{alarm_html}</td></tr>')
                else:
                    html_parts.append(f'<tr><td><b>{addr}</b></td><td>{tag}</td><td colspan="6" style="color:#9ca3af">Veri yok</td></tr>')
            html_parts.append('</tbody></table></div>')

    # Footer
    html_parts.append(f"""<div class="footer">
<p>Bu rapor {now.strftime('%d.%m.%Y %H:%M:%S')} tarihinde otomatik oluşturulmuştur.</p>
<p>{company.display_name} · SCADA Dashboard</p>
</div></body></html>""")

    return HTMLResponse("\n".join(html_parts))
