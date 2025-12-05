
export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
}

export interface PlayerControls {
  forward: boolean;
  backward: boolean; // Added for braking/reverse
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean; // Added for descending
  boost: boolean;
}

export interface RiddleData {
  question: string;
  hint: string;
}

export interface RiddleResponse {
  isCorrect: boolean;
  feedback: string;
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
