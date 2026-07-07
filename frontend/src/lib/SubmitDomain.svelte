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
  <div class="flex">
    <input type="text" 
            id="domain" 
            size="17"
            placeholder="blog.mydomain.com"
            autocorrect="off" spellcheck="false" autocapitalize="off" autocomplete="off"     
            bind:value={domain}
            disabled={submitting}
    />

    <button id="submit" type="submit" disabled={submitting || !domain.trim()}>
        {submitting ? "Checking…" : "Submit"}
    </button>
  </div>

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
  div.flex {
    display: flex; 
    gap: 5px; 
    justify-content:center; 
    width: fit-content;
  }
  input#domain {
    font-size: 9pt;
    padding: 2px 4px;
    border: 1px solid #6EE7B7;
    border-radius: 2px;
    height: 23px;
    width: 200px;
    padding: 0 5px;
    text-align: center;
  }
  button#submit {
    height: 23px;
    padding: 0 5px;
  }
</style>