
import React, { useState, useEffect, useRef } from 'react';
import GameScene from './components/GameScene';
import { GameState, WeatherState } from './types';
import { Loader } from '@react-three/drei';

// --- Simple Audio Engine (Procedural) ---
class AudioEngine {
  ctx: AudioContext | null = null;
  windOsc: OscillatorNode | null = null;
  windGain: GainNode | null = null;
  masterGain: GainNode | null = null;

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3; // Master Volume
    this.masterGain.connect(this.ctx.destination);
    
    this.startWind();
  }

  startWind() {
    if (!this.ctx || !this.masterGain) return;
    
    // Pink Noise Buffer for Wind
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; 
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Filter to make it sound like wind (Lowpass)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.5;

    noise.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    
    noise.start();
  }

  toggleMute(muted: boolean) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.3, this.ctx!.currentTime, 0.1);
    }
  }

  setWeatherSound(weather: WeatherState) {
      // Could change filter frequency based on weather (e.g., windier in snow)
      // For simplicity, just volume tweaks
  }
}

const audio = new AudioEngine();

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [weather, setWeather] = useState<WeatherState>(WeatherState.CLEAR);
  const [muted, setMuted] = useState(false);
  const [nearMaze, setNearMaze] = useState(false);
  const [showWinBanner, setShowWinBanner] = useState(false);

  const startGame = () => {
      setGameState(GameState.PLAYING);
      audio.init(); // Initialize audio context on user interaction
  };

  const toggleWeather = () => {
      const states = [WeatherState.CLEAR, WeatherState.RAIN, WeatherState.SNOW];
      const next = states[(states.indexOf(weather) + 1) % states.length];
      setWeather(next);
      audio.setWeatherSound(next);
  };

  const toggleAudio = () => {
      setMuted(!muted);
      audio.toggleMute(!muted);
  }

  // Handle Input for Maze
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (gameState === GameState.PLAYING && nearMaze && e.key === 'Enter') {
              setGameState(GameState.MAZE);
              setShowWinBanner(false);
          }
          if (gameState === GameState.MAZE && e.key === 'Escape') {
              if (window.confirm("Abandon the Triwizard Maze?")) {
                setGameState(GameState.PLAYING);
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, nearMaze]);

  const handleWinMaze = () => {
      setShowWinBanner(true);
      setGameState(GameState.PLAYING);
      setTimeout(() => setShowWinBanner(false), 5000);
  };

  return (
    <>
      <div className="relative w-full h-full select-none overflow-hidden bg-black">
        
        {/* 3D Scene */}
        <div className="absolute inset-0 z-0">
          <GameScene 
            gameState={gameState} 
            weather={weather} 
            setNearMaze={setNearMaze}
            setWinMaze={handleWinMaze}
          />
        </div>

        {/* UI Overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
          
          {/* Header */}
          <div className="flex justify-between items-start pointer-events-auto">
            <div>
              <h1 className="text-4xl font-magic text-yellow-500 drop-shadow-md tracking-wider">Hogwarts Legacy</h1>
              <p className="text-blue-200 font-serif opacity-80">Free Roam Simulator</p>
            </div>
            
            {/* Quick Settings */}
            <div className="flex gap-2">
                <button 
                    onClick={toggleWeather}
                    className="bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded border border-slate-600 text-xs font-mono"
                >
                    Weather: {weather}
                </button>
                <button 
                    onClick={toggleAudio}
                    className="bg-slate-800/80 hover:bg-slate-700 text-white p-2 rounded border border-slate-600 text-xs font-mono"
                >
                    {muted ? 'Unmute' : 'Mute'} Audio
                </button>
            </div>
          </div>

          {/* Maze Interaction Banner */}
          {gameState === GameState.PLAYING && nearMaze && (
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-green-900/90 border-2 border-green-500 p-6 rounded-lg text-center pointer-events-auto animate-pulse">
                  <h3 className="text-2xl font-magic text-green-100 mb-2">Triwizard Maze Entrance</h3>
                  <p className="text-green-300 font-mono text-sm">A test of navigation and courage.</p>
                  <div className="mt-4 text-white font-bold bg-green-800 px-4 py-2 rounded inline-block">Press ENTER to Start</div>
              </div>
          )}

          {/* Maze Mode UI */}
          {gameState === GameState.MAZE && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center pointer-events-auto">
                   <div className="bg-black/60 px-6 py-2 rounded-full border border-green-500">
                      <span className="text-green-400 font-magic text-xl">Inside the Maze</span>
                      <p className="text-xs text-gray-400 font-mono">Reach the Trophy | ESC to Quit</p>
                   </div>
              </div>
          )}

           {/* Win Banner */}
           {showWinBanner && (
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 bg-yellow-900/95 border-4 border-yellow-500 p-10 rounded-xl text-center z-50 shadow-[0_0_50px_rgba(234,179,8,0.5)]">
                  <h2 className="text-5xl font-magic text-yellow-100 mb-4">Victory!</h2>
                  <p className="text-yellow-300 font-serif text-lg">You have conquered the Maze!</p>
              </div>
          )}

          {/* Start Screen Overlay */}
          {gameState === GameState.START && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-auto bg-black/60 backdrop-blur-sm z-50">
              <div className="bg-slate-900/90 p-8 rounded-xl border border-yellow-600/50 text-center max-w-md shadow-2xl">
                <h2 className="text-3xl text-yellow-100 font-magic mb-6">Ready to Explore?</h2>
                <div className="text-left bg-black/40 p-4 rounded mb-6 text-gray-300 space-y-2 font-mono text-sm border border-slate-700">
                  <p><span className="text-yellow-500 font-bold">W / S</span> - Move Forward/Back</p>
                  <p><span className="text-yellow-500 font-bold">A / D</span> - Steer Left/Right</p>
                  <p><span className="text-yellow-500 font-bold">SHIFT</span> - Jump / Ascend</p>
                  <p><span className="text-yellow-500 font-bold">SPACE</span> - Run / Boost</p>
                  <p><span className="text-yellow-500 font-bold">Q</span> - Toggle Walk/Fly</p>
                </div>
                <button 
                  onClick={startGame}
                  className="w-full py-3 bg-gradient-to-r from-blue-900 to-blue-700 hover:from-blue-800 hover:to-blue-600 text-white font-bold rounded border border-blue-400 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]"
                >
                  Enter World
                </button>
              </div>
            </div>
          )}

          {/* In-Game Controls Hint */}
          {gameState !== GameState.START && (
            <div className="self-end bg-black/50 p-3 rounded-lg border border-white/10 backdrop-blur-sm">
              <div className="text-xs text-gray-300 font-mono space-y-1">
                <div className="border-b border-gray-600 pb-1 mb-1 font-bold text-center">CONTROLS</div>
                
                {gameState === GameState.MAZE ? (
                    <div className="grid grid-cols-2 gap-x-4 mt-2 text-green-300">
                        <div className="col-span-2 text-center font-bold pb-2">MAZE MODE</div>
                        <div>WASD: Walk</div>
                        <div>Shift: Run</div>
                        <div>Esc: Quit</div>
                    </div>
                ) : (
                    <>
                    <div className="flex justify-between gap-4">
                        <span>Toggle Mode:</span>
                        <span className="font-bold text-yellow-400">Q</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 mt-2">
                        <div className="text-blue-300 font-bold">FLY MODE</div>
                        <div className="text-green-300 font-bold">WALK MODE</div>
                        
                        <div>WASD: Flight</div>
                        <div>WASD: Walk</div>
                        
                        <div>Shift: Up</div>
                        <div>Shift: Jump</div>
                        
                        <div>Ctrl: Down</div>
                        <div>Space: Run</div>
                        
                        <div>Space: Boost</div>
                        <div></div>
                    </div>
                    </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <Loader />
    </>
  );
}
