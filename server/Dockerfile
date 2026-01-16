# Backend Dockerfile for Python/FastAPI WebSocket Server
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Runtime environment variables for Azure Blob Storage (passed via docker run -e or docker-compose)
# AZURE_STORAGE_CONNECTION_STRING - Required for uploading jobs/transcripts to Azure Blob
# AZURE_CONTAINER_NAME - Optional, defaults to 'extracted-data'

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for data persistence and empty database file
RUN mkdir -p /app/transcripts /app/voice_notes_data && touch /app/notes.db

# Expose WebSocket port
EXPOSE 8080

# Health check - verify the streaming service process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pgrep -f 'python streaming_service.py' || exit 1

# Run the streaming service
CMD ["python", "streaming_service.py"]
