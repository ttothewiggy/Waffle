from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
for subset in ['latin','latin-ext']:
 for weight in [400,700]:
  font=TTFont(f'public/pdf-fonts/kalam-{subset}-{weight}-normal.woff')
  glyphs=font.getGlyphSet(); outlines={}
  for name in glyphs:
   record=DecomposingRecordingPen(glyphs);glyphs[name].draw(record);outlines[name]=record
  for name,record in outlines.items():
   pen=TTGlyphPen(None);record.replay(TransformPen(pen,(1,0,.18,1,0,0)));font['glyf'][name]=pen.glyph()
  font['post'].italicAngle=-10
  font['head'].macStyle |= 2
  font['OS/2'].fsSelection=(font['OS/2'].fsSelection|1)&~64
  for n in font['name'].names:
   if n.nameID in (1,2,3,4,6):
    value='Italic' if n.nameID==2 else f'WaffleHandOblique-{subset}-{weight}'
    n.string=value.encode(n.getEncoding())
  font.save(f'public/pdf-fonts/waffle-hand-{subset}-{weight}-italic.woff')
