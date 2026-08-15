from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    user: dict
    token: str
    redirect: str

class CompanyCreate(BaseModel):
    displayName: str
    fullName: str
    managers: list = []

class CompanyUpdate(BaseModel):
    displayName: Optional[str] = None
    fullName: Optional[str] = None
    managers: Optional[list] = None

class LocationCreate(BaseModel):
    name: str
    managers: list = []
    users: list = []

class LocationUpdate(BaseModel):
    name: Optional[str] = None
    managers: Optional[list] = None
    users: Optional[list] = None

class DeviceCreateSchema(BaseModel):
    tagName: str
    deviceType: Optional[str] = None
    subtype: Optional[str] = None
    unit: Optional[str] = ""
    modbusConfig: Optional[dict] = None
    plcIoConfig: Optional[dict] = None
    unitPrice: Optional[float] = None

class DeviceUpdateSchema(BaseModel):
    tagName: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    status: Optional[str] = None
    deviceType: Optional[str] = None
    subtype: Optional[str] = None
    modbusConfig: Optional[dict] = None
    plcIoConfig: Optional[dict] = None
    ioTags: Optional[dict] = None
    unitPrice: Optional[float] = None

class UserCreate(BaseModel):
    username: str
    name: str
    role: str
    password: Optional[str] = "123456"
    companyId: Optional[int] = None
    locationId: Optional[int] = None

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    companyId: Optional[int] = None
    locationId: Optional[int] = None

class DeviceDataPayload(BaseModel):
    deviceId: str
    companyId: Optional[str] = None
    locationId: Optional[str] = None
    timestamp: Optional[str] = None
    type: Optional[str] = None
    subtype: Optional[str] = None
    data: Optional[dict] = None


# ESP32 Bağlantı Yönetimi Şemaları

class ESP32RegisterRequest(BaseModel):
    esp32_tag: str
    device_type: str
    model: str
    mac_address: str
    firmware_version: Optional[str] = "unknown"
    company_id:  Optional[int] = None
    location_id: Optional[int] = None

class ESP32RegisterResponse(BaseModel):
    esp32_id: int
    status: str  # "registered" | "exists"

class ESP32HeartbeatRequest(BaseModel):
    esp32_id: int
    ip_address: Optional[str] = None
    firmware_version: Optional[str] = None
    config_ack: Optional[bool] = False        # config paketi alındı bildirimi
    device_status_ack: Optional[str] = None   # ESP32'nin aldığı device_status ("online"/"offline")

class ESP32HeartbeatResponse(BaseModel):
    status: str  # "connected" | "waiting" | "offline"

class ESP32DeviceOut(BaseModel):
    id: int
    esp32_tag: str
    device_type: str
    model: str
    mac_address: str
    ip_address: Optional[str]
    firmware_version: Optional[str]
    status: str
    last_seen: Optional[str]
    created_at: str


# ESP32 ↔ Device Eşleştirme Şemaları

class ESP32LinkRequest(BaseModel):
    esp32_id: int
    device_id: str

class ESP32LinkResponse(BaseModel):
    status: str    # "linked"
    esp32_id: int
    device_id: str
