# FastAPI + ClamAV deployment

यह worker security scan के लिए Python `clamd` client इस्तेमाल करता है।
`clamd` खुद antivirus engine नहीं है; actual ClamAV daemon अलग container में
चलना जरूरी है। इसलिए production Cloud Run deployment में FastAPI ingress
container के साथ `clamav` sidecar चलेगा:

```text
Cloud Tasks (OIDC)
        |
        v
FastAPI worker :8080  ---- localhost:3310 ---->  ClamAV sidecar (clamd)
        |
        +--> Supabase status/result transaction
```

## Cloud Run

`cloud-run-sidecar.yaml` एक template है। इसमें ये placeholders deployment से
पहले replace करें:

- `SERVICE_NAME`
- `WORKER_RUNTIME_SERVICE_ACCOUNT`
- `WORKER_IMAGE` (prefer immutable Artifact Registry digest)

फिर:

```powershell
gcloud run services replace deployment/cloud-run-sidecar.yaml `
  --region <REGION> `
  --project <PROJECT_ID>
```

Production में अलग से verify करें:

1. `fastapi-worker` ही एकमात्र ingress container और port `8080` है।
2. `clamav` sidecar port `3310` पर local network में उपलब्ध है; इसे public port
   के रूप में expose नहीं किया गया है।
3. Worker service private है और केवल approved Cloud Tasks service account को
   `roles/run.invoker` मिला है।
4. `DATABASE_URL`, OIDC settings और provider secrets Secret Manager bindings
   से आते हैं; YAML या git में नहीं।
5. ClamAV image को production में digest से pin किया गया है और signature
   database update/startup तथा scan latency को load test में verify किया गया है।

यह file deploy नहीं करती और live GCP state नहीं बदलती। पहले `gcloud run
services replace ... --dry-run`/staging revision से validate करें, फिर approved
deployment करें।

## Local development

Docker उपलब्ध होने पर repository worker directory से:

```powershell
docker compose -f docker-compose.security-scan.yml up --build
```

Compose file में `CLAMAV_HOST=clamav` service-DNS के लिए पहले से set है। Cloud Run sidecar
में दोनों containers का shared network namespace होने के कारण `127.0.0.1`
सही रहेगा।

Windows machine पर Docker/ClamAV daemon installed न हो तो security scan
runtime test **BLOCKED** रहेगा; उसे fake `clean` result से pass mark नहीं करना है।
