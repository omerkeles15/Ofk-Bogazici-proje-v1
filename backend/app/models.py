from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Index, JSON, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    display_name = Column(String(200), nullable=False)
    full_name = Column(String(500))
    managers = Column(JSON, default=list)
    created_at = Column(DateTime, server_default=func.now())

    locations = relationship("Location", back_populates="company", cascade="all, delete-orphan")


class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    managers = Column(JSON, default=list)
    users = Column(JSON, default=list)
    created_at = Column(DateTime, server_default=func.now())

    company = relationship("Company", back_populates="locations")
    devices = relationship("Device", back_populates="location", cascade="all, delete-orphan")


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(20), primary_key=True)  # DEV-001
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False)
    tag_name = Column(String(200), nullable=False)
    device_type = Column(String(50))  # sensor, plc
    subtype = Column(String(50))
    unit = Column(String(20), default="")
    value = Column(Float, default=0)
    status = Column(String(20), default="offline")
    modbus_config = Column(JSON)
    plc_io_config = Column(JSON)
    io_tags = Column(JSON)
    esp32_id = Column(Integer, nullable=True)  # soft link → esp32_devices.id
    unit_price = Column(Numeric(10, 2), default=0, nullable=False, server_default='0')
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    location = relationship("Location", back_populates="devices")


class DeviceData(Base):
    __tablename__ = "device_data"
    __table_args__ = (
        Index("idx_dd_device_ts", "device_id", "timestamp", postgresql_using="btree"),
        Index("idx_dd_device_ra", "device_id", "received_at", postgresql_using="btree"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(20), nullable=False, index=True)
    company_id = Column(String(20))
    location_id = Column(String(20))
    timestamp = Column(String(50))
    type = Column(String(50))
    subtype = Column(String(50))
    data_json = Column(Text)
    received_at = Column(DateTime, server_default=func.now())


class IOPointHistory(Base):
    """Her I/O noktasının (X0, Y0, AI0, D0 vs.) ayrı geçmiş kaydı."""
    __tablename__ = "io_point_history"
    __table_args__ = (
        Index("idx_ioph_device_addr", "device_id", "address", postgresql_using="btree"),
        Index("idx_ioph_device_addr_ts", "device_id", "address", "timestamp", postgresql_using="btree"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(20), nullable=False)
    address = Column(String(20), nullable=False)  # X0, Y0, AI0, AO0, D0
    value = Column(String(50), nullable=False)
    timestamp = Column(String(50))
    received_at = Column(DateTime, server_default=func.now())


class AlarmConfig(Base):
    __tablename__ = "alarm_configs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(20), nullable=False)
    address = Column(String(20), nullable=False)
    min_value = Column(Float)
    max_value = Column(Float)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class AlarmLog(Base):
    __tablename__ = "alarm_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(20), nullable=False, index=True)
    address = Column(String(20), nullable=False)
    value = Column(String(50), nullable=False)
    alarm_type = Column(String(10), nullable=False)
    limit_value = Column(Float)
    timestamp = Column(String(50))
    received_at = Column(DateTime, server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(200), nullable=False)
    name = Column(String(200), nullable=False)
    role = Column(String(50), nullable=False)  # admin, company_manager, location_manager, user
    company_id = Column(Integer)
    location_id = Column(Integer)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class ESP32Device(Base):
    __tablename__ = "esp32_devices"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    esp32_tag        = Column(String(200), nullable=False)
    device_type      = Column(String(100), nullable=False)
    model            = Column(String(100), nullable=False)
    mac_address      = Column(String(17), unique=True, nullable=False, index=True)
    ip_address       = Column(String(45), nullable=True)
    firmware_version = Column(String(50), nullable=True)
    status           = Column(String(20), default="offline")
    last_seen        = Column(DateTime, nullable=True)
    device_id        = Column(String(20), nullable=True)   # soft link → devices.id
    pending_config   = Column(Boolean, default=False)
    config_json      = Column(Text, nullable=True)
    company_id       = Column(Integer, nullable=True)   # provisioning'den gelen firma ID
    location_id      = Column(Integer, nullable=True)   # provisioning'den gelen lokasyon ID
    conflict         = Column(Boolean, default=False)   # aynı MAC farklı tag çakışması
    created_at       = Column(DateTime, server_default=func.now())
