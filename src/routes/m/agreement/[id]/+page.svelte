<script lang="ts">
	import { page } from '$app/stores';
	import AgreementRevampDocumentPage from '$lib/pages/AgreementRevampDocumentPage.svelte';
</script>

{#key $page.params.id}
	<AgreementRevampDocumentPage basePath="/m" id={$page.params.id ?? ''} />
{/key}
