import type { AreaMap } from "../map.js";
import { SORAMEI_COURTYARD } from "./soramei.js";

export const MAPS: Record<string, AreaMap> = {
  [SORAMEI_COURTYARD.id]: SORAMEI_COURTYARD,
};

export const START_MAP = SORAMEI_COURTYARD.id;
