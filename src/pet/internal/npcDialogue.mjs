// Moods describe the line of dialogue, not the player's needs or current weather.
export const NPC_DIALOGUE_POOLS = Object.freeze({
  happy: Object.freeze([
    "Oh, it's you! My tail always does a little dance when a friend visits.",
    "A warm patch of sunshine and a good friend would make a perfect afternoon.",
    "I practiced passing the football. Sharing the ball feels better than chasing it alone!",
    "Even a tiny fish makes a lovely fishing story. I like hearing yours.",
    "The best part of a race is having someone cheer at the finish.",
    "I cleared a hurdle in my daydream. My landing was very graceful, naturally.",
    "A crunchy snack can turn an ordinary break into a celebration.",
    "I found a comfortable place to sit. That counts as a successful expedition.",
    "If it rains someday, we can listen to the little taps together.",
    "You don't have to win every game. I'm happy you came to play.",
    "My whiskers feel extra bouncy today. I think that's a good sign.",
    "The pond is a nice place to slow down and enjoy some company.",
    "I like seeing everyone's different outfits. So many ways to be yourself!",
    "A soft bed after a busy day sounds like a little piece of heaven.",
    "I was saving this cheerful purr for you. Prrrr!",
    "A breeze through my fur would be lovely. I'd try not to chase every leaf.",
    "A well-timed pass deserves a happy little paw clap.",
    "I don't need a grand adventure. A walk with a friend is plenty.",
    "Have you ever smiled so much your whiskers felt wider? That's me right now.",
    "Whatever you decide to play next, I hope you have a wonderful time.",
  ]),
  calm: Object.freeze([
    "There's no hurry. We can enjoy this little pause together.",
    "Watching the pond helps my thoughts settle, one ripple at a time.",
    "Before a football match, I like to take one slow breath.",
    "A steady pace can make a tricky race feel a little easier.",
    "Sometimes I picture clouds drifting past. My worries can drift along too.",
    "You can rest your paws between games. The next adventure can wait a moment.",
    "A quiet meal tastes nicer when I remember to chew slowly.",
    "For a hurdle, I think about the jump in front of me, not every jump after it.",
    "I don't mind a quiet friend. Sitting together is a kind of conversation.",
    "If the wind gets noisy, I'll find a cozy corner and listen from there.",
    "Fishing reminds me that waiting doesn't have to feel empty.",
    "Win or lose, a match is just one small part of the day.",
    "I like a gentle stretch before I get up. Every paw deserves its turn.",
    "A plain bowl of food can be comforting. Not everything needs to be fancy.",
    "It's all right to try a game again when you feel ready.",
    "I could sit beside a window and watch the world for ages.",
    "A soft purr is my favorite way to fill a quiet moment.",
    "Some days call for exploring. Others call for a slow walk home.",
    "If a little rain arrives, perhaps it will make a peaceful sound on the roof.",
    "You don't need to have something clever to say. I'm glad you're here.",
  ]),
  excited: Object.freeze([
    "A football match! My paws are already imagining the first sprint!",
    "What if your next catch is a fish you've never seen? Ooh, the possibilities!",
    "I love that tiny moment before a race starts. Everything feels possible!",
    "One hurdle, then another! I get excited just thinking about the rhythm!",
    "Did someone mention snacks? My ears heard that from very far away!",
    "I want to explore every path, then come back and tell you all about it!",
    "Imagine a breeze full of fluttering leaves. That's a whole parade to chase!",
    "A perfect pass, a quick dash, a shot at goal! Football has so many good bits!",
    "New outfit ideas make my whiskers twitch. Colors! Collars! Combinations!",
    "I wonder what the pond has in store next. Waiting is hard when I'm this curious!",
    "I have enough enthusiasm for three cats. Maybe four if there's a cheering section!",
    "You came back! Wait, let me make my happiest face!",
    "A race can change in one corner. That keeps my tail on high alert!",
    "If the sun comes out, I might celebrate with a very dramatic stretch!",
    "I just imagined a mountain of crunchy treats. That was an excellent thought!",
    "Let's hear your best game story. I'm ready for every exciting detail!",
    "I almost bounced out of my sitting pose. Too much adventure in these paws!",
    "Trying again means another chance for a brilliant moment!",
    "The sound of a ball rolling makes me want to spring into action!",
    "Even a small adventure can make my whole day sparkle!",
  ]),
  sad: Object.freeze([
    "I had a little gloomy feeling. It's lighter now that someone's stopped to chat.",
    "Missing a goal can sting. I try to remember it doesn't mean I'm a bad teammate.",
    "I wanted to win that race so much. I think I need a quiet minute.",
    "Sometimes the pond feels very big and I feel very small beside it.",
    "A missed jump made me feel clumsy. Maybe my paws just need another practice.",
    "I wish every goodbye came with a promise of another hello.",
    "I imagined sharing a snack, then noticed the space beside me was empty.",
    "Gray skies would suit this mood. A little warmth would be welcome too.",
    "I don't feel like being brave right this second. Could we just sit?",
    "Some days my purr is a little quieter. It's still there, though.",
    "I hoped for a catch and went home disappointed. Another fishing trip can be different.",
    "Being last feels lonely sometimes. A kind cheer can make such a difference.",
    "I miss the easy feeling of a really good day.",
    "Food doesn't sound quite as exciting when my thoughts are all tangled up.",
    "I keep replaying that mistake. I'd like to learn to be gentler with myself.",
    "If rain comes, perhaps it can keep me company for a while.",
    "I was hoping a friend would stop by. Thank you for noticing me.",
    "A soft place to curl up sounds better than another game right now.",
    "I feel a little left out when everyone runs ahead. I like being invited along.",
    "I'm not cheerful yet, but talking to you is a good start.",
  ]),
  grumpy: Object.freeze([
    "My tail is doing the annoyed swish. Please give it a little room.",
    "A football that rolls away the moment I reach it is very rude.",
    "I know races have corners. I still reserve the right to grumble about them.",
    "That hurdle looked smaller before I tried to jump it. Suspicious.",
    "An empty food bowl is a serious design flaw in any afternoon.",
    "If the wind messes up my fur, I'll be filing a complaint with the nearest tree.",
    "I can be friendly and mildly irritated at the same time. Observe.",
    "The fish are allowed to be patient. I'm allowed to sigh dramatically.",
    "Someone stepped on my imaginary last nerve. It was probably my own paw.",
    "No, I am not sulking. I am sitting with purpose.",
    "I don't enjoy losing a match. I'm practicing not blaming the ball.",
    "A scratchy outfit would put me in a mood immediately. Comfort matters.",
    "Rain would be fine if it could politely avoid my whiskers.",
    "I planned a quiet rest, then my own stomach interrupted it.",
    "If I miss another jump, I might glare at the hurdle for a full minute.",
    "You can talk. I'll listen while I work on looking less offended.",
    "I'm taking a break before I say something unkind about that race.",
    "A pebble under my paw can turn a grand walk into a personal grievance.",
    "I wanted the sunny spot in my daydream. Even imaginary clouds are being difficult.",
    "A little space and a kind word usually help. In that order, please.",
  ]),
  sleepy: Object.freeze([
    "I was going to say something brilliant, but a yawn got there first.",
    "A soft bed is winning the race for my attention.",
    "I could watch a football roll past and cheer very quietly from here.",
    "Fishing sounds restful. Just don't let my daydreams tug the line.",
    "I counted three hurdles, then somehow started counting pillows.",
    "A gentle rain on the roof would make a lovely nap soundtrack.",
    "My paws are ready for adventure. The rest of me has requested five more minutes.",
    "I dreamed about a snack and woke up halfway through the crunch.",
    "If my eyes close, I'm still listening. Probably.",
    "A warm sunbeam would be very persuasive right now.",
    "I don't think I need a faster racing line. I need a softer resting spot.",
    "That was a long stretch for such a small amount of energy.",
    "I can purr and doze at the same time. Years of careful practice.",
    "Let's keep our conversation cozy. My thoughts are wearing little slippers.",
    "The pond can keep its secrets until after my nap.",
    "I was planning my next goal, but the plan turned into a dream.",
    "A big meal sounds lovely, followed by an even bigger rest.",
    "Even the thought of chasing leaves is making me yawn.",
    "Wake me gently when there's a good story. I don't want to miss that.",
    "My next great leap might be straight into bedtime.",
  ]),
  hungry: Object.freeze([
    "My stomach just made a noise. Let's pretend it was a very small drum.",
    "I can talk about football, but somehow every ball looks like a round snack.",
    "A fishing trip makes me think about dinner. I know, very original of me.",
    "I'd like something crunchy, something soft, and then a moment to appreciate both.",
    "The race in my head ends beside a delicious meal.",
    "If jumping hurdles earned imaginary snacks, I would train all afternoon.",
    "A cool breeze would be nice. A tasty lunch would be nicer.",
    "I tried counting clouds, but I kept naming them after food.",
    "Do you ever plan your next meal while you're still talking about the last one?",
    "An empty bowl makes such a lonely little sound when I inspect it.",
    "I want to savor my food slowly. My stomach has a different proposal.",
    "A good meal after a match sounds like the finest victory celebration.",
    "My whiskers are alert for snack-related conversation.",
    "If it rains, a cozy indoor meal would suit me perfectly.",
    "I can wait patiently. Please don't ask my tail to confirm that.",
    "I was thinking about lap times, then accidentally thought about lunchtime.",
    "Even a quiet afternoon feels more interesting when dinner is on my mind.",
    "The pond has fish, and my imagination has a menu. They are separate matters.",
    "I'd love a little snack break before another grand adventure.",
    "I didn't mean to mention food again. My stomach is apparently writing this conversation.",
  ]),
  curious: Object.freeze([
    "Do you think fish notice us waiting, or are they busy with fish business?",
    "What makes a perfect football pass: timing, direction, or knowing your teammate?",
    "I wonder whether the fastest racing route always feels like the fastest one.",
    "How do you decide when to jump a hurdle? I keep watching everyone's paws.",
    "If clouds had flavors, would the fluffy ones taste different?",
    "Why does a snack taste better after I've spent ages thinking about it?",
    "Do you prefer exploring a new path or finding something new on a familiar one?",
    "I wonder how many different fish are still waiting to surprise us.",
    "Can a tiny change in a race corner make a big difference at the finish?",
    "What would your ideal cozy corner look like? Mine definitely has room for my tail.",
    "Do leaves sound different in a gentle breeze and a strong one? I'd like to listen.",
    "I wonder if goalkeepers dream about saving shots while they sleep.",
    "Which outfit color feels most like you? I think that's a lovely puzzle.",
    "If we could ask the pond one question, what would you choose?",
    "Why does stretching one paw make me want to stretch all the others?",
    "I wonder how rain sounds from inside a little wooden house.",
    "What game taught you something surprising about being patient?",
    "Does a great jump feel different from a lucky one? My paws won't explain it.",
    "How can a friend make a quiet day feel like an adventure without changing anything else?",
    "I wonder what you're looking forward to next. There are so many little possibilities.",
  ]),
});

const allLines = Object.entries(NPC_DIALOGUE_POOLS).flatMap(([mood, lines]) =>
  lines.map(text => Object.freeze({ mood, text })),
);

/** Each NPC gets an independent shuffled deck. A full deck plays before any line repeats. */
export function createNpcDialoguePicker(random = Math.random) {
  const decks = new Map();
  const randomIndex = length => {
    const value = random();
    return Math.floor(Math.max(0, Math.min(Number.isFinite(value) ? value : 0, 1 - Number.EPSILON)) * length);
  };
  return npcId => {
    let state = decks.get(npcId);
    if (!state) {
      state = { deck: [], previous: null };
      decks.set(npcId, state);
    }
    if (state.deck.length === 0) {
      state.deck = [...allLines];
      for (let i = state.deck.length - 1; i > 0; i--) {
        const j = randomIndex(i + 1);
        [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
      }
      // The next line comes from the end of the deck.
      const next = state.deck.length - 1;
      if (state.deck[next].text === state.previous) {
        [state.deck[0], state.deck[next]] = [state.deck[next], state.deck[0]];
      }
    }
    const line = state.deck.pop();
    state.previous = line.text;
    return line;
  };
}

const validPosition = position => position != null
  && Number.isFinite(position.x) && Number.isFinite(position.y);

/** Coordinates and maxDistance must use the same pixel space. Ties preserve NPC order. */
export function findNearbyNpc(positions, player, maxDistance) {
  if (!positions || !validPosition(player) || !Number.isFinite(maxDistance) || maxDistance < 0) return null;
  let nearest = null;
  let distance = maxDistance;
  for (const [id, position] of Object.entries(positions)) {
    if (!validPosition(position)) continue;
    const nextDistance = Math.hypot(position.x - player.x, position.y - player.y);
    if (nextDistance <= distance && (nearest === null || nextDistance < distance)) {
      nearest = id;
      distance = nextDistance;
    }
  }
  return nearest;
}
