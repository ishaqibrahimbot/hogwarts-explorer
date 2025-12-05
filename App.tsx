import React, { useState } from 'react';
import GameScene from './components/GameScene';
import { GameState } from './types';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.START);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-black">
      
      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <GameScene gameState={gameState} />
      </div>

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-magic text-yellow-500 drop-shadow-md tracking-wider">Broomstick Flight</h1>
            <p className="text-blue-200 font-serif opacity-80">Explore the grounds</p>
          </div>
        </div>

        {/* Start Screen Overlay */}
        {gameState === GameState.START && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm z-50">
            <div className="bg-slate-900/90 p-8 rounded-xl border border-yellow-600/50 text-center max-w-md shadow-2xl">
              <h2 className="text-3xl text-yellow-100 font-magic mb-6">Ready to Fly?</h2>
              <div className="text-left bg-black/40 p-4 rounded mb-6 text-gray-300 space-y-2 font-mono text-sm border border-slate-700">
                <p><span className="text-yellow-500 font-bold">W</span> - Fly Forward</p>
                <p><span className="text-yellow-500 font-bold">A / D</span> - Steer Left / Right</p>
                <p><span className="text-yellow-500 font-bold">SHIFT</span> - Ascend</p>
                <p><span className="text-yellow-500 font-bold">CTRL</span> - Descend</p>
                <p><span className="text-yellow-500 font-bold">Space</span> - Turbo Boost</p>
              </div>
              <button 
                onClick={() => setGameState(GameState.PLAYING)}
                className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white font-bold rounded border border-blue-400 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]"
              >
                Mount Broom
              </button>
            </div>
          </div>
        )}

        {/* In-Game Controls Hint */}
        {gameState === GameState.PLAYING && (
          <div className="self-end bg-black/50 p-3 rounded-lg border border-white/10 backdrop-blur-sm">
            <div className="text-xs text-gray-300 font-mono space-y-1">
              <div><span className="font-bold text-yellow-400">WASD</span> to Fly</div>
              <div><span className="font-bold text-yellow-400">SHIFT</span> to Rise</div>
              <div><span className="font-bold text-yellow-400">CTRL</span> to Dive</div>
              <div><span className="font-bold text-yellow-400">SPACE</span> to Boost</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}