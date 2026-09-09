# FastAPI + ClamAV Deployment

## Architecture

FastAPI worker resume bytes bhejta hai ClamAV Cloud Run service ko HTTP se scan ke liye.

```text
Cloud Tasks (OIDC)
        |
        v
FastAPI worker :8080  ---- HTTPS ---->  ClamAV Cloud Run (asia-south1)
        |
        +--> Supabase status/result transaction
```

## Key Files

| File | Description |
|------|-------------|
| `app/services/security_scanner.py` | HTTP client — calls Cloud Run `/scan` endpoint |
| `../08-clamav-cloudrun/` | ClamAV Cloud Run service (Dockerfile, deploy script, runbook) |

## Configuration (.env)

```bash
CLAMAV_HOST=https://clamav-scanner-xxxx.a.run.app   # Cloud Run URL
CLAMAV_PORT=443
CLAMAV_TIMEOUT_SECONDS=120
```

## How It Works

1. Resume upload hota hai
2. Cloud Task create hota hai `security_scan` type ka
3. FastAPI worker task receive karta hai
4. `security_scanner.py` resume bytes Cloud Run service ko HTTP se bhejta hai
5. Cloud Run pe ClamAV daemon scan karta hai (INSTREAM protocol)
6. Result wapas aata hai — `{"verdict":"clean"}` ya `{"verdict":"infected","reason":"..."}`
7. Worker DB mein status update karta hai (`clean` / `infected` / `quarantined`)
8. Agar clean hai → resume parsing ka Cloud Task emit hota hai

## Deploy

```bash
cd ../08-clamav-cloudrun
./deploy.sh
```

Full runbook: [08-clamav-cloudrun/DEPLOY-RUNBOOK.md](../08-clamav-cloudrun/DEPLOY-RUNBOOK.md)
