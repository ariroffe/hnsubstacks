<script>
  import stories from './data/stories.json';
  import HnItem from './lib/HnItem.svelte';
</script>

<table id="hnmain" border="0" cellpadding="0" cellspacing="0" width="85%" bgcolor="#f6f6ef">
  <tbody>
    <tr>
      <td bgcolor="#ff6600">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="padding:2px">
          <tbody>
            <tr>
              <td style="width:18px;padding-right:4px">
                <a href="https://news.ycombinator.com">
                  <img src="y18.svg" width="18" height="18" style="border:1px white solid; display:block">
                </a>
              </td>
              <td style="line-height:12pt; height:10px;">
                <span class="pagetop">
                  <b class="hnname"><a href="/">hnsubstacks</a></b>
                  <a href="/">top</a>
                  |
                  <a href="/new">new</a>
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
        <table border="0" cellpadding="0" cellspacing="0">
          <tbody>
            {#each stories.hits as story, i}
              <HnItem {story} rank={i+1} />
            {/each}

            <tr class="morespace" style="height:10px"></tr>
            <tr>
              <td colspan="2"></td>
              <td class='title'><a href='?p=2' class='morelink' rel='next'>More</a></td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>

    <tr>
        <td><img src="https://news.ycombinator.com/s.gif" height="10" width="0">
            <table width="100%" cellspacing="0" cellpadding="1">
              <tbody>
                <tr>
                    <td bgcolor="#ff6600"></td>
                </tr>
              </tbody>
            </table>
            <br>
            <center>
              <span class="yclinks"><a href="/about/">About hnsubstacks</a> | <a href="#">Repo</a> | <a
                  target="_blank" href="https://arielroffe.quest/">Author</a></span><br><br>
                <form method="get" action="#">Request addition of domain: <input type="text" name="q" size="17"
                  autocorrect="off" spellcheck="false" autocapitalize="off" autocomplete="off"></form>
            </center>
        </td>
    </tr>
  </tbody>
</table>
