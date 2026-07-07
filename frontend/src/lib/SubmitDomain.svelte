<script>
  import { submitDomain } from "./api";
  
  let domain = $state("");
  let submitting = $state(false);
  let result = $state(null); // { domain, status, message } | { error }
 
  // --- validate input (done again in the backend) ---

  const DOMAIN_DENYLIST = new Set(["substack.com", "www.substack.com", "hnsubstacks.com"]);
  const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

  function normalizeDomain(input) {
    if (typeof input !== "string") return null;
    let d = input.trim().toLowerCase();
    if (d.length === 0 || d.length > 253) return null;
    if (!/^https?:\/\//.test(d)) d = "https://" + d;

    let host;
    try {
        host = new URL(d).hostname;
    } catch {
        return null;
    }

    if (host.startsWith("www.")) host = host.slice(4);
    if (!DOMAIN_REGEX.test(host)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;

    return host;
  }

  export function validateDomain(input) {
    const normalized = normalizeDomain(input);
    if (!normalized) return "That doesn't look like a valid domain.";
    if (DOMAIN_DENYLIST.has(normalized) || normalized.endsWith(".substack.com")) {
        return "That domain doesn't need to be submitted.";
    }
    return null;
  }

  // --- submit ---
  
  async function submit(ev) {
    ev.preventDefault();
    result = null;

    const validation = validateDomain(domain)
    if (validation !== null) {
      result = { status: "rejected", message: validation }
      return;
    }

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
    <p class="error">{result.error}</p>
  {:else if result}
    <p class="status status-{result.status}">
      {({ approved: "✅", rejected: "❌", pending: "⏳" }[result.status]) || ""}
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