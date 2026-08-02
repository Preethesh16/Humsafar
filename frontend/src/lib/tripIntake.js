export const TRAVEL_MODES = [
  {
    id: "compare",
    label: "Compare everything",
    note: "Let the Journey Agent compare flight, train, bus and road.",
  },
  { id: "flight", label: "Flight", note: "Fastest, usually costs more." },
  { id: "train", label: "Train", note: "Slower, roomy and usually cheaper." },
  { id: "bus", label: "Bus", note: "Good for overnight and nearby routes." },
  { id: "drive", label: "Drive / bike", note: "Road-trip freedom with fuel and tolls." },
];

export const TRIP_VIBES = [
  { id: "chill", label: "Slow & chill" },
  { id: "food", label: "Eat really well" },
  { id: "nightlife", label: "Nightlife" },
  { id: "adventure", label: "Adventure" },
  { id: "culture", label: "Culture & local life" },
  { id: "comfort", label: "Comfort first" },
  { id: "workation", label: "Workation" },
];

export function tripDays({ dateMode, departureDate, returnDate, flexibleDays }) {
  if (dateMode !== "exact") return clampInteger(flexibleDays, 1, 30, 3);
  const difference = Date.parse(returnDate) - Date.parse(departureDate);
  if (!Number.isFinite(difference)) return 1;
  return Math.max(1, Math.round(difference / 86_400_000));
}

export function buildTripGoal(answers) {
  const days = tripDays(answers);
  const people = Number(answers.travelers) === 1 ? "one person" : `${answers.travelers} people`;
  const mode = TRAVEL_MODES.find((item) => item.id === answers.travelMode)?.label.toLowerCase()
    ?? "compare everything";
  const timing = answers.dateMode === "exact"
    ? `from ${friendlyDate(answers.departureDate)} to ${friendlyDate(answers.returnDate)}`
    : `for about ${days} days with flexible dates`;
  const vibes = answers.vibes?.length
    ? answers.vibes.map((id) => TRIP_VIBES.find((item) => item.id === id)?.label.toLowerCase()).filter(Boolean)
    : [];

  return [
    `Plan a ${days}-day trip from ${answers.origin.trim()} to ${answers.destination.trim()} for ${people}`,
    timing,
    `travel preference: ${mode}`,
    vibes.length ? `priorities: ${vibes.join(", ")}` : "keep the plan balanced",
    answers.note?.trim() || null,
  ].filter(Boolean).join("; ");
}

export function suggestedRooms(travelers) {
  return Math.max(1, Math.ceil(clampInteger(travelers, 1, 9, 1) / 2));
}

export function validateStep(step, answers) {
  if (step === 0) return answers.destination.trim() ? "" : "Tell me where you want to go.";
  if (step === 1) return answers.origin.trim() ? "" : "Tell me where you are leaving from.";
  if (step === 2) return answers.travelMode ? "" : "Pick a travel preference.";
  if (step === 3 && answers.dateMode === "exact") {
    if (!answers.departureDate || !answers.returnDate) return "Choose both dates.";
    if (answers.returnDate <= answers.departureDate) return "Return must be after departure.";
  }
  if (step === 4 && (!Number.isInteger(Number(answers.travelers)) || Number(answers.travelers) < 1)) {
    return "At least one traveller is required.";
  }
  if (step === 5 && (!Number.isFinite(Number(answers.budget)) || Number(answers.budget) < 5000)) {
    return "Use a trip budget of at least ₹5,000.";
  }
  return "";
}

function friendlyDate(value) {
  if (!value) return "dates to be decided";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}
