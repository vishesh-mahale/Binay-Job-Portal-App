# First Resume Upload: Security Scan और Parsed Review Form — Decision Question

## Current requirement

जब candidate पहली बार resume upload करता है, तो parsed resume data से review/edit
form auto-fill होना चाहिए। Candidate form को review और confirm करने के बाद ही
canonical profile tables update होंगी।

Candidate को upload request पर तुरंत acknowledgement चाहिए, लेकिन भारी parsing को
HTTP request के अंदर synchronous रखने से request timeout और poor UX हो सकता है।

## Proposed flow to verify

```text
Next.js upload
    ↓
NestJS authentication + ownership + file validation
(size, MIME, extension, magic bytes, checksum)
    ↓
Private Supabase Storage + uploaded_documents(status = pending)
    ↓
Immediate upload acknowledgement
    ↓
Security scan orchestration
    ↓
clean
    ↓
Resume parse task → FastAPI
    ↓
resume_parsed_data
    ↓
NestJS status/SSE update
    ↓
Review/Edit form auto-filled
    ↓
Candidate confirm/save
    ↓
Canonical profile transaction
```

`infected`, `failed` या invalid file होने पर parsing आगे नहीं बढ़नी चाहिए।

## Exact questions for independent review

1. क्या NestJS को upload के दौरान basic validation करनी चाहिए?
2. क्या full malware/antivirus scan उसी upload HTTP request में synchronous होना चाहिए,
   या upload के बाद asynchronous trusted scan होना चाहिए?
3. अगर scan asynchronous है, तो candidate को parsed review form तक कौन-सा status/SSE
   flow मिलेगा?
4. क्या clean scan के बाद ही `resume.parse.requested` event बनना चाहिए?
5. क्या security scan और parsing के बीच database state transition atomic और idempotent
   है?
6. Scanner unavailable, timeout, duplicate task या worker crash होने पर क्या होगा?
7. क्या first upload के लिए parser result आने से पहले canonical profile update रोकना
   पर्याप्त रूप से enforce होता है?
8. क्या application-specific resume और first profile resume का यही flow अलग होना चाहिए?

9. क्या ऊपर दिए गए विकल्पों के अलावा कोई बेहतर, सरल या अधिक सुरक्षित alternative है?
   Agents को कम-से-कम इन possibilities पर विचार करना चाहिए, लेकिन बिना assume किए:
   - NestJS में lightweight synchronous validation + अलग malware scanner;
   - upload quarantine area में रखना और clean होने के बाद parsing शुरू करना;
   - scanner को FastAPI service में अलग handler के रूप में रखना;
   - managed cloud malware-scanning service या ClamAV जैसे scanner का उपयोग;
   - parsing से पहले और बाद में दो-stage validation;
   - development और production के लिए अलग scanner strategy।

   हर alternative के लिए cost, latency, security, failure handling, operational
   complexity और existing architecture compatibility स्पष्ट लिखें। केवल नामों की
   list न दें; बताएं कि वह इस project में क्यों या क्यों नहीं उपयुक्त है।

## Constraints

- NestJS browser-facing validation/authorization और upload orchestration own करता है।
- FastAPI heavy resume parsing/AI extraction own करता है।
- Candidate confirmation से पहले canonical profile silently update नहीं होगी।
- Unsafe/unclean document parse नहीं होगा।
- Existing tables, events, queues और contracts के बाहर कुछ assume/invent नहीं करना है।
- External scanner call को open PostgreSQL business transaction के अंदर नहीं करना है।
- Outbox/Cloud Tasks का उपयोग तभी recommend करें जब repository evidence और lifecycle
  उससे compatible हो।

## Required agent response

हर agent इसी `s1` folder में अपनी file बनाए:

```text
<agent-name>-FIRST-RESUME-UPLOAD-SECURITY-AND-PARSING-FLOW-REVIEW.md
```

Response में अनिवार्य sections:

1. Repository evidence और exact file references
2. Synchronous बनाम asynchronous scan comparison
3. Recommended end-to-end flow
4. First-upload review/edit/canonical-confirmation flow
5. Failure, retry और idempotency handling
6. Existing schema/contract compatibility
7. Missing implementation या open gaps
8. Final verdict: APPROVED / NEEDS_CHANGE / BLOCKED

Status: `OPEN — INDEPENDENT ARCHITECT REVIEW REQUIRED`
