import type { PetDatabaseClient } from '../databaseClient';
export interface AppointmentChatServices {
 chatWithMolarAI(history: {role:'user'|'model';parts:{text:string}[]}[], message:string, userContext:string):Promise<string>;
 chatWithGroundedAppointmentFacts(question:string,intent:string,facts:unknown):Promise<string>;
 routeAppointmentCapability(message:string,capabilities:{id:string;description:string}[],recentContext:string[],previousCapability:string|null):Promise<{route:'grounded'|'general_chat'|'clarification';capability:string|null;confidence:'high'|'low';clarification:string|null}>;
}
export type AppointmentDatabaseClient = PetDatabaseClient & {auth:{getSession():PromiseLike<{data:{session:{user:{id:string;email?:string;user_metadata?:Record<string,unknown>}}|null}}>}};
