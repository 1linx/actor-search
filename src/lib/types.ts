export type MediaType = 'movie' | 'tv';

export interface TitleSuggestion {
	id: number;
	mediaType: MediaType;
	/** Films use `title`, shows use `name`; normalised to this. */
	title: string;
	/** Release year for films, first-air year for shows. */
	year: string | null;
	posterPath: string | null;
}

export type TitleSummary = TitleSuggestion;

/** How a person is credited on one of the two titles. */
export interface RoleInTitle {
	/** Character name(s) for cast, job title(s) for crew. */
	roles: string[];
	/** Billing order. Lower is higher billed. */
	order: number | null;
	/** Episodes appeared in. TV only — null for films. */
	episodeCount: number | null;
}

export interface SharedPerson {
	id: number;
	name: string;
	profilePath: string | null;
	inA: RoleInTitle;
	inB: RoleInTitle;
}

export interface CompareResult {
	a: TitleSummary;
	b: TitleSummary;
	cast: SharedPerson[];
	crew: SharedPerson[];
}

/** Wire format for a title reference, e.g. `movie:39513` or `tv:1396`. */
export const titleRef = (t: { mediaType: MediaType; id: number }) => `${t.mediaType}:${t.id}`;
