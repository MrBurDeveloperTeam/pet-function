// Capability registry — what Molar AI can actually answer in
// Appointment, independent of any specific phrasing.
//
// DELIBERATELY EXCLUDES `appointment_today_list`/`appointment_next_appointment`
// — both are patient-identity-bearing intents guarded by narrow,
// carefully-scoped deterministic patterns (see
// classifyAppointmentDataIntent.ts's own header) specifically to avoid
// ever loosely matching a genuinely sensitive question. A keyword-overlap
// semantic matcher is a broader-recall mechanism than that guard was
// designed to coexist with — rather than widen the sensitive-scope risk
// surface, those two intents stay reachable ONLY through the existing
// deterministic fast-path phrases (plus its own follow-up context), not
// through this semantic layer. The remaining four intents below carry no
// patient identity in their own facts already, so semantic routing onto
// them carries no such risk.

import type { AppointmentDataIntent } from '../contracts/groundedDataResult';

export interface AppointmentCapability {
  id: Extract<
    AppointmentDataIntent,
    'appointment_today_count' | 'appointment_soon' | 'appointment_room_usage' | 'appointment_daily_summary'
  >;
  description: string;
  keywords: string[];
}

export const APPOINTMENT_CAPABILITIES: AppointmentCapability[] = [
  {
    id: 'appointment_today_count',
    description: 'How many appointments are scheduled today.',
    keywords: ['how many appointments', 'how busy', 'appointment count', 'number of appointments'],
  },
  {
    id: 'appointment_soon',
    description: 'Appointments starting within the next 2 hours.',
    keywords: ['coming up', 'starting soon', 'anything soon', 'appointment soon'],
  },
  {
    id: 'appointment_room_usage',
    description: 'Which rooms are currently occupied.',
    keywords: ['room usage', 'rooms occupied', 'rooms in use', 'which rooms', 'room availability'],
  },
  {
    id: 'appointment_daily_summary',
    description: "An overall summary of today's schedule.",
    keywords: ['daily summary', 'how is today', 'summarize today', 'overview of today', 'hows my day'],
  },
];
