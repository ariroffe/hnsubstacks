<script>
  let { story, rank } = $props();

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
        (<a href={`https://news.ycombinator.com/from?site=${domain(story.url)}`}><span class="sitestr">{domain(story.url)}</span></a>)
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
      <a href={`https://news.ycombinator.com/item?id=${story.objectID}`}>
        {story.num_comments > 0 ? `${story.num_comments}\u00A0comment${story.num_comments !== 1 ? 's' : ''}` : 'discuss'}
      </a>
    </span>
  </td>
</tr>

<tr class="spacer" style="height:5px"></tr>