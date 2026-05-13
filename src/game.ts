import { Card, Suit, Rank, Room, Player } from './types';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export const RANK_ORDER: Record<Rank, number> = {
  '6': 0, '7': 1, '8': 2, '9': 3, '10': 4, 'J': 5, 'Q': 6, 'K': 7, 'A': 8,
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function dealInitialHands(room: Room): void {
  for (const player of room.players) {
    player.hand = [];
  }
  // Round-robin deal, 6 cards each
  for (let i = 0; i < 6; i++) {
    for (const player of room.players) {
      const card = room.deck.shift();
      if (card) player.hand.push(card);
    }
  }
  // Trump = suit of the bottom (last) card in the remaining deck
  if (room.deck.length > 0) {
    room.trumpSuit = room.deck[room.deck.length - 1].suit;
  } else {
    // All 36 cards dealt (6 players × 6) — use last card dealt
    const last = room.players[room.players.length - 1];
    room.trumpSuit = last.hand[last.hand.length - 1].suit;
  }
}

export function determineFirstAttacker(room: Room): void {
  // Player with lowest trump card attacks first; random if nobody has trumps
  let minRank = Infinity;
  let attackerIdx = Math.floor(Math.random() * room.players.length);

  for (let i = 0; i < room.players.length; i++) {
    for (const card of room.players[i].hand) {
      if (card.suit === room.trumpSuit && RANK_ORDER[card.rank] < minRank) {
        minRank = RANK_ORDER[card.rank];
        attackerIdx = i;
      }
    }
  }
  room.attackerIdx = attackerIdx;
  room.defenderIdx = nextActiveIdx(room.players, attackerIdx);
}

export function nextActiveIdx(players: Player[], fromIdx: number): number {
  const n = players.length;
  let idx = (fromIdx + 1) % n;
  for (let attempts = 0; attempts < n; attempts++) {
    if (!players[idx].isDone) return idx;
    idx = (idx + 1) % n;
  }
  return fromIdx; // fallback: only one active player (game should have ended)
}

// Returns true if defenseCard beats attackCard under the given trump
export function beats(attack: Card, defense: Card, trump: Suit): boolean {
  if (attack.suit === trump) {
    return defense.suit === trump && RANK_ORDER[defense.rank] > RANK_ORDER[attack.rank];
  }
  if (defense.suit === trump) return true;
  if (defense.suit !== attack.suit) return false;
  return RANK_ORDER[defense.rank] > RANK_ORDER[attack.rank];
}

export function getTableRanks(table: Room['table']): Set<Rank> {
  const ranks = new Set<Rank>();
  for (const slot of table) {
    ranks.add(slot.attack.rank);
    if (slot.defense) ranks.add(slot.defense.rank);
  }
  return ranks;
}

// Max attack slots = min(defender's hand size at start of turn, 6).
// We approximate with: hand.length + already-covered slots, capped at 6.
export function maxAttackSlots(room: Room): number {
  const covered = room.table.filter(s => s.defense !== null).length;
  return Math.min(room.players[room.defenderIdx].hand.length + covered, 6);
}

// Refill all hands to 6 cards, starting from attacker clockwise.
// Defender always refills last. Pass skipDefender=true after a "take".
export function refillHands(room: Room, skipDefender: boolean): void {
  const n = room.players.length;
  const order: number[] = [];
  let idx = room.attackerIdx;
  for (let i = 0; i < n; i++) {
    if (!(skipDefender && idx === room.defenderIdx)) order.push(idx);
    idx = (idx + 1) % n;
  }
  // Move defender to end when not skipped
  if (!skipDefender) {
    const di = order.indexOf(room.defenderIdx);
    if (di !== -1 && di !== order.length - 1) {
      order.splice(di, 1);
      order.push(room.defenderIdx);
    }
  }
  for (const i of order) {
    const p = room.players[i];
    while (p.hand.length < 6 && room.deck.length > 0) {
      p.hand.push(room.deck.shift()!);
    }
  }
}

export function markDonePlayers(room: Room): void {
  if (room.deck.length > 0) return;
  for (const p of room.players) {
    if (p.hand.length === 0) p.isDone = true;
  }
}

export function checkGameEnd(room: Room): boolean {
  if (room.deck.length > 0) return false;
  const active = room.players.filter(p => !p.isDone);
  if (active.length <= 1) {
    room.phase = 'ended';
    room.fool = active.length === 1 ? active[0].name : null;
    return true;
  }
  return false;
}

export function removeFromHand(player: Player, card: Card): boolean {
  const idx = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (idx === -1) return false;
  player.hand.splice(idx, 1);
  return true;
}
