/** Every mock app, in seed order. Seed n shows APPS[n mod length]. */
import type { MockApp } from '../widgets';
import { calendar } from './calendar';
import { chat } from './chat';
import { finance } from './finance';
import { fitness } from './fitness';
import { meditation } from './meditation';
import { music } from './music';
import { shop } from './shop';
import { social } from './social';
import { tasks } from './tasks';
import { travel } from './travel';

export const APPS: readonly MockApp[] = [finance, social, tasks, fitness, chat, music, travel, shop, calendar, meditation];
