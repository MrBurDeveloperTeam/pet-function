export const DECOR_ITEMS = [
  {
    "id": "games_curtains",
    "source": "game",
    "category": "Curtains",
    "label": "Powder Blue Star Curtains",
    "price": 1400,
    "room": "GAMES",
    "slot": "curtains"
  },
  {
    "id": "games_rug",
    "source": "game",
    "category": "Rugs",
    "label": "Berry Arcade Rug",
    "price": 1100,
    "room": "GAMES",
    "slot": "rug"
  },
  {
    "id": "games_console",
    "source": "game",
    "category": "TV stands",
    "label": "Midnight Game Console",
    "price": 2300,
    "room": "GAMES",
    "slot": "console"
  },
  {
    "id": "bathroom_curtains",
    "source": "bathroom",
    "category": "Curtains",
    "label": "Sea Glass Curtains",
    "price": 1300,
    "room": "BATHROOM",
    "slot": "curtains"
  },
  {
    "id": "bathroom_rug",
    "source": "bathroom",
    "category": "Rugs",
    "label": "Ocean Pebble Mat",
    "price": 900,
    "room": "BATHROOM",
    "slot": "rug"
  },
  {
    "id": "bathroom_toilet",
    "source": "bathroom",
    "category": "Toilets",
    "label": "Sky Porcelain Toilet",
    "price": 1700,
    "room": "BATHROOM",
    "slot": "toilet"
  },
  {
    "id": "bedroom_curtains",
    "source": "bedroom",
    "category": "Curtains",
    "label": "Lilac Blossom Curtains",
    "price": 1500,
    "room": "BEDROOM",
    "slot": "curtains"
  },
  {
    "id": "bedroom_rug",
    "source": "bedroom",
    "category": "Rugs",
    "label": "Rose Petal Rug",
    "price": 1200,
    "room": "BEDROOM",
    "slot": "rug"
  },
  {
    "id": "bedroom_bed",
    "source": "bedroom",
    "category": "Beds",
    "label": "Bluebell Dream Bed",
    "price": 3200,
    "room": "BEDROOM",
    "slot": "bed"
  },
  {
    "id": "kitchen_curtains",
    "source": "kitchen",
    "category": "Curtains",
    "label": "Mint Orchard Curtains",
    "price": 1400,
    "room": "KITCHEN",
    "slot": "curtains"
  },
  {
    "id": "kitchen_rug",
    "source": "kitchen",
    "category": "Rugs",
    "label": "Honeycomb Kitchen Rug",
    "price": 1000,
    "room": "KITCHEN",
    "slot": "rug"
  },
  {
    "id": "kitchen_fridge",
    "source": "kitchen",
    "category": "Fridges",
    "label": "Mint Blossom Fridge",
    "price": 2800,
    "room": "KITCHEN",
    "slot": "fridge"
  }
];
export const DECOR_BY_ID=Object.fromEntries(DECOR_ITEMS.map(item=>[item.id,item]));
export const decorKey=item=>item.room+':'+item.slot;
export const emptyDecor=()=>({owned:[],selected:{}});
const record=v=>v!==null&&typeof v==='object'&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
export function validateDecor(v){
 if(!record(v)||!Array.isArray(v.owned)||!record(v.selected)||new Set(v.owned).size!==v.owned.length)throw Error('Invalid room decor');
 for(const id of v.owned)if(typeof id!=='string'||!Object.hasOwn(DECOR_BY_ID,id))throw Error('Invalid decor ownership');
 const selected={};for(const [key,id]of Object.entries(v.selected)){if(typeof id!=='string'||!v.owned.includes(id)||decorKey(DECOR_BY_ID[id])!==key)throw Error('Invalid decor slot');selected[key]=id;}
 return {owned:[...v.owned],selected};
}
export function selectDecor(state,key,id){const next=validateDecor(state);if(!DECOR_ITEMS.some(item=>decorKey(item)===key))throw Error('Invalid decor slot');if(id===null)delete next.selected[key];else{if(!next.owned.includes(id)||decorKey(DECOR_BY_ID[id])!==key)throw Error('Buy this item first');next.selected[key]=id;}return next;}
export const decorRoomUrl=id=>'/pet-function/room-decor/'+id+'.webp?v=1';
export const decorIconUrl=id=>'/pet-function/room-decor/'+id+'-icon.png?v=1';
