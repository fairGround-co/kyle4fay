# Video catalog

Goal: every campaign video lives on YouTube (`@Kyle4Fay`) so `videos.html`
can embed it from one place. Facebook stays a distribution channel, not
the archive.

One row per video. "On YouTube" is the gate for adding it to the site.

| # | Title | Date | Length | Facebook URL | YouTube URL | Original file (where) | On YouTube? | On site? | To do |
|---|-------|------|--------|--------------|-------------|------------------------|-------------|----------|-------|
| 1 | Kyle Smith for Ward 4 | | | https://www.facebook.com/reel/2194720271437784/ | https://www.youtube.com/watch?v=1S5LjVOeyxs | | yes | yes | done |
| 2 | Plan the City We Want | | | https://www.facebook.com/reel/1186187764366065/ | https://www.youtube.com/watch?v=dbF4uptLxI8 | | yes | yes | done |
| 3 | Housing Costs | | | https://www.facebook.com/reel/2152800055315729/ | https://www.youtube.com/watch?v=77G5lcHS77s | | yes | yes | done |
| 4 | Fixing Our Infrastructure | | | https://www.facebook.com/reel/2893575557679485/ | https://www.youtube.com/watch?v=LBjzicMyAM0 | | yes | yes | done |
| 5 | Water Leaks | | | https://www.facebook.com/reel/1392252446454901/ | https://www.youtube.com/watch?v=s4Dx9PbDJZ4 | | yes | yes | done |
| 6 | Playing Chicken on Wedington | | | https://www.facebook.com/reel/1604002531509576/ | https://www.youtube.com/watch?v=xwHmdScSZZs | | yes | yes | done |
| 7 | Underwood Golf Course | | | https://www.facebook.com/KyleSmithFayetteviille/posts/pfbid021FjYffaNhCwoL4XEuBgNW89Wa8zybya7xvBAGsRn1vCyC6cRuGc8AaFtdEfu4cXnl | https://www.youtube.com/watch?v=MZDrBH_uVGk | | yes | yes | done |
| 8 | Nerdiest Name | | | https://www.facebook.com/reel/2898381113864780/ | https://www.youtube.com/watch?v=eC-Ahz7-oyk | | yes | yes | done |
| 9 | Affordable Fayetteville | | | https://www.facebook.com/reel/1468931156295316/ |  | | no | no | upload |
| 10 | Voter Registration | | | https://www.facebook.com/reel/1072512782349089/ |  | | no | no | upload |
| 11 | Keaton Smith endorsement | | | https://www.facebook.com/reel/2195981711799357 |  | | no | no | upload |
| 12 | Affordability Forum | | | | https://www.youtube.com/watch?v=V3ejcsGd6kE | | yes | yes | done |
| 13 | FNHA Forum | | | | | Vimeo: https://vimeo.com/1235684269 | no (Vimeo) | yes, Vimeo embed | confirm owner, then upload or leave on Vimeo |

## Status key

- **On YouTube?** yes / no / unlisted
- **To do** one of:
  - `upload` — on Facebook only; download the original (or the Facebook
    copy via Meta Business Suite > Content > Download) and upload to YouTube
  - `embed` — on YouTube, not yet on `videos.html`
  - `retitle` — on YouTube but needs a title, description, or thumbnail
  - `done`

## Upload checklist

1. Upload as **Public** (unlisted works for embeds but won't show on the channel).
2. Title: plain description of the topic, then `| Kyle Smith, Ward 4`.
3. Description: one or two sentences, then `kyle4fay.org`, then the
   "Paid for by Vote for Kyle Smith" disclaimer.
4. Add to a playlist (e.g. Forums, Interviews, Short takes).
5. Copy the video ID into this table and into a new `<article>` in `videos.html`.

## Gaps

- Rows 9-11 are on Facebook only and need uploading to YouTube.
- Dates, lengths, and where the original files live haven't been filled in.
- This list came from Kyle, not a channel export. Check Meta Business Suite
  and YouTube Studio for anything missing.
- **Third-party video**: forum recordings or TV segments (5NEWS, KNWA, the
  Flyer, forum hosts) belong to their owners. Link to them; re-upload only
  with permission.
