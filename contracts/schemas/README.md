# Contract schemas

यह folder reusable result और metadata schemas के लिए है।

- नए schemas JSON Schema Draft 2020-12 में बनाए जाएंगे।
- Existing Draft-07 contracts को बिना reviewed versioned migration के modify नहीं किया जाएगा।
- किसी schema में resume content, signed URL, access token, credential या अनावश्यक PII नहीं रखा जाएगा।
- `security-scan-result.v1.json` result metadata contract है; database का `security_scan_status` authoritative state रहेगा।

ये files contract drafts हैं। Security-task schema/model और dispatcher payload compatibility tests pass हो चुके हैं; NestJS producer path, runtime ClamAV और live security-scan E2E gates pass होने तक इन्हें implementation-complete/frozen नहीं माना जाएगा।
