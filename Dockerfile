# Stage 1: Build React Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend Environment
FROM python:3.11-slim
WORKDIR /app

# Install system tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and built frontend distribution
COPY . .
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Cloud runtime configuration
ENV HOST=0.0.0.0
ENV PORT=8000
ENV PIPELINE_MODE=cloud

EXPOSE 8000

CMD ["python", "server.py"]
