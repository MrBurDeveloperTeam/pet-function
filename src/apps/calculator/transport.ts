import type { AppointmentChatServices } from '../appointment/transport';
export interface CalculatorChatServices {
 chatWithMolarAI: AppointmentChatServices['chatWithMolarAI'];
 chatWithGroundedProfitFacts: AppointmentChatServices['chatWithGroundedAppointmentFacts'];
 routeCalculatorCapability: AppointmentChatServices['routeAppointmentCapability'];
}
