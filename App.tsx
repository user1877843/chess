
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Chess, Move } from 'chess.js';
// Removed react-chessboard import
import {
  Trophy, RefreshCcw, User, Cpu, ChevronRight, History,
  MessageSquare, ShieldAlert, Globe, Link as LinkIcon,
  Copy, CheckCircle2, AlertCircle
} from 'lucide-react';
import { GameMode, GameState, GeminiResponse } from './types';
import { getGeminiMove, getMoveAdvice } from './services/geminiService';
import { pb, createOnlineMatch, joinOnlineMatch, updateMatchMove } from './services/pocketbaseService';

const App: React.FC = () => {
  const [game, setGame] = useState(new Chess());
  const [gameState, setGameState] = useState<GameState>({
    fen: 'start',
    history: [],
    isCheck: false,
    isCheckmate: false,
    isDraw: false,
    turn: 'w',
    gameOver: false
  });
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.PLAYER_VS_GEMINI);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [geminiAnalysis, setGeminiAnalysis] = useState<GeminiResponse | null>(null);
  const [coachAdvice, setCoachAdvice] = useState<string>("");

  // Multiplayer State
  const [matchId, setMatchId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [isCopied, setIsCopied] = useState(false);
  const [inputMatchId, setInputMatchId] = useState("");
  const [moveFrom, setMoveFrom] = useState<string | null>(null);

  const onSquareClick = (square: string) => {
    if (!moveFrom) {
      // Check if there is a piece of the current turn's color on this square
      const piece = game.get(square as any);
      if (piece && piece.color === game.turn()) {
        setMoveFrom(square);
      }
      return;
    }

    // Try to make the move
    const success = onDrop(moveFrom, square);
    setMoveFrom(null);
  };

  const updateGameState = useCallback((chessInstance: Chess) => {
    setGameState({
      fen: chessInstance.fen(),
      history: chessInstance.history({ verbose: true }).map(m => ({
        san: m.san,
        from: m.from,
        to: m.to,
        piece: m.piece,
        color: m.color
      })),
      isCheck: chessInstance.isCheck(),
      isCheckmate: chessInstance.isCheckmate(),
      isDraw: chessInstance.isDraw(),
      turn: chessInstance.turn(),
      gameOver: chessInstance.isGameOver()
    });
  }, []);

  // PocketBase Subscription
  useEffect(() => {
    if (gameMode === GameMode.ONLINE_MULTIPLAYER && matchId) {
      pb.collection('matches').subscribe(matchId, (e) => {
        if (e.action === 'update') {
          const remoteFen = e.record.fen;
          const remoteTurn = e.record.turn;

          // 상대방이 수를 뒀을 때만 업데이트
          if (remoteFen !== game.fen() && remoteTurn === playerColor) {
            const newGame = new Chess(remoteFen);
            setGame(newGame);
            updateGameState(newGame);
          }
        }
      });

      return () => {
        pb.collection('matches').unsubscribe(matchId);
      };
    }
  }, [gameMode, matchId, playerColor, game, updateGameState]);

  const handleCreateOnline = async () => {
    try {
      const match = await createOnlineMatch();
      setMatchId(match.id);
      setPlayerColor('w');
      setGameMode(GameMode.ONLINE_MULTIPLAYER);
      const newGame = new Chess();
      setGame(newGame);
      updateGameState(newGame);
    } catch (error) {
      console.error("Failed to create match:", error);
      alert("PocketBase 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.");
    }
  };

  const handleJoinOnline = async () => {
    if (!inputMatchId) return;
    try {
      const match = await joinOnlineMatch(inputMatchId);
      setMatchId(match.id);
      setPlayerColor('b');
      setGameMode(GameMode.ONLINE_MULTIPLAYER);
      const newGame = new Chess(match.fen);
      setGame(newGame);
      updateGameState(newGame);
    } catch (error) {
      console.error("Failed to join match:", error);
      alert("유효하지 않은 매치 ID입니다.");
    }
  };

  const copyMatchId = () => {
    if (matchId) {
      navigator.clipboard.writeText(matchId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const onDrop = (sourceSquare: string, targetSquare: string, piece?: string) => {
    console.log("onDrop triggered:", sourceSquare, "to", targetSquare, "piece:", piece, "isAiThinking:", isAiThinking);
    if (gameState.gameOver || isAiThinking) return false;

    // 온라인 모드에서 자신의 차례가 아닐 때 방지
    if (gameMode === GameMode.ONLINE_MULTIPLAYER && game.turn() !== playerColor) return false;

    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      });

      if (move === null) return false;

      setGame(gameCopy);
      updateGameState(gameCopy);

      // 온라인 모드인 경우 PocketBase 업데이트
      if (gameMode === GameMode.ONLINE_MULTIPLAYER && matchId) {
        updateMatchMove(matchId, gameCopy.fen(), gameCopy.history(), gameCopy.turn());
      }

      if (!gameCopy.isGameOver()) {
        getMoveAdvice(gameCopy.fen(), move.san).then(setCoachAdvice);
      }
      console.log("Move successful:", move.san, "New FEN:", gameCopy.fen());
      return true;
    } catch (e) {
      console.error("Move error:", e);
      return false;
    }
  };

  useEffect(() => {
    if (gameMode === GameMode.PLAYER_VS_GEMINI && gameState.turn === 'b' && !gameState.gameOver) {
      const triggerAi = async () => {
        const ai = (window as any).GoogleGenAI ? new ((window as any).GoogleGenAI)(process.env.GEMINI_API_KEY) : null;
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'undefined') {
          console.log("Skipping AI move: Missing API Key");
          return;
        }

        setIsAiThinking(true);
        const historySans = game.history();
        const result = await getGeminiMove(game.fen(), historySans);
        setGeminiAnalysis(result);

        if (result.move) {
          const gameCopy = new Chess(game.fen());
          try {
            setTimeout(() => {
              gameCopy.move(result.move!);
              setGame(gameCopy);
              updateGameState(gameCopy);
              setIsAiThinking(false);
            }, 800);
          } catch (e) {
            const moves = gameCopy.moves();
            if (moves.length > 0) {
              gameCopy.move(moves[0]);
              setGame(gameCopy);
              updateGameState(gameCopy);
            }
            setIsAiThinking(false);
          }
        } else {
          setIsAiThinking(false);
        }
      };
      triggerAi();
    }
  }, [gameState.turn, gameState.gameOver, gameMode, updateGameState, game]);

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    updateGameState(newGame);
    setGeminiAnalysis(null);
    setCoachAdvice("");
    setMatchId(null);
  };

  console.log("App Rendering - Current FEN:", gameState.fen);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col p-4 md:p-8 lg:px-24">
      <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-4xl playfair font-bold text-white tracking-tight flex items-center gap-3">
            <Trophy className="text-amber-500" size={36} />
            Grandmaster Gemini
          </h1>
          <p className="text-slate-400 mt-1">Classic Strategy x PocketBase Realtime x Gemini AI</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setGameMode(GameMode.PLAYER_VS_GEMINI)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${gameMode === GameMode.PLAYER_VS_GEMINI
              ? 'bg-blue-600 text-white ring-2 ring-blue-400/50'
              : 'bg-slate-800 text-slate-300'
              }`}
          >
            <Cpu size={18} /> VS AI
          </button>

          <button
            onClick={() => setGameMode(GameMode.PLAYER_VS_PLAYER)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${gameMode === GameMode.PLAYER_VS_PLAYER
              ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/50'
              : 'bg-slate-800 text-slate-300'
              }`}
          >
            <User size={18} /> Local PvP
          </button>

          <button
            onClick={() => setGameMode(GameMode.ONLINE_MULTIPLAYER)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${gameMode === GameMode.ONLINE_MULTIPLAYER
              ? 'bg-violet-600 text-white ring-2 ring-violet-400/50'
              : 'bg-slate-800 text-slate-300'
              }`}
          >
            <Globe size={18} /> Online
          </button>

          <button
            onClick={resetGame}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
          >
            <RefreshCcw size={20} />
          </button>
        </div>
      </header>

      {/* Online Setup Area */}
      {gameMode === GameMode.ONLINE_MULTIPLAYER && !matchId && (
        <div className="mb-8 p-6 bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col md:flex-row gap-6 items-center justify-center animate-in fade-in slide-in-from-top-4">
          <div className="text-center md:text-left">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <LinkIcon className="text-violet-400" size={20} /> 멀티플레이어 시작하기
            </h3>
            <p className="text-slate-400 text-sm">방을 만들거나 매치 ID로 참가하세요.</p>
          </div>
          <div className="h-px md:h-12 w-full md:w-px bg-slate-800"></div>
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <button
              onClick={handleCreateOnline}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-violet-900/20"
            >
              새 방 만들기
            </button>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="매치 ID 입력..."
                value={inputMatchId}
                onChange={(e) => setInputMatchId(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none w-full sm:w-48"
              />
              <button
                onClick={handleJoinOnline}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all"
              >
                참가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match ID Info Area */}
      {gameMode === GameMode.ONLINE_MULTIPLAYER && matchId && (
        <div className="mb-8 p-4 bg-violet-900/20 border border-violet-800/50 rounded-xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-600 rounded-lg">
              <Globe size={18} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">실시간 매치 진행 중</p>
              <p className="text-sm text-slate-300 font-mono">ID: {matchId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 mr-2">당신의 색상: <b className="text-white uppercase">{playerColor === 'w' ? 'White' : 'Black'}</b></span>
            <button
              onClick={copyMatchId}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold transition-all"
            >
              {isCopied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {isCopied ? '복사됨!' : 'ID 복사'}
            </button>
          </div>
        </div>
      )}

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-7 flex flex-col gap-4">
          <div className="relative border-2 border-slate-700 rounded-lg p-2 bg-slate-900">
            {isAiThinking && (
              <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-slate-900/90 p-6 rounded-2xl border border-blue-500/50 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-blue-400 font-semibold tracking-wider uppercase">Gemini is thinking...</span>
                </div>
              </div>
            )}

            {/* Fix: Removed invalid 'id' prop which does not exist on ChessboardProps */}
            <GrandmasterBoard
              fen={game.fen()}
              onMove={(from, to) => onDrop(from, to)}
              orientation={playerColor === 'w' ? 'white' : 'black'}
              moveFrom={moveFrom}
              onSquareClick={onSquareClick}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900 rounded-xl border border-slate-800">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${gameState.turn === 'w' ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-slate-600'}`}></div>
                <span className={`text-sm font-bold uppercase ${gameState.turn === 'w' ? 'text-white' : 'text-slate-500'}`}>White</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${gameState.turn === 'b' ? 'bg-black border border-slate-400 shadow-[0_0_8px_rgba(0,0,0,0.8)]' : 'bg-slate-600'}`}></div>
                <span className={`text-sm font-bold uppercase ${gameState.turn === 'b' ? 'text-white' : 'text-slate-500'}`}>Black</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {gameState.isCheck && !gameState.isCheckmate && (
                <span className="px-3 py-1 bg-red-900/50 text-red-400 text-xs font-bold rounded-full border border-red-800 flex items-center gap-1">
                  <ShieldAlert size={14} /> CHECK
                </span>
              )}
              {gameState.isCheckmate && (
                <span className="px-3 py-1 bg-amber-900/50 text-amber-400 text-xs font-bold rounded-full border border-amber-800">
                  CHECKMATE
                </span>
              )}
            </div>
          </div>
        </section>

        <aside className="lg:col-span-5 flex flex-col gap-6 h-full">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col shadow-xl">
            <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-blue-400">
                <MessageSquare size={18} /> Gemini Analysis
              </h2>
              {geminiAnalysis && (
                <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300 font-mono">
                  {geminiAnalysis.evaluation}
                </span>
              )}
            </div>
            <div className="p-5 min-h-[140px] flex flex-col gap-3">
              {geminiAnalysis ? (
                <>
                  <p className="text-slate-300 italic leading-relaxed text-sm">
                    "{geminiAnalysis.explanation}"
                  </p>
                  {geminiAnalysis.move && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="text-slate-500 uppercase font-bold tracking-tighter">AI Move:</span>
                      <span className="bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded font-mono font-bold border border-blue-800">
                        {geminiAnalysis.move}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center gap-2">
                  <p className="text-sm">수 하나를 두면 Gemini가 분석을 시작합니다.</p>
                </div>
              )}
            </div>
          </div>

          {coachAdvice && (
            <div className="bg-blue-900/20 border border-blue-800/50 p-4 rounded-xl flex gap-3 items-start animate-in zoom-in-95 duration-200">
              <div className="mt-1 bg-blue-500 rounded-full p-1 text-white">
                <User size={14} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Coach Insight</h4>
                <p className="text-sm text-blue-100">{coachAdvice}</p>
              </div>
            </div>
          )}

          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col flex-grow min-h-[250px] shadow-xl">
            <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-slate-300">
                <History size={18} /> History
              </h2>
              <span className="text-xs text-slate-500 uppercase font-bold">{Math.ceil(gameState.history.length / 2)} Rounds</span>
            </div>
            <div className="p-2 overflow-y-auto max-h-[300px]">
              <div className="grid grid-cols-2 gap-px bg-slate-800 rounded-lg overflow-hidden">
                {Array.from({ length: Math.ceil(gameState.history.length / 2) }).map((_, i) => (
                  <React.Fragment key={i}>
                    <div className="bg-slate-900 p-2 flex items-center gap-3 text-sm border-r border-slate-800">
                      <span className="text-slate-600 font-mono text-xs w-4">{i + 1}.</span>
                      <span className="text-white font-medium">{gameState.history[i * 2]?.san}</span>
                    </div>
                    <div className="bg-slate-900 p-2 flex items-center gap-3 text-sm">
                      {gameState.history[i * 2 + 1] ? (
                        <span className="text-white font-medium pl-6">{gameState.history[i * 2 + 1].san}</span>
                      ) : (
                        <span className="text-slate-700 italic text-xs pl-6">...</span>
                      )}
                    </div>
                  </React.Fragment>
                ))}
                {gameState.history.length === 0 && (
                  <div className="col-span-2 bg-slate-900 p-8 text-center text-slate-600 text-sm">
                    게임 시작 대기 중
                  </div>
                )}
              </div>
            </div>
          </div>


        </aside>
      </main>

      <footer className="mt-auto pt-12 text-center text-slate-600 text-xs pb-8">
        <p>© 2024 Gemini Grandmaster Edition • Powered by PocketBase & Gemini AI</p>
      </footer>
    </div>
  );
};

// Custom Board Component for maximum reliability
const GrandmasterBoard: React.FC<{
  fen: string;
  onMove: (from: string, to: string) => void;
  orientation: 'white' | 'black';
  moveFrom: string | null;
  onSquareClick: (square: string) => void;
}> = ({ fen, onMove, orientation, moveFrom, onSquareClick }) => {
  const chess = new Chess(fen);
  const board = chess.board();

  const squares = orientation === 'white'
    ? [0, 1, 2, 3, 4, 5, 6, 7].map(r => [0, 1, 2, 3, 4, 5, 6, 7].map(c => ({ r, c })))
    : [7, 6, 5, 4, 3, 2, 1, 0].map(r => [7, 6, 5, 4, 3, 2, 1, 0].map(c => ({ r, c })));

  const getSquareName = (r: number, c: number) => {
    return String.fromCharCode(97 + c) + (8 - r);
  };

  const getPieceImg = (p: string, color: string) => {
    const name = (color === 'w' ? 'w' : 'b') + p.toUpperCase();
    return `https://chessboardjs.com/img/chesspieces/wikipedia/${name}.png`;
  };

  return (
    <div className="aspect-square w-full grid grid-cols-8 grid-rows-8 border-4 border-slate-800 rounded-lg overflow-hidden shadow-2xl bg-slate-800">
      {squares.flat().map(({ r, c }) => {
        const squareName = getSquareName(r, c);
        const piece = board[r][c];
        const isDark = (r + c) % 2 === 1;
        const isSelected = moveFrom === squareName;

        return (
          <div
            key={squareName}
            onClick={() => onSquareClick(squareName)}
            className={`
              relative flex items-center justify-center cursor-pointer transition-all duration-200
              ${isDark ? 'bg-[#1e293b]' : 'bg-[#334155]'}
              ${isSelected ? 'ring-4 ring-blue-500 ring-inset z-10' : ''}
              hover:opacity-90 active:scale-95
            `}
          >
            {/* Coordinates */}
            {c === (orientation === 'white' ? 0 : 7) && (
              <span className={`absolute top-0.5 left-1 text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {8 - r}
              </span>
            )}
            {r === (orientation === 'white' ? 7 : 0) && (
              <span className={`absolute bottom-0.5 right-1 text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {String.fromCharCode(97 + c)}
              </span>
            )}

            {piece && (
              <img
                src={getPieceImg(piece.type, piece.color)}
                alt={`${piece.color} ${piece.type}`}
                className="w-[85%] h-[85%] select-none pointer-events-none drop-shadow-md transform transition-transform hover:scale-110"
                draggable={false}
              />
            )}

            {/* Last move overlay or highlights can be added here */}
          </div>
        );
      })}
    </div>
  );
};

export default App;
