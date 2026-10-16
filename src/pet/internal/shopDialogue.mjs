export const SHOP_DIALOGUE_POOLS = Object.freeze({
  welcome: Object.freeze([
    'Meow~ Welcome! What would you like today? 🐾',
    'Welcome! See anything you like? ✨',
    'Meow~ Welcome! Take a look around. 🛍️',
  ]),
  insufficient: Object.freeze([
    'Oops… your wallet says not today. 🪙',
    'Not enough coins yet — come back richer! 🐾',
    'Your coins are hiding from you. 🙈',
    'Almost! Your wallet needs a little more love. 💛',
  ]),
  purchase: Object.freeze([
    'Meow~ Great choice! ✨',
    'Yay! It’s yours now. 🐾',
    'Cha-ching! It’s yours. 🪙',
    'Nice pick! 💛',
  ]),
  farewell: Object.freeze([
    'Please come again! 🐾',
    'See you next time! 👋',
    'Thanks for stopping by! 💛',
    'Come back anytime! ✨',
  ]),
});

/** Randomize each occasion without repeating its immediately preceding line. */
export function createShopDialoguePicker(random = Math.random) {
  const previous = new Map();
  return kind => {
    if (!Object.hasOwn(SHOP_DIALOGUE_POOLS, kind)) throw new Error('Unknown shop dialogue');
    const choices = SHOP_DIALOGUE_POOLS[kind].filter(text => text !== previous.get(kind));
    const sample = random();
    const index = Math.floor(Math.max(0, Math.min(Number.isFinite(sample) ? sample : 0, 1 - Number.EPSILON)) * choices.length);
    const text = choices[index];
    previous.set(kind, text);
    return text;
  };
}
