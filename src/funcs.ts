import { Dispatch } from "@reduxjs/toolkit";
import { NUM_BOARDS, NUM_GUESSES, START_DATE, WORDS_TARGET } from "./consts";
import {
  GameState,
  loadGame,
  SettingsState,
  startGame,
  updateSettings,
} from "./store";

// Generate integers 0 <= i < max
export function range(max: number): number[] {
  const array = [];
  for (let i = 0; i < max; i++) {
    array.push(i);
  }
  return array;
}

// Simple seeded RNG
// https://gist.github.com/miyaokamarina/0a8660363095bb5b5d5d7677ed5be9b0
export function MersenneTwister(seed = Date.now() as number | Uint32Array) {
  const next = (mt: Uint32Array, i: number, j: number, k: number) => {
    j = (mt[i]! & 0x80000000) | (mt[j]! & 0x7fffffff);
    mt[i] = mt[k]! ^ (j >>> 1) ^ (-(j & 0x1) & 0x9908b0df);
  };
  const twist = (mt: Uint32Array) => {
    let i = 0;
    while (i < 227) next(mt, i++, i, i + 396);
    while (i < 623) next(mt, i++, i, i - 228);
    next(mt, 623, 0, 396);
  };
  let i = 1;
  let mt = new Uint32Array(624);
  const u32 = () => {
    if (i >= 624) {
      twist(mt);
      i = 0;
    }
    let y = mt[i++]!;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  };
  const f32_ii = () => u32() / 0x0_ffff_ffff;
  const f32_ix = () => u32() / 0x1_0000_0000;
  const f32_xx = () => (u32() + 0.5) / 0x1_0000_0000;
  const u53 = () => (u32() >>> 5) * 67108864 + (u32() >>> 6);
  const f64_ix = () => u53() / 0x20_0000_0000_0000;
  const save = () => {
    let dump = new Uint32Array(625);
    dump[0] = i;
    dump.set(mt, 1);
    return dump;
  };
  if (typeof seed === "number") {
    mt[0] = seed;
    while (i < 624) {
      seed = mt[i - 1]! ^ (mt[i - 1]! >>> 30);
      mt[i] =
        (((seed >>> 16) * 1812433253) << 16) +
        (seed & 0xffff) * 1812433253 +
        i++;
    }
  } else {
    i = seed[0]!;
    mt.set(seed.slice(1));
  }
  return { u32, f32_ii, f32_ix, f32_xx, u53, f64_ix, save };
}

// Format time elapsed in 00:00.00 format
export function formatTimeElapsed(miliseconds: number) {
  miliseconds = Math.max(miliseconds, 0);
  const minutes = Math.floor(miliseconds / 1000 / 60);
  const seconds = Math.floor(miliseconds / 1000) % 60;
  const hundreds = Math.floor(miliseconds / 10) % 100;
  return (
    minutes.toString().padStart(2, "0") +
    ":" +
    seconds.toString().padStart(2, "0") +
    "." +
    hundreds.toString().padStart(2, "0")
  );
}

// Returns the id for today's duotrigordle
export function getTodaysId(): number {
  const today = new Date();
  const diff = today.getTime() - START_DATE.getTime();
  return Math.ceil(diff / 1000 / 60 / 60 / 24);
}

// Given a duotrigordle id, return the corresponding 32 target wordles
export function getTargetWords(id: number): string[] {
  const targetWords: string[] = WORDS_TARGET.slice(0,16);
  const rng = MersenneTwister(id);
  while (targetWords.length < NUM_BOARDS) {
    const idx = rng.u32() % WORDS_TARGET.length;
    const word = WORDS_TARGET[idx];
    if (!targetWords.includes(word)) {
      targetWords.push(word);
    }
    console.log(targetWords);
  }
  return targetWords;
}

// Given a guess word and target word, returns a 5-letter string
// consisting of either "B", "Y", or "G" representing a
// black, yellow, or green letter guess
// e.g. getGuessResult("XYCEZ", "ABCDE") returns "BBGYB"
export function getGuessColors(guess: string, target: string): string {
  let guessResult: string[] = ["B", "B", "B", "B", "B"];

  // Find green letters
  const unmatched = new Map<string, number>();
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      guessResult[i] = "G";
    } else {
      const count = unmatched.get(target[i]) ?? 0;
      unmatched.set(target[i], count + 1);
    }
  }

  // Find yellow letters
  for (let i = 0; i < 5; i++) {
    if (guessResult[i] === "G") {
      continue;
    }
    const count = unmatched.get(guess[i]);
    if (count !== undefined && count > 0) {
      guessResult[i] = "Y";
      unmatched.set(guess[i], count - 1);
    }
  }
  return guessResult.join("");
}

// Check if every target word has been guessed
export function allWordsGuessed(guesses: string[], targets: string[]) {
  if (guesses.length < targets.length) {
    return false;
  }
  for (const target of targets) {
    if (guesses.indexOf(target) === -1) {
      return false;
    }
  }
  return true;
}

// Serialization for local storage
export type GameSerialized = {
  id: number;
  guesses: string[];
  startTime: number;
  endTime: number;
};
export function isGameSerialized(obj: any): obj is GameSerialized {
  // Check the shape of the object just in case a previous invalid version of
  // the object was stored in local storage
  try {
    if (typeof obj !== "object" || obj === null) {
      return false;
    }
    if (typeof obj.id !== "number") {
      return false;
    }
    if (!Array.isArray(obj.guesses)) {
      return false;
    }
    if (obj.guesses.length > NUM_GUESSES) {
      return false;
    }
    for (const guess of obj.guesses) {
      if (typeof guess !== "string") {
        return false;
      }
    }
    if (typeof obj.startTime !== "number") {
      return false;
    }
    if (typeof obj.endTime !== "number") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
export function serializeGame(state: GameState): GameSerialized {
  return {
    id: state.id,
    guesses: state.guesses,
    startTime: state.startTime,
    endTime: state.endTime,
  };
}
export function deserializeGame(serialized: GameSerialized): GameState {
  const targets = getTargetWords(serialized.id);
  console.log("Target words: ");
  console.log(targets);
  const gameOver =
    serialized.guesses.length === NUM_GUESSES ||
    allWordsGuessed(serialized.guesses, targets);
  return {
    id: serialized.id,
    input: "",
    targets,
    guesses: serialized.guesses,
    gameOver,
    practice: false,
    startTime: serialized.startTime,
    endTime: serialized.endTime,
  };
}
export function loadGameFromLocalStorage(dispatch: Dispatch) {
  const todaysId = getTodaysId();
  const text = localStorage.getItem("duotrigordle-state");
  const serialized = text && JSON.parse(text);
  if (isGameSerialized(serialized) && serialized.id === todaysId) {
    dispatch(loadGame({ game: deserializeGame(serialized) }));
  } else {
    dispatch(startGame({ id: todaysId, practice: false }));
  }
}
export function saveGameToLocalStorage(state: GameState) {
  localStorage.setItem(
    "duotrigordle-state",
    JSON.stringify(serializeGame(state))
  );
}

// Serialization for settings
export function loadSettingsFromLocalStorage(dispatch: Dispatch) {
  const text = localStorage.getItem("duotrigordle-settings");
  const settings = text && JSON.parse(text);
  if (settings) {
    dispatch(updateSettings(settings));
  }
}
export function saveSettingsToLocalStorage(state: SettingsState) {
  localStorage.setItem("duotrigordle-settings", JSON.stringify(state));
}
