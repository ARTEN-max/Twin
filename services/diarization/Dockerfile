FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including build tools
# gcc/build-essential: needed to compile TTS C extensions (monotonic_align)
# cargo/rustc: needed to compile sudachipy (TTS transitive dep for Japanese)
# libsndfile1/ffmpeg: audio processing
RUN apt-get update && apt-get install -y \
    build-essential \
    cargo \
    rustc \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip to ensure prebuilt wheels are used where available
RUN pip install --upgrade pip

# Install PyTorch first (largest dependency, use CPU-only for faster install)
# This is the slowest part, so we do it separately for better caching
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Copy requirements
COPY requirements.txt .

# Install remaining Python dependencies
# Install in stages to better utilize build cache
RUN pip install --no-cache-dir fastapi==0.109.0 uvicorn[standard]==0.27.0 python-multipart==0.0.6 && \
    pip install --no-cache-dir scikit-learn>=1.3.0 scipy>=1.10.0 && \
    pip install --no-cache-dir librosa>=0.10.0 soundfile>=0.12.1 && \
    pip install --no-cache-dir transformers==4.33.0 && \
    pip install --no-cache-dir TTS>=0.22.0 && \
    pip install --no-cache-dir matplotlib>=3.8.0 pydub>=0.25.1

# Auto-accept Coqui TTS license (required for non-interactive Docker)
ENV COQUI_TOS_AGREED=1

# Copy application
COPY main.py .

# Expose port
EXPOSE 8001

# Run the application
CMD ["python", "main.py"]
