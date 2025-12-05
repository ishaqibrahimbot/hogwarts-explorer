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

  return (
    <>
      <div className="relative w-full h-full select-none overflow-hidden bg-black">
        
        {/* 3D Scene */}
        <div className="absolute inset-0 z-0">
          <GameScene gameState={gameState} weather={weather} />
        </div>

        {/* UI Overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
          
          {/* Header */}
          <div className="flex justify-between items-start pointer-events-auto">
            <div>
              <h1 className="text-4xl font-magic text-yellow-500 drop-shadow-md tracking-wider">Broomstick Flight</h1>
              <p className="text-blue-200 font-serif opacity-80">Explore the grounds</p>
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
                  onClick={startGame}
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
      <Loader />
    </>
  );
}