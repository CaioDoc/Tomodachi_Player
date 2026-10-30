// src/i18n/dictionary.ts
// Junta as traduções de cada parte da interface: { 'texto em português': ['English', 'Español'] }
import type { Parts } from './types';
import app from './parts/app';
import library from './parts/library';
import player from './parts/player';
import settings from './parts/settings';
import sources from './parts/sources';
import browser from './parts/browser';
import core from './parts/core';
import nuvio from './parts/nuvio';
import help from './parts/help';
import sources2 from './parts/sources2';
import videos2 from './parts/videos2';
import bulk from './parts/bulk';
import discover2 from './parts/discover2';
import mal from './parts/mal';
import search3 from './parts/search3';
import speed from './parts/speed';
import updates from './parts/updates';

export const DICTIONARY: Parts = Object.assign({}, core, app, library, player, settings, sources, browser, nuvio, help, sources2, videos2, bulk, discover2, updates, mal, search3, speed);
