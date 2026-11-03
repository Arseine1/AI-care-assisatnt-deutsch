"""Dienst zur Textextraktion aus PDFs.

POST /texte   Körper = rohes PDF  ->  {"texte": "...", "methode": "texte" | "ocr", "pages": n}
GET  /sante   ->  {"etat": "ok"}

Ein PDF, das bereits Text enthält, wird mit pdftotext gelesen (schnell, originalgetreu). Ein „gescanntes“ PDF (nur Bild)
läuft über OCRmyPDF (Tesseract, Deutsch + Französisch + Englisch). Es werden keine Daten auf der Festplatte aufbewahrt.
"""
import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SEUIL_TEXTE = 40  # darunter gilt das PDF als Bild
LANGUES = os.environ.get("OCR_LANGUES", "deu+fra+eng")


def pdf_vers_texte(contenu: bytes) -> dict:
    with tempfile.TemporaryDirectory() as dossier:
        source = os.path.join(dossier, "entree.pdf")
        with open(source, "wb") as f:
            f.write(contenu)

        # 1) nativer Text
        natif = subprocess.run(["pdftotext", "-layout", source, "-"], capture_output=True, text=True)
        texte = natif.stdout.strip() if natif.returncode == 0 else ""
        if len(texte) >= SEUIL_TEXTE:
            return {"texte": texte, "methode": "texte"}

        # 2) OCR: Es wird nur der erkannte Text behalten (Datei „sidecar“)
        sortie = os.path.join(dossier, "sortie.pdf")
        sidecar = os.path.join(dossier, "texte.txt")
        ocr = subprocess.run(
            ["ocrmypdf", "--force-ocr", "-l", LANGUES, "--sidecar", sidecar, source, sortie],
            capture_output=True, text=True,
        )
        if ocr.returncode != 0 or not os.path.exists(sidecar):
            raise RuntimeError(f"OCRmyPDF ist fehlgeschlagen (Code {ocr.returncode}): {ocr.stderr[-400:]}")
        with open(sidecar, encoding="utf-8") as f:
            return {"texte": f.read().strip(), "methode": "ocr"}


class Gestionnaire(BaseHTTPRequestHandler):
    def _repondre(self, code: int, corps: dict):
        donnees = json.dumps(corps, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(donnees)))
        self.end_headers()
        self.wfile.write(donnees)

    def do_GET(self):
        if self.path == "/sante":
            self._repondre(200, {"etat": "ok"})
        else:
            self._repondre(404, {"erreur": "inconnu"})

    def do_POST(self):
        if self.path != "/texte":
            return self._repondre(404, {"erreur": "inconnu"})
        taille = int(self.headers.get("Content-Length", "0"))
        if taille <= 0:
            return self._repondre(400, {"erreur": "leerer Körper: das rohe PDF senden"})
        try:
            self._repondre(200, pdf_vers_texte(self.rfile.read(taille)))
        except Exception as e:  # noqa: BLE001
            self._repondre(500, {"erreur": str(e)})

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8000), Gestionnaire).serve_forever()
