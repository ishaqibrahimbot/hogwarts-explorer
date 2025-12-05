import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Sky, Cloud, Sparkles, Environment, Loader } from '@react-three/drei';
import * as THREE from 'three';
import { GameState, TrainState, WeatherState, PlayerMode, MazeGrid } from '../types';
import { generateMaze } from '../services/mazeGenerator';

// --- Constants & Config ---
const WORLD_SIZE = 10000;
const CASTLE_POS: [number, number, number] = [0, 60, -200];
const FOREST_POS: [number, number, number] = [300, 0, 100];
const HOGSMEADE_POS: [number, number, number] = [-1500, 20, -1500];
const STATION_POS: [number, number, number] = [1500, 10, 1200];
const AZKABAN_POS: [number, number, number] = [2800, 0, 2800];
const WILLOW_POS: [number, number, number] = [-250, 0, -150]; // West of Castle
const QUIDDITCH_POS: [number, number, number] = [800, 30, -800]; // North-East
const MAZE_POS: [number, number, number] = [-800, 0, 800]; // South-West, moved away from Forest
const TREE_COUNT = 800;
const MAZE_CELL_SIZE = 15;
const MAZE_SIZE = 31; // Increased from 21 to 31 for more complexity

// --- Utility: Deterministic Random ---
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// --- Utility: Terrain Height Calculation ---
const getTerrainHeight = (x: number, z: number) => {
  // Base rolling hills
  let y = Math.sin(x * 0.005) * Math.cos(z * 0.005) * 40;
  // Large Mountains
  y += Math.sin(x * 0.002 + 10) * Math.cos(z * 0.002) * 150;
  // Detail
  y += Math.sin(x * 0.05) * Math.cos(z * 0.05) * 5;

  // 1. Flatten Castle Area (Hilltop)
  const distToCastle = Math.sqrt((x - CASTLE_POS[0])**2 + (z - CASTLE_POS[2])**2);
  if (distToCastle < 200) {
    const castleHeight = CASTLE_POS[1] - 5;
    const blend = Math.max(0, 1 - (distToCastle / 200));
    y = THREE.MathUtils.lerp(y, castleHeight, blend);
  }

  // 2. Flatten Hogsmeade Area (Valley)
  const distToHogsmeade = Math.sqrt((x - HOGSMEADE_POS[0])**2 + (z - HOGSMEADE_POS[2])**2);
  if (distToHogsmeade < 400) {
    const villageHeight = HOGSMEADE_POS[1] - 5;
    const blend = Math.max(0, 1 - (distToHogsmeade / 400));
    y = THREE.MathUtils.lerp(y, villageHeight, blend);
  }

  // 3. Flatten Station Area (Plains)
  const distToStation = Math.sqrt((x - STATION_POS[0])**2 + (z - STATION_POS[2])**2);
  if (distToStation < 400) {
    const stationHeight = STATION_POS[1] - 5;
    const blend = Math.max(0, 1 - (distToStation / 400));
    y = THREE.MathUtils.lerp(y, stationHeight, blend);
  }

  // 4. Flatten Quidditch Pitch
  const distToPitch = Math.sqrt((x - QUIDDITCH_POS[0])**2 + (z - QUIDDITCH_POS[2])**2);
  if (distToPitch < 350) {
      const pitchHeight = QUIDDITCH_POS[1] - 2;
      const blend = Math.max(0, 1 - (distToPitch / 350));
      y = THREE.MathUtils.lerp(y, pitchHeight, blend);
  }

  // 5. Lake (Underwater) - Only apply if NOT near Forest
  // The forest is around (300, 100). The lake definition below is (-300 to -50). They are distinct.
  if (x > -300 && x < -50 && z > 0 && z < 400) {
     const lakeBed = -20;
     y = Math.min(y, lakeBed);
  }

  // 6. Flatten Viaduct path slightly
  if (x > 100 && x < 500 && z > 100 && z < 500) {
      y = Math.min(y, 10);
  }

  // 7. Azkaban Island (Jagged Rock)
  const distToAzkaban = Math.sqrt((x - AZKABAN_POS[0])**2 + (z - AZKABAN_POS[2])**2);
  if (distToAzkaban < 300) {
      const azkabanBase = Math.max(0, 120 - distToAzkaban * 0.5);
      y = Math.max(y, azkabanBase);
  }

  // 8. Forbidden Forest (Ensure dry land)
  const distToForest = Math.sqrt((x - FOREST_POS[0])**2 + (z - FOREST_POS[2])**2);
  // Forest radius is roughly 700 based on generation
  if (distToForest < 700) {
      const forestBase = 5; // Raise above sea level (-20)
      // Smoothly blend if it was lower
      y = Math.max(y, forestBase + Math.sin(x*0.1)*2); 
  }

  // 9. Whomping Willow Hill (Create a mound)
  const distToWillow = Math.sqrt((x - WILLOW_POS[0])**2 + (z - WILLOW_POS[2])**2);
  if (distToWillow < 120) {
       // Create a localized hill approx height 60
       const hillHeight = 60 - (distToWillow * 0.5); // Slope down
       y = Math.max(y, hillHeight);
  }

  // 10. Flatten Maze Area (Strict Plateau)
  const distToMaze = Math.sqrt((x - MAZE_POS[0])**2 + (z - MAZE_POS[2])**2);
  const mazeFlatRadius = (MAZE_SIZE * MAZE_CELL_SIZE) / 2 + 50; // Strictly flat inside this radius
  const mazeBlendRadius = 150; // Blend area outside the flat zone

  if (distToMaze < mazeFlatRadius + mazeBlendRadius) {
      const mazeHeight = MAZE_POS[1];
      if (distToMaze <= mazeFlatRadius) {
          y = mazeHeight; // Force absolute flat
      } else {
          // Linear blend from flat radius out to blend radius
          const factor = (distToMaze - mazeFlatRadius) / mazeBlendRadius;
          y = THREE.MathUtils.lerp(mazeHeight, y, factor);
      }
  }

  return y;
};

// --- Weather System ---
const WeatherSystem = ({ weather }: { weather: WeatherState }) => {
    const count = 3000;
    const mesh = useRef<THREE.InstancedMesh>(null);
    const { camera } = useThree();
    
    // Store individual particle data
    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * 400;
            const y = Math.random() * 200;
            const z = (Math.random() - 0.5) * 400;
            const speed = 0.5 + Math.random(); 
            temp.push({ x, y, z, speed, offset: Math.random() * 100 });
        }
        return temp;
    }, []);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state, delta) => {
        if (!mesh.current || weather === WeatherState.CLEAR) return;

        // Keep particles relative to camera so they travel with player
        const cx = camera.position.x;
        const cz = camera.position.z;
        const cy = camera.position.y;

        particles.forEach((p, i) => {
            // Animate Y (Fall)
            let fallSpeed = weather === WeatherState.RAIN ? 80 : 15;
            p.y -= fallSpeed * delta * p.speed;

            // Reset height
            if (p.y < cy - 50) {
                p.y = cy + 100;
                p.x = (Math.random() - 0.5) * 300; // Reset X relative to center
                p.z = (Math.random() - 0.5) * 300; // Reset Z relative to center
            }

            // Drift for snow
            let driftX = 0;
            if (weather === WeatherState.SNOW) {
                driftX = Math.sin(state.clock.elapsedTime + p.offset) * 10 * delta;
            }

            dummy.position.set(cx + p.x + driftX, p.y, cz + p.z);
            
            // Rain stretches, Snow is round
            if (weather === WeatherState.RAIN) {
                dummy.scale.set(0.1, 2.5, 0.1);
            } else {
                dummy.scale.set(0.3, 0.3, 0.3);
            }
            
            dummy.updateMatrix();
            mesh.current!.setMatrixAt(i, dummy.matrix);
        });
        mesh.current.instanceMatrix.needsUpdate = true;
    });

    if (weather === WeatherState.CLEAR) return null;

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
            {weather === WeatherState.RAIN ? (
                <boxGeometry args={[0.2, 1, 0.2]} />
            ) : (
                <sphereGeometry args={[0.5, 4, 4]} />
            )}
            <meshBasicMaterial 
                color={weather === WeatherState.RAIN ? "#aaddff" : "#ffffff"} 
                transparent 
                opacity={0.6} 
            />
        </instancedMesh>
    );
};

// --- Assets: Textures & Materials ---
const Terrain = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const geometry = useMemo(() => {
    // Increased segments for larger world
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 256, 256);
    const pos = geo.attributes.position;
    const colors = [];
    const color = new THREE.Color();
    
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getY(i); 
      const height = getTerrainHeight(x, -z);
      pos.setZ(i, height);

      // Vertex Coloring Logic
      if (height < -15) {
          // Sand/Underwater
          color.set('#e0cda4');
      } else if (height < 5) {
          // Shore/Mud
          color.set('#5d4037');
      } else if (height < 120) {
          // Grass with variation
          // Simple noise based on position
          const noise = Math.sin(x * 0.05) * Math.cos(z * 0.05);
          if (noise > 0.2) color.set('#3a6b35'); // Darker Green
          else color.set('#2d5a27'); // Standard Green
      } else if (height < 180) {
          // Rock/Mountain
          color.set('#696969');
      } else {
          // Snow
          color.set('#ffffff');
      }
      colors.push(color.r, color.g, color.b);
    }
    
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group>
      {/* Land */}
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow geometry={geometry}>
        <meshStandardMaterial 
          vertexColors
          roughness={0.9} 
          metalness={0.1}
          flatShading
        />
      </mesh>
      
      {/* The Black Lake Water */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-175, -5, 200]}>
        <planeGeometry args={[250, 400]} />
        <meshPhysicalMaterial 
          color="#0a1a2a" 
          transmission={0.6} 
          opacity={0.8}
          roughness={0.2}
          metalness={0.6}
          transparent
        />
      </mesh>
      
      {/* Sea around Azkaban/Edges */}
       <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -20, 0]}>
        <planeGeometry args={[WORLD_SIZE, WORLD_SIZE]} />
        <meshPhysicalMaterial 
          color="#051020" 
          roughness={0.1} 
          metalness={0.5} 
        />
      </mesh>
    </group>
  );
};

// --- Scatter: Grass, Rocks, Bushes ---
const GroundDetails = () => {
    const grassRef = useRef<THREE.InstancedMesh>(null);
    const rockRef = useRef<THREE.InstancedMesh>(null);
    const bushRef = useRef<THREE.InstancedMesh>(null);
    
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const GRASS_COUNT = 8000;
    const ROCK_COUNT = 500;
    const BUSH_COUNT = 600;

    useEffect(() => {
        // --- Generate Grass ---
        if (grassRef.current) {
            let idx = 0;
            for(let i=0; i<GRASS_COUNT; i++) {
                 // Random Position
                 const x = (Math.random() - 0.5) * 5000;
                 const z = (Math.random() - 0.5) * 5000;
                 const y = getTerrainHeight(x, z);

                 // Filter: Only on land, not too high (snow), not in water
                 const isWater = y < 0;
                 const isSnow = y > 150;
                 // Avoid POIs roughly
                 const distCastle = Math.sqrt((x-CASTLE_POS[0])**2 + (z-CASTLE_POS[2])**2);
                 const distHogs = Math.sqrt((x-HOGSMEADE_POS[0])**2 + (z-HOGSMEADE_POS[2])**2);
                 const distQuid = Math.sqrt((x-QUIDDITCH_POS[0])**2 + (z-QUIDDITCH_POS[2])**2);
                 const distMaze = Math.sqrt((x-MAZE_POS[0])**2 + (z-MAZE_POS[2])**2);

                 // Increased buffer for maze to prevent grass clipping into flat maze floor
                 if (!isWater && !isSnow && distCastle > 150 && distHogs > 250 && distQuid > 200 && distMaze > 350) {
                     dummy.position.set(x, y, z);
                     dummy.rotation.set(0, Math.random() * Math.PI, 0);
                     const s = 0.5 + Math.random() * 1.5;
                     dummy.scale.set(s, s, s);
                     dummy.updateMatrix();
                     grassRef.current.setMatrixAt(idx++, dummy.matrix);
                 } else {
                     // Hide unused
                     dummy.position.set(0, -500, 0);
                     dummy.updateMatrix();
                     grassRef.current.setMatrixAt(i, dummy.matrix);
                 }
            }
            grassRef.current.instanceMatrix.needsUpdate = true;
        }

        // --- Generate Rocks ---
        if (rockRef.current) {
             let idx = 0;
             for(let i=0; i<ROCK_COUNT; i++) {
                 const x = (Math.random() - 0.5) * 5000;
                 const z = (Math.random() - 0.5) * 5000;
                 const y = getTerrainHeight(x, z);
                 
                 // Rocks appear more on slopes/mountains or shores
                 const isDeepWater = y < -10;
                 const isFlat = y > 0 && y < 20; 

                 if (!isDeepWater && (y > 50 || Math.random() > 0.7)) {
                    dummy.position.set(x, y + 1, z); // Slightly embedded
                    dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
                    const s = 2 + Math.random() * 5;
                    dummy.scale.set(s, s, s);
                    dummy.updateMatrix();
                    rockRef.current.setMatrixAt(idx++, dummy.matrix);
                 } else {
                    dummy.position.set(0, -500, 0);
                    dummy.updateMatrix();
                    rockRef.current.setMatrixAt(i, dummy.matrix);
                 }
             }
             rockRef.current.instanceMatrix.needsUpdate = true;
        }

        // --- Generate Bushes ---
        if (bushRef.current) {
            let idx = 0;
            for(let i=0; i<BUSH_COUNT; i++) {
                const x = (Math.random() - 0.5) * 5000;
                const z = (Math.random() - 0.5) * 5000;
                const y = getTerrainHeight(x, z);

                const isWater = y < 0;
                const isSnow = y > 120;
                const distCastle = Math.sqrt((x-CASTLE_POS[0])**2 + (z-CASTLE_POS[2])**2);
                const distMaze = Math.sqrt((x-MAZE_POS[0])**2 + (z-MAZE_POS[2])**2);

                if (!isWater && !isSnow && distCastle > 100 && distMaze > 350) {
                   dummy.position.set(x, y + 1, z);
                   dummy.rotation.set(0, Math.random() * Math.PI, 0);
                   const s = 1.5 + Math.random() * 2;
                   dummy.scale.set(s, s, s);
                   dummy.updateMatrix();
                   bushRef.current.setMatrixAt(idx++, dummy.matrix);
                } else {
                   dummy.position.set(0, -500, 0);
                   dummy.updateMatrix();
                   bushRef.current.setMatrixAt(i, dummy.matrix);
                }
            }
            bushRef.current.instanceMatrix.needsUpdate = true;
        }

    }, [dummy]);

    return (
        <group>
            {/* Grass (Green Tetrahedrons) */}
            <instancedMesh ref={grassRef} args={[undefined, undefined, GRASS_COUNT]} frustumCulled={false}>
                <coneGeometry args={[0.5, 2, 3]} /> {/* Low poly blade/tuft */}
                <meshStandardMaterial color="#3a6b35" />
            </instancedMesh>
            
            {/* Rocks (Grey Dodecahedrons) */}
            <instancedMesh ref={rockRef} args={[undefined, undefined, ROCK_COUNT]} frustumCulled={false}>
                <dodecahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color="#666" flatShading />
            </instancedMesh>

            {/* Bushes (Dark Green Icosahedrons) */}
            <instancedMesh ref={bushRef} args={[undefined, undefined, BUSH_COUNT]} frustumCulled={false}>
                <icosahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color="#1a3c1a" flatShading />
            </instancedMesh>
        </group>
    )
}

// --- Hogsmeade Village ---
const Hogsmeade = () => {
    const houses = useMemo(() => {
        const items = [];
        for(let i=0; i<20; i++) {
            const angle = (i / 20) * Math.PI * 2;
            const r = 100 + seededRandom(i)*100;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;
            items.push({ x, z, rot: -angle });
        }
        return items;
    }, []);

    return (
        <group position={HOGSMEADE_POS}>
            {/* Village Center Market */}
            <mesh position={[0, 0, 0]} receiveShadow castShadow>
                <cylinderGeometry args={[20, 20, 2, 8]} />
                <meshStandardMaterial color="#555" />
            </mesh>

            {houses.map((h, i) => (
                <group key={i} position={[h.x, 5, h.z]} rotation={[0, h.rot, 0]}>
                     {/* Base */}
                    <mesh position={[0, 10, 0]} castShadow receiveShadow>
                        <boxGeometry args={[25, 20, 30]} />
                        <meshStandardMaterial color="#6e5e4e" />
                    </mesh>
                    {/* Roof */}
                    <mesh position={[0, 25, 0]} rotation={[0, Math.PI/4, 0]}>
                        <coneGeometry args={[20, 15, 4]} /> {/* Pyramid roof */}
                        <meshStandardMaterial color="#222" />
                    </mesh>
                     {/* Snow on roof */}
                    <mesh position={[0, 28, 0]} rotation={[0, Math.PI/4, 0]}>
                         <coneGeometry args={[18, 10, 4]} />
                         <meshStandardMaterial color="#eee" />
                    </mesh>
                    {/* Chimney */}
                    <mesh position={[8, 28, 5]}>
                        <boxGeometry args={[4, 10, 4]} />
                        <meshStandardMaterial color="#444" />
                    </mesh>
                    <Sparkles position={[8, 35, 5]} count={5} scale={5} size={4} speed={0.4} opacity={0.5} color="#aaa" />
                </group>
            ))}
            
            {/* Label */}
            <pointLight position={[0, 50, 0]} color="#ffaa00" intensity={5} distance={200} />
        </group>
    )
}

// --- King's Cross / Hogwarts Express Area ---
const KingsCross = () => {
    return (
        <group position={STATION_POS}>
            {/* Platform */}
            <mesh position={[0, 2, 0]} receiveShadow>
                <boxGeometry args={[300, 4, 60]} />
                <meshStandardMaterial color="#5a5a5a" />
            </mesh>
            {/* Roof */}
            <mesh position={[0, 30, 0]} rotation={[0, 0, Math.PI/2]}>
                <cylinderGeometry args={[40, 40, 300, 3, 1, false, 0, Math.PI]} />
                <meshStandardMaterial color="#222" side={THREE.DoubleSide} />
            </mesh>
            {/* Pillars */}
            <mesh position={[-100, 15, 20]}> <cylinderGeometry args={[2,2,30]} /> <meshStandardMaterial color="#333" /> </mesh>
            <mesh position={[100, 15, 20]}> <cylinderGeometry args={[2,2,30]} /> <meshStandardMaterial color="#333" /> </mesh>
            <mesh position={[-100, 15, -20]}> <cylinderGeometry args={[2,2,30]} /> <meshStandardMaterial color="#333" /> </mesh>
            <mesh position={[100, 15, -20]}> <cylinderGeometry args={[2,2,30]} /> <meshStandardMaterial color="#333" /> </mesh>
        </group>
    )
}

// --- Hogwarts Castle Construction (Low Poly) ---
const Castle = () => {
  return (
    <group position={CASTLE_POS}>
      {/* Main Keep */}
      <mesh position={[0, 40, 0]} castShadow receiveShadow>
        <boxGeometry args={[60, 80, 60]} />
        <meshStandardMaterial color="#6b6b6b" roughness={0.7} />
      </mesh>
      
      {/* Great Hall */}
      <mesh position={[70, 20, 10]} castShadow receiveShadow>
        <boxGeometry args={[80, 40, 40]} />
        <meshStandardMaterial color="#6b6b6b" roughness={0.7} />
      </mesh>
      <mesh position={[70, 45, 10]} rotation={[0, 0, 0.785]}>
        <boxGeometry args={[56, 56, 40]} /> {/* Roof */}
        <meshStandardMaterial color="#2a2a35" roughness={0.9} />
      </mesh>

      {/* Towers */}
      <Tower position={[-40, 0, -40]} height={120} width={15} />
      <Tower position={[40, 0, -40]} height={100} width={12} />
      <Tower position={[-40, 0, 40]} height={90} width={12} />
      <Tower position={[120, 0, 10]} height={80} width={10} />
      
      {/* Bridge */}
      <mesh position={[-80, 30, 0]} rotation={[0, 0, -0.1]} castShadow>
        <boxGeometry args={[100, 10, 10]} />
        <meshStandardMaterial color="#5a5a5a" />
      </mesh>
      <group position={[-130, 20, 0]}>
          <Tower position={[0,0,0]} height={60} width={15} />
      </group>

      {/* Windows (Glow) */}
      <pointLight position={[0, 50, 32]} color="#ffaa00" intensity={5} distance={60} decay={2} />
      <pointLight position={[70, 30, 32]} color="#ffaa00" intensity={5} distance={60} decay={2} />
    </group>
  );
};

const Tower = ({ position, height, width }: { position: [number, number, number], height: number, width: number }) => {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[width, width, height, 8]} />
        <meshStandardMaterial color="#6b6b6b" roughness={0.7} />
      </mesh>
      <mesh position={[0, height + width, 0]} castShadow>
        <coneGeometry args={[width + 2, width * 2, 8]} />
        <meshStandardMaterial color="#2a2a35" />
      </mesh>
    </group>
  );
};

// --- Whomping Willow ---
const WhompingWillow = () => {
    // Positioned on a hill west of castle
    const position = useMemo(() => new THREE.Vector3(WILLOW_POS[0], 0, WILLOW_POS[2]), []);
    const height = getTerrainHeight(position.x, position.z);
    const groupRef = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (!groupRef.current) return;
        const t = state.clock.getElapsedTime();
        // Animate branches thashing
        groupRef.current.children.forEach((branch, i) => {
            if (i === 0) return; // Skip trunk
            const speed = 1 + (i % 3);
            const offset = i;
            branch.rotation.z = Math.sin(t * speed + offset) * 0.5;
            branch.rotation.x = Math.cos(t * speed * 0.7 + offset) * 0.5;
        });
    });

    const branches = useMemo(() => {
        const b = [];
        for (let i = 0; i < 8; i++) {
            b.push(
                <group key={i} position={[0, 15, 0]} rotation={[0, (i/8) * Math.PI * 2, Math.PI/4]}>
                    <mesh position={[0, 10, 0]}>
                        <cylinderGeometry args={[1, 2, 25, 6]} />
                        <meshStandardMaterial color="#3e2723" />
                    </mesh>
                    <mesh position={[0, 22, 0]}>
                         <cylinderGeometry args={[0.5, 1, 15, 6]} />
                         <meshStandardMaterial color="#3e2723" />
                    </mesh>
                </group>
            )
        }
        return b;
    }, []);

    return (
        <group ref={groupRef} position={[position.x, height, position.z]}>
            {/* Trunk */}
            <mesh position={[0, 10, 0]} castShadow>
                <cylinderGeometry args={[4, 6, 20, 8]} />
                <meshStandardMaterial color="#3e2723" />
            </mesh>
            {branches}
        </group>
    )
}

// --- Azkaban & Dementors ---
const Azkaban = () => {
    const dementors = useMemo(() => {
        const d = [];
        for (let i=0; i<30; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 60 + Math.random() * 100;
            const height = 50 + Math.random() * 100;
            d.push({ angle, radius, height, speed: 0.2 + Math.random() * 0.3 });
        }
        return d;
    }, []);

    const dementorRef = useRef<THREE.Group>(null);
    useFrame((state) => {
        if (!dementorRef.current) return;
        const t = state.clock.getElapsedTime();
        dementorRef.current.children.forEach((child, i) => {
             const data = dementors[i];
             const curAngle = data.angle + t * data.speed * 0.5;
             child.position.x = Math.cos(curAngle) * data.radius;
             child.position.z = Math.sin(curAngle) * data.radius;
             child.position.y = data.height + Math.sin(t * 2 + i) * 5;
             child.lookAt(0, data.height, 0);
        });
    });

    return (
        <group position={AZKABAN_POS}>
            {/* Fortress Tower */}
            <mesh position={[0, 80, 0]} castShadow>
                <cylinderGeometry args={[30, 50, 200, 3]} /> {/* Triangular Prism-ish */}
                <meshStandardMaterial color="#111" roughness={0.9} />
            </mesh>
            <mesh position={[0, 200, 0]}>
                 <coneGeometry args={[30, 60, 3]} />
                 <meshStandardMaterial color="#000" />
            </mesh>
            {/* Spikes */}
            <mesh position={[20, 150, 0]} rotation={[0,0,-0.5]}> <coneGeometry args={[5, 40, 4]} /> <meshStandardMaterial color="#111" /> </mesh>
            <mesh position={[-20, 120, 20]} rotation={[0.5,0,0.5]}> <coneGeometry args={[5, 40, 4]} /> <meshStandardMaterial color="#111" /> </mesh>
            
            {/* Dementors */}
            <group ref={dementorRef}>
                {dementors.map((d, i) => (
                    <group key={i}>
                         <mesh rotation={[Math.PI/2, 0, 0]}>
                             <cylinderGeometry args={[0, 4, 12, 8]} />
                             <meshStandardMaterial color="#000" transparent opacity={0.8} />
                         </mesh>
                         <mesh position={[0, 0, 4]}>
                             <sphereGeometry args={[2]} />
                             <meshStandardMaterial color="#000" />
                         </mesh>
                         {/* Ragged Cloth Trails */}
                         <mesh position={[0, -2, -4]} rotation={[Math.PI/4, 0, 0]}>
                             <planeGeometry args={[6, 10]} />
                             <meshStandardMaterial color="#000" side={THREE.DoubleSide} transparent opacity={0.6} />
                         </mesh>
                    </group>
                ))}
            </group>

             <pointLight position={[0, 100, 0]} color="#112233" intensity={20} distance={400} />
        </group>
    )
}

// --- Quidditch Pitch ---

// Reuse/Simplify Wizard for NPC
const NPCWizard = ({ color, ...props }: any) => (
    <group {...props}>
       {/* Broom */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.05, 3.5, 8]} />
          <meshStandardMaterial color="#4a3c31" />
      </mesh>
      {/* Wizard Body */}
      <mesh position={[0, 0.6, 0.2]} rotation={[0.2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.4, 1.2, 8]} />
          <meshStandardMaterial color={color} /> 
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.3, 0.3]} castShadow>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshStandardMaterial color="#ffdbac" />
      </mesh>
    </group>
)

// --- Roaming NPCs ---
const WalkerNPC: React.FC<{ 
    center: [number, number, number], 
    radius: number, 
    color: string, 
    playerRef: React.RefObject<THREE.Group>,
    onInteractionChange: (hasInteraction: boolean, text?: string) => void,
    dialoguePool: string[]
}> = ({ center, radius, color, playerRef, onInteractionChange, dialoguePool }) => {
    const ref = useRef<THREE.Group>(null);
    const [target, setTarget] = useState(new THREE.Vector3());
    const speed = 2 + Math.random() * 2; // Walking speed
    // Use a ref to track interaction state to avoid constant state updates in useFrame loop
    const isInteractable = useRef(false);

    const pickTarget = () => {
        const r = Math.random() * radius;
        const theta = Math.random() * Math.PI * 2;
        return new THREE.Vector3(
            center[0] + Math.cos(theta) * r,
            0,
            center[2] + Math.sin(theta) * r
        );
    };

    useEffect(() => {
        // Initialize position
        const start = pickTarget();
        start.y = getTerrainHeight(start.x, start.z);
        if(ref.current) ref.current.position.copy(start);
        setTarget(pickTarget());
    }, []);

    useFrame((state, delta) => {
        if (!ref.current) return;
        
        // --- Movement Logic ---
        const pos = ref.current.position;
        const dir = new THREE.Vector3().subVectors(target, pos);
        dir.y = 0; 
        const dist = dir.length();

        if (dist < 2) {
            setTarget(pickTarget());
        } else {
            dir.normalize();
            pos.add(dir.multiplyScalar(speed * delta));
            pos.y = getTerrainHeight(pos.x, pos.z) + 0.1;
            ref.current.lookAt(target.x, pos.y, target.z);
        }

        // --- Interaction Logic ---
        if (playerRef.current) {
            const distToPlayer = pos.distanceTo(playerRef.current.position);
            const closeEnough = distToPlayer < 6.0;

            if (closeEnough && !isInteractable.current) {
                isInteractable.current = true;
                const randomText = dialoguePool[Math.floor(Math.random() * dialoguePool.length)];
                onInteractionChange(true, randomText);
            } else if (!closeEnough && isInteractable.current) {
                isInteractable.current = false;
                onInteractionChange(false);
            }
        }
    });

    return (
        <group ref={ref}>
             {/* Simple Walker Visualization (No Broom) */}
            <mesh position={[0, 1, 0]} castShadow>
                <cylinderGeometry args={[0.3, 0.4, 2, 8]} />
                <meshStandardMaterial color={color} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 2.2, 0]} castShadow>
                <sphereGeometry args={[0.25, 16, 16]} />
                <meshStandardMaterial color="#ffdbac" />
            </mesh>
            {/* Hat */}
            <mesh position={[0, 2.5, 0]} castShadow>
                 <coneGeometry args={[0.3, 0.6, 16]} />
                 <meshStandardMaterial color="#111" />
            </mesh>
        </group>
    )
}

const Population = ({ playerRef, onNPCProx }: { playerRef: React.RefObject<THREE.Group>, onNPCProx: (hasInteraction: boolean, text?: string) => void }) => {
    const hogsmeadeNPCs = useMemo(() => {
        const npcs = [];
        for(let i=0; i<15; i++) npcs.push(i);
        return npcs;
    }, []);

    const hogwartsNPCs = useMemo(() => {
        const npcs = [];
        for(let i=0; i<10; i++) npcs.push(i);
        return npcs;
    }, []);

    const colors = ["#740001", "#1a472a", "#0e1a40", "#ecb939", "#333", "#555", "#4a3c31"];
    const randomColor = () => colors[Math.floor(Math.random() * colors.length)];

    const hogsmeadeDialogue = [
        "Fancy a Butterbeer at the Three Broomsticks?",
        "I heard Zonko's has a sale on Dungbombs.",
        "It's freezing today, isn't it?",
        "Have you seen the Shrieking Shack? Spooky.",
        "I need to buy some new quills.",
        "Look at that broom go!",
        "Are you a student or a visitor?"
    ];

    const hogwartsDialogue = [
        "I'm late for Potions class!",
        "10 points to Gryffindor!",
        "Watch out for Peeves.",
        "I hope we have a feast tonight.",
        "Have you seen my toad?",
        "The Giant Squid is active today.",
        "Professor Snape is in a mood..."
    ];

    return (
        <group>
            {/* Hogsmeade Walkers */}
            {hogsmeadeNPCs.map(i => (
                <WalkerNPC 
                    key={`hogs-${i}`} 
                    center={HOGSMEADE_POS} 
                    radius={250} 
                    color={randomColor()} 
                    playerRef={playerRef}
                    onInteractionChange={onNPCProx}
                    dialoguePool={hogsmeadeDialogue}
                />
            ))}
            
            {/* Hogwarts Walkers */}
            {hogwartsNPCs.map(i => (
                <WalkerNPC 
                    key={`hog-${i}`} 
                    center={[CASTLE_POS[0], CASTLE_POS[1], CASTLE_POS[2] + 50]} 
                    radius={80} 
                    color={randomColor()} 
                    playerRef={playerRef}
                    onInteractionChange={onNPCProx}
                    dialoguePool={hogwartsDialogue}
                />
            ))}
        </group>
    )
}
  
const QuidditchMatch = () => {
     const ballRef = useRef<THREE.Mesh>(null);
     const playersRef = useRef<THREE.Group>(null);
     
     useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        
        // Ball movement (chaotic figure 8)
        if (ballRef.current) {
            ballRef.current.position.x = Math.sin(t * 1.5) * 60;
            ballRef.current.position.z = Math.cos(t * 0.8) * 100;
            ballRef.current.position.y = 30 + Math.sin(t * 2) * 15;
        }
        
        // Players chasing logic
        if (playersRef.current) {
           playersRef.current.children.forEach((player, i) => {
               const offset = i * 1.5;
               const tx = Math.sin(t * 1.2 + offset) * 60;
               const tz = Math.cos(t * 0.9 + offset) * 100;
               const ty = 30 + Math.sin(t * 1.8 + offset) * 15;
               
               // Smoothly move towards target
               player.position.x += (tx - player.position.x) * 0.05;
               player.position.z += (tz - player.position.z) * 0.05;
               player.position.y += (ty - player.position.y) * 0.05;
               
               player.lookAt(tx, ty, tz);
               // Bank logic
               player.rotation.z = (tx - player.position.x) * -0.05;
           })
        }
     })
  
     return (
        <group>
           <mesh ref={ballRef} castShadow>
              <sphereGeometry args={[1.5, 16, 16]} />
              <meshStandardMaterial color="#800000" />
           </mesh>
           <group ref={playersRef}>
               {/* Gryffindor Team */}
               <NPCWizard position={[10, 30, 0]} color="#740001" />
               <NPCWizard position={[-10, 30, 20]} color="#740001" />
               {/* Slytherin Team */}
               <NPCWizard position={[0, 30, -20]} color="#1a472a" />
               <NPCWizard position={[20, 40, 0]} color="#1a472a" />
           </group>
        </group>
     )
  }

const Hoop = ({position, height}: {position: [number,number,number], height: number}) => (
    <group position={position}>
        <mesh position={[0, height/2, 0]} castShadow>
            <cylinderGeometry args={[0.5, 0.5, height]} />
            <meshStandardMaterial color="#ffd700" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Changed rotation to [0,0,0] to make hoops vertical and face Z direction */}
        <mesh position={[0, height, 0]} rotation={[0, 0, 0]} castShadow>
            <torusGeometry args={[6, 0.5, 8, 24]} />
            <meshStandardMaterial color="#ffd700" metalness={0.8} roughness={0.2} />
        </mesh>
    </group>
);

const TowerStand: React.FC<{position: [number,number,number], color:string}> = ({position, color}) => (
    <group position={position}>
         <mesh position={[0, 25, 0]} castShadow>
             <cylinderGeometry args={[8, 8, 50, 8]} />
             <meshStandardMaterial color="#888" /> {/* Stone base */}
         </mesh>
         <mesh position={[0, 50, 0]} castShadow>
             <cylinderGeometry args={[9, 8, 10, 8]} />
             <meshStandardMaterial color={color} /> {/* House colors */}
         </mesh>
         <mesh position={[0, 65, 0]} castShadow>
             <coneGeometry args={[10, 20, 8]} />
             <meshStandardMaterial color="#222" /> {/* Roof */}
         </mesh>
         {/* Audience Sparkles */}
         <Sparkles position={[0, 55, 0]} count={40} scale={[6, 10, 6]} size={4} speed={0.4} opacity={0.8} color={color} />
    </group>
  );

const QuidditchPitch = () => {
  const towers = useMemo(() => {
    const t: { pos: [number, number, number]; color: string }[] = [];
    const colors = ["#740001", "#1a472a", "#0e1a40", "#ecb939"]; // Gryffindor, Slytherin, Ravenclaw, Hufflepuff
    for(let i=0; i<16; i++) {
        const angle = (i/16) * Math.PI * 2;
        const x = Math.cos(angle) * 120; // Radius slightly outside field
        const z = Math.sin(angle) * 200;
        const color = colors[i % 4];
        t.push({ pos: [x, 0, z] as [number, number, number], color });
    }
    return t;
  }, []);

  return (
    <group position={QUIDDITCH_POS}>
      {/* Field */}
      <mesh rotation={[-Math.PI/2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 350]} /> {/* Long along Z */}
        <meshStandardMaterial color="#2d5a27" roughness={1} />
      </mesh>
      
      {/* Border Walls */}
      <mesh position={[100, 5, 0]} castShadow><boxGeometry args={[4, 10, 350]} /><meshStandardMaterial color="#666" /></mesh>
      <mesh position={[-100, 5, 0]} castShadow><boxGeometry args={[4, 10, 350]} /><meshStandardMaterial color="#666" /></mesh>
      <mesh position={[0, 5, 175]} rotation={[0, Math.PI/2, 0]} castShadow><boxGeometry args={[4, 10, 200]} /><meshStandardMaterial color="#666" /></mesh>
      <mesh position={[0, 5, -175]} rotation={[0, Math.PI/2, 0]} castShadow><boxGeometry args={[4, 10, 200]} /><meshStandardMaterial color="#666" /></mesh>

      {/* Hoops - North End (-Z) */}
      <Hoop position={[0, 0, -160]} height={35} />
      <Hoop position={[-20, 0, -160]} height={20} />
      <Hoop position={[20, 0, -160]} height={20} />

      {/* Hoops - South End (+Z) */}
      <Hoop position={[0, 0, 160]} height={35} />
      <Hoop position={[-20, 0, 160]} height={20} />
      <Hoop position={[20, 0, 160]} height={20} />

      {/* Towers */}
      {towers.map((t, i) => <TowerStand key={i} position={t.pos} color={t.color} />)}
      
      {/* Active Game */}
      <QuidditchMatch />
    </group>
  )
}

// --- Maze Structure ---
const MazeStructure = ({ mazeData }: { mazeData: MazeGrid }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    
    useEffect(() => {
        if (!meshRef.current) return;
        let idx = 0;
        
        // Calculate offsets to center the maze around MAZE_POS
        // Grid (0,0) will be top-left corner
        const width = mazeData.width * MAZE_CELL_SIZE;
        const height = mazeData.height * MAZE_CELL_SIZE;
        const offsetX = -width / 2;
        const offsetZ = -height / 2;

        for (let y = 0; y < mazeData.height; y++) {
            for (let x = 0; x < mazeData.width; x++) {
                if (mazeData.grid[y][x] === 1) { // 1 is Wall
                    // Position
                    dummy.position.set(
                        offsetX + x * MAZE_CELL_SIZE, 
                        7.5, // Height/2 (15 tall)
                        offsetZ + y * MAZE_CELL_SIZE
                    );
                    dummy.scale.set(1, 1, 1);
                    dummy.updateMatrix();
                    meshRef.current.setMatrixAt(idx++, dummy.matrix);
                }
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [mazeData, dummy]);

    return (
        <group position={MAZE_POS}>
             {/* Floor */}
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, 0.1, 0]} receiveShadow>
                <planeGeometry args={[mazeData.width * MAZE_CELL_SIZE + 20, mazeData.height * MAZE_CELL_SIZE + 20]} />
                <meshStandardMaterial color="#1a2f1a" />
            </mesh>

            {/* Walls */}
            {/* Added frustumCulled={false} to fix disappearing maze bug */}
            <instancedMesh ref={meshRef} args={[undefined, undefined, mazeData.width * mazeData.height]} castShadow receiveShadow frustumCulled={false}>
                <boxGeometry args={[MAZE_CELL_SIZE, 15, MAZE_CELL_SIZE]} />
                <meshStandardMaterial color="#0b290b" roughness={0.9} />
            </instancedMesh>
            
            {/* End Goal Marker */}
            <group position={[
                (mazeData.end.x - mazeData.width/2) * MAZE_CELL_SIZE,
                5,
                (mazeData.end.y - mazeData.height/2) * MAZE_CELL_SIZE
            ]}>
                <mesh>
                    <cylinderGeometry args={[0, 4, 8, 4]} /> {/* Trophy Cup Shape */}
                    <meshStandardMaterial color="#ffd700" metalness={0.9} roughness={0.1} />
                </mesh>
                <pointLight intensity={3} color="#aaddff" distance={20} />
                <Sparkles count={20} scale={5} size={6} speed={1} color="#ffd700" />
            </group>
        </group>
    )
}

// --- Forbidden Forest ---
const getTreeData = () => {
  const trees = [];
  // Center forest
  for (let i = 0; i < TREE_COUNT; i++) {
    const r1 = seededRandom(i * 123);
    const r2 = seededRandom(i * 321);
    const r3 = seededRandom(i * 789);
    
    const angle = r1 * Math.PI * 2;
    // Increased radius for larger forest presence
    const radius = 100 + r2 * 600; 
    const x = FOREST_POS[0] + Math.cos(angle) * radius * 0.5 + (r3 - 0.5) * 200;
    const z = FOREST_POS[2] + Math.sin(angle) * radius * 0.5 + (r3 - 0.5) * 200;
    
    const y = getTerrainHeight(x, z);
    const scale = 3 + r3 * 4; 
    trees.push({ position: new THREE.Vector3(x, y, z), scale });
  }
  return trees;
};

const ForbiddenForest = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const treeData = useMemo(() => getTreeData(), []);

  useEffect(() => {
    if (!meshRef.current) return;
    
    treeData.forEach((tree, i) => {
      dummy.position.copy(tree.position);
      dummy.position.y += tree.scale * 2.5;
      dummy.scale.set(tree.scale, tree.scale, tree.scale);
      dummy.rotation.y = seededRandom(i) * Math.PI;
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    
    // FIX for disappearing trees: Compute bounding sphere for culling
    if (meshRef.current.geometry) {
        meshRef.current.geometry.computeBoundingSphere();
    }
  }, [dummy, treeData]);

  return (
    // FIX: Disable frustumCulled to prevent trees from disappearing when looking away from origin
    <instancedMesh ref={meshRef} args={[undefined, undefined, TREE_COUNT]} castShadow receiveShadow frustumCulled={false}>
      <coneGeometry args={[2, 10, 8]} />
      <meshStandardMaterial color="#1a2f1a" roughness={0.9} />
    </instancedMesh>
  );
};

// --- Hogwarts Express & Tracks ---

// Define path control points
const TRAIN_PATH_POINTS = [
  new THREE.Vector3(1500, 14, 1200), // Stop 1: Station
  new THREE.Vector3(1000, 20, 800),  // Winding
  new THREE.Vector3(600, 30, 400),   // Valley
  new THREE.Vector3(300, 45, 200),   // Viaduct Start
  new THREE.Vector3(0, 50, 50),      // Viaduct End / Near Castle
  new THREE.Vector3(-50, 50, -150),  // Stop 2: Hogwarts
  new THREE.Vector3(-300, 40, 200),  // Loop back path
  new THREE.Vector3(0, 30, 800),     // Winding back
  new THREE.Vector3(800, 20, 1300),  // Approaching Station
  new THREE.Vector3(1500, 14, 1200)  // Loop Close
];

const TrainSystem = () => {
  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3(TRAIN_PATH_POINTS, true, 'centripetal', 0.5);
  }, []);

  return (
    <group>
      <TrainTrack curve={curve} />
      <Viaduct curve={curve} />
      <HogwartsExpress curve={curve} />
    </group>
  )
}

const TrainTrack = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
  const linePoints = useMemo(() => curve.getPoints(300), [curve]);
  
  // Create sleeper positions
  const sleepers = useMemo(() => {
    const points = curve.getSpacedPoints(400); // More dense for sleepers
    const sleeperData = [];
    for(let i=0; i<points.length - 1; i++) {
        const p = points[i];
        const nextP = points[i+1];
        const dir = new THREE.Vector3().subVectors(nextP, p).normalize();
        
        // Correct sleeper orientation relative to track
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
        
        sleeperData.push({ pos: p, rot: quaternion });
    }
    return sleeperData;
  }, [curve]);

  return (
    <group>
        {/* Rails */}
        <mesh position={[0, 0.5, 0]}>
            <tubeGeometry args={[curve, 300, 0.3, 8, true]} />
            <meshStandardMaterial color="#333" />
        </mesh>
        
        {/* Sleepers */}
        {sleepers.map((s, i) => (
             <mesh key={i} position={s.pos} quaternion={s.rot}>
                 <boxGeometry args={[0.5, 0.5, 4]} />
                 <meshStandardMaterial color="#3e2723" />
             </mesh>
        ))}
    </group>
  );
};

const Viaduct = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
    // Generate pillars where the track is significantly higher than terrain
    const pillars = useMemo(() => {
        const points = curve.getSpacedPoints(100);
        const pList = [];
        for(const p of points) {
            const terrainY = getTerrainHeight(p.x, p.z);
            if (p.y - terrainY > 15) { // If bridge is 15 units above ground
                 pList.push({ pos: p, height: p.y - terrainY });
            }
        }
        return pList;
    }, [curve]);

    return (
        <group>
            {pillars.map((p, i) => (
                // Only place pillars every few points to create arches
                i % 4 === 0 && (
                    <group key={i} position={[p.pos.x, p.pos.y - p.height/2, p.pos.z]}>
                        <mesh receiveShadow castShadow>
                            <boxGeometry args={[8, p.height, 8]} />
                            <meshStandardMaterial color="#78909c" />
                        </mesh>
                        {/* Arch top */}
                        <mesh position={[0, p.height/2 - 2, 0]}>
                             <boxGeometry args={[12, 4, 10]} />
                             <meshStandardMaterial color="#78909c" />
                        </mesh>
                    </group>
                )
            ))}
        </group>
    )
}

const HogwartsExpress = ({ curve }: { curve: THREE.CatmullRomCurve3 }) => {
    const trainRef = useRef<THREE.Group>(null);
    // FIX: Use useRef for loop state instead of useState to prevent infinite re-renders
    const stateRef = useRef<TrainState>({
        progress: 0,
        speed: 0.0003, // Base speed
        isStopped: false,
        stopTimer: 0
    });

    useFrame((state, delta) => {
        if (!trainRef.current) return;

        // Mutate ref directly
        const s = stateRef.current;
        const stopPoints = [0.01, 0.54]; 
        const stopDuration = 5.0; // Seconds

        if (s.isStopped) {
            s.stopTimer -= delta;
            if (s.stopTimer <= 0) {
                s.isStopped = false;
                s.progress += 0.005; // Move slightly to clear stop zone
            }
        } else {
            s.progress = (s.progress + s.speed) % 1; 

            for (const sp of stopPoints) {
                if (Math.abs(s.progress - sp) < 0.002) {
                    s.isStopped = true;
                    s.stopTimer = stopDuration;
                    break;
                }
            }
        }

        // --- Robust Orientation Logic (Fixes Vertical/Flipped Train) ---
        const position = curve.getPointAt(s.progress);
        const tangent = curve.getTangentAt(s.progress).normalize();
        
        // Define Up vector as World Up, then orthogonalize
        const axisY = new THREE.Vector3(0, 1, 0); 
        const axisX = new THREE.Vector3().crossVectors(axisY, tangent).normalize(); // Right vector
        const axisYCorrected = new THREE.Vector3().crossVectors(tangent, axisX).normalize(); // Corrected Up vector

        // Create rotation matrix from basis (Right, Up, Forward)
        const matrix = new THREE.Matrix4();
        matrix.makeBasis(axisX, axisYCorrected, tangent);
        
        // Set position with offset to place wheels ON tracks (approx +3.5y)
        matrix.setPosition(position.x, position.y + 3.5, position.z);
        
        trainRef.current.matrix.copy(matrix);
        trainRef.current.matrixAutoUpdate = false; // Important when manually setting matrix
    });

    return (
        <group ref={trainRef}>
            {/* Engine Body */}
            <mesh position={[0, 2, 0]} castShadow>
                <boxGeometry args={[6, 8, 20]} />
                <meshStandardMaterial color="#7a1a1a" />
            </mesh>
             {/* Engine Front (Boiler) */}
            <mesh position={[0, 2, 12]} rotation={[Math.PI/2, 0, 0]} castShadow>
                <cylinderGeometry args={[3.5, 3.5, 14, 16]} />
                <meshStandardMaterial color="#7a1a1a" />
            </mesh>
            {/* Chimney */}
            <mesh position={[0, 6, 16]} castShadow>
                <cylinderGeometry args={[1, 1.5, 4]} />
                <meshStandardMaterial color="#111" />
            </mesh>
            <Sparkles position={[0, 10, 16]} count={15} scale={4} size={6} speed={0.8} opacity={0.5} color="#fff" />

            {/* Wheels */}
            <group position={[0, -2, 0]}>
                <mesh position={[3.2, 0, 5]} rotation={[0,0,Math.PI/2]}> <cylinderGeometry args={[2,2,1, 16]} /> <meshStandardMaterial color="#333" /> </mesh>
                <mesh position={[-3.2, 0, 5]} rotation={[0,0,Math.PI/2]}> <cylinderGeometry args={[2,2,1, 16]} /> <meshStandardMaterial color="#333" /> </mesh>
                <mesh position={[3.2, 0, 15]} rotation={[0,0,Math.PI/2]}> <cylinderGeometry args={[2,2,1, 16]} /> <meshStandardMaterial color="#333" /> </mesh>
                <mesh position={[-3.2, 0, 15]} rotation={[0,0,Math.PI/2]}> <cylinderGeometry args={[2,2,1, 16]} /> <meshStandardMaterial color="#333" /> </mesh>
            </group>

            {/* Carriages */}
            <Carriage zOffset={-18} />
            <Carriage zOffset={-38} />
            <Carriage zOffset={-58} />
        </group>
    )
}

const Carriage = ({ zOffset }: { zOffset: number }) => {
    return (
        <group position={[0, 2, zOffset]}>
            <mesh castShadow>
                <boxGeometry args={[7, 9, 16]} />
                <meshStandardMaterial color="#7a1a1a" />
            </mesh>
            {/* Windows */}
            <mesh position={[3.6, 2, 0]}> <boxGeometry args={[0.1, 4, 12]} /> <meshStandardMaterial color="#222" /> </mesh>
            <mesh position={[-3.6, 2, 0]}> <boxGeometry args={[0.1, 4, 12]} /> <meshStandardMaterial color="#222" /> </mesh>
            {/* Connector */}
            <mesh position={[0, -2, 9]}> <boxGeometry args={[2, 1, 4]} /> <meshStandardMaterial color="#111" /> </mesh>
            {/* Wheels */}
            <group position={[0, -2, 0]}>
                <mesh position={[3.2, -2, -4]} rotation={[0,0,Math.PI/2]}> <cylinderGeometry args={[2,2,1, 16]} /> <meshStandardMaterial color="#333" /> </mesh>
                <mesh position={[-3.2, -2, -4]} rotation={[0,0,Math.PI/2]}> <cylinderGeometry args={[2,2,1, 16]} /> <meshStandardMaterial color="#333" /> </mesh>
                <mesh position={[3.2, -2, 4]} rotation={[0,0,Math.PI/2]}> <cylinderGeometry args={[2,2,1, 16]} /> <meshStandardMaterial color="#333" /> </mesh>
                <mesh position={[-3.2, -2, 4]} rotation={[0,0,Math.PI/2]}> <cylinderGeometry args={[2,2,1, 16]} /> <meshStandardMaterial color="#333" /> </mesh>
            </group>
        </group>
    )
}

// --- Player (Wizard on Broom/Foot) ---
interface WizardProps {
    mode: PlayerMode;
}
const WizardPlayer = React.forwardRef<THREE.Group, WizardProps>(({ mode }, ref) => {
    const groupRef = useRef<THREE.Group>(null);
    const bodyRef = useRef<THREE.Group>(null);
    const broomRef = useRef<THREE.Group>(null);

    useFrame((state, delta) => {
        if (!bodyRef.current || !broomRef.current) return;
        
        const isFlying = mode === PlayerMode.FLY;
        
        // Broom Position/Visibility
        // Hide broom entirely if walking
        // Flying: Underneath [0, 0, 0], Horizontal
        const targetBroomPos = new THREE.Vector3(0, 0, 0);
        const finalBroomRotX = Math.PI / 2;

        broomRef.current.position.lerp(targetBroomPos, delta * 5);
        broomRef.current.rotation.x = THREE.MathUtils.lerp(broomRef.current.rotation.x, finalBroomRotX, delta * 5);
        
        // Wizard Leg Position (Simplified by just moving the cylinder body)
        // Flying: Sitting [0, 0.6, 0.2], Leaning slightly
        // Walking: Standing [0, 1.0, 0], Upright
        const targetBodyPos = isFlying ? new THREE.Vector3(0, 0.6, 0.2) : new THREE.Vector3(0, 1.0, 0);
        const targetBodyRot = isFlying ? 0.2 : 0;

        bodyRef.current.position.lerp(targetBodyPos, delta * 5);
        bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, targetBodyRot, delta * 5);
    });

    return (
        <group ref={ref}>
            <group ref={groupRef} rotation={[0, Math.PI, 0]}>
                
                {/* Broom Stick - Toggle visibility based on mode */}
                <group ref={broomRef} visible={mode === PlayerMode.FLY}>
                    <mesh castShadow>
                        <cylinderGeometry args={[0.08, 0.05, 3.5, 8]} />
                        <meshStandardMaterial color="#4a3c31" />
                    </mesh>
                    <mesh position={[0, -1.8, 0]} castShadow> {/* Tail relative to stick */}
                        <cylinderGeometry args={[0.05, 0.4, 1.2, 16]} />
                        <meshStandardMaterial color="#654321" />
                    </mesh>
                    {/* Particles only when flying */}
                    {mode === PlayerMode.FLY && (
                         <group position={[0, -2.5, 0]}>
                            <Sparkles count={20} scale={1.5} size={3} speed={0.4} opacity={0.5} color="#cebaff" />
                        </group>
                    )}
                </group>

                {/* Wizard */}
                <group ref={bodyRef}>
                    <mesh castShadow>
                        <cylinderGeometry args={[0.3, 0.4, 1.2, 8]} />
                        <meshStandardMaterial color="#1a1a2e" />
                    </mesh>
                    
                    {/* Head */}
                    <mesh position={[0, 0.8, 0]} castShadow>
                        <sphereGeometry args={[0.25, 16, 16]} />
                        <meshStandardMaterial color="#ffdbac" />
                    </mesh>
                    
                    {/* Hat */}
                    <group position={[0, 1.0, 0]} rotation={[-0.2, 0, 0]}>
                        <mesh castShadow>
                            <coneGeometry args={[0.35, 0.8, 16]} />
                            <meshStandardMaterial color="#111" />
                        </mesh>
                        <mesh position={[0, -0.35, 0]} castShadow>
                            <cylinderGeometry args={[0.6, 0.6, 0.05, 16]} />
                            <meshStandardMaterial color="#111" />
                        </mesh>
                    </group>
                    
                    {/* Cape */}
                    <mesh position={[0, 0, 0.35]} rotation={[-0.1, 0, 0]}>
                        <boxGeometry args={[0.7, 1.0, 0.05]} />
                        <meshStandardMaterial color="#1a1a2e" side={THREE.DoubleSide} />
                    </mesh>
                </group>
            </group>
            
            {/* Lumos Light */}
            <pointLight intensity={3} distance={25} color="#aaddff" position={[0, 2, -1]} />
        </group>
  );
});

// --- Physics/Player Controller ---
interface PlayerControllerProps {
    gameState: GameState;
    mazeData: MazeGrid;
    onWinMaze: () => void;
    setNearMaze: (b: boolean) => void;
    playerRef: React.RefObject<THREE.Group>; // External ref
}

const PlayerController: React.FC<PlayerControllerProps> = ({ gameState, mazeData, onWinMaze, setNearMaze, playerRef }) => {
    // const playerRef = useRef<THREE.Group>(null); // Replaced by prop
    const velocity = useRef(new THREE.Vector3());
    const [mode, setMode] = useState<PlayerMode>(PlayerMode.FLY);
    const modeRef = useRef(mode);

    // Sync mode state and ref
    useEffect(() => {
        if (gameState === GameState.MAZE) {
            setMode(PlayerMode.WALK);
            modeRef.current = PlayerMode.WALK;
            if (playerRef.current) {
                const mazeWidth = mazeData.width * MAZE_CELL_SIZE;
                const mazeHeight = mazeData.height * MAZE_CELL_SIZE;
                const startX = MAZE_POS[0] - mazeWidth/2 + mazeData.start.x * MAZE_CELL_SIZE;
                const startZ = MAZE_POS[2] - mazeHeight/2 + mazeData.start.y * MAZE_CELL_SIZE;
                playerRef.current.position.set(startX, MAZE_POS[1] + 2, startZ);
                playerRef.current.rotation.y = 0;
                velocity.current.set(0,0,0);
            }
        } else {
            setMode(PlayerMode.FLY);
            modeRef.current = PlayerMode.FLY;
        }
    }, [gameState, mazeData, playerRef]);

    useEffect(() => { modeRef.current = mode; }, [mode]);
  
    const keys = useRef({ w: false, a: false, s: false, d: false, shift: false, control: false, space: false, q: false });
    const prevQ = useRef(false);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (k === 'w') keys.current.w = true;
            if (k === 'a') keys.current.a = true;
            if (k === 's') keys.current.s = true;
            if (k === 'd') keys.current.d = true;
            if (k === 'q') keys.current.q = true;
            if (e.shiftKey) keys.current.shift = true;
            if (e.ctrlKey) keys.current.control = true;
            if (e.code === 'Space') keys.current.space = true;
        };
        const onKeyUp = (e: KeyboardEvent) => {
            const k = e.key.toLowerCase();
            if (k === 'w') keys.current.w = false;
            if (k === 'a') keys.current.a = false;
            if (k === 's') keys.current.s = false;
            if (k === 'd') keys.current.d = false;
            if (k === 'q') keys.current.q = false;
            keys.current.shift = e.shiftKey;
            keys.current.control = e.ctrlKey;
            if (e.code === 'Space') keys.current.space = false;
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    useFrame((state, delta) => {
        if (!playerRef.current) return;
        const player = playerRef.current;
        const currentMode = modeRef.current;

        // --- Proximity Check for UI ---
        if (gameState === GameState.PLAYING) {
            const dist = Math.sqrt((player.position.x - MAZE_POS[0])**2 + (player.position.z - MAZE_POS[2])**2);
            // Increased radius due to larger maze size
            setNearMaze(dist < 400);
        } else {
            setNearMaze(false);
        }

        // --- Toggle Mode ---
        if (gameState !== GameState.MAZE && keys.current.q && !prevQ.current) {
            const newMode = currentMode === PlayerMode.FLY ? PlayerMode.WALK : PlayerMode.FLY;
            setMode(newMode);
            velocity.current.y = 0; 
        }
        prevQ.current = keys.current.q;

        // --- Physics Logic ---
        const ROTATION_SPEED = 2.5;

        if (currentMode === PlayerMode.FLY) {
             const MAX_SPEED = keys.current.space ? 120.0 : 60.0;
             const VERTICAL_SPEED = 30.0;
             if (keys.current.a) player.rotation.y += ROTATION_SPEED * delta;
             if (keys.current.d) player.rotation.y -= ROTATION_SPEED * delta;
             let targetSpeed = 0;
             if (keys.current.w) targetSpeed = MAX_SPEED;
             if (keys.current.s) targetSpeed = -MAX_SPEED * 0.5;
             velocity.current.x = THREE.MathUtils.lerp(velocity.current.x, targetSpeed, delta * 2);
             const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
             const displacement = forward.clone().multiplyScalar(velocity.current.x * delta);
             let verticalMove = 0;
             if (keys.current.shift) verticalMove = VERTICAL_SPEED * delta;
             if (keys.current.control) verticalMove = -VERTICAL_SPEED * delta;
             const nextPos = player.position.clone().add(displacement);
             nextPos.y += verticalMove;
             const terrainHeight = getTerrainHeight(nextPos.x, nextPos.z);
             if (nextPos.y < terrainHeight + 2) {
                 nextPos.y = terrainHeight + 2;
                 if (verticalMove < 0) velocity.current.x *= 0.8;
             }
             player.position.copy(nextPos);
             if(player.children[0]) {
                 const targetTilt = keys.current.a ? 0.6 : (keys.current.d ? -0.6 : 0);
                 const targetPitch = keys.current.w ? 0.3 : (keys.current.s ? -0.1 : 0);
                 const inner = player.children[0] as THREE.Group; 
                 inner.rotation.z = THREE.MathUtils.lerp(inner.rotation.z, targetTilt, delta * 4);
                 inner.rotation.x = THREE.MathUtils.lerp(inner.rotation.x, targetPitch, delta * 4);
             }
        } else {
            // WALK
            const WALK_SPEED = 15.0;
            const RUN_SPEED = 30.0;
            const GRAVITY = 80.0;
            const JUMP_FORCE = 30.0;
            if (keys.current.a) player.rotation.y += ROTATION_SPEED * delta;
            if (keys.current.d) player.rotation.y -= ROTATION_SPEED * delta;
            const speed = keys.current.space ? RUN_SPEED : WALK_SPEED;
            let moveForward = 0;
            if (keys.current.w) moveForward = speed;
            if (keys.current.s) moveForward = -speed;
            const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
            const displacement = forward.clone().multiplyScalar(moveForward * delta);
            const nextPos = player.position.clone().add(displacement);
            velocity.current.y -= GRAVITY * delta;
            nextPos.y += velocity.current.y * delta;
            const terrainHeight = getTerrainHeight(nextPos.x, nextPos.z);
            const groundLevel = terrainHeight + 1.2;
            if (nextPos.y <= groundLevel) {
                nextPos.y = groundLevel;
                velocity.current.y = 0;
                if (keys.current.shift && gameState !== GameState.MAZE) {
                    velocity.current.y = JUMP_FORCE;
                }
            }
            
            // Maze Collision
            let blocked = false;
            if (gameState === GameState.MAZE) {
                const mazeWidth = mazeData.width * MAZE_CELL_SIZE;
                const mazeHeight = mazeData.height * MAZE_CELL_SIZE;
                const mazeOriginX = MAZE_POS[0] - mazeWidth / 2;
                const mazeOriginZ = MAZE_POS[2] - mazeHeight / 2;
                const isWall = (wx: number, wz: number) => {
                    const gx = Math.floor((wx - mazeOriginX + MAZE_CELL_SIZE/2) / MAZE_CELL_SIZE);
                    const gy = Math.floor((wz - mazeOriginZ + MAZE_CELL_SIZE/2) / MAZE_CELL_SIZE);
                    if (gx < 0 || gx >= mazeData.width || gy < 0 || gy >= mazeData.height) return true;
                    return mazeData.grid[gy][gx] === 1;
                };
                if (isWall(nextPos.x, nextPos.z)) {
                    blocked = true;
                    if (!isWall(nextPos.x, player.position.z)) { nextPos.z = player.position.z; blocked = false; }
                    else if (!isWall(player.position.x, nextPos.z)) { nextPos.x = player.position.x; blocked = false; }
                }
                const gx = Math.floor((nextPos.x - mazeOriginX + MAZE_CELL_SIZE/2) / MAZE_CELL_SIZE);
                const gy = Math.floor((nextPos.z - mazeOriginZ + MAZE_CELL_SIZE/2) / MAZE_CELL_SIZE);
                if (gx === mazeData.end.x && gy === mazeData.end.y) {
                    onWinMaze();
                }
            }

            if (!blocked) player.position.copy(nextPos);

             if(player.children[0]) {
                const inner = player.children[0] as THREE.Group;
                inner.rotation.z = THREE.MathUtils.lerp(inner.rotation.z, 0, delta * 5);
                inner.rotation.x = THREE.MathUtils.lerp(inner.rotation.x, 0, delta * 5);
             }
        }

        // Camera
        const camDist = currentMode === PlayerMode.FLY ? 14 : 8;
        const camHeight = currentMode === PlayerMode.FLY ? 6 : 4;
        const camOffset = new THREE.Vector3(0, camHeight, camDist);
        camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.rotation.y);
        const idealCamPos = player.position.clone().add(camOffset);
        state.camera.position.lerp(idealCamPos, 0.1);
        state.camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 2, 0)));
    });

    return <WizardPlayer ref={playerRef} mode={mode} />;
}


const CinematicCamera = () => {
    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        state.camera.position.x = Math.sin(t * 0.05) * 400;
        state.camera.position.z = Math.cos(t * 0.05) * 400;
        state.camera.position.y = 150;
        state.camera.lookAt(0, 50, 0);
    });
    return null;
}

interface GameSceneProps {
    gameState: GameState;
    weather: WeatherState;
    setNearMaze: (near: boolean) => void;
    setWinMaze: () => void;
    onNPCInteract: (hasInteraction: boolean, text?: string) => void;
}

const GameScene: React.FC<GameSceneProps> = ({ gameState, weather, setNearMaze, setWinMaze, onNPCInteract }) => {
  const mazeData = useMemo(() => generateMaze(MAZE_SIZE, MAZE_SIZE), []);
  const playerRef = useRef<THREE.Group>(null); // Lifted state

  // Wrapper for onWinMaze to handle scene logic if needed
  const handleWin = () => {
      setWinMaze();
  };

  return (
    <Canvas shadows camera={{ fov: 70, position: [0, 10, 20], far: 15000 }}>
      <color attach="background" args={['#081020']} />
      
      {/* Environment */}
      <Environment preset="night" />
      <fogExp2 attach="fog" color={weather === WeatherState.SNOW ? "#cfd8dc" : "#081020"} density={weather === WeatherState.CLEAR ? 0.0002 : 0.001} /> 
      
      <Sky 
        sunPosition={[100, 10, 100]} 
        turbidity={weather === WeatherState.CLEAR ? 5 : 10} 
        rayleigh={weather === WeatherState.CLEAR ? 1 : 4} 
        mieCoefficient={0.005} 
        mieDirectionalG={0.8}
        inclination={0.52} 
        azimuth={0.25}
        distance={450000}
      />
      <Stars radius={15000} depth={100} count={10000} factor={8} saturation={0} fade speed={1} />
      
      {/* Increased Light Intensity */}
      <ambientLight intensity={2.0} color={weather === WeatherState.SNOW ? "#ffffff" : "#8aa2b3"} />
      <hemisphereLight color="#87CEEB" groundColor="#374151" intensity={1.5} />

      <directionalLight 
        position={[200, 300, 100]} 
        intensity={weather === WeatherState.RAIN ? 2.0 : 5.0} 
        color={weather === WeatherState.RAIN ? "#556677" : "#dbeafe"} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
      >
        <orthographicCamera attach="shadow-camera" args={[-400, 400, 400, -400]} />
      </directionalLight>

      {/* World */}
      <Terrain />
      <GroundDetails />
      <Castle />
      <ForbiddenForest />
      <Hogsmeade />
      <KingsCross />
      <TrainSystem />
      <WhompingWillow />
      <Azkaban />
      <QuidditchPitch />
      <Population playerRef={playerRef} onNPCProx={onNPCInteract} />
      <MazeStructure mazeData={mazeData} />

      {/* Weather */}
      <WeatherSystem weather={weather} />

      {/* Clouds - Simplified props for compatibility */}
      <Cloud position={[-100, 150, -100]} opacity={0.2} speed={0.1} color="#8899aa" />
      <Cloud position={[600, 200, 500]} opacity={0.2} speed={0.1} color="#8899aa" />

      {/* Game Logic */}
      {(gameState === GameState.PLAYING || gameState === GameState.MAZE) && (
        <PlayerController 
            gameState={gameState} 
            mazeData={mazeData} 
            onWinMaze={handleWin}
            setNearMaze={setNearMaze}
            playerRef={playerRef}
        />
      )}
      {gameState === GameState.START && <CinematicCamera />}
    </Canvas>
  );
};

export default GameScene;