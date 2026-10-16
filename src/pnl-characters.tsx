export type CharacterId = 'ronin' | 'bull' | 'netrunner' | 'valkyrie'

export interface CharacterOption {
  id: CharacterId
  name: string
  title: string
}

export const CHARACTER_OPTIONS: CharacterOption[] = [
  { id: 'ronin', name: 'Cyber Ronin', title: 'The Disciplined Trader' },
  { id: 'bull', name: 'Wall St Bull', title: 'The Alpha Chad' },
  { id: 'netrunner', name: 'Netrunner', title: 'The Code Specialist' },
  { id: 'valkyrie', name: 'Alpha Valkyrie', title: 'The Celestial Guardian' },
]

interface CharacterProps {
  id: CharacterId
  accent: string
  isWin: boolean
}

export function getCharacterSvg({ id, accent, isWin }: CharacterProps): string {
  switch (id) {
    case 'ronin':
      return getRoninSvg(accent, isWin)
    case 'bull':
      return getBullSvg(accent, isWin)
    case 'netrunner':
      return getNetrunnerSvg(accent, isWin)
    case 'valkyrie':
      return getValkyrieSvg(accent, isWin)
    default:
      return getRoninSvg(accent, isWin)
  }
}

// 1. CYBER RONIN (Samurai)
function getRoninSvg(accent: string, isWin: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 620" fill="none">
    <defs>
      <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="60%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="#05070a"/>
      </linearGradient>
      <linearGradient id="armorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#2a2e39"/>
        <stop offset="100%" stop-color="#101216"/>
      </linearGradient>
      <filter id="accentGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>

    <!-- Torso & Shoulder Armor -->
    <path d="M120 620 L160 380 L250 410 L340 380 L380 620 Z" fill="url(#armorGrad)" stroke="#3f4555" stroke-width="2"/>
    <path d="M210 400 L250 620 L290 400 Z" fill="#14171f"/>
    <!-- Chest Plate Accents -->
    <path d="M190 440 L250 460 L310 440 L300 520 L250 540 L200 520 Z" fill="#1c202a" stroke="${accent}" stroke-width="2.5"/>
    <circle cx="250" cy="490" r="12" fill="${accent}" filter="url(#accentGlow)"/>

    <!-- Left Pauldron (Shoulder) -->
    <path d="M80 390 L160 370 L170 470 L70 450 Z" fill="#20242e" stroke="#4a5266" stroke-width="2"/>
    <path d="M90 405 L155 390 L160 455 L85 440 Z" fill="#14161d" stroke="${accent}" stroke-width="1.5"/>

    <!-- Right Pauldron (Shoulder) -->
    <path d="M420 390 L340 370 L330 470 L430 450 Z" fill="#20242e" stroke="#4a5266" stroke-width="2"/>
    <path d="M410 405 L345 390 L340 455 L415 440 Z" fill="#14161d" stroke="${accent}" stroke-width="1.5"/>

    <!-- High Cyber Scarf / Collar -->
    <path d="M170 360 C170 330 210 320 250 320 C290 320 330 330 330 360 L320 420 L250 435 L180 420 Z" fill="#0d0f14" stroke="#2d323e" stroke-width="2"/>
    <path d="M200 370 L250 390 L300 370" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>

    <!-- Neck & Face base -->
    <path d="M215 320 L215 250 L285 250 L285 320 Z" fill="#d4a373"/>
    <path d="M195 240 C195 160 305 160 305 240 C305 295 275 320 250 320 C225 320 195 295 195 240 Z" fill="#e0ab76"/>
    <!-- Jaw Shadow -->
    <path d="M205 260 L250 315 L295 260 Z" fill="rgba(0,0,0,0.18)"/>

    <!-- Cyber Headband with Oni horns / Antenna -->
    <path d="M185 195 L315 195 L310 165 L190 165 Z" fill="#161922" stroke="#333a4a" stroke-width="2"/>
    <!-- Headband Center Crest -->
    <polygon points="250,150 262,175 238,175" fill="${accent}" filter="url(#accentGlow)"/>
    <!-- Cyber Oni Horns -->
    <path d="M195 170 L160 110 L185 155 Z" fill="#222733" stroke="${accent}" stroke-width="1.5"/>
    <path d="M305 170 L340 110 L315 155 Z" fill="#222733" stroke="${accent}" stroke-width="1.5"/>

    <!-- Sharp Samurai Hair / Topknot -->
    <path d="M190 170 C170 120 220 80 250 75 C280 80 330 120 310 170 Z" fill="#0c0d12"/>
    <path d="M250 75 L255 35 L245 35 Z" fill="#0c0d12"/>
    <circle cx="250" cy="35" r="9" fill="${accent}"/>
    <!-- Hair Strands -->
    <path d="M220 120 Q240 90 270 115" stroke="${accent}" stroke-width="2" stroke-linecap="round" fill="none"/>

    <!-- Visor / Eyes -->
    ${isWin ? `
      <!-- Confident glowing eye slits -->
      <path d="M210 220 L240 224 L240 216 Z" fill="${accent}" filter="url(#accentGlow)"/>
      <path d="M290 220 L260 224 L260 216 Z" fill="${accent}" filter="url(#accentGlow)"/>
      <!-- Smirk -->
      <path d="M232 270 Q250 278 268 268" stroke="#3d2616" stroke-width="3" stroke-linecap="round" fill="none"/>
    ` : `
      <!-- Single glowing visor line / Battle-damaged -->
      <path d="M205 220 L295 220" stroke="${accent}" stroke-width="5" stroke-linecap="round" filter="url(#accentGlow)"/>
      <path d="M205 210 L230 250" stroke="#991b1b" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Stoic Resolute Line -->
      <path d="M235 272 L265 272" stroke="#3d2616" stroke-width="3" stroke-linecap="round"/>
    `}

    <!-- Katana Weapon -->
    ${isWin ? `
      <!-- Victorious Raised Katana across shoulder with energy aura -->
      <g filter="url(#accentGlow)">
        <path d="M30 500 L430 80" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>
      </g>
      <path d="M30 500 L430 80" stroke="url(#bladeGrad)" stroke-width="4" stroke-linecap="round"/>
      <!-- Katana Tsuba (Guard) -->
      <ellipse cx="140" cy="390" rx="16" ry="10" transform="rotate(-45 140 390)" fill="#111" stroke="${accent}" stroke-width="2"/>
      <!-- Katana Tsuka (Hilt) -->
      <path d="M140 390 L80 450" stroke="#0e1017" stroke-width="12" stroke-linecap="round"/>
      <path d="M135 395 L85 445" stroke="${accent}" stroke-width="3" stroke-dasharray="6,4"/>
    ` : `
      <!-- Sheathed Blade Resting Down / Resilient Stance -->
      <path d="M370 280 L440 600" stroke="#161820" stroke-width="10" stroke-linecap="round"/>
      <path d="M365 290 L435 590" stroke="${accent}" stroke-width="2"/>
      <circle cx="370" cy="285" r="12" fill="#0d0f14" stroke="${accent}" stroke-width="2"/>
      <!-- Smoke wisps -->
      <path d="M260 270 Q275 250 270 230" stroke="rgba(255,255,255,0.4)" stroke-width="2" fill="none" stroke-linecap="round"/>
    `}
  </svg>`
}

// 2. WALL STREET BULL (Alpha Chad Mascot)
function getBullSvg(accent: string, isWin: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 620" fill="none">
    <defs>
      <linearGradient id="suitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#181c24"/>
        <stop offset="100%" stop-color="#0a0c10"/>
      </linearGradient>
      <linearGradient id="hornGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#1a1d24"/>
        <stop offset="70%" stop-color="#3d4454"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
      <filter id="bullGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>

    <!-- Massive Shoulders & Tailored Suit -->
    <path d="M80 620 L120 360 L250 390 L380 360 L420 620 Z" fill="url(#suitGrad)" stroke="#2f3545" stroke-width="2"/>
    <!-- Crisp White Dress Shirt & Collar -->
    <polygon points="210,380 250,470 290,380" fill="#f8fafc"/>
    <!-- Silk Necktie in Theme Accent Color -->
    <polygon points="243,400 257,400 264,560 250,580 236,560" fill="${accent}" filter="url(#bullGlow)"/>
    <!-- Lapels -->
    <path d="M120 360 L210 490 L210 430 L160 360 Z" fill="#232834" stroke="#3d4559" stroke-width="1.5"/>
    <path d="M380 360 L290 490 L290 430 L340 360 Z" fill="#232834" stroke="#3d4559" stroke-width="1.5"/>
    <!-- Pocket Square in Accent Color -->
    <polygon points="145,430 165,415 175,435" fill="${accent}"/>

    <!-- Muscular Bull Neck & Jaw -->
    <path d="M180 360 L180 260 L320 260 L320 360 Z" fill="#2a201c"/>
    <path d="M170 230 C170 140 330 140 330 230 C330 300 290 340 250 340 C210 340 170 300 170 230 Z" fill="#382c27"/>

    <!-- Giant Polished Horns with Glowing Accent Tips -->
    <path d="M180 180 C120 180 60 130 50 40 C70 100 120 130 190 140 Z" fill="url(#hornGrad)" stroke="#525d73" stroke-width="1.5"/>
    <path d="M320 180 C380 180 440 130 450 40 C430 100 380 130 310 140 Z" fill="url(#hornGrad)" stroke="#525d73" stroke-width="1.5"/>
    <circle cx="50" cy="40" r="10" fill="${accent}" filter="url(#bullGlow)"/>
    <circle cx="450" cy="40" r="10" fill="${accent}" filter="url(#bullGlow)"/>

    <!-- Bull Snout & Pierced Gold Ring -->
    <ellipse cx="250" cy="275" rx="46" ry="32" fill="#54433d"/>
    <circle cx="230" cy="275" r="7" fill="#1f1816"/>
    <circle cx="270" cy="275" r="7" fill="#1f1816"/>
    <!-- Bull Septum Ring -->
    <circle cx="250" cy="295" r="18" fill="none" stroke="${accent}" stroke-width="5" filter="url(#bullGlow)"/>

    <!-- Dark Polarized Aviator Sunglasses -->
    <path d="M185 200 L245 200 L240 235 L190 235 Z" fill="#090b10" stroke="#4b5563" stroke-width="2"/>
    <path d="M255 200 L315 200 L310 235 L260 235 Z" fill="#090b10" stroke="#4b5563" stroke-width="2"/>
    <line x1="245" y1="208" x2="255" y2="208" stroke="#4b5563" stroke-width="2"/>
    <!-- Candlestick Reflection on Sunglasses -->
    <line x1="210" y1="205" x2="210" y2="230" stroke="${accent}" stroke-width="2"/>
    <line x1="285" y1="205" x2="285" y2="230" stroke="${accent}" stroke-width="2"/>

    <!-- Expressions -->
    ${isWin ? `
      <!-- Smug Golden Smile with Cuban Cigar -->
      <path d="M230 315 Q250 328 275 316" stroke="#1f1816" stroke-width="4" stroke-linecap="round"/>
      <!-- Premium Cigar -->
      <rect x="265" y="308" width="55" height="11" rx="4" transform="rotate(-15 265 308)" fill="#5c3826"/>
      <rect x="312" y="296" width="6" height="11" rx="2" transform="rotate(-15 312 296)" fill="${accent}" filter="url(#bullGlow)"/>
      <path d="M325 290 Q340 270 330 250" stroke="rgba(255,255,255,0.5)" stroke-width="2" fill="none"/>
    ` : `
      <!-- Resolute Gritted Jaws & Steam from Nostrils -->
      <line x1="230" y1="318" x2="270" y2="318" stroke="#1f1816" stroke-width="4" stroke-linecap="round"/>
      <!-- Steam from Nostrils -->
      <path d="M225 285 Q190 300 160 290" stroke="rgba(255,255,255,0.5)" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M275 285 Q310 300 340 290" stroke="rgba(255,255,255,0.5)" stroke-width="3" fill="none" stroke-linecap="round"/>
    `}
  </svg>`
}

// 3. NETRUNNER (Cyberpunk Hacker)
function getNetrunnerSvg(accent: string, isWin: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 620" fill="none">
    <defs>
      <linearGradient id="hoodieGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1d222c"/>
        <stop offset="100%" stop-color="#0e1015"/>
      </linearGradient>
      <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>

    <!-- Techwear Oversized Hoodie Body -->
    <path d="M100 620 L130 380 L250 410 L370 380 L400 620 Z" fill="url(#hoodieGrad)" stroke="#323a4b" stroke-width="2"/>
    <!-- Cyber Straps & Zipper -->
    <line x1="250" y1="410" x2="250" y2="620" stroke="#0a0c10" stroke-width="6"/>
    <line x1="250" y1="410" x2="250" y2="620" stroke="${accent}" stroke-width="2" stroke-dasharray="8,6"/>

    <!-- Tactical Chest Rig / Vest -->
    <rect x="180" y="450" width="140" height="110" rx="8" fill="#141820" stroke="#3b4458" stroke-width="1.5"/>
    <rect x="195" y="470" width="45" height="40" rx="4" fill="#0d0f14" stroke="${accent}" stroke-width="1"/>
    <rect x="260" y="470" width="45" height="40" rx="4" fill="#0d0f14" stroke="${accent}" stroke-width="1"/>
    <!-- Rig LED Indicator -->
    <circle cx="205" cy="482" r="3" fill="${accent}" filter="url(#neonGlow)"/>

    <!-- Techwear Deep Hood Frame -->
    <path d="M140 370 C130 190 180 110 250 100 C320 110 370 190 360 370 Z" fill="#161a22" stroke="#323a4b" stroke-width="2.5"/>
    <!-- Hood Inner Shadow -->
    <path d="M165 350 C155 210 195 140 250 135 C305 140 345 210 335 350 Z" fill="#0b0d12"/>

    <!-- Face Silhouette inside Hood -->
    <path d="M200 240 C200 190 300 190 300 240 C300 290 270 315 250 315 C230 315 200 290 200 240 Z" fill="#d8a47f"/>

    <!-- Studio Tech Headphones around Neck/Ears -->
    <path d="M160 240 C140 270 150 330 180 345" stroke="#475569" stroke-width="14" stroke-linecap="round" fill="none"/>
    <circle cx="165" cy="275" r="16" fill="#1e2430" stroke="${accent}" stroke-width="3" filter="url(#neonGlow)"/>
    <path d="M340 240 C360 270 350 330 320 345" stroke="#475569" stroke-width="14" stroke-linecap="round" fill="none"/>
    <circle cx="335" cy="275" r="16" fill="#1e2430" stroke="${accent}" stroke-width="3" filter="url(#neonGlow)"/>

    <!-- Futuristic VR/AR Visor Display -->
    <path d="M190 220 L310 220 L305 255 L195 255 Z" fill="#0f172a" stroke="${accent}" stroke-width="2" filter="url(#neonGlow)"/>
    <!-- Live Matrix / Data lines on visor -->
    <text x="205" y="242" font-family="monospace" font-size="12" font-weight="bold" fill="${accent}" letter-spacing="2">
      ${isWin ? '▲ GAIN: 100%' : '▼ HOLD: 100%'}
    </text>

    <!-- Expressions & Gestures -->
    ${isWin ? `
      <!-- Confident Smile -->
      <path d="M232 285 Q250 296 268 285" stroke="#332117" stroke-width="3" stroke-linecap="round"/>
      <!-- Glowing Holographic Data Cube in Foreground -->
      <g filter="url(#neonGlow)">
        <polygon points="360,420 420,390 420,460 360,490" fill="none" stroke="${accent}" stroke-width="2"/>
        <polygon points="360,420 420,390 390,360 330,390" fill="none" stroke="${accent}" stroke-width="2"/>
        <polygon points="330,390 390,360 390,430 330,460" fill="none" stroke="${accent}" stroke-width="2"/>
      </g>
    ` : `
      <!-- Resolute Focused Expression -->
      <line x1="235" y1="288" x2="265" y2="288" stroke="#332117" stroke-width="3" stroke-linecap="round"/>
      <!-- Coffee Mug in hand -->
      <rect x="340" y="440" width="40" height="50" rx="6" fill="#1e293b" stroke="${accent}" stroke-width="2"/>
      <path d="M380 452 C395 452 395 478 380 478" stroke="${accent}" stroke-width="3" fill="none"/>
      <path d="M350 435 Q360 415 355 400" stroke="rgba(255,255,255,0.4)" stroke-width="2" fill="none"/>
    `}
  </svg>`
}

// 4. ALPHA VALKYRIE (Celestial Guardian)
function getValkyrieSvg(accent: string, isWin: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 620" fill="none">
    <defs>
      <linearGradient id="valkArmor" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#334155"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <linearGradient id="wingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <filter id="valkGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>

    <!-- Geometric Cyber Wings (Left & Right) -->
    <g filter="url(#valkGlow)" opacity="0.85">
      <!-- Left Wing Feathers -->
      <path d="M170 280 L40 180 L80 250 L20 230 L70 320 L160 330 Z" fill="url(#wingGrad)" stroke="${accent}" stroke-width="2"/>
      <!-- Right Wing Feathers -->
      <path d="M330 280 L460 180 L420 250 L480 230 L430 320 L340 330 Z" fill="url(#wingGrad)" stroke="${accent}" stroke-width="2"/>
    </g>

    <!-- Torso with Sleek Titanium Bodysuit -->
    <path d="M160 620 L180 380 L250 400 L320 380 L340 620 Z" fill="url(#valkArmor)" stroke="#475569" stroke-width="2"/>
    <!-- Golden/Accent Glowing Corset Spine -->
    <line x1="250" y1="400" x2="250" y2="620" stroke="${accent}" stroke-width="3" filter="url(#valkGlow)"/>

    <!-- Pauldrons -->
    <path d="M140 380 L190 360 L200 440 L150 430 Z" fill="#1e293b" stroke="${accent}" stroke-width="1.5"/>
    <path d="M360 380 L310 360 L300 440 L350 430 Z" fill="#1e293b" stroke="${accent}" stroke-width="1.5"/>

    <!-- Slender Neck & Face -->
    <path d="M225 330 L225 270 L275 270 L275 330 Z" fill="#fecaca"/>
    <path d="M205 240 C205 180 295 180 295 240 C295 295 275 320 250 320 C225 320 205 295 205 240 Z" fill="#fed7aa"/>

    <!-- Platinum/White Hair with Accent Strands -->
    <path d="M200 230 C190 140 310 140 300 230 C310 270 330 320 340 380 L310 330 L280 200 L220 200 L190 330 L160 380 Z" fill="#f1f5f9"/>
    <path d="M230 180 Q250 140 270 180" stroke="${accent}" stroke-width="3" fill="none" filter="url(#valkGlow)"/>

    <!-- Holographic Crown / Halo Floating Above Head -->
    <ellipse cx="250" cy="120" rx="50" ry="14" fill="none" stroke="${accent}" stroke-width="3" filter="url(#valkGlow)"/>
    <polygon points="250,95 256,110 244,110" fill="${accent}" filter="url(#valkGlow)"/>

    <!-- Eyes & Expressions -->
    ${isWin ? `
      <!-- Radiant Glowing Eyes -->
      <ellipse cx="230" cy="240" rx="7" ry="5" fill="${accent}" filter="url(#valkGlow)"/>
      <ellipse cx="270" cy="240" rx="7" ry="5" fill="${accent}" filter="url(#valkGlow)"/>
      <!-- Serene Smile -->
      <path d="M238 280 Q250 288 262 280" stroke="#78350f" stroke-width="2.5" stroke-linecap="round"/>
    ` : `
      <!-- Battle-Ready Determined Visage -->
      <line x1="223" y1="240" x2="237" y2="240" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
      <line x1="263" y1="240" x2="277" y2="240" stroke="${accent}" stroke-width="3" stroke-linecap="round"/>
      <line x1="240" y1="282" x2="260" y2="282" stroke="#78350f" stroke-width="2.5" stroke-linecap="round"/>
    `}
  </svg>`
}
