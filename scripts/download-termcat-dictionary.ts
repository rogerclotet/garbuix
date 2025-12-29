import { Word } from '@/data/types';
import { XMLParser } from 'fast-xml-parser';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path'

interface Root { cessiodades: { fitxes: { fitxa: Fitxa[] } } }
interface Fitxa { '@_num': number; areatematica: string | string[]; denominacio: Denominacio[], definicio?: Definicio }
interface Denominacio { '@_num': number; '@_llengua': string; '@_tipus': 'principal' | 'equivalent'; '#text': string; }
interface Definicio { '@_num': number; '@_llengua': string; '#text': string; }

const MIN_LENGTH = 3;
const DATA_DIR = join(process.cwd(), 'src', 'data')
const OUTPUT_FILE = join(DATA_DIR, 'catalan-words.json');

async function main() {
  console.log('📚 Downloading TermCat IATE dictionary...')
  const response = await fetch("https://www.termcat.cat/Thor/files/diccionaris/wadfiateencatala.xml");

  const xml = await response.text();

  const parser = new XMLParser({ ignoreAttributes: false,  });
  const obj = parser.parse(xml) as Root;

  const words = new Map<string, Word>();
  for (const fitxa of obj.cessiodades.fitxes.fitxa) {
    const name = fitxa.denominacio.find(d => d['@_tipus'] === 'principal' && d['@_llengua'] === 'ca')?.['#text'];
    const areatematica = cleanAreaTematica(fitxa.areatematica);
    const definition = fitxa.definicio?.['#text'] ?? '';

    if (name !== undefined && isValid(name)) {
      words.set(name, { name, areatematica, definition });
    }
  }

  console.log(`${words.size} usable words downloaded`);

  console.log(`💾 Saving to ${OUTPUT_FILE}...`)
  writeFileSync(OUTPUT_FILE, JSON.stringify(Array.from(words.values()), null, 2))
}

main().catch(console.error);

function isValid(name: string): boolean {
  const regex = /^(?=.*[a-zà-ÿç])\p{Letter}+$/u
  return name.length > MIN_LENGTH && regex.test(name);
}

function cleanAreaTematica(areatematica: string | string[]): string {
  const parts = Array.isArray(areatematica) ? areatematica : [areatematica];

  const cleanedParts = parts.map(part => part.replace(/\s*\(\d+\)$/, '')
    .split(' > ')
    .slice(0, 2)
    .join(', '));

  // Remove repeated parts
  const uniqueParts = Array.from(new Set(cleanedParts));

  const result = uniqueParts.join(', ');

  return result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
}
