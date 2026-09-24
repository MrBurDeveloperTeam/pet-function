import React from 'react';
import type { FoodItem } from '../types';

const itemAssetUrl = (fileName: string) => `/pet-function/items/${fileName}`;
const bananaPixelUrl = itemAssetUrl('banana-pixel.png');
const applePixelUrl = itemAssetUrl('apple-pixel.png');
const bobaTeaPixelUrl = itemAssetUrl('boba-tea-pixel.png');
const broccoliPixelUrl = itemAssetUrl('broccoli-pixel.png');
const carrotPixelUrl = itemAssetUrl('carrot-pixel.png');
const coffeePixelUrl = itemAssetUrl('coffee-pixel.png');
const cornPixelUrl = itemAssetUrl('corn-pixel.png');
const grapesPixelUrl = itemAssetUrl('grapes-pixel.png');
const greenTeaPixelUrl = itemAssetUrl('green-tea-pixel.png');
const juiceBoxPixelUrl = itemAssetUrl('juice-box-pixel.png');
const milkPixelUrl = itemAssetUrl('milk-pixel.png');
const pineapplePixelUrl = itemAssetUrl('pineapple-pixel.png');
const saladPixelUrl = itemAssetUrl('salad-pixel.png');
const sodaPixelUrl = itemAssetUrl('soda-pixel.png');
const strawberryPixelUrl = itemAssetUrl('strawberry-pixel.png');
const watermelonPixelUrl = itemAssetUrl('watermelon-pixel.png');
const waterPixelUrl = itemAssetUrl('water-pixel.png');
const baconPixelUrl = itemAssetUrl('bacon-pixel.png');
const breadPixelUrl = itemAssetUrl('bread-pixel.png');
const cerealPixelUrl = itemAssetUrl('cereal-pixel.png');
const croissantPixelUrl = itemAssetUrl('croissant-pixel.png');
const friedEggPixelUrl = itemAssetUrl('fried-egg-pixel.png');
const pancakesPixelUrl = itemAssetUrl('pancakes-pixel.png');
const wafflePixelUrl = itemAssetUrl('waffle-pixel.png');
const burgerPixelUrl = itemAssetUrl('burger-pixel.png');
const burritoPixelUrl = itemAssetUrl('burrito-pixel.png');
const chickenLegPixelUrl = itemAssetUrl('chicken-leg-pixel.png');
const friesPixelUrl = itemAssetUrl('fries-pixel.png');
const hotdogPixelUrl = itemAssetUrl('hotdog-pixel.png');
const pizzaPixelUrl = itemAssetUrl('pizza-pixel.png');
const ramenPixelUrl = itemAssetUrl('ramen-pixel.png');
const sandwichPixelUrl = itemAssetUrl('sandwich-pixel.png');
const spaghettiPixelUrl = itemAssetUrl('spaghetti-pixel.png');
const steakPixelUrl = itemAssetUrl('steak-pixel.png');
const sushiPixelUrl = itemAssetUrl('sushi-pixel.png');
const tacoPixelUrl = itemAssetUrl('taco-pixel.png');
const cakePixelUrl = itemAssetUrl('cake-pixel.png');
const chocolatePixelUrl = itemAssetUrl('chocolate-pixel.png');
const cookiePixelUrl = itemAssetUrl('cookie-pixel.png');
const donutPixelUrl = itemAssetUrl('donut-pixel.png');
const iceCreamPixelUrl = itemAssetUrl('ice-cream-pixel.png');
const lollipopPixelUrl = itemAssetUrl('lollipop-pixel.png');
const piePixelUrl = itemAssetUrl('pie-pixel.png');
const eightBallPixelUrl = itemAssetUrl('8-ball-pixel.png');
const baseballPixelUrl = itemAssetUrl('baseball-pixel.png');
const basketballPixelUrl = itemAssetUrl('basketball-pixel.png');
const blueBallPixelUrl = itemAssetUrl('blue-ball-pixel.png');
const footballPixelUrl = itemAssetUrl('football-pixel.png');
const goldBallPixelUrl = itemAssetUrl('gold-ball-pixel.png');
const greenBallPixelUrl = itemAssetUrl('green-ball-pixel.png');
const orangeBallPixelUrl = itemAssetUrl('orange-ball-pixel.png');
const purpleBallPixelUrl = itemAssetUrl('purple-ball-pixel.png');
const redBallPixelUrl = itemAssetUrl('red-ball-pixel.png');
const rugbyBallPixelUrl = itemAssetUrl('rugby-ball-pixel.png');
const soccerBallPixelUrl = itemAssetUrl('soccer-ball-pixel.png');
const tennisBallPixelUrl = itemAssetUrl('tennis-ball-pixel.png');

interface FoodItemVisualProps {
  item: Pick<FoodItem, 'id' | 'icon' | 'label'>;
  imageClassName: string;
  emojiClassName: string;
}

const FOOD_PIXEL_IMAGES: Record<string, string> = {
  apple: applePixelUrl,
  banana: bananaPixelUrl,
  berry: strawberryPixelUrl,
  boba: bobaTeaPixelUrl,
  'boba tea': bobaTeaPixelUrl,
  broccoli: broccoliPixelUrl,
  carrot: carrotPixelUrl,
  coffee: coffeePixelUrl,
  corn: cornPixelUrl,
  grapes: grapesPixelUrl,
  tea: greenTeaPixelUrl,
  'green tea': greenTeaPixelUrl,
  juice: juiceBoxPixelUrl,
  'juice box': juiceBoxPixelUrl,
  melon: watermelonPixelUrl,
  milk: milkPixelUrl,
  pineapple: pineapplePixelUrl,
  salad: saladPixelUrl,
  soda: sodaPixelUrl,
  strawberry: strawberryPixelUrl,
  veggie: broccoliPixelUrl,
  watermelon: watermelonPixelUrl,
  water: waterPixelUrl,
  bacon: baconPixelUrl,
  bread: breadPixelUrl,
  toast: breadPixelUrl,
  cereal: cerealPixelUrl,
  croissant: croissantPixelUrl,
  egg: friedEggPixelUrl,
  'fried egg': friedEggPixelUrl,
  pancakes: pancakesPixelUrl,
  waffle: wafflePixelUrl,
  burger: burgerPixelUrl,
  burrito: burritoPixelUrl,
  chicken: chickenLegPixelUrl,
  'chicken leg': chickenLegPixelUrl,
  fries: friesPixelUrl,
  hotdog: hotdogPixelUrl,
  pizza: pizzaPixelUrl,
  ramen: ramenPixelUrl,
  sandwich: sandwichPixelUrl,
  spaghetti: spaghettiPixelUrl,
  pasta: spaghettiPixelUrl,
  steak: steakPixelUrl,
  sushi: sushiPixelUrl,
  taco: tacoPixelUrl,
  cake: cakePixelUrl,
  chocolate: chocolatePixelUrl,
  cookie: cookiePixelUrl,
  donut: donutPixelUrl,
  icecream: iceCreamPixelUrl,
  'ice cream': iceCreamPixelUrl,
  lollipop: lollipopPixelUrl,
  pie: piePixelUrl,
  ball_8ball: eightBallPixelUrl,
  '8-ball': eightBallPixelUrl,
  ball_baseball: baseballPixelUrl,
  baseball: baseballPixelUrl,
  ball_basketball: basketballPixelUrl,
  basketball: basketballPixelUrl,
  ball_blue: blueBallPixelUrl,
  'blue ball': blueBallPixelUrl,
  ball_football: footballPixelUrl,
  football: footballPixelUrl,
  ball_gold: goldBallPixelUrl,
  'gold ball': goldBallPixelUrl,
  ball_green: greenBallPixelUrl,
  'green ball': greenBallPixelUrl,
  ball_orange: orangeBallPixelUrl,
  'orange ball': orangeBallPixelUrl,
  ball_purple: purpleBallPixelUrl,
  'purple ball': purpleBallPixelUrl,
  ball_red: redBallPixelUrl,
  'red ball': redBallPixelUrl,
  ball_rugby: rugbyBallPixelUrl,
  'rugby ball': rugbyBallPixelUrl,
  ball_soccer: soccerBallPixelUrl,
  'soccer ball': soccerBallPixelUrl,
  ball_tennis: tennisBallPixelUrl,
  'tennis ball': tennisBallPixelUrl,
};

export const FoodItemVisual: React.FC<FoodItemVisualProps> = ({
  item,
  imageClassName,
  emojiClassName,
}) => {
  const imageUrl = FOOD_PIXEL_IMAGES[item.id.toLowerCase()] ?? FOOD_PIXEL_IMAGES[item.label.toLowerCase()];
  const [failedImageUrl, setFailedImageUrl] = React.useState<string | null>(null);

  if (imageUrl && failedImageUrl !== imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={item.label}
        draggable={false}
        className={`${imageClassName} select-none object-contain`}
        onError={() => setFailedImageUrl(imageUrl)}
      />
    );
  }

  return <span className={emojiClassName}>{item.icon}</span>;
};
