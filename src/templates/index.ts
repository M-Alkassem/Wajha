/**
 * Built-in templates shipped with the app. Owned by the templates work package.
 * Each template lives in its own module under ./builtin/ (authored with the
 * builders in ./kit.ts) and is listed here in the order the template picker
 * shows them: alternating light and dark, calm and loud, so any row of the
 * grid looks varied. The first one is the default (`?demo`).
 */
import type { Template } from '../model/types';
import { aurora } from './builtin/aurora';
import { bubblegum } from './builtin/bubblegum';
import { citrusPop } from './builtin/citrusPop';
import { clayGarden } from './builtin/clayGarden';
import { desertDune } from './builtin/desertDune';
import { glassPrism } from './builtin/glassPrism';
import { launchpad } from './builtin/launchpad';
import { loudAndClear } from './builtin/loudAndClear';
import { midnightNeon } from './builtin/midnightNeon';
import { monoSwiss } from './builtin/monoSwiss';
import { noirGold } from './builtin/noirGold';
import { noor } from './builtin/noor';
import { obsidian } from './builtin/obsidian';
import { panoramaPeaks } from './builtin/panoramaPeaks';
import { panoramaRibbon } from './builtin/panoramaRibbon';
import { panoramaWaves } from './builtin/panoramaWaves';
import { paperAndInk } from './builtin/paperAndInk';
import { sage } from './builtin/sage';
import { splitTone } from './builtin/splitTone';
import { sunsetBoulevard } from './builtin/sunsetBoulevard';

export const BUILTIN_TEMPLATES: Template[] = [
  aurora,
  sunsetBoulevard,
  monoSwiss,
  midnightNeon,
  clayGarden,
  loudAndClear,
  panoramaWaves,
  paperAndInk,
  glassPrism,
  obsidian,
  citrusPop,
  noor,
  panoramaPeaks,
  bubblegum,
  launchpad,
  noirGold,
  splitTone,
  desertDune,
  panoramaRibbon,
  sage,
];

export function builtinTemplate(id: string): Template | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.id === id);
}
