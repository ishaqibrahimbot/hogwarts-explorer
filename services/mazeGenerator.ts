import { MazeGrid, Coordinate } from "../types";

export const generateMaze = (width: number, height: number): MazeGrid => {
  // Ensure odd dimensions for wall/path logic
  const w = width % 2 === 0 ? width + 1 : width;
  const h = height % 2 === 0 ? height + 1 : height;

  const grid: number[][] = Array(h).fill(null).map(() => Array(w).fill(1)); // 1 = Wall
  
  const visited: boolean[][] = Array(h).fill(null).map(() => Array(w).fill(false));

  const start: Coordinate = { x: 1, y: 1 };
  const stack: Coordinate[] = [start];
  
  grid[start.y][start.x] = 0;
  visited[start.y][start.x] = true;

  const directions = [
    { x: 0, y: -2 }, // Up
    { x: 0, y: 2 },  // Down
    { x: -2, y: 0 }, // Left
    { x: 2, y: 0 }   // Right
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    
    // Shuffle directions for randomness
    const shuffledDirs = directions.sort(() => Math.random() - 0.5);
    let found = false;

    for (const dir of shuffledDirs) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;

      if (nx > 0 && nx < w - 1 && ny > 0 && ny < h - 1 && !visited[ny][nx]) {
        grid[ny][nx] = 0; // Carve destination
        grid[current.y + dir.y / 2][current.x + dir.x / 2] = 0; // Carve wall between
        visited[ny][nx] = true;
        stack.push({ x: nx, y: ny });
        found = true;
        break;
      }
    }

    if (!found) {
      stack.pop();
    }
  }

  // Set End Point (furthest away roughly, or just opposite corner)
  const end: Coordinate = { x: w - 2, y: h - 2 };
  grid[end.y][end.x] = 0; 
  // Ensure the cell before the end is clear (it usually is by algorithm, but good to be safe)

  return {
    width: w,
    height: h,
    grid,
    start,
    end
  };
};