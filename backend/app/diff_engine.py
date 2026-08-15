"""
OFK-SCADA DiffEngine
Coil/register yapılandırması değişikliklerini hesaplar.
İlk bağlantı → full payload, sonraki → diff payload.
"""
from __future__ import annotations
import json
from typing import Optional


# ── Varsayılan boş config ────────────────────────────────────
EMPTY_IO = {"coils": [], "dataRegisters": []}


def _normalize_io(raw) -> dict:
    if not raw or not isinstance(raw, dict):
        return {"coils": [], "dataRegisters": []}
    return {
        "coils":         raw.get("coils", []),
        "dataRegisters": raw.get("dataRegisters", []),
    }


# ESP32'nin ihtiyacı olan alanlar — tagName ve description gönderilmez
_ESP32_COIL_FIELDS    = {"plcTag", "coilAddress"}
_ESP32_REG_FIELDS     = {"plcTag", "registerAddress", "dataType"}


def _extract_esp32_fields(rows: list, fields: set) -> list:
    """Sadece ESP32'ye gönderilecek alanları al."""
    return [{k: v for k, v in row.items() if k in fields} for row in rows]


def compute_config_diff(old_config: Optional[dict], new_config: Optional[dict]) -> Optional[dict]:
    """
    İki plc_io_config arasındaki farkı hesaplar.
    - Karşılaştırma SADECE ESP32 alanları üzerinden yapılır (plcTag, coilAddress, registerAddress, length).
    - tagName ve description değişikliği ESP32'ye gönderilmez.
    - Değişen alan yoksa None döner.
    - Değişen varsa {"diff": True, "changed": {...}} döner.

    Property 3: Her diff anahtarı new_config'de mevcuttur ve old_config'den farklıdır.
    """
    old = _normalize_io(old_config)
    new = _normalize_io(new_config)

    changed = {}

    # Coil — sadece ESP32 alanlarını karşılaştır
    old_coils = _extract_esp32_fields(old.get("coils", []), _ESP32_COIL_FIELDS)
    new_coils = _extract_esp32_fields(new.get("coils", []), _ESP32_COIL_FIELDS)
    if json.dumps(old_coils, sort_keys=True) != json.dumps(new_coils, sort_keys=True):
        # ESP32'ye sadece adres alanlarını gönder (tagName/description olmadan)
        changed["coils"] = _extract_esp32_fields(new.get("coils", []), _ESP32_COIL_FIELDS)

    # DataRegister — sadece ESP32 alanlarını karşılaştır
    old_regs = _extract_esp32_fields(old.get("dataRegisters", []), _ESP32_REG_FIELDS)
    new_regs = _extract_esp32_fields(new.get("dataRegisters", []), _ESP32_REG_FIELDS)
    if json.dumps(old_regs, sort_keys=True) != json.dumps(new_regs, sort_keys=True):
        changed["dataRegisters"] = _extract_esp32_fields(new.get("dataRegisters", []), _ESP32_REG_FIELDS)

    if not changed:
        return None

    return {"diff": True, "changed": changed}


def apply_diff(base_config: dict, diff_payload: dict) -> dict:
    """
    Diff payload'u base_config'e uygular, yeni config döner.
    Property 4: apply_diff(C, compute_config_diff(C, C')) ≡ C'
    """
    result = _normalize_io(base_config)
    changed = diff_payload.get("changed", {})

    if "coils" in changed:
        result["coils"] = changed["coils"]
    if "dataRegisters" in changed:
        result["dataRegisters"] = changed["dataRegisters"]

    return result


def build_full_config_payload(device, company_name: str = "", location_name: str = "") -> dict:
    """
    İlk kayıt veya force_full için tam yapılandırma paketi üretir.
    device: Device ORM nesnesi
    """
    plc_io = device.plc_io_config or {}
    if isinstance(plc_io, dict):
        plc_io = {
            "coils":         plc_io.get("coils", []),
            "dataRegisters": plc_io.get("dataRegisters", []),
        }

    # ESP32'ye sadece adres bilgilerini gönder (tagName/description ESP32'ye gerekmez)
    esp32_plc_io = {
        "coils":         _extract_esp32_fields(plc_io.get("coils", []), _ESP32_COIL_FIELDS),
        "dataRegisters": _extract_esp32_fields(plc_io.get("dataRegisters", []), _ESP32_REG_FIELDS),
    }

    return {
        "diff":          False,
        "device_id":     device.id,
        "device_type":   device.device_type,
        "subtype":       device.subtype,
        "company_name":  company_name,
        "location_name": location_name,
        "modbus_config": device.modbus_config,
        "plc_io_config": esp32_plc_io,
        "device_status": device.status,
    }


def build_diff_config_payload(device, old_plc_io: Optional[dict]) -> Optional[dict]:
    """
    Sonraki değişiklikler için diff paketi üretir.
    Değişen yoksa None döner — ESP32'ye gereksiz paket gitmez.
    """
    diff = compute_config_diff(old_plc_io, device.plc_io_config)
    if diff is None:
        return None

    return {
        "device_id": device.id,
        **diff,
    }
