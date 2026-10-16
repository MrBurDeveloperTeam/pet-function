export type CabinetRoom = 'GAMES'|'BATHROOM'|'BEDROOM'|'KITCHEN';
export interface CabinetState {owned:string[];selected:Partial<Record<CabinetRoom,string>>}
export interface CabinetItem {id:string;room:CabinetRoom;area:string;label:string;price:number;color:string;source:string}
export const CABINET_ITEMS:CabinetItem[];
export const CABINET_BY_ID:Record<string,CabinetItem>;
export function emptyCabinets():CabinetState;
export function validateCabinets(value:unknown):CabinetState;
export function selectCabinet(state:CabinetState,room:CabinetRoom,id:string|null):CabinetState;
export function cabinetRoomUrl(id:string):string;
export function cabinetIconUrl(id:string):string;
