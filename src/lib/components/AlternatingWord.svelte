<script lang="ts">
	/**
	 * Cross-fades between a set of words in place.
	 *
	 * All the words are stacked in a single grid cell so the box is as wide as
	 * the longest one and the surrounding text never reflows mid-fade.
	 */
	let {
		words,
		label,
		intervalMs = 3200
	}: {
		words: string[];
		/** Read by screen readers instead of the cycling text. */
		label: string;
		intervalMs?: number;
	} = $props();

	let index = $state(0);

	$effect(() => {
		const timer = setInterval(() => {
			index = (index + 1) % words.length;
		}, intervalMs);
		return () => clearInterval(timer);
	});
</script>

<span class="sr-only">{label}</span>
<span class="inline-grid" aria-hidden="true">
	{#each words as word, i (word)}
		<span
			class="[grid-area:1/1] text-center transition-opacity duration-700 ease-in-out motion-reduce:transition-none {i ===
			index
				? 'opacity-100'
				: 'opacity-0'}"
		>
			{word}
		</span>
	{/each}
</span>
