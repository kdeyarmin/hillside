import part0 from './compact0';
import part1 from './compact1';
import part2 from './compact2';
import part3 from './compact3';
import part4 from './compact4';
import part5 from './compact5';
import part6 from './compact6';
import part7 from './compact7';
import part8 from './compact8';
import part9 from './compact9';
import part10 from './compact10';
import part11 from './compact11';

export const HILLSIDE_CATALOG_SPRITE_DATA_URI =
  'data:image/jpeg;base64,' +
  part0 +
  part1 +
  part2 +
  part3 +
  part4 +
  part5 +
  part6 +
  part7 +
  part8 +
  part9 +
  part10 +
  part11;

export const HILLSIDE_CATALOG_VIEWBOXES = {
  'house-plants': '0 0 400 300',
  'carnivorous-plants': '400 0 400 300',
  'live-plant-planters': '800 0 400 300',
  'homemade-soaps': '1200 0 400 300',
  moss: '1600 0 400 300',
  succulents: '0 300 400 300',
  driftwood: '400 300 400 300',
  apothecary: '800 300 400 300',
  'air-plants': '1200 300 400 300',
  'terrarium-supplies': '1600 300 400 300'
} as const;

export type HillsideCatalogImage = keyof typeof HILLSIDE_CATALOG_VIEWBOXES;
