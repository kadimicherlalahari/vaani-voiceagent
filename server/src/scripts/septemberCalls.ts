// The 20 phone enquiries from "Aangan_Sep 2026_Enquiries.pdf" (T01–T20), expressed as the
// structured fields the Vaani agent extracts after a call. Used for two things:
//  1. test/qualify.test.ts — the rubric must reach the same decision the front desk / Nikhil did
//  2. scripts/seed.ts — a "September baseline" so the dashboard has history (marked source=seed)

import type { LeadFacts } from "../rules/qualify.js";

export type SeedCall = {
  id: string;
  at: string; // IST
  durationSec: number;
  status: "completed" | "dropped" | "missed";
  name?: string;
  summary: string;
  transcript?: string;
  facts: LeadFacts;
  expected: "qualified" | "needs_info" | "declined" | "nurture" | "escalation" | null;
};

const R = (s: string) => s.trim().replace(/^ +/gm, "");

export const SEPTEMBER_CALLS: SeedCall[] = [
  {
    id: "T01", at: "2026-09-02T10:23:00+05:30", durationSec: 252, status: "completed", name: "Priya",
    summary: "3BHK in Kothrud (Dahanukar Colony), 1,400 sq ft. Full redesign — kitchen, living, both bedrooms. Done by March. Owner; husband aware. Referral from Shruti Joshi.",
    transcript: R(`AGENT: Good morning, Aangan Studio.
      USER: Hi, I'm Priya. I got your number from a friend — Shruti Joshi. She had her flat done by you in Aundh.
      USER: We have a 3BHK in Kothrud — Dahanukar Colony. We want to redo the whole thing — kitchen, living room, both bedrooms. About 1,400 sq ft carpet.
      USER: We'd like to be done by March. We're in no rush.
      USER: Yes — myself and my husband. He knows we're calling and is happy to go ahead.`),
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Kothrud, Dahanukar Colony", carpetSqft: 1400, scopeSize: "full_home", completionDeadline: "by March, no rush", occupancy: "owner", decisionMaker: "self", referral: "Friend Shruti Joshi (past client, Aundh)", property: "3BHK apartment", sentiment: "calm" },
    expected: "qualified",
  },
  {
    id: "T02", at: "2026-09-03T14:41:00+05:30", durationSec: 308, status: "completed",
    summary: "2BHK in Wakad, 950 sq ft. Modular kitchen, wardrobes, living, both bedrooms. Moving in November. Pushed for a price range twice — deflected; booked.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Wakad", carpetSqft: 950, scopeSize: "full_home", completionDeadline: "move in November", decisionMaker: "self", property: "2BHK apartment", referral: "Instagram" },
    expected: "qualified",
  },
  {
    id: "T03", at: "2026-09-03T16:15:00+05:30", durationSec: 160, status: "completed", name: "Suresh Patil",
    summary: "Home office and study in Nashik. Outside service area — declined politely.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", location: "Nashik", scopeSize: "partial_home", referral: "LinkedIn" },
    expected: "declined",
  },
  {
    id: "T04", at: "2026-09-04T11:07:00+05:30", durationSec: 202, status: "completed",
    summary: "Wants ideas for living room — colours, furniture arrangement. Not planning full project. Advice-only; declined.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "advice_only", readiness: "just_exploring", scopeSize: "single_room" },
    expected: "declined",
  },
  {
    id: "T05", at: "2026-09-05T10:52:00+05:30", durationSec: 404, status: "completed", name: "Aarti Mehta",
    summary: "4BHK Koregaon Park, 2,400 sq ft. Complete redesign incl. flooring. Moved out; back by February. Referral via Vikram Agarwal (friend of Nikhil). Wants site visit.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Koregaon Park", carpetSqft: 2400, scopeSize: "full_home", completionDeadline: "move back by February", decisionMaker: "self", referral: "Vikram Agarwal — close friend of Nikhil", property: "4BHK apartment" },
    expected: "qualified",
  },
  {
    id: "T06", at: "2026-09-05T15:28:00+05:30", durationSec: 301, status: "completed",
    summary: "Startup office in Baner, 800 sq ft bare shell. 20 workstations, cabin, meeting room, break area. Operational by December. Caller is founder.",
    facts: { enquiryType: "new_project", projectCategory: "commercial_office", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Baner", carpetSqft: 800, scopeSize: "office", completionDeadline: "operational by December", decisionMaker: "self", property: "Office, bare shell" },
    expected: "qualified",
  },
  {
    id: "T07", at: "2026-09-08T09:44:00+05:30", durationSec: 195, status: "completed",
    summary: "Living room + kitchen before Diwali (~3 weeks away per front desk). Too short. Offered November start; caller will think.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", scopeSize: "partial_home", rooms: 2, completionDeadline: "in 3 weeks, before Diwali" },
    expected: "declined",
  },
  {
    id: "T08", at: "2026-09-09T22:47:00+05:30", durationSec: 0, status: "missed",
    summary: "Missed call after hours, no voicemail. Nanded City (Pune) number. Call-back next morning — no answer.",
    facts: {},
    expected: null,
  },
  {
    id: "T09", at: "2026-09-10T11:32:00+05:30", durationSec: 352, status: "completed", name: "Sheetal Deshpande",
    summary: "EXISTING CLIENT COMPLAINT. 2BHK Viman Nagar, designer Aryan hasn't replied in 5 days. Wants callback from Nikhil or senior within 15 min.",
    facts: { enquiryType: "existing_client_complaint", location: "Viman Nagar", sentiment: "angry" },
    expected: "escalation",
  },
  {
    id: "T10", at: "2026-09-11T14:04:00+05:30", durationSec: 220, status: "completed",
    summary: "1BHK Kharadi, 550 sq ft. Kitchen + one bedroom. Volunteered budget 1–1.5 lakh. Misalignment addressed honestly on call.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", location: "Kharadi", carpetSqft: 550, scopeSize: "partial_home", rooms: 2, budget: "1 to 1.5 lakh maximum" },
    expected: "declined",
  },
  {
    id: "T11", at: "2026-09-12T10:18:00+05:30", durationSec: 382, status: "completed",
    summary: "Rented 2BHK in Baner, 3-year lease. Living, bedroom, kitchen — no structural changes. Landlord OK as long as no walls broken.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Baner", scopeSize: "partial_home", rooms: 3, occupancy: "tenant", landlordPermission: "yes", decisionMaker: "self", property: "2BHK apartment (rented)" },
    expected: "qualified",
  },
  {
    id: "T12", at: "2026-09-15T10:05:00+05:30", durationSec: 450, status: "completed", name: "Anand Sharma",
    summary: "Villa in Kalyani Nagar, 5,500 sq ft, G+2, new construction. Full end-to-end. Move in March. Wants principal designer site visit this/next week.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Kalyani Nagar", carpetSqft: 5500, scopeSize: "full_home", completionDeadline: "March next year, no rush", decisionMaker: "self", property: "Villa, G+2, new construction" },
    expected: "qualified",
  },
  {
    id: "T13", at: "2026-09-16T12:19:00+05:30", durationSec: 368, status: "completed",
    summary: "3BHK Aundh, 1,100 sq ft. Kitchen, wardrobes, living. Asked for price range twice — deflected; booked.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Aundh", carpetSqft: 1100, scopeSize: "partial_home", decisionMaker: "self", property: "3BHK apartment" },
    expected: "qualified",
  },
  {
    id: "T14", at: "2026-09-17T11:41:00+05:30", durationSec: 295, status: "completed",
    summary: "Son calling for parents' new-possession 3BHK in Hadapsar. Parents decide and will attend consultation.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", location: "Hadapsar", scopeSize: "full_home", occupancy: "family_of_owner", decisionMaker: "owner_will_attend_consultation", readiness: "ready_to_proceed", property: "3BHK, new possession" },
    expected: "qualified",
  },
  {
    id: "T15", at: "2026-09-18T15:12:00+05:30", durationSec: 344, status: "completed", name: "Smita",
    summary: "2BHK Undri, 875 sq ft, possession in ~6 weeks. Full home. Owner; husband said book. Builder will allow site access now.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Undri", carpetSqft: 875, scopeSize: "full_home", decisionMaker: "self", property: "2BHK, possession in 6 weeks" },
    expected: "qualified",
  },
  {
    id: "T16", at: "2026-09-19T10:38:00+05:30", durationSec: 318, status: "completed", name: "Girish Nair",
    summary: "Called Monday, never followed up. 3BHK Viman Nagar. Frustrated — re-logged and booked. Handle with care.",
    facts: { enquiryType: "follow_up_no_response", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Viman Nagar", scopeSize: "full_home", sentiment: "frustrated", property: "3BHK apartment" },
    expected: "qualified",
  },
  {
    id: "T17a", at: "2026-09-22T14:14:00+05:30", durationSec: 72, status: "dropped",
    summary: "Line dropped mid-sentence.", facts: {}, expected: null,
  },
  {
    id: "T17", at: "2026-09-22T14:16:00+05:30", durationSec: 270, status: "completed", name: "Ritu Kapoor",
    summary: "Called back after drop. 3BHK Pimple Saudagar, 1,050 sq ft. Kitchen, wardrobes, living. Done by March.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Pimple Saudagar", carpetSqft: 1050, scopeSize: "partial_home", completionDeadline: "ideally done by March", decisionMaker: "self", property: "3BHK apartment" },
    expected: "qualified",
  },
  {
    id: "T18", at: "2026-09-23T11:55:00+05:30", durationSec: 182, status: "completed",
    summary: "Coworking pod, 180 sq ft — lighting, desk, storage. Below commercial minimum; declined.",
    facts: { enquiryType: "new_project", projectCategory: "commercial_office", serviceWanted: "design_and_execution", carpetSqft: 180, scopeSize: "office" },
    expected: "declined",
  },
  {
    id: "T19", at: "2026-09-24T16:02:00+05:30", durationSec: 170, status: "completed",
    summary: "Restaurant in Koregaon Park. Hospitality is out of scope; declined.",
    facts: { enquiryType: "new_project", projectCategory: "restaurant_hotel_retail_gym", serviceWanted: "design_and_execution", location: "Koregaon Park" },
    expected: "declined",
  },
  {
    id: "T20", at: "2026-09-25T09:15:00+05:30", durationSec: 284, status: "completed", name: "Pooja",
    summary: "2BHK Magarpatta (Cybercity), 900 sq ft. Kitchen, both bedrooms, living. January execution start. Both owners attending.",
    facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Magarpatta, Cybercity", carpetSqft: 900, scopeSize: "full_home", completionDeadline: "flexible, January start for execution", decisionMaker: "self", property: "2BHK apartment" },
    expected: "qualified",
  },
];

// Extra cases from the WhatsApp/web-form sections — not phone calls, so not seeded, but they
// exercise rubric branches the phone calls don't (Talegaon, 3-week deadline, early-stage).
export const RUBRIC_EXTRA_CASES: { id: string; facts: LeadFacts; at: string; expected: SeedCall["expected"] }[] = [
  { id: "F03", at: "2026-09-06T11:18:00+05:30", expected: "declined", facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", location: "Talegaon Dabhade, near Pune", carpetSqft: 1400, scopeSize: "full_home", completionDeadline: "3-4 months, flexible", budget: "15-20 lakh" } },
  { id: "F05", at: "2026-09-11T10:05:00+05:30", expected: "qualified", facts: { enquiryType: "new_project", projectCategory: "commercial_office", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Hinjewadi Phase 1", carpetSqft: 2200, scopeSize: "office", completionDeadline: "operational by January 15", budget: "60-80 lakh", decisionMaker: "authorised_by_owner" } },
  { id: "F06", at: "2026-09-14T20:52:00+05:30", expected: "qualified", facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", location: "NIBM Road", carpetSqft: 1950, scopeSize: "full_home", completionDeadline: "starting February 2027", budget: "35-40 lakh", decisionMaker: "self" } },
  { id: "F08", at: "2026-09-18T18:44:00+05:30", expected: "declined", facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", location: "Wakad", carpetSqft: 875, scopeSize: "partial_home", rooms: 2, completionDeadline: "3 weeks maximum", budget: "4-5 lakh" } },
  { id: "W07", at: "2026-09-05T16:52:00+05:30", expected: "declined", facts: { enquiryType: "new_project", projectCategory: "restaurant_hotel_retail_gym", serviceWanted: "design_and_execution", location: "Kothrud", carpetSqft: 2500 } },
  { id: "W10", at: "2026-09-23T18:44:00+05:30", expected: "nurture", facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "unknown", readiness: "just_exploring", location: "Hinjewadi", scopeSize: "full_home" } },
  { id: "TENANT-PENDING", at: "2026-10-10T12:00:00+05:30", expected: "needs_info", facts: { enquiryType: "new_project", projectCategory: "residential", serviceWanted: "design_and_execution", readiness: "ready_to_proceed", location: "Baner", scopeSize: "partial_home", occupancy: "tenant", landlordPermission: "not_checked", decisionMaker: "self" } },
];
