from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
base=Path(__file__).parent
canvas=Image.new('RGB',(1500,1160),'#e9e3db');draw=ImageDraw.Draw(canvas)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',25)
for i,name in enumerate(['front','left','right','back','top','bottom']):
 im=Image.open(base/f'gulu-{name}.png').convert('RGBA');im.thumbnail((470,510))
 x=(i%3)*500+(500-im.width)//2;y=(i//3)*580+20
 canvas.paste(im,(x,y),im);draw.text(((i%3)*500+180,(i//3)*580+540),name.upper(),font=font,fill='#423a34')
canvas.save(base/'gulu-model-review.png')
