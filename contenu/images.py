# Génère la bibliothèque d'illustrations images/<nom>.svg (style plat, palette de la plateforme).
# Usage : python3 contenu/images.py
import os
NAVY, BRASS, GOLD, SKY, CREAM, INK, GREEN, PLUM, RED, BLUE = "#1b2a4e", "#a87b1f", "#e0b85a", "#dce7f7", "#f6efe0", "#141b2e", "#3f7d4e", "#7a3f86", "#b2392f", "#2f5fb3"
def svg(nom, titre, corps, fond=(SKY, CREAM)):
    a, b = fond
    s = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" role="img" aria-label="{titre}">
<title>{titre}</title>
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>
<rect width="320" height="200" rx="18" fill="url(#g)"/>
{corps}
</svg>
'''
    open(os.path.join(os.path.dirname(__file__), "..", "images", nom + ".svg"), "w").write(s)

sol = f'<path d="M0 160 Q80 145 160 155 T320 150 V200 H0 Z" fill="#c9dcc0"/><path d="M0 172 Q90 160 180 170 T320 165 V200 H0Z" fill="#b3cfa8"/>'
soleil = f'<circle cx="262" cy="46" r="20" fill="{GOLD}" opacity=".85"/>'

svg("bible", "Une Bible ouverte", f'''{soleil}
<path d="M60 70 Q110 52 160 72 V160 Q110 142 60 160Z" fill="#fff" stroke="{NAVY}" stroke-width="3"/>
<path d="M260 70 Q210 52 160 72 V160 Q210 142 260 160Z" fill="#fff" stroke="{NAVY}" stroke-width="3"/>
<path d="M56 160 Q110 144 160 166 Q210 144 264 160 V168 Q210 152 160 174 Q110 152 56 168Z" fill="{NAVY}"/>
{''.join(f'<path d="M76 {86+i*12} Q108 {76+i*12} 146 {90+i*12}" stroke="#9aa6c2" stroke-width="2.5" fill="none"/>' for i in range(5))}
{''.join(f'<path d="M174 {90+i*12} Q212 {76+i*12} 244 {86+i*12}" stroke="#9aa6c2" stroke-width="2.5" fill="none"/>' for i in range(5))}
<path d="M160 72 V150" stroke="{BRASS}" stroke-width="3"/><path d="M196 62 V100 L204 92 L212 100 V60" fill="{RED}"/>''')

svg("croix", "La croix sur la colline au lever du jour", f'''<circle cx="160" cy="150" r="70" fill="{GOLD}" opacity=".35"/><circle cx="160" cy="150" r="46" fill="{GOLD}" opacity=".45"/>
<path d="M0 165 Q160 110 320 165 V200 H0Z" fill="#b3cfa8"/>
<rect x="152" y="40" width="16" height="100" rx="3" fill="#6b4a2b"/><rect x="122" y="66" width="76" height="14" rx="3" fill="#6b4a2b"/>
<path d="M120 150 Q160 140 200 150" stroke="#8a6a44" stroke-width="3" fill="none"/>''', fond=("#fbe7c6", CREAM))

svg("priere", "Des mains jointes en prière", f'''{soleil}
<path d="M160 50 C150 70 136 100 132 130 L128 160 H160Z" fill="#c98f63" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>
<path d="M160 50 C170 70 184 100 188 130 L192 160 H160Z" fill="#b97d52" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>
<rect x="118" y="158" width="84" height="22" rx="8" fill="{NAVY}"/>
{''.join(f'<path d="M{160+dx} 40 l{dx//2} -14" stroke="{BRASS}" stroke-width="3" stroke-linecap="round"/>' for dx in (-30,-14,14,30))}''')

svg("colombe", "Une colombe, symbole du Saint-Esprit", f'''{soleil}
<path d="M90 120 Q130 80 180 100 Q210 70 250 66 Q230 96 220 112 Q200 140 150 142 Q120 142 90 120Z" fill="#fff" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>
<path d="M150 104 Q170 50 220 40 Q200 80 186 104" fill="#fff" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>
<circle cx="112" cy="116" r="3" fill="{INK}"/><path d="M92 120 L78 124 L92 126" fill="{BRASS}"/>
<path d="M120 150 Q150 170 190 150" stroke="{GREEN}" stroke-width="4" fill="none"/><ellipse cx="150" cy="158" rx="8" ry="4" fill="{GREEN}"/><ellipse cx="172" cy="156" rx="8" ry="4" fill="{GREEN}"/>''')

svg("eglise", "Une petite église et sa communauté", f'''{soleil}{sol}
<path d="M110 90 L160 54 L210 90 V160 H110Z" fill="#fff" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>
<path d="M100 94 L160 50 L220 94" fill="none" stroke="{RED}" stroke-width="8" stroke-linejoin="round"/>
<rect x="148" y="118" width="24" height="42" rx="12" fill="{NAVY}"/><path d="M160 22 V48 M150 32 H170" stroke="{BRASS}" stroke-width="4" stroke-linecap="round"/>
<circle cx="160" cy="96" r="9" fill="{GOLD}"/>
{''.join(f'<circle cx="{x}" cy="150" r="7" fill="{c}"/><rect x="{x-7}" y="157" width="14" height="16" rx="6" fill="{c}"/>' for x,c in ((60,BLUE),(80,GREEN),(240,PLUM),(262,BRASS)))}''')

svg("chemin", "Un chemin qui monte vers la lumière", f'''<circle cx="160" cy="64" r="26" fill="{GOLD}"/>
<path d="M0 120 Q80 100 160 104 T320 112 V200 H0Z" fill="#c9dcc0"/>
<path d="M120 200 C140 160 150 140 156 110 L164 110 C172 140 200 170 230 200Z" fill="#e9d8b4"/>
<path d="M30 130 l16 -34 l16 34z M260 136 l16 -40 l16 40z" fill="{GREEN}"/>
<circle cx="170" cy="150" r="6" fill="{NAVY}"/><rect x="165" y="156" width="10" height="16" rx="4" fill="{NAVY}"/>''', fond=("#fbe7c6", CREAM))

svg("chaines", "Des chaînes brisées", f'''{soleil}
{''.join(f'<rect x="{x}" y="{y}" width="46" height="26" rx="13" fill="none" stroke="#7d8597" stroke-width="9" transform="rotate({r} {x+23} {y+13})"/>' for x,y,r in ((34,100,-10),(74,92,-10),(206,92,10),(246,100,10)))}
<path d="M140 80 l10 18 l-14 6 l16 22" stroke="{GOLD}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M180 80 l-10 18 l14 6 l-16 22" stroke="{GOLD}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M100 160 Q160 140 220 160" stroke="{BRASS}" stroke-width="4" fill="none"/><text x="160" y="186" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="{NAVY}" font-style="italic">Jean 8.36</text>''')

svg("lumiere", "La lumière qui chasse les ténèbres", f'''<rect width="160" height="200" rx="18" fill="#26304a"/><rect x="140" width="20" height="200" fill="#26304a"/>
{''.join(f'<circle cx="{x}" cy="{y}" r="1.8" fill="#9aa6c2"/>' for x,y in ((30,30),(70,50),(110,24),(40,90),(120,80),(20,140)))}
<circle cx="200" cy="100" r="80" fill="{GOLD}" opacity=".25"/><circle cx="200" cy="100" r="54" fill="{GOLD}" opacity=".35"/>
<path d="M190 70 h20 v44 l-10 12 l-10 -12z" fill="#fff" stroke="{NAVY}" stroke-width="3"/><path d="M200 46 Q212 58 200 70 Q188 58 200 46Z" fill="#f08a3e"/>
<text x="240" y="186" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="{NAVY}" font-style="italic">Jean 1.5</text>''', fond=(CREAM, "#fbe7c6"))

svg("bouclier", "Le bouclier de la foi", f'''{soleil}
<path d="M160 34 L222 56 V100 C222 140 194 164 160 176 C126 164 98 140 98 100 V56Z" fill="{NAVY}"/>
<path d="M160 46 L210 64 V100 C210 132 188 152 160 162 C132 152 110 132 110 100 V64Z" fill="{BLUE}"/>
<path d="M160 64 V144 M130 92 H190" stroke="{GOLD}" stroke-width="9" stroke-linecap="round"/>
{''.join(f'<path d="M{x} {y} l18 6" stroke="{RED}" stroke-width="4" stroke-linecap="round"/>' for x,y in ((50,60),(40,110),(60,150)))}''')

svg("famille", "Une famille réunie", f'''{soleil}{sol}
{''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#a86e48"/><rect x="{x-r-2}" y="{y+r}" width="{2*r+4}" height="{h}" rx="{r}" fill="{c}"/>' for x,y,r,h,c in ((110,82,14,56,BLUE),(150,78,15,60,PLUM),(196,104,10,40,GREEN),(226,110,9,34,BRASS))) }
<path d="M70 70 L60 160 M50 90 Q60 70 80 64" stroke="#6b4a2b" stroke-width="5" fill="none"/><circle cx="62" cy="62" r="22" fill="{GREEN}" opacity=".8"/>''')

svg("arbre", "Un arbre planté près d'un courant d'eau", f'''{soleil}{sol}
<path d="M150 170 C152 140 150 120 156 96 L166 96 C170 120 168 140 172 170Z" fill="#6b4a2b"/>
<circle cx="160" cy="76" r="44" fill="{GREEN}"/><circle cx="126" cy="96" r="28" fill="#4f9461"/><circle cx="196" cy="96" r="28" fill="#4f9461"/>
{''.join(f'<circle cx="{x}" cy="{y}" r="5" fill="{RED}"/>' for x,y in ((140,70),(176,62),(190,96),(130,104),(160,96)))}
<path d="M0 182 Q80 172 160 184 T320 178" stroke="{BLUE}" stroke-width="7" fill="none" opacity=".7"/>''')

svg("coeur", "Un cœur renouvelé", f'''{soleil}
<path d="M160 168 C100 128 76 100 80 72 C84 46 120 38 140 58 L160 78 L180 58 C200 38 236 46 240 72 C244 100 220 128 160 168Z" fill="{RED}"/>
<path d="M118 70 C110 74 106 82 108 92" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>
<path d="M160 92 V136 M142 108 H178" stroke="#fff" stroke-width="7" stroke-linecap="round"/>''')

svg("balance", "Une balance en équilibre", f'''{soleil}
<rect x="156" y="50" width="8" height="110" fill="{NAVY}"/><path d="M120 168 H200 L190 156 H130Z" fill="{NAVY}"/>
<rect x="76" y="58" width="168" height="8" rx="4" fill="{BRASS}"/><circle cx="160" cy="54" r="10" fill="{GOLD}"/>
<path d="M90 66 L70 120 M90 66 L110 120 M230 66 L210 120 M230 66 L250 120" stroke="#7d8597" stroke-width="2"/>
<path d="M62 120 H118 Q90 144 62 120Z M202 120 H258 Q230 144 202 120Z" fill="{BRASS}"/>''')

svg("eau", "L'eau vive qui lave et désaltère", f'''{soleil}
<path d="M160 36 C190 80 206 104 206 126 C206 152 186 170 160 170 C134 170 114 152 114 126 C114 104 130 80 160 36Z" fill="{BLUE}"/>
<path d="M140 120 C138 136 146 148 160 152" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".7"/>
<path d="M30 176 Q60 164 90 176 T150 176 T210 176 T270 176 T330 176" stroke="{BLUE}" stroke-width="5" fill="none" opacity=".6"/>''')

svg("couronne", "La couronne de vie", f'''{soleil}
<path d="M90 140 L80 70 L124 104 L160 56 L196 104 L240 70 L230 140Z" fill="{GOLD}" stroke="{BRASS}" stroke-width="4" stroke-linejoin="round"/>
<rect x="88" y="138" width="144" height="20" rx="6" fill="{BRASS}"/>
{''.join(f'<circle cx="{x}" cy="148" r="5" fill="{c}"/>' for x,c in ((116,RED),(160,BLUE),(204,GREEN)))}
<circle cx="80" cy="66" r="7" fill="{GOLD}"/><circle cx="160" cy="52" r="7" fill="{GOLD}"/><circle cx="240" cy="66" r="7" fill="{GOLD}"/>''')

svg("mains", "Des mains qui servent et partagent", f'''{soleil}
<path d="M40 150 Q90 120 140 128 L170 132 Q182 136 176 146 L140 148" fill="#c98f63" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>
<path d="M280 110 Q230 96 196 104 L170 112 Q158 118 166 126 L196 124" fill="#8d5b3b" stroke="{NAVY}" stroke-width="3" stroke-linejoin="round"/>
<path d="M150 104 Q160 80 170 104Z" fill="#e9b26b"/><ellipse cx="160" cy="112" rx="26" ry="10" fill="#d99a52" stroke="{NAVY}" stroke-width="3"/>''')

svg("berger", "Le berger et sa brebis", f'''{soleil}{sol}
<circle cx="120" cy="64" r="14" fill="#a86e48"/><path d="M104 80 H136 L144 160 H96Z" fill="{BLUE}"/>
<path d="M150 44 Q166 44 166 60 Q166 70 156 70 M156 70 V168" stroke="#6b4a2b" stroke-width="5" fill="none" stroke-linecap="round"/>
<ellipse cx="214" cy="140" rx="34" ry="20" fill="#fff" stroke="{NAVY}" stroke-width="3"/><circle cx="248" cy="128" r="10" fill="#fff" stroke="{NAVY}" stroke-width="3"/>
<path d="M196 158 v14 M230 158 v14" stroke="{NAVY}" stroke-width="4"/>''')

svg("lampe", "Une lampe allumée", f'''<circle cx="160" cy="100" r="76" fill="{GOLD}" opacity=".25"/>
<path d="M96 132 Q160 166 224 132 Q216 112 160 112 Q104 112 96 132Z" fill="{BRASS}" stroke="{NAVY}" stroke-width="3"/>
<path d="M220 128 Q248 118 252 104" stroke="{NAVY}" stroke-width="5" fill="none"/>
<path d="M104 124 Q86 120 84 108" stroke="{NAVY}" stroke-width="3" fill="none"/>
<path d="M84 104 C74 88 82 72 84 60 C92 74 100 86 84 104Z" fill="#f08a3e"/>
<text x="160" y="186" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="{NAVY}" font-style="italic">Psaume 119.105</text>''', fond=("#fbe7c6", CREAM))

svg("porte", "Une porte ouverte", f'''{soleil}{sol}
<rect x="118" y="44" width="84" height="120" rx="6" fill="{GOLD}" opacity=".6"/>
<path d="M118 44 H202 V164 H118Z" fill="none" stroke="{NAVY}" stroke-width="5"/>
<path d="M118 44 L90 54 V172 L118 164Z" fill="#6b4a2b" stroke="{NAVY}" stroke-width="3"/><circle cx="110" cy="112" r="3" fill="{GOLD}"/>
<path d="M160 164 L150 200 H190 L180 164Z" fill="#e9d8b4"/>''')

svg("semence", "Une semence qui germe", f'''{soleil}{sol}
<path d="M160 160 C160 130 158 110 160 84" stroke="{GREEN}" stroke-width="6" fill="none"/>
<path d="M160 110 C130 104 120 86 122 70 C146 72 158 88 160 110Z" fill="#4f9461"/><path d="M160 96 C188 90 198 72 196 56 C172 58 160 74 160 96Z" fill="{GREEN}"/>
<ellipse cx="160" cy="168" rx="14" ry="8" fill="#8a6a44"/>
{''.join(f'<path d="M{x} 30 q4 10 0 20" stroke="{BLUE}" stroke-width="3" fill="none" opacity=".6"/>' for x in (120,140,180,200))}''')
print("images générées")
