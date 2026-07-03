<script>
  import { submitDomain } from "./api";
  const WORKER_URL = "https://your-worker.example.workers.dev"; // update me
 
  let domain = $state("");
  let submitting = $state(false);
  let result = $state(null); // { domain, status, message } | { error }
 
  async function submit(ev) {
    ev.preventDefault();
    result = null;
    if (!domain.trim()) return;
    submitting = true;
    
    result = await submitDomain(domain);
    submitting = false;
  }

</script>

<form onsubmit={submit}>
  Custom domain? Request addition:<br>
  <input type="text" 
         id="domain" 
         size="17" 
         autocorrect="off" spellcheck="false" autocapitalize="off" autocomplete="off"     
         bind:value={domain}
         disabled={submitting}
  />

  <button type="submit" disabled={submitting || !domain.trim()}>
    {submitting ? "Checking…" : "Submit"}
  </button>

  {#if result?.error}
    <br>
    <p class="error">{result.error}</p>
  {:else if result}
    <br>
    <p class="status status-{result.status}">
        {{ approved: "✅", rejected: "❌", pending: "⏳" }[result.status] || ""}
        {result.message}
    </p>
  {/if}
</form>

<style>
  p.error, 
  p.status {
    margin-top: 3px;
  }
  p.error, 
  p.status-rejected {
    color: red;
  }
  p.status-approved {
    color: green;
  }
</style>