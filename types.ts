
export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
}

export enum WeatherState {
  CLEAR = 'CLEAR',
  RAIN = 'RAIN',
  SNOW = 'SNOW',
}

export enum PlayerMode {
  FLY = 'FLY',
  WALK = 'WALK',
}

export interface PlayerControls {
  forward: boolean;
  backward: boolean; 
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean; 
  boost: boolean;
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface MazeGrid {
  width: number;
  height: number;
  grid: number[][];
  start: Coordinate;
  end: Coordinate;
}

export interface TrainState {
  progress: number;
  speed: number;
  isStopped: boolean;
  stopTimer: number;
}
