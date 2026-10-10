// services.md → "Service area": Pune city and PCMC. Not Talegaon, Lonavala, Nashik, Mumbai, other cities.
// Localities named in services.md first, then common Pune / PCMC localities so the check
// doesn't send real Pune callers to "unclear" (e.g. Nanded City in T08, Kharadi in T10).

const PUNE = [
  // named in services.md
  "kothrud", "baner", "aundh", "wakad", "koregaon park", "kalyani nagar", "viman nagar", "hadapsar",
  "magarpatta", "nibm", "kondhwa", "undri", "shivane", "warje", "erandwane", "deccan",
  // other Pune city localities
  "pune", "kharadi", "wagholi", "balewadi", "pashan", "sus", "bavdhan", "karve nagar", "karvenagar",
  "sinhagad road", "dhayari", "nanded city", "katraj", "bibwewadi", "dhankawadi", "swargate",
  "camp", "wanowrie", "fatima nagar", "mundhwa", "keshav nagar", "yerwada", "yerawada", "vishrantwadi",
  "dhanori", "lohegaon", "tingre nagar", "kalyani", "sangamwadi", "shivaji nagar", "shivajinagar",
  "model colony", "prabhat road", "sb road", "senapati bapat", "boat club", "bund garden", "pimple gurav",
  "sadashiv peth", "narayan peth", "kasba peth", "shukrawar peth", "salisbury park", "market yard",
  "mohammed wadi", "mohammadwadi", "handewadi", "manjri", "amanora", "fursungi", "hinjawadi",
  "dahanukar colony", "sunderban", "cybercity", "kalas", "ambegaon", "narhe", "kirkatwadi", "khadakwasla",
  "nagar road", "solapur road", "satara road", "paud road", "law college road", "fc road", "east street",
  "bhosale nagar", "gokhale nagar", "range hills", "khadki", "kirkee", "aundh road", "ganeshkhind",
  // PCMC
  "pcmc", "pimpri", "chinchwad", "pimple saudagar", "pimple nilakh", "ravet", "hinjewadi", "nigdi",
  "akurdi", "moshi", "chikhali", "tathawade", "punawale", "kiwale", "bhosari", "rahatani", "thergaon",
  "sangvi", "dapodi", "kasarwadi", "pradhikaran", "chakan road", "marunji", "maan",
];

const OUTSIDE = [
  "talegaon", "lonavala", "lonavla", "nashik", "mumbai", "thane", "navi mumbai", "satara", "kolhapur",
  "aurangabad", "sambhajinagar", "nagpur", "bangalore", "bengaluru", "hyderabad", "goa", "delhi",
  "chakan", "shirur", "baramati", "khandala", "kamshet", "alibaug", "lavasa", "saswad", "daund",
  "ahmednagar", "solapur city", "sangli",
];

export type AreaVerdict = { verdict: "in" | "out" | "unclear"; matched?: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const has = (hay: string, needle: string) => new RegExp(`\\b${needle}\\b`).test(hay);

export function checkServiceArea(location?: string | null): AreaVerdict {
  if (!location) return { verdict: "unclear" };
  const l = norm(location);
  // check exclusions first: "Talegaon Dabhade, near Pune" must be out (F03)
  const out = OUTSIDE.find((p) => has(l, p));
  if (out) return { verdict: "out", matched: out };
  const inn = PUNE.find((p) => has(l, p));
  if (inn) return { verdict: "in", matched: inn };
  return { verdict: "unclear" };
}

export const SERVICE_AREA_SUMMARY =
  "Pune city (Kothrud, Baner, Aundh, Wakad, Koregaon Park, Kalyani Nagar, Viman Nagar, Hadapsar, Magarpatta, NIBM, Kondhwa, Undri, Shivane, Warje, Erandwane, Deccan and adjoining areas) and PCMC (Pimpri, Chinchwad, Pimple Saudagar, Pimple Nilakh, Ravet, Hinjewadi). Not Talegaon, Lonavala, Nashik, Mumbai or other cities.";
