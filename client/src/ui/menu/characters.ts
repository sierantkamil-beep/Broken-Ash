import { DEFAULT_LOOKS, PATHS, isWeapon, validLook, type BodyType, type CharacterLook, type PathId, type PeopleId, type WeaponId } from "@broken-ash/shared";

/**
 * Characters made on this computer: name, path, body, people, weapon and look. Mastery is not here —
 * the host remembers it (server/src/game/Profiles.ts), keyed by the character's name.
 */
export interface SavedCharacter {
  id: string;
  name: string;
  path: PathId;
  body: BodyType;
  people: PeopleId;
  weapon: WeaponId;
  look: CharacterLook;
  updated: number;
}

const KEY = "broken-ash.characters";
const CUR = "broken-ash.character";

function read(): SavedCharacter[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedCharacter[];
    return Array.isArray(raw) ? raw.filter((c) => c && c.path in PATHS).map(clean) : [];
  } catch {
    return [];
  }
}

/** Old or hand-edited saves are made whole again. */
function clean(c: SavedCharacter): SavedCharacter {
  const path = c.path;
  return {
    ...c,
    body: c.body === "male" ? "male" : "female",
    people: c.people ?? PATHS[path].people,
    weapon: isWeapon(c.weapon) ? c.weapon : PATHS[path].homeWeapons[0],
    look: validLook(c.look, path),
  };
}

function write(list: SavedCharacter[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: characters just won't be remembered.
  }
}

export function listCharacters(): SavedCharacter[] {
  return read().sort((a, b) => b.updated - a.updated);
}

export function currentCharacter(): SavedCharacter | undefined {
  let id = "";
  try {
    id = localStorage.getItem(CUR) ?? "";
  } catch {
    /* none */
  }
  const list = listCharacters();
  return list.find((c) => c.id === id) ?? list[0];
}

export function saveCharacter(c: SavedCharacter) {
  const list = read().filter((x) => x.id !== c.id);
  list.push({ ...c, updated: Date.now() });
  write(list);
  selectCharacter(c.id);
}

export function selectCharacter(id: string) {
  try {
    localStorage.setItem(CUR, id);
  } catch {
    /* none */
  }
}

export function deleteCharacter(id: string) {
  write(read().filter((c) => c.id !== id));
}

/** A fresh character on a path, dressed in its people's colours with its first home weapon. */
export function newCharacter(path: PathId, body: BodyType = "female", name = ""): SavedCharacter {
  return {
    id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    path,
    body,
    people: PATHS[path].people,
    weapon: PATHS[path].homeWeapons[0],
    look: { ...DEFAULT_LOOKS[path] },
    updated: Date.now(),
  };
}
