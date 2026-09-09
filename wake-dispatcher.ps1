while ($true) {
    try {
        Invoke-RestMethod -Uri "http://localhost:3002/internal/dispatcher/wake" -Method POST -Headers @{"x-webhook-secret"="752ff6a339a8af94d5f6d3d8af276b0d33a323eed9beee97e3638cddea04a684"} -TimeoutSec 5 | Out-Null
    } catch {}
    Start-Sleep -Seconds 10
}
