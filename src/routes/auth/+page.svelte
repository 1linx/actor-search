<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The server owns which step you're on — it's in the signed attempt cookie —
	 * so the prompt and the phase are read straight from `data` and advanced by
	 * re-running the load function. Nothing about the puzzle is mirrored in
	 * client state, which is what stops the two drifting apart.
	 */
	const prompt = $derived(data.prompt);
	const phase = $derived(data.phase);

	let secondsRemaining = $state(0);
	let wrong = $state(false);
	let busy = $state(false);

	const locked = $derived(data.locked && secondsRemaining > 0);

	// Re-seeds and restarts whenever a fresh load lands, so the countdown always
	// reflects the server's view rather than a stale one.
	$effect(() => {
		secondsRemaining = data.secondsRemaining;
		if (!data.locked) return;

		const timer = setInterval(() => {
			secondsRemaining -= 1;
			if (secondsRemaining <= 0) {
				clearInterval(timer);
				invalidateAll();
			}
		}, 1000);
		return () => clearInterval(timer);
	});

	const formatTime = (total: number) =>
		`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

	async function pick(value: string) {
		if (locked || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ value })
			});
			const result = await res.json();

			if (result.done) {
				await goto('/', { invalidateAll: true });
				return;
			}
			if (!result.next && !result.locked) {
				// Wrong, or the attempt expired. The server has already restarted us on
				// a fresh puzzle; flash, then reload to show it.
				wrong = true;
				setTimeout(() => (wrong = false), 1200);
			}
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Name the film</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-5 py-10">
	{#if locked}
		<div class="flex flex-col items-center gap-4">
			<span class="text-5xl" aria-hidden="true">🔒</span>
			<p class="text-4xl font-semibold text-amber-400 tabular-nums">
				{formatTime(secondsRemaining)}
			</p>
			<p class="text-sm text-slate-500">Too many wrong answers. Try again shortly.</p>
		</div>
	{:else}
		<p class="mb-2 text-xs font-semibold tracking-widest text-slate-500 uppercase">
			{phase === 1 ? 'Step 1 — the colour' : 'Step 2 — the word'}
		</p>
		<h1 class="mb-8 text-center text-2xl font-bold text-slate-50 sm:text-3xl">{prompt}</h1>

		<div class="grid grid-cols-4 gap-3">
			{#if phase === 1}
				{#each data.colours as colour (colour.name)}
					<button
						type="button"
						onclick={() => pick(colour.name)}
						disabled={busy}
						class="flex size-16 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-slate-900 transition hover:scale-105 disabled:opacity-60 sm:size-20 {wrong
							? 'border-rose-500'
							: 'border-slate-700 hover:border-amber-400'}"
					>
						<!-- The ring keeps a black or near-black swatch visible against the tile. -->
						<span
							class="size-7 rounded-full ring-1 ring-white/25 sm:size-8"
							style="background-color: {colour.hex}"
							aria-hidden="true"
						></span>
						<span class="text-[0.6rem] text-slate-400 capitalize">{colour.name}</span>
					</button>
				{/each}
			{:else}
				{#each data.words as option (option.word)}
					<button
						type="button"
						onclick={() => pick(option.word)}
						disabled={busy}
						class="flex size-16 flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-slate-900 transition hover:scale-105 disabled:opacity-60 sm:size-20 {wrong
							? 'border-rose-500'
							: 'border-slate-700 hover:border-amber-400'}"
					>
						<span class="text-2xl" aria-hidden="true">{option.symbol}</span>
						<span class="text-[0.6rem] text-slate-400">{option.word}</span>
					</button>
				{/each}
			{/if}
		</div>

		<p class="mt-6 h-5 text-sm text-rose-400" aria-live="polite">
			{wrong ? "Not that one — here's another." : ''}
		</p>
	{/if}
</main>
