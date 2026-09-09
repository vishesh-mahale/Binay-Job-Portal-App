import socket
import os
import tempfile
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="ClamAV Scanner")

CLAMAV_HOST = "127.0.0.1"
CLAMAV_PORT = 3310
CLAMAV_TIMEOUT = int(os.getenv("CLAMAV_TIMEOUT_SECONDS", "60"))


@app.post("/scan")
async def scan_file(file: UploadFile = File(...)):
    content = await file.read()

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(CLAMAV_TIMEOUT)
        sock.connect((CLAMAV_HOST, CLAMAV_PORT))

        sock.send(b"INSTREAM\n")

        chunk_size = len(content)
        sock.send(chunk_size.to_bytes(4, byteorder="big"))
        sock.send(content)
        sock.send(b"\x00\x00\x00\x00")

        response = b""
        while True:
            data = sock.recv(4096)
            if not data:
                break
            response += data
            if b"\n" in response:
                break

        sock.close()

        response_str = response.decode("utf-8").strip()

        if "FOUND" in response_str:
            return {
                "verdict": "infected",
                "reason": response_str.split(":")[-1].strip(),
            }
        else:
            return {"verdict": "clean"}

    except socket.timeout:
        return JSONResponse(
            status_code=504,
            content={"verdict": "error", "reason": "ClamAV scan timeout"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"verdict": "error", "reason": str(e)},
        )


@app.get("/health")
async def health():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((CLAMAV_HOST, CLAMAV_PORT))
        sock.send(b"PING\n")
        response = sock.recv(1024).decode("utf-8").strip()
        sock.close()
        return {"status": "ok", "clamav": response}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "reason": str(e)},
        )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
