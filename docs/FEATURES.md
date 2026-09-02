# AI feature index v1

`featurize()` emits exactly 120 finite values. Indices 0–59 are normalized feature values; indices 60–119 are matching presence masks. Missing values therefore remain distinguishable from meaningful zero values.

## Value features (0–59)

| Range | Features |
|---|---|
| 0–6 | Trip counts, trip/enquiry recency, booking window, international and business ratios |
| 7–11 | Family, couple, solo and group mix; average duration |
| 12–17 | Average/max spend and budget, mid, premium and luxury bands |
| 18–29 | Preferred travel months January–December |
| 30–36 | Preferred day of week Sunday–Saturday |
| 37–43 | Offer/campaign engagement, chatbot use and preferred communication channel |
| 44–49 | Destination/country diversity and hotel-category affinities |
| 50–55 | 30/90-day recency, recent intent, repeat, frequent international and high-value flags |
| 56–59 | Frequent business/family, high engagement and long booking-window flags |

Normalization caps large values to stable business ranges. All feature names and exact indices are exported through `FEATURE_NAMES` and `FEATURE_INDEX`; tests fail if the contract stops producing 120 values.

## Phase 1 serving policy

Until TLC has at least 500 positive outcome events and a validated neural model with AUC ≥ 0.72, recommendations use `RulesRecommender`. Every result is labelled rule-based and includes feature attributions. Neural-network training remains a later phase; Step 5 deliberately avoids presenting heuristic scores as learned predictions.
