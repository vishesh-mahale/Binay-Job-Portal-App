# User Journeys — Hinglish

Ye folder user-facing stories ko UI → API → NestJS → database/async effect ke
order me explain karta hai. Exact endpoint, schema aur architecture details ke
liye linked API Catalog, OpenAPI, SQL aur approved decisions authoritative hain.

## Journey index

1. [Auth and onboarding](01-AUTH-AND-ONBOARDING.md)
2. [Candidate and resume](02-CANDIDATE-RESUME-FLOW.md)
3. [Jobs, search and applications](03-JOBS-SEARCH-APPLICATIONS.md)
4. [Company, HR and interviews](04-COMPANY-HR-INTERVIEWS.md)
5. [Notifications and messaging](05-NOTIFICATIONS-MESSAGING.md)
6. [Admin and analytics](06-ADMIN-ANALYTICS.md)

## Standard story format

Har journey me ye order follow hoga:

`User action → UI → API → NestJS processing → Auth/DB/async effect → response → next UI state`

Pending behavior ko `PENDING_DECISION` ya `NOT_IMPLEMENTED` ke roop me mark
kiya jayega; missing requirement invent nahi ki jayegi.
