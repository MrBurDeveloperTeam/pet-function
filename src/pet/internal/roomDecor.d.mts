export interface DecorState {owned:string[];selected:Record<string,string>}
export interface DecorItem {id:string;source:string;category:string;label:string;price:number;room:string;slot:string}
export const DECOR_ITEMS:DecorItem[];
export const DECOR_BY_ID:Record<string,DecorItem>;
export function decorKey(item:DecorItem):string;
export function emptyDecor():DecorState;
export function validateDecor(v:unknown):DecorState;
export function selectDecor(state:DecorState,key:string,id:string|null):DecorState;
export function decorRoomUrl(id:string):string;
export function decorIconUrl(id:string):string;
