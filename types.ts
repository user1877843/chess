
export interface MoveRecord {
  san: string;
  from: string;
  to: string;
  piece: string;
  color: 'w' | 'b';
}

export interface GameState {
  fen: string;
  history: MoveRecord[];
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  turn: 'w' | 'b';
  gameOver: boolean;
}

export interface GeminiResponse {
  move?: string;
  explanation: string;
  evaluation: string;
}

export enum GameMode {
  PLAYER_VS_PLAYER = 'PVP',
  PLAYER_VS_GEMINI = 'PVG',
  ONLINE_MULTIPLAYER = 'ONLINE'
}
