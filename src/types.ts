export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type Phase = 'lobby' | 'playing' | 'ended';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface AttackSlot {
  attack: Card;
  defense: Card | null;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  isHost: boolean;
  isDone: boolean;
}

export interface Room {
  code: string;
  phase: Phase;
  players: Player[];
  hostId: string;
  deck: Card[];
  trumpSuit: Suit | null;
  table: AttackSlot[];
  attackerIdx: number;
  defenderIdx: number;
  fool: string | null;
  defenderTaking: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  cardCount: number;
  isHost: boolean;
  isDone: boolean;
}

export interface RoomView {
  code: string;
  phase: Phase;
  players: PlayerView[];
  hostId: string;
  trumpSuit: Suit | null;
  deckCount: number;
  table: AttackSlot[];
  myCards: Card[];
  attackerId: string;
  defenderId: string;
  canThrow: boolean;
  fool: string | null;
  defenderTaking: boolean;
}

export interface ServerToClientEvents {
  'room:updated': (room: RoomView) => void;
  'room:error': (message: string) => void;
  'react:received': (payload: { playerId: string; emoji: string }) => void;
}

export interface ClientToServerEvents {
  'room:create': (name: string, cb: (code: string) => void) => void;
  'room:join': (payload: { code: string; name: string }, cb: (err: string | null) => void) => void;
  'room:start': (cb: (err: string | null) => void) => void;
  'room:leave': () => void;
  'game:attack': (card: Card, cb: (err: string | null) => void) => void;
  'game:defend': (payload: { attack: Card; defense: Card }, cb: (err: string | null) => void) => void;
  'game:throw': (card: Card, cb: (err: string | null) => void) => void;
  'game:take': (cb: (err: string | null) => void) => void;
  'game:done': (cb: (err: string | null) => void) => void;
  'game:confirm_take': (cb: (err: string | null) => void) => void;
  'game:react': (emoji: string) => void;
}
