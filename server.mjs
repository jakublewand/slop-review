import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Chess } from './public/vendor/chess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const defaultEnginePath = resolveDefaultEnginePath();

const port = Number(process.env.PORT || 4173);
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const mateScore = 100000;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

function resolveDefaultEnginePath() {
  if (process.env.STOCKFISH_PATH) return process.env.STOCKFISH_PATH.trim();

  const pathFile = path.join(__dirname, 'engines', 'stockfish', 'engine-path.txt');
  if (existsSync(pathFile)) {
    const storedPath = readFileSync(pathFile, 'utf8').trim();
    if (storedPath) return storedPath;
  }

  return process.platform === 'win32'
    ? path.join(__dirname, 'engines', 'stockfish', 'bin', 'stockfish.exe')
    : path.join(__dirname, 'engines', 'stockfish', 'bin', 'stockfish');
}

const classificationInfo = {
  brilliant: {
    label: 'Brilliant',
    color: '#1baca6',
    mark: '!!',
    description: 'A great move that involves a piece sacrifice.',
  },
  great: {
    label: 'Great',
    color: '#5b8def',
    mark: '!',
    description: "The only good move in a certain position; everything else would worsen the player's position significantly.",
  },
  best: {
    label: 'Best',
    color: '#81b64c',
    mark: '✓',
    description: 'The same move the chess engine would play.',
  },
  excellent: {
    label: 'Excellent',
    color: '#9ac75f',
    mark: '✓',
    description: 'A move that is almost as good as the best move, but could be slightly worse.',
  },
  good: {
    label: 'Good',
    color: '#6fa943',
    mark: '•',
    description: "A move that is not as good as the best or excellent choices but does not make the player's position bad.",
  },
  book: {
    label: 'Book',
    color: '#b58863',
    mark: '▰',
    description: "A move that's part of opening theory.",
  },
  inaccuracy: {
    label: 'Inaccuracy',
    color: '#f7c948',
    mark: '?!',
    description: "A move that makes the player's position slightly worse.",
  },
  mistake: {
    label: 'Mistake',
    color: '#f08c2e',
    mark: '?',
    description: "A bad move that makes the player's position worse.",
  },
  blunder: {
    label: 'Blunder',
    color: '#e0514b',
    mark: '??',
    description: "A terrible move that makes the player's position significantly worse.",
  },
  miss: {
    label: 'Miss',
    color: '#d95b88',
    mark: '×',
    description: "A move that misses the opportunity to capitalize on the opponent's mistake.",
  },
};

const pieceValues = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const openingLines = [
  { eco: 'A00', name: 'Anderssen Opening', moves: ['a3'] },
  { eco: 'A00', name: 'Dunst Opening', moves: ['Nc3'] },
  { eco: 'A00', name: 'Grob Opening', moves: ['g4'] },
  { eco: 'A00', name: 'Mieses Opening', moves: ['d3'] },
  { eco: 'A00', name: 'Polish Opening', moves: ['b4'] },
  { eco: 'A01', name: "Nimzo-Larsen Attack", moves: ['b3'] },
  { eco: 'A02', name: "Bird's Opening", moves: ['f4'] },
  { eco: 'A04', name: 'Reti Opening', moves: ['Nf3'] },
  { eco: 'A05', name: "King's Indian Attack", moves: ['Nf3', 'Nf6', 'g3', 'g6', 'Bg2', 'Bg7', 'O-O', 'O-O', 'd3'] },
  { eco: 'A06', name: 'Reti Opening', moves: ['Nf3', 'd5'] },
  { eco: 'A07', name: "King's Indian Attack", moves: ['Nf3', 'd5', 'g3'] },
  { eco: 'A10', name: 'English Opening', moves: ['c4'] },
  { eco: 'A13', name: 'English Opening: Agincourt Defense', moves: ['c4', 'e6'] },
  { eco: 'A15', name: 'English Opening', moves: ['c4', 'Nf6'] },
  { eco: 'A16', name: 'English Opening: Anglo-Indian Defense', moves: ['c4', 'Nf6', 'Nc3'] },
  { eco: 'A20', name: 'English Opening: Reversed Sicilian', moves: ['c4', 'e5'] },
  { eco: 'A21', name: 'English Opening: Reversed Sicilian', moves: ['c4', 'e5', 'Nc3'] },
  { eco: 'A25', name: 'English Opening: Four Knights', moves: ['c4', 'e5', 'Nc3', 'Nc6', 'Nf3', 'Nf6'] },
  { eco: 'A30', name: 'English Opening: Symmetrical Variation', moves: ['c4', 'c5'] },
  { eco: 'A34', name: 'English Opening: Symmetrical Variation', moves: ['c4', 'c5', 'Nc3', 'Nf6', 'g3'] },
  { eco: 'A40', name: 'Englund Gambit', moves: ['d4', 'e5'] },
  { eco: 'A40', name: "Queen's Pawn Game", moves: ['d4'] },
  { eco: 'A41', name: 'Modern Defense', moves: ['d4', 'g6'] },
  { eco: 'A43', name: 'Benoni Defense', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5'] },
  { eco: 'A45', name: 'Trompowsky Attack', moves: ['d4', 'Nf6', 'Bg5'] },
  { eco: 'A46', name: 'Torre Attack', moves: ['d4', 'Nf6', 'Nf3', 'e6', 'Bg5'] },
  { eco: 'A46', name: 'London System', moves: ['d4', 'Nf6', 'Nf3', 'd5', 'Bf4'] },
  { eco: 'A48', name: "King's Indian: Torre System", moves: ['d4', 'Nf6', 'Nf3', 'g6', 'Bg5'] },
  { eco: 'A50', name: "Queen's Indian Accelerated", moves: ['d4', 'Nf6', 'c4', 'b6'] },
  { eco: 'A52', name: 'Budapest Gambit', moves: ['d4', 'Nf6', 'c4', 'e5'] },
  { eco: 'A57', name: 'Benko Gambit', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5'] },
  { eco: 'A60', name: 'Benoni Defense', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6'] },
  { eco: 'A65', name: 'Benoni Defense: Modern Variation', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6', 'Nc3', 'exd5', 'cxd5', 'd6'] },
  { eco: 'A80', name: 'Dutch Defense', moves: ['d4', 'f5'] },
  { eco: 'A84', name: 'Dutch Defense: Classical Variation', moves: ['d4', 'f5', 'c4', 'Nf6', 'Nc3', 'e6'] },
  { eco: 'A90', name: 'Dutch Defense: Stonewall Variation', moves: ['d4', 'f5', 'c4', 'Nf6', 'g3', 'e6', 'Bg2', 'd5'] },
  { eco: 'B00', name: "King's Pawn Game", moves: ['e4'] },
  { eco: 'B00', name: 'Nimzowitsch Defense', moves: ['e4', 'Nc6'] },
  { eco: 'B01', name: 'Scandinavian Defense', moves: ['e4', 'd5'] },
  { eco: 'B01', name: 'Scandinavian Defense: Main Line', moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'] },
  { eco: 'B01', name: 'Scandinavian Defense: Modern Variation', moves: ['e4', 'd5', 'exd5', 'Nf6'] },
  { eco: 'B02', name: "Alekhine's Defense", moves: ['e4', 'Nf6'] },
  { eco: 'B03', name: "Alekhine's Defense: Four Pawns Attack", moves: ['e4', 'Nf6', 'e5', 'Nd5', 'd4', 'd6', 'c4', 'Nb6', 'f4'] },
  { eco: 'B06', name: 'Modern Defense', moves: ['e4', 'g6'] },
  { eco: 'B06', name: 'Modern Defense', moves: ['e4', 'g6', 'd4', 'Bg7'] },
  { eco: 'B07', name: 'Pirc Defense', moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6'] },
  { eco: 'B08', name: 'Pirc Defense: Classical Variation', moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Nf3', 'Bg7'] },
  { eco: 'B09', name: 'Pirc Defense: Austrian Attack', moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'f4'] },
  { eco: 'B10', name: 'Caro-Kann Defense', moves: ['e4', 'c6'] },
  { eco: 'B12', name: 'Caro-Kann Defense: Advance Variation', moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'] },
  { eco: 'B13', name: 'Caro-Kann Defense: Exchange Variation', moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'] },
  { eco: 'B13', name: 'Caro-Kann Defense: Panov Attack', moves: ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4'] },
  { eco: 'B15', name: 'Caro-Kann Defense: Two Knights Attack', moves: ['e4', 'c6', 'Nc3', 'd5', 'Nf3'] },
  { eco: 'B18', name: 'Caro-Kann Defense: Classical Variation', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'] },
  { eco: 'B20', name: 'Sicilian Defense', moves: ['e4', 'c5'] },
  { eco: 'B21', name: 'Sicilian Defense: Smith-Morra Gambit', moves: ['e4', 'c5', 'd4', 'cxd4', 'c3'] },
  { eco: 'B22', name: 'Sicilian Defense: Alapin Variation', moves: ['e4', 'c5', 'c3'] },
  { eco: 'B23', name: 'Sicilian Defense: Closed Variation', moves: ['e4', 'c5', 'Nc3'] },
  { eco: 'B23', name: 'Sicilian Defense: Grand Prix Attack', moves: ['e4', 'c5', 'Nc3', 'Nc6', 'f4'] },
  { eco: 'B30', name: 'Sicilian Defense: Old Sicilian', moves: ['e4', 'c5', 'Nf3', 'Nc6'] },
  { eco: 'B31', name: 'Sicilian Defense: Rossolimo Variation', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'B32', name: 'Sicilian Defense: Open Sicilian', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4'] },
  { eco: 'B34', name: 'Sicilian Defense: Accelerated Dragon', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'] },
  { eco: 'B40', name: 'Sicilian Defense: French Variation', moves: ['e4', 'c5', 'Nf3', 'e6'] },
  { eco: 'B41', name: 'Sicilian Defense: Kan Variation', moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'a6'] },
  { eco: 'B44', name: 'Sicilian Defense: Taimanov Variation', moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6'] },
  { eco: 'B50', name: 'Sicilian Defense', moves: ['e4', 'c5', 'Nf3', 'd6'] },
  { eco: 'B51', name: 'Sicilian Defense: Moscow Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'Bb5+'] },
  { eco: 'B54', name: 'Sicilian Defense: Classical Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6'] },
  { eco: 'B70', name: 'Sicilian Defense: Dragon Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'] },
  { eco: 'B80', name: 'Sicilian Defense: Scheveningen Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e6'] },
  { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  { eco: 'B97', name: 'Sicilian Defense: Najdorf, Poisoned Pawn Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Bg5', 'e6', 'f4', 'Qb6'] },
  { eco: 'C00', name: 'French Defense', moves: ['e4', 'e6'] },
  { eco: 'C01', name: 'French Defense: Exchange Variation', moves: ['e4', 'e6', 'd4', 'd5', 'exd5', 'exd5'] },
  { eco: 'C02', name: 'French Defense: Advance Variation', moves: ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6'] },
  { eco: 'C03', name: 'French Defense: Tarrasch Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'] },
  { eco: 'C10', name: 'French Defense: Rubinstein Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'dxe4'] },
  { eco: 'C11', name: 'French Defense: Classical Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'] },
  { eco: 'C15', name: 'French Defense: Winawer Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'] },
  { eco: 'C20', name: 'Open Game', moves: ['e4', 'e5'] },
  { eco: 'C21', name: 'Center Game', moves: ['e4', 'e5', 'd4', 'exd4'] },
  { eco: 'C21', name: 'Danish Gambit', moves: ['e4', 'e5', 'd4', 'exd4', 'c3'] },
  { eco: 'C23', name: "Bishop's Opening", moves: ['e4', 'e5', 'Bc4'] },
  { eco: 'C25', name: 'Vienna Game', moves: ['e4', 'e5', 'Nc3'] },
  { eco: 'C30', name: "King's Gambit", moves: ['e4', 'e5', 'f4'] },
  { eco: 'C34', name: "King's Gambit Accepted", moves: ['e4', 'e5', 'f4', 'exf4'] },
  { eco: 'C40', name: "King's Knight Opening", moves: ['e4', 'e5', 'Nf3'] },
  { eco: 'C41', name: 'Philidor Defense', moves: ['e4', 'e5', 'Nf3', 'd6'] },
  { eco: 'C42', name: "Petrov's Defense", moves: ['e4', 'e5', 'Nf3', 'Nf6'] },
  { eco: 'C44', name: 'Ponziani Opening', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'c3'] },
  { eco: 'C44', name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'] },
  { eco: 'C45', name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'] },
  { eco: 'C46', name: 'Four Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'] },
  { eco: 'C47', name: 'Four Knights Game: Scotch Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'd4'] },
  { eco: 'C48', name: 'Four Knights Game: Spanish Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Bb5'] },
  { eco: 'C50', name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { eco: 'C50', name: 'Italian Game: Hungarian Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Be7'] },
  { eco: 'C53', name: 'Italian Game: Giuoco Piano', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'] },
  { eco: 'C54', name: 'Italian Game: Classical Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4', 'cxd4'] },
  { eco: 'C55', name: 'Italian Game: Two Knights Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { eco: 'C57', name: 'Italian Game: Fried Liver Attack', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Nxd5'] },
  { eco: 'C60', name: 'Ruy Lopez', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'] },
  { eco: 'C68', name: 'Ruy Lopez: Exchange Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'] },
  { eco: 'C70', name: 'Ruy Lopez: Morphy Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'] },
  { eco: 'C77', name: 'Ruy Lopez: Anderssen Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'] },
  { eco: 'C80', name: 'Ruy Lopez: Open Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Nxe4'] },
  { eco: 'C84', name: 'Ruy Lopez: Closed Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'] },
  { eco: 'C88', name: 'Ruy Lopez: Closed, Anti-Marshall', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6'] },
  { eco: 'C89', name: 'Ruy Lopez: Marshall Attack', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'O-O', 'c3', 'd5'] },
  { eco: 'C92', name: 'Ruy Lopez: Closed, Chigorin Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Na5'] },
  { eco: 'D00', name: "Queen's Pawn Game", moves: ['d4', 'd5'] },
  { eco: 'D00', name: 'Blackmar-Diemer Gambit', moves: ['d4', 'd5', 'e4'] },
  { eco: 'D02', name: 'London System', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'] },
  { eco: 'D03', name: 'Torre Attack', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bg5'] },
  { eco: 'D04', name: 'Colle System', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'e3'] },
  { eco: 'D05', name: 'Stonewall Attack', moves: ['d4', 'd5', 'e3', 'Nf6', 'Bd3'] },
  { eco: 'D06', name: "Queen's Gambit", moves: ['d4', 'd5', 'c4'] },
  { eco: 'D08', name: "Queen's Gambit Declined: Albin Countergambit", moves: ['d4', 'd5', 'c4', 'e5'] },
  { eco: 'D10', name: 'Slav Defense', moves: ['d4', 'd5', 'c4', 'c6'] },
  { eco: 'D15', name: 'Slav Defense: Three Knights Variation', moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3'] },
  { eco: 'D20', name: "Queen's Gambit Accepted", moves: ['d4', 'd5', 'c4', 'dxc4'] },
  { eco: 'D24', name: "Queen's Gambit Accepted: Classical Defense", moves: ['d4', 'd5', 'c4', 'dxc4', 'Nf3', 'Nf6', 'e3'] },
  { eco: 'D31', name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6'] },
  { eco: 'D35', name: "Queen's Gambit Declined: Exchange Variation", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5'] },
  { eco: 'D37', name: "Queen's Gambit Declined: Harrwitz Attack", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Be7', 'Bf4'] },
  { eco: 'D38', name: "Queen's Gambit Declined: Ragozin Defense", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'Bb4'] },
  { eco: 'D40', name: "Queen's Gambit Declined: Semi-Tarrasch Defense", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Nf3', 'c5'] },
  { eco: 'D43', name: 'Semi-Slav Defense', moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6'] },
  { eco: 'D45', name: 'Semi-Slav Defense: Meran Variation', moves: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6', 'e3'] },
  { eco: 'D50', name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'] },
  { eco: 'D59', name: "Queen's Gambit Declined: Tartakower Defense", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'h6', 'Bh4', 'O-O'] },
  { eco: 'D70', name: 'Neo-Grunfeld Defense', moves: ['d4', 'Nf6', 'c4', 'g6', 'g3'] },
  { eco: 'D80', name: 'Grunfeld Defense', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'] },
  { eco: 'D85', name: 'Grunfeld Defense: Exchange Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5', 'e4'] },
  { eco: 'D90', name: 'Grunfeld Defense: Three Knights Variation', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'Nf3'] },
  { eco: 'E00', name: "Queen's Pawn Game", moves: ['d4', 'Nf6'] },
  { eco: 'E00', name: 'Catalan Opening', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'] },
  { eco: 'E01', name: 'Catalan Opening: Closed Variation', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2'] },
  { eco: 'E10', name: "Queen's Pawn Game", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3'] },
  { eco: 'E11', name: 'Bogo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4+'] },
  { eco: 'E12', name: "Queen's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'] },
  { eco: 'E15', name: "Queen's Indian Defense: Fianchetto Variation", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3'] },
  { eco: 'E20', name: 'Nimzo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { eco: 'E21', name: 'Nimzo-Indian Defense: Three Knights Variation', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Nf3'] },
  { eco: 'E32', name: 'Nimzo-Indian Defense: Classical Variation', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'Qc2'] },
  { eco: 'E41', name: 'Nimzo-Indian Defense: Rubinstein Variation', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3'] },
  { eco: 'E44', name: 'Nimzo-Indian Defense: Fischer Variation', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'b6'] },
  { eco: 'E60', name: "King's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'g6'] },
  { eco: 'E61', name: "King's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'] },
  { eco: 'E62', name: "King's Indian Defense: Fianchetto Variation", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nf3', 'Bg7', 'g3'] },
  { eco: 'E70', name: "King's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4'] },
  { eco: 'E80', name: "King's Indian Defense: Samisch Variation", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'f3'] },
  { eco: 'E90', name: "King's Indian Defense: Classical Variation", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2'] },
  { eco: 'E97', name: "King's Indian Defense: Orthodox Variation", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5', 'O-O', 'Nc6'] },
];

const explorerBook = new Map([
  ['', {
    moves: [
      bookMove('e4', 48500, 38, 31, 31, 'Claims the center and opens both bishop and queen.'),
      bookMove('d4', 45200, 37, 33, 30, 'Builds a broad center and often leads to strategic play.'),
      bookMove('Nf3', 15100, 36, 35, 29, 'Keeps options open and prevents ...e5 ideas.'),
      bookMove('c4', 12800, 37, 34, 29, 'Starts the English and fights for d5.'),
    ],
  }],
  ['e4', {
    moves: [
      bookMove('c5', 21200, 34, 31, 35, 'The Sicilian creates immediate imbalance.'),
      bookMove('e5', 19800, 36, 33, 31, 'Classical development and open central files.'),
      bookMove('e6', 8600, 33, 36, 31, 'The French invites a locked center.'),
      bookMove('c6', 7800, 35, 34, 31, 'The Caro-Kann supports ...d5 with a solid base.'),
    ],
  }],
  ['e4|e5|Nf3|Nc6', {
    moves: [
      bookMove('Bb5', 9600, 38, 34, 28, 'The Ruy Lopez pressures the defender of e5.'),
      bookMove('Bc4', 7300, 37, 32, 31, 'The Italian points at f7 and develops quickly.'),
      bookMove('d4', 2100, 35, 30, 35, 'The Scotch opens the center at once.'),
    ],
  }],
  ['d4', {
    moves: [
      bookMove('Nf6', 19800, 34, 34, 32, 'Flexible Indian-game development.'),
      bookMove('d5', 18200, 36, 35, 29, 'Classical symmetry and queen-pawn structures.'),
      bookMove('e6', 5100, 34, 36, 30, 'Often transposes to Queen\'s Gambit or Indian systems.'),
    ],
  }],
  ['d4|d5|c4', {
    moves: [
      bookMove('e6', 11200, 36, 37, 27, 'Queen\'s Gambit Declined: solid and resilient.'),
      bookMove('c6', 5800, 35, 36, 29, 'Slav Defense: supports d5 without blocking the bishop.'),
      bookMove('dxc4', 3900, 36, 33, 31, 'Queen\'s Gambit Accepted: gives up the center temporarily.'),
    ],
  }],
  ['d4|Nf6|c4', {
    moves: [
      bookMove('e6', 12400, 35, 36, 29, 'Keeps Nimzo, Queen\'s Indian, and QGD options.'),
      bookMove('g6', 9200, 34, 35, 31, 'King\'s Indian or Grunfeld structures.'),
      bookMove('c5', 3700, 33, 34, 33, 'Benoni-style counterplay against the center.'),
    ],
  }],
  ['c4', {
    moves: [
      bookMove('e5', 5500, 36, 33, 31, 'Reversed Sicilian structures.'),
      bookMove('Nf6', 4900, 35, 35, 30, 'Flexible development against the English.'),
      bookMove('c5', 2300, 35, 36, 29, 'Symmetrical English.'),
    ],
  }],
]);

const notableGames = [
  {
    opening: 'Ruy Lopez',
    white: 'Kasparov',
    black: 'Anand',
    year: '1995',
    result: '1-0',
    note: 'A model of central pressure turning into kingside attack.',
  },
  {
    opening: 'Italian Game',
    white: 'Kramnik',
    black: 'Aronian',
    year: '2007',
    result: '1-0',
    note: 'Clean piece placement and a long-term edge from the opening.',
  },
  {
    opening: "Queen's Gambit",
    white: 'Botvinnik',
    black: 'Capablanca',
    year: '1938',
    result: '1-0',
    note: 'A classic example of queenside space becoming tactical force.',
  },
  {
    opening: 'Sicilian Defense',
    white: 'Fischer',
    black: 'Taimanov',
    year: '1971',
    result: '1-0',
    note: 'Pressure against structural weaknesses in a Sicilian middlegame.',
  },
  {
    opening: "King's Indian Defense",
    white: 'Gligoric',
    black: 'Fischer',
    year: '1959',
    result: '0-1',
    note: 'Black creates counterplay while White expands on the queenside.',
  },
  {
    opening: 'French Defense',
    white: 'Short',
    black: 'Timman',
    year: '1991',
    result: '1-0',
    note: 'A famous king walk finish after a tense French structure.',
  },
];

function bookMove(san, games, white, draw, black, note) {
  return { san, games, white, draw, black, note };
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': mimeTypes.get(ext) || 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

function splitPgnGames(pgn) {
  const normalized = String(pgn || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const eventStarts = [...normalized.matchAll(/(?=^\s*\[Event\s+")/gm)].map((match) => match.index);
  if (eventStarts.length <= 1) return [normalized];

  return eventStarts
    .map((start, index) => normalized.slice(start, eventStarts[index + 1] ?? normalized.length).trim())
    .filter(Boolean);
}

function loadPgnGame(pgn) {
  const game = new Chess();
  game.loadPgn(pgn, { strict: false });
  return game;
}

function summarizePgnGames(pgn) {
  return splitPgnGames(pgn).map((gamePgn, index) => {
    const game = loadPgnGame(gamePgn);
    const headers = game.getHeaders();
    const moveCount = Math.ceil(game.history().length / 2);
    return {
      index,
      title: formatGameTitle(headers, index),
      headers,
      moveCount,
      result: headers.Result || '*',
    };
  });
}

function formatGameTitle(headers, index) {
  const white = headers.White && headers.White !== '?' ? headers.White : 'White';
  const black = headers.Black && headers.Black !== '?' ? headers.Black : 'Black';
  const event = headers.Event && headers.Event !== '?' ? ` - ${headers.Event}` : '';
  return `${index + 1}. ${white} vs ${black}${event}`;
}

function buildTimeline(gamePgn) {
  const game = loadPgnGame(gamePgn);
  const headers = game.getHeaders();
  const history = game.history({ verbose: true });
  const initialFen = headers.SetUp === '1' && headers.FEN ? headers.FEN : startFen;
  const replay = new Chess();
  replay.load(initialFen);

  const positions = [{
    ply: 0,
    fen: replay.fen(),
    label: 'Start',
    moveNumber: 1,
    turn: replay.turn(),
    sanPrefix: [],
  }];
  const moves = [];
  const sanPrefix = [];

  history.forEach((move, index) => {
    const beforeFen = replay.fen();
    const uci = moveToUci(move);
    const played = replay.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
    if (!played) {
      throw new Error(`Could not replay move ${index + 1}: ${move.san}`);
    }
    sanPrefix.push(normalizeSan(played.san));
    const afterFen = replay.fen();
    const ply = index + 1;
    const label = `${Math.floor(index / 2) + 1}${move.color === 'w' ? '.' : '...'} ${played.san}`;
    positions.push({
      ply,
      fen: afterFen,
      label,
      moveNumber: Math.floor(index / 2) + 1,
      turn: replay.turn(),
      sanPrefix: [...sanPrefix],
    });
    moves.push({
      ply,
      index,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color,
      san: played.san,
      normalizedSan: normalizeSan(played.san),
      uci,
      from: move.from,
      to: move.to,
      promotion: move.promotion || '',
      flags: played.flags,
      captured: played.captured || '',
      beforeFen,
      afterFen,
      sanPrefix: [...sanPrefix],
    });
  });

  return { headers, history, positions, moves, finalFen: replay.fen() };
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ''}`;
}

function normalizeSan(san) {
  return String(san || '')
    .replace(/[+#?!]+/g, '')
    .replace(/^0-0-0$/i, 'O-O-O')
    .replace(/^0-0$/i, 'O-O');
}

function sanitizeConfig(config = {}) {
  return {
    timeMs: clampNumber(config.timeMs ?? config.timePerMove ?? 120, 20, 10_000),
    multiPv: clampNumber(config.multiPv ?? 3, 1, 5),
    threads: clampNumber(config.threads ?? 1, 1, 16),
    hashMb: clampNumber(config.hashMb ?? 128, 16, 4096),
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

class UciEngine {
  constructor(enginePath) {
    this.enginePath = enginePath;
    this.process = null;
    this.lineHandlers = new Set();
    this.buffer = '';
  }

  async start(config) {
    if (!this.enginePath || !existsSync(this.enginePath)) {
      throw new Error(`Engine was not found at: ${this.enginePath || '(empty path)'}`);
    }

    this.process = spawn(this.enginePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.process.stdout.setEncoding('utf8');
    this.process.stderr.setEncoding('utf8');
    this.process.stdout.on('data', (chunk) => this.handleOutput(chunk));
    this.process.stderr.on('data', (chunk) => this.handleOutput(chunk));
    this.process.on('exit', (code) => {
      if (code !== 0) this.emitLine(`__engine_exit__ ${code}`);
    });

    this.send('uci');
    await this.waitFor((line) => line === 'uciok', 10_000, 'Engine did not finish UCI setup.');
    await this.setOption('Threads', config.threads);
    await this.setOption('Hash', config.hashMb);
    await this.setOption('UCI_AnalyseMode', 'true');
    await this.ready();
  }

  handleOutput(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) this.emitLine(trimmed);
    }
  }

  emitLine(line) {
    for (const handler of [...this.lineHandlers]) handler(line);
  }

  send(command) {
    if (!this.process || !this.process.stdin.writable) {
      throw new Error('Engine process is not running.');
    }
    this.process.stdin.write(`${command}\n`);
  }

  waitFor(predicate, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.lineHandlers.delete(handler);
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      const handler = (line) => {
        if (predicate(line)) {
          clearTimeout(timer);
          this.lineHandlers.delete(handler);
          resolve(line);
        }
      };
      this.lineHandlers.add(handler);
    });
  }

  async setOption(name, value) {
    this.send(`setoption name ${name} value ${value}`);
  }

  async ready() {
    this.send('isready');
    await this.waitFor((line) => line === 'readyok', 10_000, 'Engine was not ready.');
  }

  async analyzeFen(fen, { timeMs, multiPv }) {
    const turn = fen.split(/\s+/)[1] || 'w';
    const terminal = terminalWhiteEval(fen);
    if (terminal !== null) {
      return {
        fen,
        turn,
        depth: 0,
        lines: [{
          multipv: 1,
          depth: 0,
          score: { type: 'cp', value: terminal },
          whiteCp: terminal,
          pv: [],
          sanLine: '',
          firstSan: '',
        }],
        bestmove: '(none)',
      };
    }

    await this.setOption('MultiPV', multiPv);
    const infos = new Map();
    let bestmove = '';
    const handler = (line) => {
      if (line.startsWith('info ')) {
        const info = parseInfoLine(line, turn);
        if (info?.pv?.length) infos.set(info.multipv, info);
      } else if (line.startsWith('bestmove ')) {
        bestmove = line.split(/\s+/)[1] || '';
      }
    };
    this.lineHandlers.add(handler);
    this.send(`position fen ${fen}`);
    this.send(`go movetime ${timeMs}`);
    await this.waitFor((line) => line.startsWith('bestmove '), Math.max(10_000, timeMs * 50), 'Engine analysis timed out.');
    this.lineHandlers.delete(handler);

    const lines = [...infos.values()]
      .sort((a, b) => a.multipv - b.multipv)
      .map((line) => ({
        ...line,
        sanLine: pvToSan(fen, line.pv, 6).join(' '),
        firstSan: pvToSan(fen, line.pv, 1)[0] || '',
      }));

    if (!lines.length && bestmove && bestmove !== '(none)') {
      lines.push({
        multipv: 1,
        depth: 0,
        score: { type: 'cp', value: 0 },
        whiteCp: 0,
        pv: [bestmove],
        sanLine: pvToSan(fen, [bestmove], 6).join(' '),
        firstSan: pvToSan(fen, [bestmove], 1)[0] || '',
      });
    }

    return {
      fen,
      turn,
      depth: lines.reduce((max, line) => Math.max(max, line.depth), 0),
      lines,
      bestmove,
    };
  }

  stop() {
    if (!this.process) return;
    try {
      this.send('quit');
    } catch {
      this.process.kill();
    }
    this.process = null;
  }
}

function parseInfoLine(line, turn) {
  const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1] || 0);
  const multipv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1] || 1);
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const pvMatch = line.match(/\bpv\s+(.+)$/);
  if (!scoreMatch || !pvMatch) return null;

  const score = {
    type: scoreMatch[1],
    value: Number(scoreMatch[2]),
  };
  const povCp = score.type === 'mate'
    ? Math.sign(score.value || 1) * (mateScore - Math.min(Math.abs(score.value), 99) * 1000)
    : score.value;
  const whiteCp = turn === 'w' ? povCp : -povCp;

  return {
    multipv,
    depth,
    score,
    whiteCp,
    pv: pvMatch[1].trim().split(/\s+/).filter(Boolean),
  };
}

function terminalWhiteEval(fen) {
  const chess = new Chess();
  chess.load(fen);
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -mateScore : mateScore;
  }
  if (chess.isDraw()) return 0;
  return null;
}

function pvToSan(fen, pv, limit = 6) {
  const chess = new Chess();
  chess.load(fen);
  const san = [];
  for (const uci of pv.slice(0, limit)) {
    const move = chess.move(uciToMove(uci));
    if (!move) break;
    san.push(move.san);
  }
  return san;
}

function uciToMove(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  };
}

async function reviewGame({ pgn, gameIndex = 0, config }) {
  const games = splitPgnGames(pgn);
  if (!games.length) throw new Error('Paste or upload at least one PGN game.');
  const selectedPgn = games[Number(gameIndex)] || games[0];
  const timeline = buildTimeline(selectedPgn);
  const engineConfig = sanitizeConfig(config);
  const engine = new UciEngine(defaultEnginePath);
  await engine.start(engineConfig);

  const reviewedMoves = [];
  let lastBookPly = 0;

  try {
    for (const move of timeline.moves) {
      const before = await engine.analyzeFen(move.beforeFen, {
        timeMs: engineConfig.timeMs,
        multiPv: engineConfig.multiPv,
      });
      const bestLine = before.lines[0] || null;
      const bestWhiteCp = bestLine?.whiteCp ?? 0;
      const matchingLine = before.lines.find((line) => line.pv[0] === move.uci);
      let actualWhiteCp = matchingLine?.whiteCp;
      let after = null;

      if (!Number.isFinite(actualWhiteCp)) {
        after = await engine.analyzeFen(move.afterFen, {
          timeMs: engineConfig.timeMs,
          multiPv: 1,
        });
        actualWhiteCp = after.lines[0]?.whiteCp ?? bestWhiteCp;
      }

      const mover = move.color;
      const rawLoss = mover === 'w'
        ? bestWhiteCp - actualWhiteCp
        : actualWhiteCp - bestWhiteCp;
      const lossCp = clampNumber(Math.max(0, rawLoss), 0, 1000);
      const accuracy = moveAccuracy(lossCp);
      const isBook = isBookPrefix(move.sanPrefix);
      if (isBook) lastBookPly = move.ply;

      const classification = classifyMove({
        move,
        lossCp,
        isBook,
        bestLine,
        lines: before.lines,
        bestWhiteCp,
        actualWhiteCp,
      });

      const reviewed = {
        ...move,
        stage: stageForMove(move, move.afterFen),
        evalBefore: normalizeEval(bestWhiteCp),
        evalAfter: normalizeEval(actualWhiteCp),
        lossCp,
        accuracy,
        classification,
        classificationLabel: classificationInfo[classification].label,
        classificationColor: classificationInfo[classification].color,
        best: bestLine ? {
          uci: bestLine.pv[0] || '',
          san: bestLine.firstSan,
          sanLine: bestLine.sanLine,
          whiteCp: normalizeEval(bestLine.whiteCp),
          depth: bestLine.depth,
        } : null,
        alternatives: before.lines.map((line) => ({
          uci: line.pv[0] || '',
          san: line.firstSan,
          sanLine: line.sanLine,
          whiteCp: normalizeEval(line.whiteCp),
          depth: line.depth,
        })),
        coach: coachText({
          move,
          classification,
          lossCp,
          bestLine,
          actualWhiteCp,
          bestWhiteCp,
        }),
      };
      reviewedMoves.push(reviewed);
    }
  } finally {
    engine.stop();
  }

  const players = buildPlayerSummaries(reviewedMoves);
  const keyMoments = buildKeyMoments(reviewedMoves, lastBookPly);
  const graph = buildGraph(timeline.positions, reviewedMoves);
  const opening = identifyOpening(timeline.positions.at(-1)?.sanPrefix || reviewedMoves.map((move) => move.normalizedSan));

  return {
    headers: timeline.headers,
    game: {
      title: formatGameTitle(timeline.headers, Number(gameIndex) || 0),
      white: timeline.headers.White || 'White',
      black: timeline.headers.Black || 'Black',
      result: timeline.headers.Result || '*',
      event: timeline.headers.Event || '',
      site: timeline.headers.Site || '',
      date: timeline.headers.Date || '',
      plyCount: reviewedMoves.length,
    },
    engine: {
      path: engine.enginePath,
      config: engineConfig,
    },
    classificationInfo,
    positions: timeline.positions,
    moves: reviewedMoves,
    graph,
    players,
    keyMoments,
    opening: {
      ...opening,
      lastBookPly,
    },
  };
}

function normalizeEval(cp) {
  if (!Number.isFinite(cp)) return 0;
  return Math.max(-mateScore, Math.min(mateScore, Math.round(cp)));
}

function moveAccuracy(lossCp) {
  const loss = Math.max(0, Math.min(1000, lossCp));
  return Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-loss / 300))));
}

function classifyMove({ move, lossCp, isBook, bestLine, lines, bestWhiteCp, actualWhiteCp }) {
  if (isBook) return 'book';

  const bestUci = bestLine?.pv?.[0] || '';
  const actualIsBest = bestUci === move.uci;
  const moverScore = move.color === 'w' ? actualWhiteCp : -actualWhiteCp;
  const bestMoverScore = move.color === 'w' ? bestWhiteCp : -bestWhiteCp;
  const gap = bestLineGap(lines, move.color);
  const sacrifice = materialDeltaForMover(move.beforeFen, move.afterFen, move.color) <= -200;
  const missedOpponentMistake = bestMoverScore >= 170 && bestMoverScore - moverScore >= 115;

  if (lossCp <= 12) {
    if (sacrifice && actualIsBest && moverScore > -80) return 'brilliant';
    if (actualIsBest && gap >= 160) return 'great';
    if (actualIsBest) return 'best';
    return 'excellent';
  }
  if (missedOpponentMistake && lossCp <= 340) return 'miss';
  if (lossCp <= 40) return 'excellent';
  if (lossCp <= 90) return 'good';
  if (lossCp <= 170) return 'inaccuracy';
  if (lossCp <= 330) return 'mistake';
  return 'blunder';
}

function bestLineGap(lines, color) {
  if (lines.length < 2) return 0;
  const scores = lines
    .map((line) => color === 'w' ? line.whiteCp : -line.whiteCp)
    .sort((a, b) => b - a);
  return Math.max(0, scores[0] - scores[1]);
}

function materialDeltaForMover(beforeFen, afterFen, color) {
  return materialBalanceFor(afterFen, color) - materialBalanceFor(beforeFen, color);
}

function materialBalanceFor(fen, color) {
  const totals = { w: 0, b: 0 };
  for (const char of fen.split(/\s+/)[0]) {
    const lower = char.toLowerCase();
    if (!pieceValues.hasOwnProperty(lower)) continue;
    totals[char === lower ? 'b' : 'w'] += pieceValues[lower];
  }
  return totals[color] - totals[color === 'w' ? 'b' : 'w'];
}

function stageForMove(move, fen) {
  if (move.ply <= 16 || isBookPrefix(move.sanPrefix)) return 'opening';
  const pieces = pieceCount(fen);
  if (pieces <= 12 || move.moveNumber >= 36) return 'endgame';
  return 'middlegame';
}

function pieceCount(fen) {
  return (fen.split(/\s+/)[0].match(/[pnbrqk]/gi) || []).length;
}

function isBookPrefix(prefix) {
  const normalized = prefix.map(normalizeSan);
  return openingLines.some((line) => {
    if (normalized.length > line.moves.length) return false;
    return normalized.every((move, index) => move === line.moves[index]);
  });
}

function identifyOpening(prefix) {
  const normalized = prefix.map(normalizeSan);
  let best = { eco: '', name: 'Unclassified Opening', moves: [] };
  for (const line of openingLines) {
    const matches = line.moves.every((move, index) => normalized[index] === move);
    if (matches && line.moves.length >= best.moves.length) best = line;
  }
  return {
    eco: best.eco,
    name: best.name,
    moves: best.moves,
  };
}

function buildExplore(prefix) {
  const normalized = prefix.map(normalizeSan);
  const exact = explorerBook.get(normalized.join('|'));
  const opening = identifyOpening(normalized);
  const games = notableGames
    .filter((game) => game.opening === opening.name || opening.name.includes(game.opening) || game.opening.includes(opening.name))
    .slice(0, 4);

  return {
    opening,
    moves: exact?.moves || [],
    notableGames: games.length ? games : notableGames.slice(0, 4),
  };
}

function buildPlayerSummaries(moves) {
  const base = {
    white: emptyPlayerSummary(),
    black: emptyPlayerSummary(),
  };
  for (const move of moves) {
    const side = move.color === 'w' ? 'white' : 'black';
    const summary = base[side];
    summary.moves += 1;
    summary.accuracies.push(move.accuracy);
    summary.losses.push(move.lossCp);
    if (move.classification !== 'book') {
      summary.ratedAccuracies.push(move.accuracy);
      summary.ratedLosses.push(move.lossCp);
    }
    summary.classifications[move.classification] = (summary.classifications[move.classification] || 0) + 1;
    summary.stages[move.stage].push(move.accuracy);
  }

  for (const summary of Object.values(base)) {
    const accuracySample = summary.ratedAccuracies.length ? summary.ratedAccuracies : summary.accuracies;
    const lossSample = summary.ratedLosses.length ? summary.ratedLosses : summary.losses;
    summary.precision = average(accuracySample);
    summary.acpl = Math.round(average(lossSample));
    summary.ratedMoves = lossSample.length;
    summary.rating = estimateRating({
      precision: summary.precision,
      acpl: summary.acpl,
      moves: summary.ratedMoves,
      classifications: summary.classifications,
    });
    summary.stages = Object.fromEntries(
      Object.entries(summary.stages).map(([stage, values]) => [stage, values.length ? Math.round(average(values)) : null]),
    );
    delete summary.accuracies;
    delete summary.losses;
    delete summary.ratedAccuracies;
    delete summary.ratedLosses;
  }

  return base;
}

function emptyPlayerSummary() {
  return {
    moves: 0,
    accuracies: [],
    losses: [],
    ratedAccuracies: [],
    ratedLosses: [],
    precision: 0,
    acpl: 0,
    ratedMoves: 0,
    rating: 0,
    classifications: Object.fromEntries(Object.keys(classificationInfo).map((key) => [key, 0])),
    stages: {
      opening: [],
      middlegame: [],
      endgame: [],
    },
  };
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function estimateRating({ precision, acpl, moves, classifications }) {
  const anchors = [
    [8, 2920],
    [15, 2750],
    [25, 2520],
    [40, 2280],
    [60, 2050],
    [90, 1800],
    [130, 1550],
    [180, 1300],
    [250, 1050],
    [360, 820],
    [520, 620],
    [760, 420],
  ];

  let rating = interpolateByAcpl(Math.max(0, acpl), anchors);
  rating += (precision - 85) * 8;
  rating -= (classifications.blunder || 0) * 125;
  rating -= (classifications.mistake || 0) * 58;
  rating -= (classifications.miss || 0) * 42;
  rating -= (classifications.inaccuracy || 0) * 18;

  const sampleMultiplier = Math.min(1, Math.sqrt(Math.max(1, moves) / 16));
  rating = 1200 + (rating - 1200) * sampleMultiplier;
  rating = Math.min(rating, maxRatingForSample(moves));

  return Math.max(100, Math.min(3000, Math.round(rating / 10) * 10));
}

function maxRatingForSample(moves) {
  if (moves < 4) return 2150;
  if (moves < 10) return 2500;
  if (moves < 20) return 2850;
  if (moves < 30) return 3000;
  if (moves < 45) return 3000;
  return 3000;
}

function interpolateByAcpl(acpl, anchors) {
  if (acpl <= anchors[0][0]) return anchors[0][1];
  for (let index = 1; index < anchors.length; index += 1) {
    const [rightAcpl, rightRating] = anchors[index];
    const [leftAcpl, leftRating] = anchors[index - 1];
    if (acpl <= rightAcpl) {
      const t = (acpl - leftAcpl) / (rightAcpl - leftAcpl);
      return leftRating + (rightRating - leftRating) * t;
    }
  }
  return anchors.at(-1)[1];
}

function buildKeyMoments(moves, lastBookPly) {
  const keyClassifications = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder', 'miss']);
  const moments = [];
  const lastBook = moves.find((move) => move.ply === lastBookPly);
  if (lastBook) {
    moments.push({
      id: `book-${lastBook.ply}`,
      type: 'book',
      title: 'Last book move',
      ply: lastBook.ply,
      moveIndex: lastBook.index,
      san: lastBook.san,
      moveNumber: lastBook.moveNumber,
      color: lastBook.color,
      classification: lastBook.classification,
      text: `Theory ran through ${lastBook.moveNumber}${lastBook.color === 'w' ? '.' : '...'} ${lastBook.san}.`,
    });
  }

  for (const move of moves) {
    if (!keyClassifications.has(move.classification)) continue;
    moments.push({
      id: `${move.classification}-${move.ply}`,
      type: move.classification,
      title: classificationInfo[move.classification].label,
      ply: move.ply,
      moveIndex: move.index,
      san: move.san,
      moveNumber: move.moveNumber,
      color: move.color,
      classification: move.classification,
      text: move.coach,
      best: move.best,
      lossCp: move.lossCp,
    });
  }

  if (!moments.length && moves.length) {
    const sharpest = [...moves].sort((a, b) => b.lossCp - a.lossCp)[0];
    moments.push({
      id: `summary-${sharpest.ply}`,
      type: sharpest.classification,
      title: 'Clean game',
      ply: sharpest.ply,
      moveIndex: sharpest.index,
      san: sharpest.san,
      moveNumber: sharpest.moveNumber,
      color: sharpest.color,
      classification: sharpest.classification,
      text: 'No major tactical moments stood out at this engine setting.',
      best: sharpest.best,
      lossCp: sharpest.lossCp,
    });
  }

  return moments;
}

function coachText({ move, classification, lossCp, bestLine, actualWhiteCp, bestWhiteCp }) {
  const who = move.color === 'w' ? 'White' : 'Black';
  const best = bestLine?.firstSan ? ` ${bestLine.firstSan}` : '';
  const swing = Math.abs(actualWhiteCp - bestWhiteCp);

  switch (classification) {
    case 'brilliant':
      return `${who} found a great move with ${move.san}, and it works even though it sacrifices material.`;
    case 'great':
      return `${move.san} was the only good move. Other choices would worsen the position by about ${Math.round(swing)} centipawns.`;
    case 'best':
      return `${move.san} matches the engine's first choice.`;
    case 'excellent':
      return `${move.san} is almost as good as the engine recommendation${best ? ` of${best}` : ''}.`;
    case 'good':
      return `${move.san} is playable and keeps the position healthy, though the engine prefers${best || ' another move'}.`;
    case 'book':
      return `${move.san} is part of the local opening book.`;
    case 'inaccuracy':
      return `${move.san} makes the position slightly worse. The cleaner try was${best || ' the engine line'}.`;
    case 'mistake':
      return `${move.san} is a bad move that worsens the position. Look at${best || ' the best move'} before moving on.`;
    case 'blunder':
      return `${move.san} is a terrible move that worsens the position significantly. The engine wanted${best || ' a forcing alternative'}.`;
    case 'miss':
      return `${move.san} missed the chance to capitalize on the opponent's mistake. The engine points to${best || ' a stronger continuation'}.`;
    default:
      return `${move.san} loses about ${lossCp} centipawns compared with the engine line.`;
  }
}

function buildGraph(positions, moves) {
  return positions.map((position, index) => {
    if (index === 0) {
      return {
        ply: 0,
        label: 'Start',
        eval: moves[0]?.evalBefore ?? 0,
        classification: null,
      };
    }
    const move = moves[index - 1];
    return {
      ply: position.ply,
      label: position.label,
      eval: move.evalAfter,
      classification: move.classification,
    };
  });
}

async function evaluatePosition({ fen, config }) {
  const engineConfig = sanitizeConfig(config);
  const engine = new UciEngine(defaultEnginePath);
  await engine.start(engineConfig);
  try {
    const analysis = await engine.analyzeFen(fen, {
      timeMs: engineConfig.timeMs,
      multiPv: engineConfig.multiPv,
    });
    return {
      fen,
      engine: {
        path: engine.enginePath,
        config: engineConfig,
      },
      lines: analysis.lines.map((line) => ({
        uci: line.pv[0] || '',
        san: line.firstSan,
        sanLine: line.sanLine,
        whiteCp: normalizeEval(line.whiteCp),
        depth: line.depth,
      })),
    };
  } finally {
    engine.stop();
  }
}

async function handleApi(req, res) {
  try {
    if (req.method === 'GET' && req.url.startsWith('/api/default-engine')) {
      jsonResponse(res, 200, {
        included: true,
        exists: existsSync(defaultEnginePath),
      });
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/games')) {
      const body = await readJson(req);
      jsonResponse(res, 200, { games: summarizePgnGames(body.pgn) });
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/review')) {
      const body = await readJson(req);
      const review = await reviewGame(body);
      jsonResponse(res, 200, review);
      return;
    }

    if (req.method === 'POST' && req.url.startsWith('/api/evaluate')) {
      const body = await readJson(req);
      const result = await evaluatePosition(body);
      jsonResponse(res, 200, result);
      return;
    }

    jsonResponse(res, 404, { error: 'Unknown API route.' });
  } catch (error) {
    jsonResponse(res, 400, { error: error.message || String(error) });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(port, () => {
  console.log(`Local Chess Game Review is running at http://localhost:${port}`);
  console.log(`Default engine: ${defaultEnginePath}`);
});
