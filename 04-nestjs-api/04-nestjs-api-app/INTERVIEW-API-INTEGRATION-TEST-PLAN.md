# Interview API — Database Integration Test Plan

यह plan वास्तविक Supabase test database पर चलने वाले tests के लिए है। Production
database पर destructive cleanup नहीं चलाना है। हर test अपने UUID-tagged fixture data
के साथ शुरू और rollback/cleanup के साथ समाप्त होगा।

## Required scenarios

1. Available schedule block पर interview booking: block और participant दोनों बनें।
2. Same block पर दो concurrent bookings: केवल एक सफल हो, दूसरा conflict मिले।
3. Expired lock वाला block: lock fields clear होकर booking सफल हो।
4. Block के बाहर समय या duration: booking reject हो।
5. Inactive interviewer/cross-company block: booking reject हो।
6. Candidate confirm: status और confirmation timestamp/flag दोनों update हों।
7. Candidate दूसरे user की interview confirm/decline न कर सके।
8. Completed status पर `completed_at` बने; terminal state reopen न हो।
9. Reschedule: पुरानी row `rescheduled`, पुराना slot release, नई row में
   `rescheduled_from` और नया participant/slot बने।
10. किसी भी failure पर interview, participant और slot updates atomic rollback हों।

## Evidence to capture

- SQL row snapshots before/after each test
- HTTP status and sanitized response
- transaction rollback/orphan checks
- concurrent winner/loser result
- no secrets or resume content in logs

## Current gate

Unit/build tests pass हैं, लेकिन यह database integration suite अभी execute नहीं हुई है।
Execution के लिए isolated test fixtures और approved database credentials आवश्यक हैं।
