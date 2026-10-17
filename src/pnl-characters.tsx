export type CharacterId = 'bull' | 'ronin' | 'valkyrie'

export interface CharacterOption {
  id: CharacterId
  name: string
  title: string
  winImage: string
  lossImage: string
}

export const CHARACTER_OPTIONS: CharacterOption[] = [
  {
    id: 'bull',
    name: 'Cyber Bull',
    title: 'The Wall St Alpha',
    winImage: '/characters/bull-win.jpg',
    lossImage: '/characters/bull-loss.jpg',
  },
  {
    id: 'ronin',
    name: 'Cyber Ronin',
    title: 'The Disciplined Samurai',
    winImage: '/characters/ronin-win.jpg',
    lossImage: '/characters/ronin-loss.jpg',
  },
  {
    id: 'valkyrie',
    name: 'Cyber Valkyrie',
    title: 'The Tactical Guardian',
    winImage: '/characters/valkyrie-win.jpg',
    lossImage: '/characters/valkyrie-loss.jpg',
  },
]

export function getCharacterImagePath(id: CharacterId, isWin: boolean): string {
  const char = CHARACTER_OPTIONS.find((c) => c.id === id) || CHARACTER_OPTIONS[0]
  return isWin ? char.winImage : char.lossImage
}
