import React from 'react';
import bananaPixelUrl from '../../../assets/pet/banana-pixel.png';
import applePixelUrl from '../../../assets/pet/apple-pixel.png';
import bobaTeaPixelUrl from '../../../assets/pet/boba-tea-pixel.png';
import broccoliPixelUrl from '../../../assets/pet/broccoli-pixel.png';
import carrotPixelUrl from '../../../assets/pet/carrot-pixel.png';
import coffeePixelUrl from '../../../assets/pet/coffee-pixel.png';
import cornPixelUrl from '../../../assets/pet/corn-pixel.png';
import grapesPixelUrl from '../../../assets/pet/grapes-pixel.png';
import greenTeaPixelUrl from '../../../assets/pet/green-tea-pixel.png';
import juiceBoxPixelUrl from '../../../assets/pet/juice-box-pixel.png';
import milkPixelUrl from '../../../assets/pet/milk-pixel.png';
import pineapplePixelUrl from '../../../assets/pet/pineapple-pixel.png';
import saladPixelUrl from '../../../assets/pet/salad-pixel.png';
import sodaPixelUrl from '../../../assets/pet/soda-pixel.png';
import strawberryPixelUrl from '../../../assets/pet/strawberry-pixel.png';
import watermelonPixelUrl from '../../../assets/pet/watermelon-pixel.png';
import waterPixelUrl from '../../../assets/pet/water-pixel.png';
import baconPixelUrl from '../../../assets/pet/bacon-pixel.png';
import breadPixelUrl from '../../../assets/pet/bread-pixel.png';
import cerealPixelUrl from '../../../assets/pet/cereal-pixel.png';
import croissantPixelUrl from '../../../assets/pet/croissant-pixel.png';
import friedEggPixelUrl from '../../../assets/pet/fried-egg-pixel.png';
import pancakesPixelUrl from '../../../assets/pet/pancakes-pixel.png';
import wafflePixelUrl from '../../../assets/pet/waffle-pixel.png';
import burgerPixelUrl from '../../../assets/pet/burger-pixel.png';
import burritoPixelUrl from '../../../assets/pet/burrito-pixel.png';
import chickenLegPixelUrl from '../../../assets/pet/chicken-leg-pixel.png';
import friesPixelUrl from '../../../assets/pet/fries-pixel.png';
import hotdogPixelUrl from '../../../assets/pet/hotdog-pixel.png';
import pizzaPixelUrl from '../../../assets/pet/pizza-pixel.png';
import ramenPixelUrl from '../../../assets/pet/ramen-pixel.png';
import sandwichPixelUrl from '../../../assets/pet/sandwich-pixel.png';
import spaghettiPixelUrl from '../../../assets/pet/spaghetti-pixel.png';
import steakPixelUrl from '../../../assets/pet/steak-pixel.png';
import sushiPixelUrl from '../../../assets/pet/sushi-pixel.png';
import tacoPixelUrl from '../../../assets/pet/taco-pixel.png';
import cakePixelUrl from '../../../assets/pet/cake-pixel.png';
import chocolatePixelUrl from '../../../assets/pet/chocolate-pixel.png';
import cookiePixelUrl from '../../../assets/pet/cookie-pixel.png';
import donutPixelUrl from '../../../assets/pet/donut-pixel.png';
import iceCreamPixelUrl from '../../../assets/pet/ice-cream-pixel.png';
import lollipopPixelUrl from '../../../assets/pet/lollipop-pixel.png';
import piePixelUrl from '../../../assets/pet/pie-pixel.png';
import eightBallPixelUrl from '../../../assets/pet/8-ball-pixel.png';
import baseballPixelUrl from '../../../assets/pet/baseball-pixel.png';
import basketballPixelUrl from '../../../assets/pet/basketball-pixel.png';
import blueBallPixelUrl from '../../../assets/pet/blue-ball-pixel.png';
import footballPixelUrl from '../../../assets/pet/football-pixel.png';
import goldBallPixelUrl from '../../../assets/pet/gold-ball-pixel.png';
import greenBallPixelUrl from '../../../assets/pet/green-ball-pixel.png';
import orangeBallPixelUrl from '../../../assets/pet/orange-ball-pixel.png';
import purpleBallPixelUrl from '../../../assets/pet/purple-ball-pixel.png';
import redBallPixelUrl from '../../../assets/pet/red-ball-pixel.png';
import rugbyBallPixelUrl from '../../../assets/pet/rugby-ball-pixel.png';
import soccerBallPixelUrl from '../../../assets/pet/soccer-ball-pixel.png';
import tennisBallPixelUrl from '../../../assets/pet/tennis-ball-pixel.png';
import type { FoodItem } from '../types';

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

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={item.label}
        draggable={false}
        className={`${imageClassName} select-none object-contain`}
      />
    );
  }

  return <span className={emojiClassName}>{item.icon}</span>;
};
