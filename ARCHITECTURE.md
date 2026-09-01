# Architecture

- Next.js 16 App Router with Server Components by default; interactive search, save and planner islands are client components.
- Domain types and repository contracts live in `src/types`. The current in-memory repository is demonstrative and replaceable by Firestore without changing page components.
- Public routes are server rendered and expose static parameters for known destinations and trips.
- Inquiry API validates at the server boundary with Zod. Production persistence, rate limiting and email are provider concerns to add behind repository/service interfaces.
- Anonymous saved trips use local storage. A future authenticated repository can synchronise these with Firestore.
- SEO uses the Metadata API, sitemap, robots, semantic content and legacy permanent redirects.
- Generated imagery is stored locally in `public/images` and served through Next Image where appropriate.
- Netlify builds the standard Next output. Firebase Admin credentials remain server-only.
