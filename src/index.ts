import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { ServerToClientEvents, ClientToServerEvents, Room } from './types';
import {
  createRoom, joinRoom, startGame, leaveRoom, toView,
  attackCard, defendCard, throwCard, requestTake, confirmTake, doneTurn, getRoomBySocket,
} from './rooms';

const app = express();
app.use(cors());
app.get('/health', (_, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});

function broadcast(room: Room): void {
  for (const player of room.players) {
    io.to(player.id).emit('room:updated', toView(room, player.id));
  }
}

io.on('connection', (socket) => {
  socket.on('room:create', (name, cb) => {
    const room = createRoom(socket.id, name);
    socket.join(room.code);
    cb(room.code);
    broadcast(room);
  });

  socket.on('room:join', ({ code, name }, cb) => {
    const result = joinRoom(socket.id, code, name);
    if ('error' in result) return cb(result.error);
    socket.join(result.room.code);
    cb(null);
    broadcast(result.room);
  });

  socket.on('room:start', (cb) => {
    const result = startGame(socket.id);
    if ('error' in result) return cb(result.error);
    cb(null);
    broadcast(result.room);
  });

  socket.on('game:attack', (card, cb) => {
    const result = attackCard(socket.id, card);
    if ('error' in result) return cb(result.error);
    cb(null);
    broadcast(result.room);
  });

  socket.on('game:defend', ({ attack, defense }, cb) => {
    const result = defendCard(socket.id, attack, defense);
    if ('error' in result) return cb(result.error);
    cb(null);
    broadcast(result.room);
  });

  socket.on('game:throw', (card, cb) => {
    const result = throwCard(socket.id, card);
    if ('error' in result) return cb(result.error);
    cb(null);
    broadcast(result.room);
  });

  socket.on('game:take', (cb) => {
    const result = requestTake(socket.id);
    if ('error' in result) return cb(result.error);
    cb(null);
    broadcast(result.room);
  });

  socket.on('game:confirm_take', (cb) => {
    const result = confirmTake(socket.id);
    if ('error' in result) return cb(result.error);
    cb(null);
    broadcast(result.room);
  });

  socket.on('game:done', (cb) => {
    const result = doneTurn(socket.id);
    if ('error' in result) return cb(result.error);
    cb(null);
    broadcast(result.room);
  });

  socket.on('game:react', (emoji: string) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    io.to(room.code).emit('react:received', { playerId: socket.id, emoji });
  });

  socket.on('room:leave', () => handleLeave(socket.id));
  socket.on('disconnect', () => handleLeave(socket.id));
});

function handleLeave(socketId: string): void {
  const { room, code } = leaveRoom(socketId);
  if (code && room) broadcast(room);
}

const PORT = process.env.PORT ?? 3001;
httpServer.listen(PORT, () => console.log(`🃏 Durak server on http://localhost:${PORT}`));
