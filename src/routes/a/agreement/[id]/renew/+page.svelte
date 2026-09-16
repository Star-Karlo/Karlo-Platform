<script lang="ts">
	import { page } from '$app/stores';
	import AgreementRevampFormPage from '$lib/pages/AgreementRevampFormPage.svelte';
</script>

<AgreementRevampFormPage basePath="/a" id={$page.params.id ?? null} />
