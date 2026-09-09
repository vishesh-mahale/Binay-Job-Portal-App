"""
Test script for ClamAV Cloud Run deployment.
Run this after deploying the Cloud Run service.

Usage:
  python test-clamav.py <SERVICE_URL>

Example:
  python test-clamav.py https://clamav-scanner-xxxx-uc.a.run.app
"""

import sys
import httpx


def test_health(base_url: str):
    print(f"Testing health endpoint: {base_url}/health")
    try:
        resp = httpx.get(f"{base_url}/health", timeout=10)
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.json()}")
        return resp.status_code == 200
    except Exception as e:
        print(f"  Error: {e}")
        return False


def test_clean_scan(base_url: str, token: str):
    print(f"\nTesting clean file scan...")
    try:
        resp = httpx.post(
            f"{base_url}/scan",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("test.txt", b"This is a clean test file.", "text/plain")},
            timeout=60,
        )
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.json()}")
        return resp.json().get("verdict") == "clean"
    except Exception as e:
        print(f"  Error: {e}")
        return False


def test_eicar_scan(base_url: str, token: str):
    print(f"\nTesting EICAR test file (should detect as infected)...")
    eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    try:
        resp = httpx.post(
            f"{base_url}/scan",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("eicar.com", eicar, "application/octet-stream")},
            timeout=60,
        )
        print(f"  Status: {resp.status_code}")
        print(f"  Response: {resp.json()}")
        return resp.json().get("verdict") == "infected"
    except Exception as e:
        print(f"  Error: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python test-clamav.py <SERVICE_URL>")
        print("Example: python test-clamav.py https://clamav-scanner-xxxx-uc.a.run.app")
        sys.exit(1)

    base_url = sys.argv[1].rstrip("/")

    # Get identity token for authenticated requests
    import subprocess
    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-identity-token"],
            text=True,
        ).strip()
    except Exception:
        print("Warning: Could not get identity token. Trying unauthenticated...")
        token = ""

    print("=" * 60)
    print("ClamAV Cloud Run Test")
    print("=" * 60)

    results = []
    results.append(("Health", test_health(base_url)))
    if token:
        results.append(("Clean Scan", test_clean_scan(base_url, token)))
        results.append(("EICAR Detection", test_eicar_scan(base_url, token)))

    print("\n" + "=" * 60)
    print("Results:")
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {name}: {status}")

    all_passed = all(r[1] for r in results)
    print("=" * 60)
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
