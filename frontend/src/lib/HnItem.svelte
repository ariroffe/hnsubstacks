<script>
  import { flagDomain } from './api.js';
  
  let { story, rank, flagStates = $bindable() } = $props();

  function timeAgo(timestamp) {
    const seconds = Math.floor(Date.now() / 1000) - timestamp;
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  function domain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  // --- flagging ---
  let storyDomain = $derived(domain(story.url));
  let flaggable = $derived(storyDomain !== 'substack.com' && !storyDomain.endsWith('.substack.com'));
  let flagState = $derived(flagStates[storyDomain] ?? 'idle'); // 'idle' | 'loading' | 'flagged' | 'error'

  async function handleFlag() {
    if (!flaggable || flagState !== 'idle') return;
    const confirmed = confirm(
      "Flag this only if you believe this domain isn't actually a Substack publication. For other issues, please flag the story on Hacker News itself. Continue?"
    );
    if (!confirmed) return;

    flagStates[storyDomain] = 'loading'; // instantly reflects on every row with this domain
    const result = await flagDomain(storyDomain);
    flagStates[storyDomain] = result.error ? 'error' : 'flagged';
  }
</script>

<tr class="athing submission" id={story.objectID}>
  <td class="title" align="right" valign="top">
    <span class="rank">{rank}.</span>
  </td>
  <td valign="top" class="votelinks" style="width: 10px"></td>
  <td class="title">
    <span class="titleline">
      <a href={story.url}>{story.title}</a>
      <span class="sitebit comhead">
        (<a href={`https://news.ycombinator.com/from?site=${storyDomain}`}><span class="sitestr">{storyDomain}</span></a>)
      </span>
    </span>
  </td>
</tr>

<tr>
  <td colspan="2"></td>
  <td class="subtext">
    <span class="subline">
      <span class="score" id={`score_${story.objectID}`}>
        {story.points} point{story.points !== 1 ? 's' : ''}
      </span>
      by <a href={`https://news.ycombinator.com/user?id=${story.author}`} class="hnuser">{story.author}</a>
      <span class="age" title={new Date(story.created_at).toISOString()}>
        <a href={`https://news.ycombinator.com/item?id=${story.objectID}`}>{timeAgo(story.created_at_i)}</a>
      </span>
      |
      {#if flagState === 'idle' || flagState === 'error'}
        {#if flaggable}
          <a href="javascript:void(0)" onclick={handleFlag}>
            {flagState === 'error' ? 'flag failed, retry' : 'flag'}
          </a>
        {:else}
          <span class="flag-disabled" title="Only non-Substack domains can be flagged">flag</span>
        {/if}
      {:else if flagState === 'loading'}
        <span class="flag-pending">flagging&hellip;</span>
      {:else if flagState === 'flagged'}
        <span class="flag-done">flagged</span>
      {/if}
      |
      <a href={`https://news.ycombinator.com/item?id=${story.objectID}`}>
        {story.num_comments > 0 ? `${story.num_comments}\u00A0comment${story.num_comments !== 1 ? 's' : ''}` : 'discuss'}
      </a>
    </span>
  </td>
</tr>

<tr class="spacer" style="height:5px"></tr>


<style>
  span.flag-disabled {
    color: #bbb;
    cursor: not-allowed;
  }
</style>