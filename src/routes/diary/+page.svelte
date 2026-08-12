<script>
  import DiaryView from '$lib/components/DiaryView.svelte';

  let { data } = $props();
</script>

<DiaryView {data} />
