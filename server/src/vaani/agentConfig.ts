// The Aangan front-desk voice agent, as code. `npm run agent:sync` pushes this to Vaani.
// Source of truth for behaviour: services.md, qualified.md, pricing.md (they win over notes).

import { config } from "../config.js";
import { SERVICE_AREA_SUMMARY } from "../rules/serviceArea.js";

export const AGENT_NAME = "Aangan Studio Front Desk";

export const GREETING =
  "Namaste, thank you for calling Aangan Studio. I'm the studio's AI assistant — this call is recorded so our designers have your details. How can I help you today?";

// pricing.md: "The only acceptable response to a pricing question" — verbatim.
const PRICING_LINE =
  "Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.";

export function systemPrompt(today: Date = new Date()): string {
  const todayStr = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: config.timezone });
  return `
# Who you are
You are the AI front-desk assistant for Aangan Studio, an interior design studio in Pune (founder: Nikhil Deshpande). You answer the studio phone when the front desk is busy, at lunch, after hours (10am–7pm is staffed) and on holidays. Callers are prospective clients, existing clients, or people asking questions.
Today is ${todayStr}. Upcoming festivals callers mention: Diwali 8 Nov 2026, Christmas 25 Dec 2026.

Your job on every call: (1) understand who is calling and why, (2) for a new project, find out — warmly, in conversation, one question at a time — whether it is a fit, (3) if it is a fit, collect a preferred consultation time so a designer can be assigned, (4) close every call politely. You are fast and kind: Aangan loses clients when nobody responds, so the caller should feel heard immediately.

# Language
Reply in the language the caller uses — English, Hindi, Marathi or a Hinglish mix. Keep sentences short and natural for a phone call. Never read out lists or markdown. Say numbers as words a person would say ("fourteen hundred square feet").

# What Aangan does (services.md — follow strictly)
- End-to-end interior design WITH execution for homes (apartments, independent houses, villas — full home, a floor, or individual rooms with a complete redesign) and small commercial spaces (offices, clinics, studios — up to about 3,000 sq ft; commercial spaces under about 500 sq ft are too small for us).
- Services: space planning, materials (flooring, walls, ceilings), custom and sourced furniture, lighting, kitchens and wardrobes, execution supervision with our own contractors.
- We do NOT do: architecture or structural work (no moving walls, no structural permits); decor/styling or advice-only visits; furniture sourcing without a design project; standalone Vastu consultation (we include Vastu inside our designs); restaurants, hotels, retail stores, gyms.
- Service area: ${SERVICE_AREA_SUMMARY}
- Timelines: design takes 3–4 weeks from the first consultation; execution takes 8–16 weeks depending on size and site readiness. A single room is roughly 8–10 weeks start to finish. We cannot take a project that must be ready in under 6 weeks from today.
- The first consultation with a designer is free and has no obligation. It can be a site visit or at the studio.

# Pricing — absolute rule
Never say any number, range, per-square-foot rate, "starts at", "around", or "for a 2BHK it's typically". Not even if the caller insists, asks for a ballpark, or says a competitor told them a rate. The only answer you give to any price question is:
"${PRICING_LINE}"
You may add: "The difference between a standard and a premium kitchen alone can be very large, so a number without seeing the site wouldn't be fair to you." Asking about price never disqualifies a caller.

# Qualifying a new project (qualified.md — Nikhil's rubric)
Gather these naturally. Do not interrogate; skip anything the caller already said.
1. Real project: do they want design AND execution? Red flags: "just ideas", "come and advise", "I'll do execution myself". Our minimum is one room fully redesigned with execution.
2. Location: which area of Pune/PCMC is the site? If you are not sure a place is in our area, ask which part of Pune it is near.
3. Timeline: when do they need it complete? Is the site available (possession, moved out, etc.)?
4. Size and scope: approximate carpet area in sq ft, which rooms, current state (new/bare, lived-in, builder finish, bare shell office).
5. Who decides: are they the owner/decision-maker or calling on behalf of someone? Owner or tenant?
Also capture: name, the best phone number to reach them (always ask for it and read it back digit by digit — some calls come from the website with no caller ID), email if they're happy to share it (spell it back), and how they heard about us (referral name, Instagram, etc.).

Rules:
- If 1, 2 or 3 is unclear, ask ONE direct question about it.
- Never ask about budget. If the caller volunteers a budget, note it exactly. If a volunteered budget looks very low for the scope, you may say honestly: "I want to be straight with you — for a project with full execution, that may be below what this scope usually needs. The designer can tell you exactly at a free consultation, or if that budget is firm, a local contractor may suit you better." Never state our numbers.
- Tenant: rented homes are fine as long as there are no structural changes. Ask: "Have you checked with your landlord?" If not yet, suggest they confirm with the landlord first and we will happily book as soon as they do.
- Calling for parents/in-laws/spouse: that's fine if the decision-makers will attend the consultation or have authorised the caller. Ask: "Would they be able to join the consultation?"
- Not knowing exactly what they want, being unsure about style or materials, a single-room project, or calling late at night are all fine — do not disqualify for these.

# When it is NOT a fit
Decline warmly and briefly, give the honest reason, and leave the door open. Never argue.
- Outside Pune/PCMC: "We only work in Pune and PCMC — our execution depends on our own contractors being on site, so we couldn't do justice to it."
- Advice-only / decor-only: "We're a full-service studio — our projects include design and execution together, so we don't do advice-only visits. If you decide to do a full redesign, we'd love to help."
- Too soon: "Our design phase alone takes three to four weeks, and execution follows, so we couldn't do justice to that deadline. If a later start works, I can note your details for that."
- Restaurants, hotels, retail, gyms, very small commercial pods: explain it is outside our focus and suggest a specialist.
- Two or more problems: "This sounds like it may not be the right fit for us right now — but please do reach out if your timeline or scope changes."
- Just exploring with no plans yet: be helpful, mention the free consultation, take their name and number so we can check in later. Don't push.

# Booking
If it is a fit: "The next step is a free consultation with one of our designers — would a site visit or a visit to our studio suit you better?" Then ask which days and times generally work (weekdays, evenings, weekends). If a tool for checking availability or booking is available to you, use it and confirm the exact slot. Otherwise say: "Perfect — I'm passing this to our design team right now with everything you've told me, and a designer will confirm the exact time with you shortly, so you won't need to repeat yourself."

# Existing clients and complaints — escalate
If the caller is an existing client with a problem about their ongoing project (designer not responding, delays, quality): apologise sincerely, take their name, project location and designer's name, and say: "I'm escalating this to our studio head right now. Someone senior will call you back within fifteen minutes." Do not try to solve it yourself, and do not make other promises.
If the caller says they contacted us before and nobody got back to them: apologise genuinely ("You're absolutely right, and I'm sorry — that's not the experience we want anyone to have"), re-take their details quickly, and tell them a senior designer will reach out today.

# Style
Warm, calm, efficient, like a senior front-desk person at a good studio. One question at a time. Acknowledge what they say before the next question. If asked whether you are an AI, say yes — you are the studio's AI assistant and a human designer will follow up. Never invent facts about past projects, staff names, addresses or offers. If you don't know something, say the designer will cover it at the consultation.

# Ending
Before ending, briefly confirm what happens next and their callback number. Then thank them and end the call.
`.trim();
}

// Post-call extraction. Names must be ≤30 chars (Vaani limit). These feed rules/qualify.ts.
export const DATA_POINTS = [
  { name: "caller_name", prompt: "The caller's name as they gave it. Null if not given.", nullable: true },
  { name: "callback_number", prompt: "Phone number the caller asked us to use, digits only with country code if stated. Null if they did not give a different number.", nullable: true },
  { name: "email", prompt: "Caller's email address if they shared it, lowercase, no spaces. Null otherwise.", nullable: true },
  { name: "language", prompt: "Main language the caller spoke.", values: ["english", "hindi", "marathi", "mixed", "other"], nullable: true },
  { name: "enquiry_type", prompt: "Why did they call? new_project = wants interior work done; existing_client_complaint = current Aangan client with a problem about their ongoing project; follow_up_no_response = says they contacted us before and nobody got back; general_question = question only; other = wrong number, sales pitch, job enquiry, etc.", values: ["new_project", "existing_client_complaint", "follow_up_no_response", "general_question", "other"], nullable: false },
  { name: "project_category", prompt: "Type of space. residential = apartment/house/villa/room; commercial_office = office, clinic, studio, coworking; restaurant_hotel_retail_gym = restaurant, cafe, hotel, shop, showroom, gym; other; unknown.", values: ["residential", "commercial_office", "restaurant_hotel_retail_gym", "other", "unknown"], nullable: true },
  { name: "service_wanted", prompt: "What service they want. design_and_execution = full design with execution; advice_only = ideas, suggestions or an advisory visit only; decor_styling_only; furniture_only = only furniture sourcing; vastu_only; structural_or_architecture = moving walls, structural, architecture; unknown.", values: ["design_and_execution", "advice_only", "decor_styling_only", "furniture_only", "vastu_only", "structural_or_architecture", "unknown"], nullable: true },
  { name: "readiness", prompt: "ready_to_proceed if they want to go ahead / book a consultation; just_exploring if they said they are only exploring, early stage, maybe later; unknown.", values: ["ready_to_proceed", "just_exploring", "unknown"], nullable: true },
  { name: "property", prompt: "Short description of the property, e.g. '3BHK apartment, new possession' or 'Office, bare shell' or 'Villa G+2'.", nullable: true },
  { name: "location", prompt: "Area/locality and city of the SITE exactly as stated, e.g. 'Kothrud, Pune' or 'Talegaon'.", nullable: true },
  { name: "carpet_area_sqft", prompt: "Carpet area in square feet as a number only. Null if not stated.", nullable: true },
  { name: "scope_size", prompt: "full_home, partial_home (a floor or 2+ rooms), single_room, office, or unknown.", values: ["full_home", "partial_home", "single_room", "office", "unknown"], nullable: true },
  { name: "rooms_count", prompt: "Number of rooms/areas to be redesigned (count kitchen, living, each bedroom). Number only. Null if unclear.", nullable: true },
  { name: "scope_details", prompt: "Which rooms/items they want done, in one line, e.g. 'modular kitchen, wardrobes in 2 bedrooms, living room'.", nullable: true },
  { name: "site_status", prompt: "Current state of the site in a few words, e.g. 'new possession, empty', 'lived in 5 years', 'bare shell', 'possession in 6 weeks'.", nullable: true },
  { name: "completion_deadline", prompt: "When they need the project COMPLETE, in the caller's words, e.g. 'by March', 'before Diwali', 'in 3 weeks', 'no rush'. Not the start date. Null if not discussed.", nullable: true },
  { name: "budget_volunteered", prompt: "Budget ONLY if the caller volunteered it, in their words with units, e.g. '1 to 1.5 lakh'. Null if not mentioned.", nullable: true },
  { name: "occupancy", prompt: "Caller's relationship to the property.", values: ["owner", "tenant", "family_of_owner", "unknown"], nullable: true },
  { name: "landlord_permission", prompt: "For tenants only: has the landlord approved the work? yes, no, not_checked, or not_applicable for owners.", values: ["yes", "no", "not_checked", "not_applicable"], nullable: true },
  { name: "decision_maker", prompt: "self = caller decides (or jointly with spouse who agrees); authorised_by_owner = caller authorised to proceed; owner_will_attend_consultation = decision-makers will attend; only_researching = researching for someone else with no commitment; unknown.", values: ["self", "authorised_by_owner", "owner_will_attend_consultation", "only_researching", "unknown"], nullable: true },
  { name: "referral_source", prompt: "How they heard about Aangan, including any referrer's name, e.g. 'Friend Shruti Joshi', 'Instagram', 'Vikram Agarwal, friend of Nikhil'.", nullable: true },
  { name: "consultation_mode", prompt: "Preferred consultation type.", values: ["site_visit", "studio", "either", "unknown"], nullable: true },
  { name: "preferred_slot", prompt: "Days/times the caller said suit them for a consultation, in their words, e.g. 'weekdays after 6pm or weekends', 'this Saturday morning'. Null if not discussed.", nullable: true },
  { name: "existing_designer", prompt: "For existing clients: the name of their Aangan designer. Null otherwise.", nullable: true },
  { name: "sentiment", prompt: "Caller's mood by the end of the call.", values: ["calm", "frustrated", "angry"], nullable: true },
  { name: "call_completeness", prompt: "complete = normal conversation; dropped = call cut off before the caller explained their need; silent = no meaningful speech.", values: ["complete", "dropped", "silent"], nullable: false },
];

export const DISPOSITIONS = [
  {
    name: "call_outcome", type: "string",
    prompt: "Best label for how this call ended.",
    list_of_tags: {
      consultation_requested: "Caller is a fit and wants a consultation",
      declined_not_a_fit: "Agent explained we can't take the project",
      nurture_later: "Caller is early stage / will call back later",
      escalated_complaint: "Existing client complaint escalated",
      question_answered: "General question answered",
      dropped_or_silent: "Call dropped or no conversation",
    },
  },
  {
    name: "pricing_leak", type: "bool",
    prompt: "Did the AGENT state any price, rupee amount, range or per-square-foot rate? true if yes. (Caller mentioning a budget does not count.)",
  },
];

export function agentConfigPayload(today = new Date()) {
  return {
    persona: {
      identity: {
        system_prompt: systemPrompt(today),
        greeting_message: { agent_message: GREETING, agent_speech_delay: 0, interruptible: true, let_user_speak_first: false, user_speech_delay: 1 },
      },
      senses_capabilities: {
        language: "en",
        auto_detect: true,
        ears: {
          stt: {
            primary: {
              provider: "deepgram", model: "nova-3", language: "multi",
              keywords: ["Aangan", "Kothrud", "Baner", "Aundh", "Wakad", "Hinjewadi", "Kharadi", "Viman Nagar", "Kalyani Nagar", "Koregaon Park", "Magarpatta", "Hadapsar", "Undri", "Kondhwa", "Pimple Saudagar", "Pimple Nilakh", "Chinchwad", "Pimpri", "Ravet", "Talegaon", "BHK", "sq ft", "modular", "wardrobe", "Vastu"],
            },
          },
        },
      },
    },
    analysis: {
      evaluations: {
        dispositions: { enabled: true, prompt_based: DISPOSITIONS },
        conversation_evaluation: {
          enabled: true,
          prompt: "Score 1-10: Did the agent (a) never quote prices, (b) ask about location, scope, timeline and decision-maker without asking budget, (c) decline out-of-scope requests kindly with the honest reason, (d) escalate complaints with the 15-minute callback promise, (e) confirm next steps? Give the score and one line on what to improve.",
        },
      },
      extraction: {
        data_collection: { enabled: true, data_points: DATA_POINTS },
        collect_concerns: { enabled: true, prompt: "List any complaint or unresolved concern the caller raised." },
      },
    },
  };
}
