# Owner and employee dashboard audit — 3 November 2026

The audited dashboard views and the tested workflows pass the checks below. This does not mean that all external services are activated in production.

## Corrections

- The employee CRM pipeline includes both current `assignedUid` and legacy `assignedTo` assignments, without duplicate leads. Detail access follows the same ownership rules. The additional production Firestore index is deployed.
- Read-only CRM users no longer see the New lead action.
- Staff with catalogue reading permission can open catalogue details in view-only mode. Creation, saving, uploads and archiving remain restricted to content writers; server authorization still rejects unauthorized writes.
- Enabling a staff account clears legacy disabled flags and synchronizes account status with Firebase Authentication. Disable and enable operations were verified through the interface and API.
- A failed catalogue archive request displays an error and releases the busy state so the user can retry.
- Performance reports use approved INR booking values instead of adding currencies or counting unapproved quotes as revenue. Bookings for leads created in earlier months are attributed to their consultant, including legacy assignments, rather than automatically to the booking creator. The interface labels the date of the daily snapshot.

## Verification

| Check                                            | Result                                                                                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner and employee production repository queries | 37 passed, using the actual assigned accounts; read-only checks                                                                                                                                                  |
| Staff role browser coverage                      | 10 roles, including Super Admin, Owner, Sales and Travel Consultant                                                                                                                                              |
| Dashboard navigation                             | 199 requests checked for successful responses and render failures                                                                                                                                                |
| Browser workflows                                | Ownership isolation, legacy leads, view-only catalogue, archive network failure, staff re-enablement, finance currency reports and CSV, dispatch, support reply round-trip, pagination and mobile layouts passed |
| Unit tests                                       | 228 passed                                                                                                                                                                                                       |
| Firestore rules tests                            | 21 passed                                                                                                                                                                                                        |
| Backend integration tests                        | 49 passed, including quote/booking approval, payment/refund idempotency, settlement, period close, messaging controls, assignment and performance aggregation                                                    |
| Build, lint and type checking                    | Passed                                                                                                                                                                                                           |
| Firestore indexes                                | 106 ready                                                                                                                                                                                                        |

Browser and mutation tests use isolated Firebase emulators and synthetic records. Supplier, payment and delivery integrations use controlled fixtures; this audit did not create paid production bookings, charge cards or send client messages.

## Production limitations

1. **App Check setup completed in the subsequent CLI configuration.** A domain-restricted reCAPTCHA Enterprise key is registered for the website, the browser integration obtains App Check tokens, and production deployment settings require verification. Existing callable-Function enforcement remains enabled. This resolves the missing website-key configuration identified in the audit.
2. **Live TBO inventory credentials are absent from the deployed search Functions.** Their live supplier searches and booking flow require provider configuration and verification.
3. **Outbound email and WhatsApp are disabled and have no provider secret bindings on the delivery Functions.** Real delivery remains unavailable until those integrations are configured and verified.
4. Real payment-provider transactions were not performed. Integration tests verify the application's payment and finance behavior using controlled fixtures.

The supplier, delivery and payment configuration/verification items above must be completed before describing every dashboard function as working end to end in production.
