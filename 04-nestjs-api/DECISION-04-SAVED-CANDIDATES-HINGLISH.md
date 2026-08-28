# Decision 04 - Saved Candidates

**Status:** APPROVED / FROZEN - current required scope

## Final decision

Authorized HR/employer user candidate search ya candidate profile se candidate ko private bookmark ke roop mein save kar sakta hai. Yeh feature kisi specific job se linked nahi hoga; `job_id` is model ka hissa nahi hai.

```text
HR search/profile -> Save Candidate -> saved_candidates row -> My Saved Candidates
```

## Ownership and visibility

- Saved row jis `recruiter_user_id` ne create ki hai, wahi usse dekh/update/delete kar sakta hai.
- `company_id` tenant boundary ke liye store hoga; record doosri company ko expose nahi hoga.
- Active company membership, HR authorization aur candidate visibility NestJS trusted write path par validate honge; direct read policy creator-owner scoped rahegi.
- Same company ka doosra HR bhi default se is private saved list ko nahi dekhega.
- Candidate, guest aur unauthorized member save/unsave nahi kar sakte.
- Same candidate ko same HR ke liye ek hi baar save kiya ja sakta hai.
- Doosra HR usi candidate ko apni private list mein independently save kar sakta hai.

## Database direction

`09_applications.sql` ke baseline mein `saved_candidates` model add hoga:

```text
id, recruiter_user_id, company_id, candidate_id, private_note, created_at, updated_at
```

Required invariants:

```text
UNIQUE (recruiter_user_id, candidate_id)
```

Owner-list aur ownership lookup ke liye `recruiter_user_id, created_at` index
rahega; uniqueness constraint ka index alag se duplicate nahi banaya jayega.

`saved_jobs` is requirement ka replacement nahi hai. Clean dev/pre-prod reset ke time updated `09_applications.sql` execute hoga; reset na ho to equivalent forward migration required hogi.

## API/UI behavior

```http
POST   /candidates/:candidateId/save
DELETE /candidates/:candidateId/save
GET    /me/saved-candidates
```

Search/profile responses `is_saved` aur, jab applicable ho, `saved_candidate_id` return karenge. Duplicate protection database constraint aur server authorization se hogi.

## Transaction and security

- NestJS JWT, role, company membership aur candidate visibility validate karega.
- Save/unsave writes Decision-01 ke trusted `SystemClient` transaction path se honge.
- Yeh bookmark operation khud kisi AI/outbox event ka requirement nahi banata.
- Optional private note sirf owner ko visible hoga.

## Acceptance criteria

1. Authorized HR search/profile se candidate save kar sake.
2. Same HR + same candidate duplicate row na bana sake.
3. Same candidate ko doosra HR independently save kar sake.
4. HR sirf apni saved rows list, update ya delete kar sake.
5. Candidate/guest/unauthorized member ko save/unsave se `403` mile.
6. Search aur profile dono mein `is_saved` correct ho.
7. Save kisi job application ya shortlist ko automatically create nahi karega.
