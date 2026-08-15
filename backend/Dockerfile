FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend kaynak kodu
COPY . .

# Frontend build dosyaları — dist/ klasörü /app/dist olarak kopyalanır
COPY dist/ /app/dist/

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
