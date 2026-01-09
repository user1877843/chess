
import PocketBase from 'pocketbase';

// PocketBase 서버 URL (사용자의 환경에 맞게 수정 가능)
const PB_URL = 'https://hypothesis-manufacturers-bali-pockets.trycloudflare.com';
export const pb = new PocketBase(PB_URL);

export interface MatchRecord {
  id: string;
  fen: string;
  history: any[];
  turn: string;
  white?: string;
  black?: string;
  status: 'waiting' | 'playing' | 'finished';
}

export const createOnlineMatch = async () => {
  const data = {
    fen: 'start',
    history: [],
    turn: 'w',
    status: 'waiting',
    white: 'Player 1'
  };
  return await pb.collection('matches').create(data);
};

export const joinOnlineMatch = async (matchId: string) => {
  const data = {
    status: 'playing',
    black: 'Player 2'
  };
  return await pb.collection('matches').update(matchId, data);
};

export const updateMatchMove = async (matchId: string, fen: string, history: any[], turn: string) => {
  return await pb.collection('matches').update(matchId, {
    fen,
    history,
    turn
  });
};
