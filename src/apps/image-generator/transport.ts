import type { AppointmentChatServices } from '../appointment/transport';
export interface ContentStudioChatServices {
 chatWithMolarAI: AppointmentChatServices['chatWithMolarAI'];
 chatWithGroundedContentStudioFacts: AppointmentChatServices['chatWithGroundedAppointmentFacts'];
 routeContentStudioCapability: AppointmentChatServices['routeAppointmentCapability'];
}
