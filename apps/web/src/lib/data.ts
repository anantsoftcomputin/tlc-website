import type { Destination, Mood, Trip, TripRepository } from "@/types";

/**
 * Destination and journey content. Every photograph is a verified image of the
 * place it is labelled as (see IMAGE_CREDITS.md). Best-time and duration notes
 * are widely established travel guidance; operational details are always
 * reconfirmed by TLC before travel.
 */

export const destinations: Destination[] = [
  {
    id: "thailand", slug: "thailand", name: "Thailand", country: "Thailand", region: "international",
    tagline: "Easy days, vivid nights",
    description: "Limestone islands, gilded temples and some of the warmest hospitality in Asia — Thailand rewards first-timers and returners alike.",
    overview: "Thailand pairs genuinely easy travel with real variety: Bangkok's river-and-temple energy, the jungle-backed north around Chiang Mai, and the Andaman coast where Krabi's limestone karsts rise straight out of turquoise water. It suits families, honeymooners and friends on very different budgets — which is why it remains one of the most-requested destinations at TLC.",
    image: "/images/destinations/thailand.jpg", imageAlt: "Longtail boats moored below a limestone karst at Railay beach, Krabi",
    photoLocation: "Railay, Krabi", bestTime: "November – February", idealDuration: "6 – 9 days",
    styles: ["Family", "Honeymoon", "Beach"],
    experiences: [
      { title: "Bangkok by river", note: "The Grand Palace, Wat Pho and canal life along the Chao Phraya." },
      { title: "Krabi & Railay", note: "Longtail boats between karst cliffs, quiet coves and island lunches." },
      { title: "Phuket old town & beaches", note: "Sino-Portuguese lanes, then west-coast sands from Kata to Bang Tao." },
      { title: "Phi Phi & Phang Nga day trips", note: "Classic island circuits, timed to avoid the busiest hours." },
    ],
  },
  {
    id: "dubai", slug: "dubai", name: "Dubai", country: "United Arab Emirates", region: "international",
    tagline: "Big moments, beautifully easy",
    description: "A polished city break with desert horizons — record-breaking architecture, souks, beaches and family adventures in one compact stop.",
    overview: "Dubai works because everything is close: the Burj Khalifa and Dubai Mall, the historic creek and gold and spice souks, Jumeirah's beaches, and the dunes less than an hour away. Direct flights from India, easy visas and hotels at every level make it one of the simplest international breaks to plan well.",
    image: "/images/destinations/dubai.jpg", imageAlt: "Downtown Dubai skyline with the Burj Khalifa at sunset",
    photoLocation: "Downtown Dubai", bestTime: "November – March", idealDuration: "4 – 6 days",
    styles: ["Family", "Luxury", "Shopping"],
    experiences: [
      { title: "Burj Khalifa at sunset", note: "At-the-Top views timed for golden hour over the fountains." },
      { title: "Desert evening", note: "Dune drive, camel ride and dinner under the stars at a desert camp." },
      { title: "Old Dubai & the creek", note: "Abra crossings, Al Fahidi lanes and the spice and gold souks." },
      { title: "Family parks & Abu Dhabi day trip", note: "Aquaventure, theme parks, or the Sheikh Zayed Grand Mosque." },
    ],
  },
  {
    id: "singapore", slug: "singapore", name: "Singapore", country: "Singapore", region: "international",
    tagline: "The easiest big city in Asia",
    description: "Gardens, hawker food and a skyline built for evenings — Singapore is the most effortless family city break in Asia.",
    overview: "Singapore compresses an astonishing amount into a small, safe, spotless island: Gardens by the Bay and the Marina Bay skyline, Sentosa's beaches and attractions, world-heritage hawker food and distinct neighbourhoods from Chinatown to Kampong Glam. Short flights and famously smooth arrivals make it ideal for first international trips with children.",
    image: "/images/destinations/singapore.jpg", imageAlt: "Aerial view of Marina Bay Sands and Gardens by the Bay, Singapore",
    photoLocation: "Marina Bay", bestTime: "Year-round", idealDuration: "4 – 5 days",
    styles: ["Family", "City", "Food"],
    experiences: [
      { title: "Gardens by the Bay", note: "Cloud Forest, Flower Dome and the evening Supertree light show." },
      { title: "Sentosa island", note: "Universal Studios, S.E.A. Aquarium and cable-car views." },
      { title: "Hawker centres", note: "Michelin-listed plates at Maxwell, Lau Pa Sat and Newton." },
      { title: "Night safari", note: "The world's first nocturnal wildlife park, best booked ahead." },
    ],
  },
  {
    id: "bali", slug: "bali", name: "Bali", country: "Indonesia", region: "international",
    tagline: "Temples, rice terraces, ocean light",
    description: "Clifftop temples, jungle rivers and rice-terrace mornings — Bali layers culture over its beaches like nowhere else in Asia.",
    overview: "Bali's magic is the mix: Ubud's rice terraces, water temples and craft villages inland; surf and sunset temples like Tanah Lot and Uluwatu on the coast; and calm resort stretches from Nusa Dua to Sanur. It is one of the best-value honeymoon destinations anywhere, and quieter corners reward those who look beyond the busy south.",
    image: "/images/destinations/bali.jpg", imageAlt: "Tanah Lot sea temple at sunset, Bali",
    photoLocation: "Tanah Lot", bestTime: "April – October", idealDuration: "6 – 8 days",
    styles: ["Honeymoon", "Culture", "Beach"],
    experiences: [
      { title: "Ubud & the terraces", note: "Tegalalang rice terraces, the Monkey Forest and craft villages." },
      { title: "Temple evenings", note: "Tanah Lot and Uluwatu at sunset, with the kecak fire dance." },
      { title: "Ulun Danu Beratan", note: "The lakeside temple in the cool Bedugul highlands." },
      { title: "Nusa Penida day trip", note: "Kelingking cliff viewpoint and snorkelling bays by fast boat." },
    ],
  },
  {
    id: "maldives", slug: "maldives", name: "Maldives", country: "Maldives", region: "international",
    tagline: "One island, one resort, zero decisions",
    description: "Overwater villas, house reefs and seaplane arrivals — the Maldives remains the purest do-nothing luxury escape on earth.",
    overview: "Each Maldivian resort occupies its own island, so choosing the right one is the whole game — house reef quality, villa style, dining and transfer type change the trip completely. TLC matches the island to your budget and pace, from barefoot-casual to full overwater indulgence, with honest advice on seaplane versus speedboat transfers.",
    image: "/images/destinations/maldives.jpg", imageAlt: "Overwater villas curving across a Maldivian lagoon",
    photoLocation: "South Malé Atoll region", bestTime: "November – April", idealDuration: "4 – 6 nights",
    styles: ["Honeymoon", "Luxury", "Beach"],
    experiences: [
      { title: "Overwater living", note: "Villas with direct lagoon access — the signature Maldives stay." },
      { title: "House-reef snorkelling", note: "Turtles, rays and reef fish steps from your deck." },
      { title: "Sandbank picnics & sunset cruises", note: "Classic resort experiences worth planning ahead." },
      { title: "Spa over the water", note: "Treatment pavilions above the lagoon at most resorts." },
    ],
  },
  {
    id: "switzerland", slug: "switzerland", name: "Switzerland", country: "Switzerland", region: "international",
    tagline: "A slower kind of spectacular",
    description: "Lake towns, mountain railways and meadows under snow peaks — Switzerland is the scenic benchmark the rest of Europe is measured against.",
    overview: "Switzerland is built for unhurried travel: trains that run to the minute through scenery that does not, lake promenades in Lucerne and Interlaken, and cogwheel railways climbing to Jungfraujoch and Gornergrat. Summer brings green alps and hiking; winter turns the same valleys into classic snow holidays.",
    image: "/images/destinations/switzerland.jpg", imageAlt: "Snow-capped peaks above a lake and green meadows at Melchsee-Frutt, Switzerland",
    photoLocation: "Melchsee-Frutt, Obwalden", bestTime: "June – September; December – March for snow", idealDuration: "7 – 9 days",
    styles: ["Honeymoon", "Nature", "Luxury"],
    experiences: [
      { title: "Lucerne & Mount Pilatus", note: "The Chapel Bridge, lake cruises and the world's steepest cogwheel line." },
      { title: "Interlaken & Jungfrau region", note: "Grindelwald, Lauterbrunnen's waterfalls and the Top of Europe." },
      { title: "Zermatt & the Matterhorn", note: "A car-free village beneath the most famous peak in the Alps." },
      { title: "Scenic rail", note: "GoldenPass, Glacier Express and Bernina — journeys as destinations." },
    ],
  },
  {
    id: "japan", slug: "japan", name: "Japan", country: "Japan", region: "international",
    tagline: "Old rituals, new energy",
    description: "Temple lanes and bullet trains, kaiseki dinners and neon crossings — Japan rewards curiosity like nowhere else.",
    overview: "Japan runs ancient and hyper-modern in parallel: Kyoto's preserved lanes, shrines and gardens sit two hours by shinkansen from Tokyo's layered neighbourhoods. Food is a highlight at every budget, transport is a pleasure in itself, and spring blossom or autumn colour turns the whole country into an event.",
    image: "/images/destinations/japan.jpg", imageAlt: "The Yasaka Pagoda above a preserved stone street in Higashiyama, Kyoto, at dusk",
    photoLocation: "Higashiyama, Kyoto", bestTime: "March – May & October – November", idealDuration: "8 – 12 days",
    styles: ["Culture", "Food", "Luxury"],
    experiences: [
      { title: "Kyoto's old quarters", note: "Kiyomizu-dera, the Yasaka Pagoda lanes and Fushimi Inari's torii gates." },
      { title: "Tokyo neighbourhoods", note: "Shibuya and Shinjuku energy, Asakusa tradition, Ginza polish." },
      { title: "Shinkansen days", note: "Effortless side trips — Nara's deer park, Osaka's food streets, Hakone." },
      { title: "Seasonal Japan", note: "Cherry blossom in spring, fiery maples in autumn — timed carefully." },
    ],
  },
  {
    id: "vietnam", slug: "vietnam", name: "Vietnam", country: "Vietnam", region: "international",
    tagline: "Limestone bays and lantern towns",
    description: "Ha Long Bay's karst seascape, Hoi An's lantern-lit old town and two great river deltas — Vietnam packs remarkable range into one coastline.",
    overview: "Vietnam runs 1,600 kilometres from Hanoi's old quarter and the karst islands of Ha Long Bay down through imperial Hue and lantern-lit Hoi An to Ho Chi Minh City and the Mekong Delta. It is superb value, the food alone justifies the trip, and an overnight cruise on the bay remains one of Asia's great travel moments.",
    image: "/images/destinations/vietnam.jpg", imageAlt: "Boats among the limestone karsts of Ha Long Bay, Vietnam",
    photoLocation: "Ha Long Bay", bestTime: "October – April (varies by region)", idealDuration: "8 – 10 days",
    styles: ["Culture", "Nature", "Food"],
    experiences: [
      { title: "Ha Long Bay overnight", note: "A night on the water among two thousand limestone islands." },
      { title: "Hanoi old quarter", note: "Street food crawls, the lake at dawn and colonial-era corners." },
      { title: "Hoi An", note: "A UNESCO old town of tailors, lanterns and riverside cafés." },
      { title: "Mekong Delta", note: "Floating markets and orchard villages south of Ho Chi Minh City." },
    ],
  },
  {
    id: "rajasthan", slug: "rajasthan", name: "Rajasthan", country: "India", region: "india",
    tagline: "Forts, palaces and painted cities",
    description: "Jaipur's pink façades, Jodhpur's blue lanes and Udaipur's lake palaces — Rajasthan is India's great royal circuit.",
    overview: "Rajasthan concentrates more spectacle per kilometre than almost anywhere in India: the Amber Fort and Hawa Mahal in Jaipur, Mehrangarh towering over Jodhpur's blue old city, and Udaipur's palaces reflected in Lake Pichola. Heritage hotels — converted forts and havelis — make the journey itself royal, and winter weather is superb.",
    image: "/images/destinations/rajasthan.jpg", imageAlt: "The pink façade of Hawa Mahal with decorated horses passing, Jaipur",
    photoLocation: "Hawa Mahal, Jaipur", bestTime: "October – March", idealDuration: "6 – 9 days",
    styles: ["Culture", "Heritage", "Family"],
    experiences: [
      { title: "Jaipur's landmarks", note: "Amber Fort, Hawa Mahal, City Palace and the Jantar Mantar." },
      { title: "Jodhpur's blue city", note: "Mehrangarh Fort and the lanes and stepwells below it." },
      { title: "Udaipur's lakes", note: "Boat rides on Pichola, the City Palace and rooftop dinners." },
      { title: "Heritage stays", note: "Nights in converted forts, palaces and painted havelis." },
    ],
  },
  {
    id: "kerala", slug: "kerala", name: "Kerala", country: "India", region: "india",
    tagline: "Backwaters, spice hills, slow mornings",
    description: "Houseboats drifting the backwaters, tea estates in Munnar and beaches at Kovalam — Kerala is India at its most restful.",
    overview: "Kerala strings together three unhurried worlds: the palm-shaded backwaters around Alleppey and Kumarakom, the tea-carpeted hills of Munnar and Thekkady's spice plantations, and a gentle coastline from Kochi down to Kovalam and Varkala. Add Ayurveda done properly and some of India's best food, and it is the definitive slow holiday.",
    image: "/images/destinations/kerala.jpg", imageAlt: "A traditional houseboat cruising palm-lined Kerala backwaters",
    photoLocation: "Alleppey backwaters", bestTime: "October – March", idealDuration: "5 – 8 days",
    styles: ["Honeymoon", "Nature", "Wellness"],
    experiences: [
      { title: "A night on a houseboat", note: "Kettuvallam cruising through Alleppey's canal villages." },
      { title: "Munnar tea country", note: "Estate walks, viewpoints and cool hill-station evenings." },
      { title: "Fort Kochi", note: "Chinese fishing nets, colonial lanes and Kathakali evenings." },
      { title: "Ayurveda & beaches", note: "Genuine treatments near Kovalam and the Varkala cliffs." },
    ],
  },
  {
    id: "goa", slug: "goa", name: "Goa", country: "India", region: "india",
    tagline: "Sun, sand and susegad",
    description: "Palm-fringed beaches, Portuguese-era lanes and café evenings — Goa remains India's easiest, happiest coastal break.",
    overview: "Goa splits neatly in two: the lively northern strip from Baga to Vagator with its markets and beach shacks, and the quieter southern sands around Palolem and Agonda. In between sit Latin-quarter lanes in Fontainhas, spice farms and the churches of Old Goa. It suits everything from a long weekend to a slow week.",
    image: "/images/destinations/goa.jpg", imageAlt: "Turquoise water and a palm-lined beach in Goa",
    photoLocation: "North Goa coastline", bestTime: "November – February", idealDuration: "3 – 5 days",
    styles: ["Beach", "Family", "Friends"],
    experiences: [
      { title: "North beach circuit", note: "Baga, Anjuna's flea market and sunset at Vagator." },
      { title: "The quiet south", note: "Palolem's crescent bay and Agonda's slow mornings." },
      { title: "Old Goa & Fontainhas", note: "Basilica of Bom Jesus and the painted Latin quarter." },
      { title: "River & spice country", note: "Chapora river cruises and plantation lunches inland." },
    ],
  },
  {
    id: "ladakh", slug: "ladakh", name: "Ladakh", country: "India", region: "india",
    tagline: "The high road through the Himalaya",
    description: "Monasteries above moonscape valleys, Pangong's colour-shifting lake and passes over 5,000 metres — Ladakh is India's great adventure.",
    overview: "Ladakh sits in the rain shadow of the Himalaya: a high-altitude desert of gompas, prayer flags and vast light. From Leh, journeys run over Khardung La into the Nubra Valley's dunes, and east to Pangong Tso's impossible blues. Roads open June to September; acclimatisation days are essential, and TLC builds them in.",
    image: "/images/destinations/ladakh.jpg", imageAlt: "A motorcyclist on a high mountain highway in Ladakh with snow peaks beyond",
    photoLocation: "Leh–Manali highway region", bestTime: "June – September", idealDuration: "6 – 8 days",
    styles: ["Adventure", "Nature", "Roadtrip"],
    experiences: [
      { title: "Leh & its monasteries", note: "Thiksey at dawn, Hemis and Shanti Stupa evenings." },
      { title: "Nubra Valley", note: "Over Khardung La to sand dunes and double-humped camels at Hunder." },
      { title: "Pangong Tso", note: "The vast blue lake at 4,225 m — a night by the water is unforgettable." },
      { title: "High-pass road days", note: "Chang La, Khardung La and river-valley drives, properly paced." },
    ],
  },
];

export const moods: Mood[] = [
  { name: "Honeymoon", slug: "honeymoon", image: "/images/destinations/santorini.jpg", imageAlt: "Blue-domed churches above the caldera in Oia, Santorini", note: "Santorini, Bali, Maldives, Kerala" },
  { name: "Family", slug: "family", image: "/images/destinations/singapore-night.jpg", imageAlt: "The Merlion and Marina Bay Sands lit up at night, Singapore", note: "Singapore, Dubai, Thailand" },
  { name: "Luxury", slug: "luxury", image: "/images/destinations/dubai-burj-al-arab.jpg", imageAlt: "Aerial view of the Burj Al Arab and Jumeirah coastline, Dubai", note: "Maldives, Dubai, Switzerland" },
  { name: "Adventure", slug: "adventure", image: "/images/destinations/himalaya.jpg", imageAlt: "Trekkers crossing a snowbound Himalayan ridge above the clouds", note: "Ladakh, Himachal, Vietnam" },
  { name: "Beaches", slug: "beach", image: "/images/destinations/thailand-aerial.jpg", imageAlt: "Aerial view of a jungle-backed cove on Koh Tao, Thailand", note: "Thailand, Goa, Bali" },
  { name: "Cruises", slug: "cruise", image: "/images/destinations/cruise.jpg", imageAlt: "Cruise ships docked in a turquoise island harbour", note: "Ocean & river sailings" },
  { name: "Wildlife", slug: "wildlife", image: "/images/destinations/safari.jpg", imageAlt: "A lone acacia tree at sunset on the East African savanna", note: "African safaris, Indian parks" },
  { name: "Spiritual", slug: "spiritual", image: "/images/destinations/bali-temple.jpg", imageAlt: "The Ulun Danu Beratan lake temple in the Bali highlands", note: "Char Dham, Varanasi, Bali" },
];

export const trips: Trip[] = [
  {
    id: "th-family", slug: "thailand-family-escape", title: "Thailand, Made for Family",
    destination: "Thailand", destinationSlug: "thailand",
    summary: "Bangkok's colour, Krabi's karst coastline and Phuket's easy beaches — paced for travelling with children, with every day adjustable.",
    days: 7, nights: 6, route: ["Bangkok", "Krabi", "Phuket"], styles: ["Family", "Beach"], idealFor: ["Families", "First-time visitors"],
    image: "/images/destinations/thailand.jpg", imageAlt: "Longtail boats below limestone cliffs at Railay, Krabi",
    itinerary: [
      { day: 1, title: "Arrive in Bangkok", description: "Private transfer to your hotel by the river. The evening stays open — a first street-food dinner if energy allows." },
      { day: 2, title: "A gentler Bangkok", description: "The Grand Palace and Wat Pho in the cooler morning, then a long-tail canal ride the children will remember more than any temple." },
      { day: 3, title: "South to Krabi", description: "A short flight south and into the slower rhythm of the Andaman coast. Pool and beach afternoon." },
      { day: 4, title: "Islands at your pace", description: "A private longtail day around Railay and the nearby islands — swim stops, a beach lunch, back before anyone melts down." },
      { day: 5, title: "On to Phuket", description: "A scenic coastal transfer. Settle into your beach stay and walk the sand before dinner." },
      { day: 6, title: "Your kind of day", description: "Old Phuket Town's painted shophouses, an elephant sanctuary visit, or simply nothing at all — decided that morning, not months before." },
      { day: 7, title: "Journey home", description: "Private transfer to the airport, timed around your confirmed flight." },
    ],
    inclusions: ["Family-suitable stays selected for your brief", "Private airport and inter-city transfers", "Sightseeing and island day as agreed", "TLC planning support before and during travel"],
  },
  {
    id: "th-honeymoon", slug: "thailand-honeymoon", title: "A Thailand Honeymoon, Your Way",
    destination: "Thailand", destinationSlug: "thailand",
    summary: "City sparkle, island light and room for two people to travel entirely at their own rhythm.",
    days: 6, nights: 5, route: ["Bangkok", "Phuket", "Phi Phi day"], styles: ["Honeymoon", "Beach"], idealFor: ["Couples", "Honeymooners"],
    image: "/images/destinations/thailand-aerial.jpg", imageAlt: "Aerial view of a turquoise cove fringed by jungle on Koh Tao",
    itinerary: [
      { day: 1, title: "Welcome to Thailand", description: "Private arrival transfer and a relaxed first evening — a rooftop bar above the river if you're up for it." },
      { day: 2, title: "Bangkok together", description: "A considered introduction: Wat Arun across the water, the flower market, dinner somewhere special." },
      { day: 3, title: "To the islands", description: "Fly to Phuket and check into your couples' stay. Sunset on the sand." },
      { day: 4, title: "Across the Andaman", description: "A private boat day toward Phi Phi — snorkelling, empty beaches where the timing allows, and lunch on the water." },
      { day: 5, title: "A day of your own", description: "Spa morning, beach afternoon, seafood dinner — deliberately unplanned." },
      { day: 6, title: "Until next time", description: "Transfer for your onward journey — or extend into the Maldives; ask us." },
    ],
    inclusions: ["Curated couples' accommodation options", "Private transfers throughout", "Private island boat day", "TLC planning support"],
  },
  {
    id: "kl-backwaters", slug: "kerala-backwaters-retreat", title: "Kerala, Slowly",
    destination: "Kerala", destinationSlug: "kerala",
    summary: "Fort Kochi's old lanes, Munnar's tea hills and a night drifting the backwaters — the classic Kerala circuit, without the rush.",
    days: 6, nights: 5, route: ["Kochi", "Munnar", "Alleppey"], styles: ["Honeymoon", "Nature"], idealFor: ["Couples", "Parents", "Slow travellers"],
    image: "/images/destinations/kerala.jpg", imageAlt: "A kettuvallam houseboat on palm-lined backwaters near Alleppey",
    itinerary: [
      { day: 1, title: "Arrive in Kochi", description: "Meet your driver and settle into Fort Kochi. Sunset by the Chinese fishing nets." },
      { day: 2, title: "Fort Kochi on foot", description: "Colonial lanes, the Dutch Palace and Jew Town's antique shops; a Kathakali performance in the evening." },
      { day: 3, title: "Climb to Munnar", description: "A beautiful four-hour drive into tea country, with waterfall and spice-garden stops on the way." },
      { day: 4, title: "Tea country", description: "Morning among the estates and viewpoints; afternoon free for a plantation walk and warm mountain air." },
      { day: 5, title: "Board your houseboat", description: "Descend to Alleppey and cruise out onto the backwaters. Lunch, sunset and dinner on board as village life passes." },
      { day: 6, title: "Homeward", description: "Disembark after breakfast and transfer to Kochi airport." },
    ],
    inclusions: ["Character stays in Kochi and Munnar", "Private car and driver throughout", "Exclusive overnight houseboat with meals", "TLC planning support"],
  },
  {
    id: "rj-royal", slug: "rajasthan-royal-circuit", title: "Rajasthan's Royal Circuit",
    destination: "Rajasthan", destinationSlug: "rajasthan",
    summary: "Jaipur, Jodhpur and Udaipur — forts at golden hour, heritage stays and the great Rajput cities in one flowing route.",
    days: 7, nights: 6, route: ["Jaipur", "Jodhpur", "Udaipur"], styles: ["Culture", "Heritage"], idealFor: ["Families", "Culture lovers", "International guests"],
    image: "/images/destinations/rajasthan-amber.jpg", imageAlt: "The ramparts of Amber Fort rising above its reflection, Jaipur",
    itinerary: [
      { day: 1, title: "Arrive in Jaipur", description: "Settle into a heritage stay in the Pink City. Evening walk through the bazaars near Hawa Mahal." },
      { day: 2, title: "Amber and the Pink City", description: "Amber Fort in the morning light, then City Palace and the astronomical instruments of Jantar Mantar." },
      { day: 3, title: "The road to Jodhpur", description: "Drive west across Rajasthan, arriving in the blue city by evening; dinner overlooking the fort." },
      { day: 4, title: "Mehrangarh", description: "One of India's most dramatic forts, then the stepwell and the indigo lanes of the old city below." },
      { day: 5, title: "To Udaipur via Ranakpur", description: "Break the drive at the intricately carved Jain temples of Ranakpur before reaching the lake city." },
      { day: 6, title: "Udaipur's lakes", description: "City Palace, a boat ride on Lake Pichola, and a rooftop dinner as the palaces light up." },
      { day: 7, title: "Departure", description: "Transfer to Udaipur airport with a late checkout where possible." },
    ],
    inclusions: ["Heritage-style stays throughout", "Private car and driver for the full circuit", "Monument visits as agreed", "TLC planning support"],
  },
  {
    id: "ch-alps", slug: "swiss-alpine-journey", title: "Switzerland by Rail",
    destination: "Switzerland", destinationSlug: "switzerland",
    summary: "Lucerne, the Jungfrau region and Zermatt — lakes, cogwheel railways and the Matterhorn, stitched together by trains that make the journey the point.",
    days: 8, nights: 7, route: ["Zurich", "Lucerne", "Interlaken", "Zermatt"], styles: ["Honeymoon", "Nature"], idealFor: ["Couples", "Families", "Scenery lovers"],
    image: "/images/destinations/switzerland.jpg", imageAlt: "Snow peaks above green meadows and a lake in the Swiss Alps",
    itinerary: [
      { day: 1, title: "Arrive in Zurich", description: "Train from the airport straight to Lucerne. Evening on the lakefront and the Chapel Bridge." },
      { day: 2, title: "Lucerne & Pilatus", description: "The golden round trip: boat across the lake, the steep cogwheel up Mount Pilatus, cable car down." },
      { day: 3, title: "To Interlaken", description: "The scenic Luzern–Interlaken Express over the Brünig Pass. Afternoon between the two lakes." },
      { day: 4, title: "Jungfrau region", description: "Up through Grindelwald or Lauterbrunnen towards Jungfraujoch — glaciers and the Top of Europe." },
      { day: 5, title: "Valley day", description: "Lauterbrunnen's waterfalls, Mürren by cable car, or paragliding over Interlaken for the brave." },
      { day: 6, title: "To Zermatt", description: "Rail via Visp into the car-free village beneath the Matterhorn. First sight of the peak from Gornergrat if weather allows." },
      { day: 7, title: "The Matterhorn", description: "Gornergrat railway at sunrise or Glacier Paradise by cable car; afternoon strolling Zermatt's lanes." },
      { day: 8, title: "Homeward", description: "Train back to Zurich airport — around three and a half scenic hours." },
    ],
    inclusions: ["Hand-picked hotels in each town", "Rail passes and seat reservations arranged", "Excursion guidance day by day", "TLC planning support"],
  },
  {
    id: "db-family", slug: "dubai-family-week", title: "Dubai, the Family Edit",
    destination: "Dubai", destinationSlug: "dubai",
    summary: "Skyline mornings, desert evenings and a parks day — five easy days that work for every generation.",
    days: 5, nights: 4, route: ["Dubai", "Desert", "Abu Dhabi day"], styles: ["Family", "City"], idealFor: ["Families", "Multi-generation trips"],
    image: "/images/destinations/dubai-burj-al-arab.jpg", imageAlt: "Aerial view of the Burj Al Arab and the Jumeirah coastline",
    itinerary: [
      { day: 1, title: "Arrive in Dubai", description: "Private transfer in. Evening at Dubai Mall and the fountain show beneath the Burj Khalifa." },
      { day: 2, title: "Old and new Dubai", description: "Abra across the creek, spice and gold souks, then At-the-Top of the Burj Khalifa for sunset." },
      { day: 3, title: "Desert evening", description: "A free morning by the pool, then dunes, camels and a starlit desert-camp dinner." },
      { day: 4, title: "Parks or Abu Dhabi", description: "Aquaventure and the beach — or a day trip to the Sheikh Zayed Grand Mosque and Yas Island." },
      { day: 5, title: "Fly home", description: "A last morning swim, late checkout where possible, and your transfer out." },
    ],
    inclusions: ["Family rooms in well-located hotels", "Private airport transfers", "Desert experience and city touring as agreed", "TLC planning support"],
  },
  {
    id: "bl-honeymoon", slug: "bali-honeymoon", title: "Bali for Two",
    destination: "Bali", destinationSlug: "bali",
    summary: "Jungle mornings in Ubud, clifftop sunsets at Uluwatu and slow beach days — Bali's honeymoon classics, privately arranged.",
    days: 7, nights: 6, route: ["Ubud", "Uluwatu", "Nusa Dua"], styles: ["Honeymoon", "Culture"], idealFor: ["Couples", "Honeymooners"],
    image: "/images/destinations/bali.jpg", imageAlt: "Tanah Lot sea temple silhouetted at sunset, Bali",
    itinerary: [
      { day: 1, title: "Arrive into Ubud", description: "Private transfer to the jungle. Settle in among the rice terraces." },
      { day: 2, title: "Ubud's green heart", description: "Tegalalang terraces early, a waterfall stop, and the Monkey Forest before a couples' spa evening." },
      { day: 3, title: "Temples and highlands", description: "Ulun Danu Beratan on its lake, coffee-plantation stops and the cool of the hills." },
      { day: 4, title: "South to the cliffs", description: "Down to the Bukit peninsula. Sunset at Uluwatu temple with the kecak fire dance." },
      { day: 5, title: "Beach day", description: "Padang Padang or Melasti sands, a beach club afternoon, seafood on the sand at Jimbaran." },
      { day: 6, title: "Entirely yours", description: "A private boat to Nusa Penida, more beach, or nothing at all." },
      { day: 7, title: "Home", description: "Transfer to the airport — tans, photographs and plans to return." },
    ],
    inclusions: ["Romantic stays in Ubud and on the coast", "Private car and driver on touring days", "Temple and island experiences as agreed", "TLC planning support"],
  },
  {
    id: "lk-road", slug: "ladakh-road-adventure", title: "Ladakh: The High Road",
    destination: "Ladakh", destinationSlug: "ladakh",
    summary: "Leh's monasteries, the Nubra dunes over Khardung La and a night at Pangong Tso — properly acclimatised, properly supported.",
    days: 7, nights: 6, route: ["Leh", "Nubra", "Pangong"], styles: ["Adventure", "Roadtrip"], idealFor: ["Friends", "Adventurers", "Photographers"],
    image: "/images/destinations/ladakh.jpg", imageAlt: "A rider on a high-altitude highway in Ladakh, snow peaks beyond",
    itinerary: [
      { day: 1, title: "Fly into Leh", description: "Arrive at 3,500 m and do very little — acclimatisation is the day's only job. Easy evening walk to Shanti Stupa." },
      { day: 2, title: "Leh, gently", description: "Leh Palace, the old-town lanes and afternoon monasteries at Thiksey and Hemis as your body adjusts." },
      { day: 3, title: "Over Khardung La to Nubra", description: "Across one of the world's highest motorable passes into the Nubra Valley; evening among Hunder's dunes." },
      { day: 4, title: "Nubra to Pangong", description: "The dramatic Shyok river road east to Pangong Tso. Sunset over water that refuses to pick one blue." },
      { day: 5, title: "Pangong to Leh", description: "Lakeside sunrise, then back over Chang La to Leh for a well-earned hot dinner." },
      { day: 6, title: "Spare day", description: "Built in deliberately — for weather, for Alchi or Lamayuru, or for rest." },
      { day: 7, title: "Fly out", description: "Morning flight from Leh with the Himalaya out both windows." },
    ],
    inclusions: ["Oxygen-aware pacing with acclimatisation built in", "Experienced local driver and support", "Inner-line permits arranged", "TLC planning support"],
  },
];

class MemoryTripRepository implements TripRepository {
  async findBySlug(slug: string) { return trips.find((trip) => trip.slug === slug) ?? null; }
  async findFeatured(limit = 3) { return trips.slice(0, limit); }
}

export const tripRepository: TripRepository = new MemoryTripRepository();

/**
 * Only testimonials with verified published text are shown. Rishab Vora and
 * Rubina Malik also have genuine testimonials on the legacy site; add their
 * exact wording here once exported (never paraphrase into new quotes).
 */
export const testimonials = [
  { quote: "Team is very prompt and responsive. I booked Char Dham yatra for my parents and the entire trip went well. They were in touch throughout.", name: "Sailesh Jha", detail: "Lucknow · Char Dham yatra" },
] as const;
