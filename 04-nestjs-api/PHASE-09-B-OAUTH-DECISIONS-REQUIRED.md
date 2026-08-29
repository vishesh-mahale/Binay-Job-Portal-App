# Phase 09-B OAuth Decisions Required

OAuth authorize/callback implementation अभी current release में नहीं होगा। इसे future scope के रूप में defer किया गया है; नीचे के decisions तभी भरें जब OAuth को फिर से activate किया जाए।

| ID | Decision | Required answer |
|---|---|---|
| OAUTH-D1 | Providers | कौन से providers अभी enable होंगे (उदाहरण: Google, Apple)? Allowlist exact names में दें। |
| OAUTH-D2 | Callback URL | Dev और pre-prod के exact HTTPS callback URLs क्या होंगे? |
| OAUTH-D3 | Frontend redirects | Success और sanitized error redirect URLs क्या होंगे? |
| OAUTH-D4 | Account linking | Existing email account और OAuth identity मिलने पर link करना है, या explicit user confirmation तक reject करना है? Automatic email merge allowed नहीं होगा। |
| OAUTH-D5 | Rate limit | Authorize और callback के लिए per-IP/per-user limits क्या होंगी? |
| OAUTH-D6 | State secret/TTL | `OAUTH_STATE_SECRET` Secret Manager में दिया जाएगा; state TTL (recommended short-lived range 60–3600 seconds) की approved value क्या है? |

## After decisions are approved

1. Wire the concrete OAuth provider adapter and authorize/callback controller.
2. Add state/PKCE, replay, inactive-account, audit, cookie and sanitized-redirect tests.
3. Run build and the full test suite.
4. Run live signup/login/refresh/logout/OAuth integration.
5. Send the same commit to Antigravity, FreeBuf and OpenCode for read-only review.
