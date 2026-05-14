import { Room, Player, RoomView, PlayerView, Card } from './types';
import {
  createDeck, dealInitialHands, determineFirstAttacker, nextActiveIdx,
  beats, getTableRanks, maxAttackSlots, refillHands, markDonePlayers,
  checkGameEnd, removeFromHand,
} from './game';

const rooms = new Map<string, Room>();
const playerRoom = new Map<string, string>(); // socketId -> roomCode

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateCode() : code;
}

function canThrow(room: Room, playerId: string): boolean {
  if (room.phase !== 'playing') return false;
  const attacker = room.players[room.attackerIdx];
  const defender = room.players[room.defenderIdx];
  if (playerId === attacker?.id || playerId === defender?.id) return false;

  const player = room.players.find(p => p.id === playerId);
  if (!player || player.isDone || player.hand.length === 0) return false;
  if (room.table.length === 0) return false;
  if (room.table.length >= maxAttackSlots(room)) return false;

  const ranks = getTableRanks(room.table);
  return player.hand.some(c => ranks.has(c.rank));
}

export function toView(room: Room, forPlayerId: string): RoomView {
  const player = room.players.find(p => p.id === forPlayerId);
  const attacker = room.players[room.attackerIdx];
  const defender = room.players[room.defenderIdx];
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p): PlayerView => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      isHost: p.isHost,
      isDone: p.isDone,
    })),
    hostId: room.hostId,
    trumpSuit: room.trumpSuit,
    deckCount: room.deck.length,
    table: room.table,
    myCards: player?.hand ?? [],
    attackerId: attacker?.id ?? '',
    defenderId: defender?.id ?? '',
    canThrow: canThrow(room, forPlayerId),
    fool: room.fool,
    defenderTaking: room.defenderTaking,
  };
}

// ── Room lifecycle ────────────────────────────────────────────────────────────

export function createRoom(socketId: string, name: string): Room {
  const code = generateCode();
  const host: Player = { id: socketId, name, hand: [], isHost: true, isDone: false };
  const room: Room = {
    code, players: [host], phase: 'lobby', hostId: socketId,
    deck: [], trumpSuit: null, table: [],
    attackerIdx: 0, defenderIdx: 0, fool: null, defenderTaking: false,
  };
  rooms.set(code, room);
  playerRoom.set(socketId, code);
  return room;
}

export function joinRoom(
  socketId: string, code: string, name: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { error: 'Комната не найдена' };
  if (room.phase !== 'lobby') return { error: 'Игра уже началась' };
  if (room.players.length >= 6) return { error: 'Комната заполнена (максимум 6 игроков)' };
  if (room.players.some(p => p.name === name)) return { error: 'Имя уже занято' };
  room.players.push({ id: socketId, name, hand: [], isHost: false, isDone: false });
  playerRoom.set(socketId, code.toUpperCase());
  return { room };
}

export function startGame(socketId: string): { room: Room } | { error: string } {
  const code = playerRoom.get(socketId);
  const room = code ? rooms.get(code) : undefined;
  if (!room) return { error: 'Вы не в комнате' };
  if (room.hostId !== socketId) return { error: 'Только хост может начать игру' };
  if (room.players.length < 2) return { error: 'Нужно минимум 2 игрока' };

  room.deck = createDeck();
  room.table = [];
  room.fool = null;
  room.defenderTaking = false;
  room.phase = 'playing';
  for (const p of room.players) { p.hand = []; p.isDone = false; }

  dealInitialHands(room);
  determineFirstAttacker(room);
  return { room };
}

export function leaveRoom(socketId: string): { room: Room | null; code: string | null } {
  const code = playerRoom.get(socketId);
  if (!code) return { room: null, code: null };
  playerRoom.delete(socketId);
  const room = rooms.get(code);
  if (!room) return { room: null, code };

  const wasPlaying = room.phase === 'playing';
  room.players = room.players.filter(p => p.id !== socketId);

  if (room.players.length === 0) {
    rooms.delete(code);
    return { room: null, code };
  }

  if (room.hostId === socketId) {
    room.players[0].isHost = true;
    room.hostId = room.players[0].id;
  }

  if (wasPlaying) {
    room.phase = 'lobby';
    room.table = [];
    room.deck = [];
    room.defenderTaking = false;
    for (const p of room.players) { p.hand = []; p.isDone = false; }
  }

  return { room, code };
}

export function getRoomBySocket(socketId: string): Room | undefined {
  const code = playerRoom.get(socketId);
  return code ? rooms.get(code) : undefined;
}

// ── Game actions ──────────────────────────────────────────────────────────────

export function attackCard(
  socketId: string, card: Card,
): { room: Room } | { error: string } {
  const room = getRoomBySocket(socketId);
  if (!room || room.phase !== 'playing') return { error: 'Нет активной игры' };

  const attacker = room.players[room.attackerIdx];
  if (attacker.id !== socketId) return { error: 'Сейчас не ваш ход атаки' };

  if (!room.defenderTaking && room.table.length >= maxAttackSlots(room)) {
    return { error: 'Нельзя добавить больше карт' };
  }

  if (room.table.length > 0) {
    const ranks = getTableRanks(room.table);
    if (!ranks.has(card.rank)) return { error: 'Можно подкидывать только карты того же достоинства' };
  }

  if (!removeFromHand(attacker, card)) return { error: 'Такой карты нет в руке' };
  room.table.push({ attack: card, defense: null });
  return { room };
}

export function defendCard(
  socketId: string, attackCard: Card, defenseCard: Card,
): { room: Room } | { error: string } {
  const room = getRoomBySocket(socketId);
  if (!room || room.phase !== 'playing') return { error: 'Нет активной игры' };
  if (room.defenderTaking) return { error: 'Вы уже решили взять карты' };

  const defender = room.players[room.defenderIdx];
  if (defender.id !== socketId) return { error: 'Вы не защищаетесь' };
  if (!room.trumpSuit) return { error: 'Козырь не определён' };

  const slot = room.table.find(
    s => s.attack.suit === attackCard.suit && s.attack.rank === attackCard.rank && s.defense === null,
  );
  if (!slot) return { error: 'Открытая карта для защиты не найдена' };
  if (!beats(attackCard, defenseCard, room.trumpSuit)) return { error: 'Эта карта не бьёт атакующую' };
  if (!removeFromHand(defender, defenseCard)) return { error: 'Такой карты нет в руке' };

  slot.defense = defenseCard;
  return { room };
}

export function throwCard(
  socketId: string, card: Card,
): { room: Room } | { error: string } {
  const room = getRoomBySocket(socketId);
  if (!room || room.phase !== 'playing') return { error: 'Нет активной игры' };
  if (!canThrow(room, socketId)) return { error: 'Нельзя подкинуть карту сейчас' };

  const player = room.players.find(p => p.id === socketId)!;
  const ranks = getTableRanks(room.table);
  if (!ranks.has(card.rank)) return { error: 'Такое достоинство отсутствует на столе' };
  if (!removeFromHand(player, card)) return { error: 'Такой карты нет в руке' };

  room.table.push({ attack: card, defense: null });
  return { room };
}

// Defender requests to take — attacker must confirm before cards move
export function requestTake(socketId: string): { room: Room } | { error: string } {
  const room = getRoomBySocket(socketId);
  if (!room || room.phase !== 'playing') return { error: 'Нет активной игры' };

  const defender = room.players[room.defenderIdx];
  if (defender.id !== socketId) return { error: 'Вы не защищаетесь' };
  if (room.table.length === 0) return { error: 'На столе нет карт' };
  if (room.defenderTaking) return { error: 'Вы уже решили взять карты' };

  room.defenderTaking = true;
  return { room };
}

// Attacker confirms take — cards move to defender
export function confirmTake(socketId: string): { room: Room } | { error: string } {
  const room = getRoomBySocket(socketId);
  if (!room || room.phase !== 'playing') return { error: 'Нет активной игры' };

  const attacker = room.players[room.attackerIdx];
  if (attacker.id !== socketId) return { error: 'Только атакующий подтверждает взятие' };
  if (!room.defenderTaking) return { error: 'Защитник не запрашивал взятие' };

  const defender = room.players[room.defenderIdx];
  for (const slot of room.table) {
    defender.hand.push(slot.attack);
    if (slot.defense) defender.hand.push(slot.defense);
  }
  room.table = [];
  room.defenderTaking = false;

  refillHands(room, true);
  markDonePlayers(room);
  if (checkGameEnd(room)) return { room };

  const newAttackerIdx = nextActiveIdx(room.players, room.defenderIdx);
  room.attackerIdx = newAttackerIdx;
  room.defenderIdx = nextActiveIdx(room.players, newAttackerIdx);
  return { room };
}

export function doneTurn(socketId: string): { room: Room } | { error: string } {
  const room = getRoomBySocket(socketId);
  if (!room || room.phase !== 'playing') return { error: 'Нет активной игры' };

  const attacker = room.players[room.attackerIdx];
  const defender = room.players[room.defenderIdx];

  if (attacker.id !== socketId && defender.id !== socketId) return { room };

  if (defender.id === socketId) return { error: 'Прикройте все карты или возьмите их' };
  if (room.defenderTaking) return { error: 'Защитник берёт — подтвердите или подкиньте карты' };
  if (room.table.length === 0) return { error: 'Сначала сыграйте хотя бы одну карту' };
  if (room.table.some(s => s.defense === null)) return { error: 'Не все карты на столе прикрыты' };

  room.table = [];
  const oldDefenderIdx = room.defenderIdx;

  refillHands(room, false);
  markDonePlayers(room);
  if (checkGameEnd(room)) return { room };

  const nextAttackerIdx = room.players[oldDefenderIdx].isDone
    ? nextActiveIdx(room.players, oldDefenderIdx)
    : oldDefenderIdx;
  room.attackerIdx = nextAttackerIdx;
  room.defenderIdx = nextActiveIdx(room.players, nextAttackerIdx);
  return { room };
}
