Ab next step **manual candidate E2E verification** hai. Is order me test karo:

1. Candidate account se login karke `/dashboard/candidate` open karo.
2. Profile fields edit karke save karo; page refresh ke baad values persist honi chahiye.
3. Resume upload karo:
   - PDF/DOC/DOCX
   - status transitions dekho: uploaded → processing → review-ready
4. Parsed resume data review karo, correction karke **Confirm Resume Data** karo.
5. Public job detail se **Apply Now** click karo.
6. Candidate dashboard me:
   - ready resume select karo
   - screening questions answer karo
   - consent tick karo
   - application submit karo
7. Applications tab me submitted application, status, snapshot aur history verify karo.
8. Same job par dobara apply karke duplicate application create na ho, verify karo.
9. Profile edit ke baad old application snapshot unchanged rehna chahiye.
10. Negative cases test karo:
   - infected/failed resume
   - incomplete parsing
   - missing consent
   - missing required answer
   - expired/closed job
   - doosre candidate ka document/application ID

Uske baad hum remaining bugs fix karke final full-stack regression run karenge.