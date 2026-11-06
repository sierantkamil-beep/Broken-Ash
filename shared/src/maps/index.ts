import type { AreaMap } from "../map.js";
import { FARMSTEAD, HARROW_ROAD, SAP_MINE, SORAMEI_CELLS } from "./act1.js";
import { SORAMEI_COURTYARD } from "./soramei.js";

export const MAPS: Record<string, AreaMap> = Object.fromEntries([SORAMEI_CELLS, SORAMEI_COURTYARD, FARMSTEAD, SAP_MINE, HARROW_ROAD].map((m) => [m.id, m]));

/** Act 1 opens in the bleeding-cells under Soramei Keep. */
export const START_MAP = SORAMEI_CELLS.id;
