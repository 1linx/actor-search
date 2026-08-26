/**
 * The auth puzzle set.
 *
 * Each entry is a film title with a colour and a noun taken out; the visitor
 * has to put both back. Adding one is a single line — its colour and its
 * word/symbol are folded into the option grids automatically, which also makes
 * every new entry a decoy for all the others.
 *
 * Server-only by virtue of living under $lib/server: the answers must never be
 * bundled into anything the browser receives.
 */

/** Swatches offered in step one. The whole palette is always shown, so the
 *  answer isn't narrowed down to "the colours that happen to be in use". */
export const COLOURS = {
	black: '#111827',
	white: '#f8fafc',
	red: '#dc2626',
	green: '#16a34a',
	blue: '#2563eb',
	yellow: '#facc15',
	orange: '#ea580c',
	purple: '#9333ea',
	pink: '#ec4899',
	grey: '#6b7280',
	brown: '#92400e',
	silver: '#cbd5e1'
} as const;

export type ColourName = keyof typeof COLOURS;

export interface Puzzle {
	id: string;
	/** The title with both answer words replaced by blanks. */
	prompt: string;
	colour: ColourName;
	word: string;
	/** Shown on the word's tile in step two. */
	symbol: string;
}

/**
 * Referencing a colour that isn't in COLOURS above is a type error rather than
 * a blank swatch at runtime, so a typo can't reach production.
 */
export const PUZZLES: Puzzle[] = [
	{
		id: 'harold-kumar',
		prompt: 'Harold & Kumar Go to ___ ___',
		colour: 'white',
		word: 'Castle',
		symbol: '🏰'
	},
	{
		id: 'red-october',
		prompt: 'The Hunt for ___ ___',
		colour: 'red',
		word: 'October',
		symbol: '⚓'
	},
	{
		id: 'black-hawk',
		prompt: '___ ___ Down',
		colour: 'black',
		word: 'Hawk',
		symbol: '🦅'
	},
	{
		id: 'yellow-submarine',
		prompt: "The Beatles sung' ___ ___",
		colour: 'yellow',
		word: 'Submarine',
		symbol: '🚤'
	},
	{
		id: 'pink-panther',
		prompt: 'Sellers as Clouseau in: The ___ ___',
		colour: 'pink',
		word: 'Panther',
		symbol: '🐆'
	},
	{
		id: 'black-swan',
		prompt: 'Portman, ballet, Aronofsky: ___ ___',
		colour: 'black',
		word: 'Swan',
		symbol: '🦢'
	},
	{
		id: 'green-mile',
		prompt: 'Basedon the Stephen King novel about death row: The ___ ___',
		colour: 'green',
		word: 'Mile',
		symbol: '⚡'
	},
	{
		id: 'white-christmas',
		prompt: 'Crosby abotu this festive event: ___ ___',
		colour: 'white',
		word: 'Christmas',
		symbol: '🎄'
	}
];

function shuffle<T>(items: T[]): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Puzzles are addressed by index, because that is what the attempt cookie carries. */
export const randomPuzzleIndex = () => Math.floor(Math.random() * PUZZLES.length);

export const puzzleAt = (index: number | undefined) =>
	index !== undefined && index >= 0 && index < PUZZLES.length ? PUZZLES[index] : null;

/**
 * The grids the browser is allowed to see: every colour, and every word in the
 * set. Deliberately identical whichever puzzle is active, so the options
 * themselves leak nothing about the answer.
 */
export function optionGrids() {
	const words = new Map(PUZZLES.map((p) => [p.word, p.symbol]));
	return {
		colours: shuffle(Object.entries(COLOURS).map(([name, hex]) => ({ name, hex }))),
		words: shuffle([...words].map(([word, symbol]) => ({ word, symbol })))
	};
}

export function isCorrect(puzzle: Puzzle, phase: 1 | 2, value: unknown): boolean {
	if (typeof value !== 'string') return false;
	const answer = phase === 1 ? puzzle.colour : puzzle.word;
	return value.trim().toLowerCase() === answer.toLowerCase();
}
