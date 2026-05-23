FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including build tools
# gcc/build-essential: needed to compile TTS C extensions (monotonic_align)
# cargo/rustc: needed to compile sudachipy (TTS transitive dep for Japanese)
# libsndfile1/ffmpeg: audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cargo \
    rustc \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip to ensure prebuilt wheels are used where available
RUN pip install --upgrade pip

# Install numpy first (must be < 2.0 for scipy compatibility)
RUN pip install --no-cache-dir "numpy<2.0.0"

# Install PyTorch (CPU-only for faster install)
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Copy requirements
COPY requirements.txt .

# Install remaining Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Auto-accept Coqui TTS license (required for non-interactive Docker)
ENV COQUI_TOS_AGREED=1

# Copy application
COPY main.py .

# Expose port
EXPOSE 8001

# Run the application
CMD ["python", "main.py"]
