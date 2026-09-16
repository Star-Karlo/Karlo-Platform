<script lang="ts">
	import { page } from '$app/stores';
	import AgreementRevampFormPage from '$lib/pages/AgreementRevampFormPage.svelte';
</script>

<AgreementRevampFormPage basePath="/t" id={$page.params.id ?? null} />
