<script>
  import { fetchStories } from './lib/api.js';
  import HnItem from './lib/HnItem.svelte';
  import SubmitDomain from './lib/SubmitDomain.svelte';

  const PAGE_SIZE = 30;
  const DEFAULT_SORT = 'hot';

  // domain -> 'idle' | 'loading' | 'flagged' | 'error'
  let flagStates = $state({});

  let { sortBy, page } = $state(paramsFromUrl());
  let storiesPromise = $state(fetchStories(sortBy));
  
  function paramsFromUrl() {
    const params = new URLSearchParams(location.search);
    let sort = DEFAULT_SORT;
    const sortParam = params.get('sort');
    if (sortParam === "new") sort = "new";
    if (sortParam === "best") sort = "best";
    const page = parseInt(params.get('p'), 10);
    return { sortBy: sort, page: page && page > 0 ? page : 1 };
  }

  // Single entry point for any state change (sort click, pagination, popstate).
  // Updates state, refetches if sort changed, syncs the URL, and scrolls to top.
  function applyParams(newParams, { pushHistory = true, scroll = true } = {}) {
    const sortChanged = newParams.sortBy !== undefined && newParams.sortBy !== sortBy;

    if (newParams.sortBy !== undefined) sortBy = newParams.sortBy;
    if (newParams.page !== undefined) page = newParams.page;

    if (sortChanged) {
      storiesPromise = fetchStories(sortBy);
    }

    if (pushHistory) {
      const params = new URLSearchParams();
      if (sortBy !== DEFAULT_SORT) params.set('sort', sortBy);
      if (page !== 1) params.set('p', page);
      const query = params.toString();
      history.pushState({ sortBy, page }, '', query ? `?${query}` : location.pathname);
    }

    if (scroll) window.scrollTo(0, 0);
  }

  function changeSort(newSortBy) {
    if (newSortBy === sortBy) return;
    applyParams({ sortBy: newSortBy, page: 1 });
  }

  function nextPage(totalHits) {
    const maxPage = Math.ceil(totalHits / PAGE_SIZE);
    if (page < maxPage) applyParams({ page: page + 1 });
  }

  function prevPage() {
    if (page > 1) applyParams({ page: page - 1 });
  }

  $effect(() => {
    function handlePopState() {
      applyParams(paramsFromUrl(), { pushHistory: false });
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  });

  // Search box
  let search = $state('');
  function matchesSearch(story, query) {
    const q = query.toLowerCase();
    const title = (story.title || '').toLowerCase();
    const url = (story.url || '').toLowerCase();
    return title.includes(q) || url.includes(q);
  }

  function handleSearchInput(e) {
    search = e.target.value;
    // Reset to page 1 whenever the filter changes so results aren't hidden on a stale page
    if (page !== 1) applyParams({ page: 1 }, { pushHistory: false, scroll: false });
  }
</script>

<table id="hnmain" border="0" cellpadding="0" cellspacing="0" width="85%" bgcolor="#f6f6ef">
  <tbody>
    <tr>
      <td bgcolor="#10B981">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:2px">
          <tbody>
            <tr>
              <td style="width:18px;padding-right:4px">
                <a href="https://hnsubstacks.com">
                  <img src="/hnsubstacks.jpeg" width="18" height="18" style="border:1px #999 solid; display:block">
                </a>
              </td>
              <td style="line-height:12pt; height:10px;">
                <span class="pagetop">
                  <b class="hnname"><a href="/">hnsubstacks</a></b>
                  <button class={sortBy === "hot" ? "active" : ""} onclick={() => changeSort('hot')}>hot</button>
                  |
                  <button class={sortBy === "new" ? "active" : ""} href="/" onclick={() => changeSort('new')}>new</button>
                  |
                  <button class={sortBy === "best" ? "active" : ""} href="/" onclick={() => changeSort('best')}>best</button>
                  |
                  <label for="search-box">filter:</label>
                  <input type="text" id="search-box" placeholder="title or url..." value={search} oninput={handleSearchInput} />
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>

    <tr style="height:10px"></tr>
    
    <tr id="bigbox">
      <td>
        {#await storiesPromise}
          <p class="loading">Loading...</p>
        {:then stories}
          {@const filteredHits = search ? stories.hits.filter((story) => matchesSearch(story, search)) : stories.hits}
          {@const start = (page - 1) * PAGE_SIZE}
          {@const pageHits = filteredHits.slice(start, start + PAGE_SIZE)}

          {#if pageHits.length > 0}
            <table border="0" cellpadding="0" cellspacing="0">
                <tbody>
                {#each pageHits as story, i (story.objectID)}
                    <HnItem {story} rank={start + i + 1} bind:flagStates />
                {/each}
                <tr class="morespace" style="height:10px"></tr>
                <tr>
                    <td colspan="2"></td>
                    <td class='title'>
                    {#if start + PAGE_SIZE < stories.hits.length}
                        <a href="?p={page + 1}" class='morelink' rel='next' 
                        onclick={(e) => { e.preventDefault(); nextPage(stories.hits.length); }}>
                        More
                        </a>
                    {/if}
                    </td>
                </tr>
                </tbody>
            </table>
          {:else}
            <p class="loading">Nothing to show.</p>
          {/if}
        {:catch error}
          <p class="loading">Failed to load stories.</p>
        {/await}
      </td>
    </tr>

    <tr>
        <td><img src="https://news.ycombinator.com/s.gif" height="10" width="0">
            <table width="100%" cellspacing="0" cellpadding="1">
              <tbody>
                <tr>
                  <td bgcolor="#10B981"></td>
                </tr>
              </tbody>
            </table>
            <br>
            <center>
              <span class="yclinks"><a target="_blank", href="https://news.ycombinator.com/item?id=48818416">About hnsubstacks</a> | <a target="_blank" href="https://github.com/ariroffe/hnsubstacks/">Repo</a> | <a
                  target="_blank" href="https://arielroffe.quest/">Author</a></span>
                  <br>
                  <br>
                  <SubmitDomain />
            </center>
        </td>
    </tr>
  </tbody>
</table>

<style>
  span.pagetop button, 
  span.pagetop label {
    outline: none;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  span.pagetop button.active {
    color: white;
  }
  p.loading {
    padding-left: 10px;
  }
  input#search-box {
    font-size: 10pt;
    padding: 2px 4px;
    border: 1px solid #999;
    border-radius: 2px;
    height: 19px;
    width: 140px;
    padding: 0 5px;
  }
  input#search-box::placeholder {
    font-family: Verdana, Geneva, sans-serif;
    font-size: inherit;
    color: #828282;
  }
</style>