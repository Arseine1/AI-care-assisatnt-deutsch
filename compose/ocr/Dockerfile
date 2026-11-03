# Petit service HTTP d'OCR pour le connecteur « fichiers » (n8n) : OCRmyPDF + Tesseract (allemand, français, anglais).
FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 ocrmypdf ghostscript poppler-utils \
      tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY serveur.py /app/serveur.py

EXPOSE 8000
CMD ["python3", "/app/serveur.py"]
