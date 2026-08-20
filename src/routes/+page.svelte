<script lang="ts">
	import AlternatingWord from '$lib/components/AlternatingWord.svelte';
	import MediaBadge from '$lib/components/MediaBadge.svelte';
	import TitleSearch from '$lib/components/TitleSearch.svelte';
	import { posterUrl, profileUrl } from '$lib/images';
	import { titleRef, type CompareResult, type RoleInTitle, type TitleSuggestion } from '$lib/types';

	let titleA = $state<TitleSuggestion | null>(null);
	let titleB = $state<TitleSuggestion | null>(null);
	let result = $state<CompareResult | null>(null);
	let comparing = $state(false);
	let error = $state<string | null>(null);
	let showCrew = $state(false);

	$effect(() => {
		const a = titleA;
		const b = titleB;

		if (!a || !b) {
			result = null;
			error = null;
			return;
		}
		if (a.mediaType === b.mediaType && a.id === b.id) {
			result = null;
			error = 'Those are the same title — pick two different ones.';
			return;
		}

		let cancelled = false;
		comparing = true;
		error = null;

		fetch(`/api/compare?a=${titleRef(a)}&b=${titleRef(b)}`)
			.then(async (res) => {
				const data = await res.json();
				if (cancelled) return;
				if (!res.ok) throw new Error(data.error ?? 'Comparison failed.');
				result = data;
			})
			.catch((e) => {
				if (cancelled) return;
				error = (e as Error).message;
				result = null;
			})
			.finally(() => {
				if (!cancelled) comparing = false;
			});

		return () => {
			cancelled = true;
		};
	});

	const roleText = (role: RoleInTitle) => role.roles.join(' / ') || 'Uncredited';

	/** Episode counts only exist for shows, and they tell you regular from guest. */
	const episodeText = (role: RoleInTitle) =>
		role.episodeCount === null
			? null
			: `${role.episodeCount} ${role.episodeCount === 1 ? 'episode' : 'episodes'}`;
</script>

<svelte:head>
	<title>Actor Search — who's in both?</title>
	<meta
		name="description"
		content="Find the actors two films or TV shows have in common, using TMDB."
	/>
</svelte:head>

<main class="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-10 sm:py-16">
	<header class="mb-10 text-center">
		<h1 class="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
			<!-- Oh look it's that <AlternatingWord words={['guy', 'gal', 'dude']} label="person" /> from ... -->
			Oh! Oh! It's that actor from ...
		</h1>
		<p class="mx-auto mt-3 max-w-xl text-slate-400">
			Pick two films or TV shows and find every actor who appears in both.
		</p>
	</header>

	<section class="grid gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
		<TitleSearch label="First title" placeholder="e.g. Boogie Nights" bind:selected={titleA} />
		<div class="hidden pb-3 text-center text-sm font-semibold text-slate-600 sm:block">and</div>
		<TitleSearch label="Second title" placeholder="e.g. Community" bind:selected={titleB} />
	</section>

	{#if error}
		<p
			class="mt-8 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-rose-300"
		>
			{error}
		</p>
	{/if}

	{#if comparing}
		<p class="mt-12 text-center text-slate-400">Comparing casts…</p>
	{:else if result}
		{@const shared = showCrew ? result.crew : result.cast}
		<section class="mt-12">
			<div class="flex flex-wrap items-center justify-center gap-4 sm:gap-8">
				{#each [result.a, result.b] as title, i (titleRef(title))}
					{#if i === 1}
						<span class="text-sm font-semibold text-slate-600">and</span>
					{/if}
					<div class="flex items-center gap-3">
						{#if posterUrl(title.posterPath)}
							<img
								src={posterUrl(title.posterPath)}
								alt=""
								class="h-16 w-11 rounded object-cover shadow-lg"
							/>
						{/if}
						<div>
							<p class="font-semibold text-slate-100">{title.title}</p>
							<p class="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
								{title.year ?? '—'}
								<MediaBadge mediaType={title.mediaType} />
							</p>
						</div>
					</div>
				{/each}
			</div>

			<div
				class="mx-auto mt-8 flex w-fit items-center justify-center gap-1 rounded-full border border-slate-800 bg-slate-900/70 p-1 text-sm"
			>
				<button
					type="button"
					onclick={() => (showCrew = false)}
					class="rounded-full px-4 py-1.5 font-medium transition {!showCrew
						? 'bg-amber-400 text-slate-950'
						: 'text-slate-400 hover:text-slate-200'}"
				>
					Cast ({result.cast.length})
				</button>
				<button
					type="button"
					onclick={() => (showCrew = true)}
					class="rounded-full px-4 py-1.5 font-medium transition {showCrew
						? 'bg-amber-400 text-slate-950'
						: 'text-slate-400 hover:text-slate-200'}"
				>
					Crew ({result.crew.length})
				</button>
			</div>

			{#if shared.length === 0}
				<p class="mt-10 text-center text-slate-400">
					No {showCrew ? 'crew members' : 'actors'} in common. Perhaps it was someone who just
					<em>looks</em> like them.
				</p>
			{:else}
				<ul class="mt-8 grid gap-4 sm:grid-cols-2">
					{#each shared as person (person.id)}
						<li
							class="flex gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700"
						>
							{#if profileUrl(person.profilePath)}
								<img
									src={profileUrl(person.profilePath)}
									alt=""
									loading="lazy"
									class="h-24 w-16 shrink-0 rounded-lg object-cover"
								/>
							{:else}
								<span
									class="grid h-24 w-16 shrink-0 place-items-center rounded-lg bg-slate-800 text-2xl text-slate-600"
									aria-hidden="true">?</span
								>
							{/if}
							<div class="min-w-0">
								<a
									href="https://www.themoviedb.org/person/{person.id}"
									target="_blank"
									rel="noopener noreferrer"
									class="font-semibold text-slate-100 underline-offset-4 hover:text-amber-300 hover:underline"
								>
									{person.name}
								</a>
								<dl class="mt-2 space-y-1 text-sm">
									{#each [{ title: result.a, role: person.inA }, { title: result.b, role: person.inB }] as side (titleRef(side.title))}
										<div>
											<dt class="text-slate-500">{side.title.title}</dt>
											<dd class="text-slate-300">
												{roleText(side.role)}
												{#if episodeText(side.role)}
													<span class="text-slate-500">· {episodeText(side.role)}</span>
												{/if}
											</dd>
										</div>
									{/each}
								</dl>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<!-- mt-auto eats the leftover space, so the footer sits at the bottom of the
	     window on a short page and is simply pushed down by a long result list. -->
	<footer class="mt-auto pt-20 text-center text-xs text-slate-600">
		This product uses the TMDB API but is not endorsed or certified by TMDB.
	</footer>
</main>
