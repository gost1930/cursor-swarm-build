# cursor-swarm-build

A swarm of named cursors scans your page, then **rebuilds it layer by layer**: outlines are dragged
out around boxes and pictures, text is typed in with a caret, and the page scrolls along. When it
ends, your page is exactly as it was. Think of it as a page rebuild animation you can drop on any
site.

**[Live demo](demo/index.html)**: a full-length landing page, with speed, tour, right-to-left and
dark-mode switches.

- **Hand-like cursors.** Curved paths with a natural speed profile, a faint tremor, a lean into the
  direction of travel, a click ripple where work starts, and a name tag on every cursor.
- **Smooth auto-scroll.** Two critically damped springs glide the page to where the swarm is
  working and back to the top at the end: no jolts, no stops, no snapping.
- **Real layers.** Text, pictures and styled boxes are found in the DOM and rebuilt in reading
  order, with snapping guides and live size tags. Right-to-left text types from the right.
- **Controls.** A small bar (progress, tour, speed 1x/2x/4x, skip) in a shadow root, plus Esc.
- **Safe.** Respects `prefers-reduced-motion`, restores every element it touched, no dependencies,
  ES module with types.
- **Replay gate.** `createReplayGate` plays the intro the first time and again only after a big
  change.

## Install

```sh
npm install cursor-swarm-build
```

## Use

```js
import { buildIntro } from 'cursor-swarm-build'

const intro = buildIntro(document.querySelector('#app'))
await intro.finished // the page is whole again
```

`buildIntro` hides the layers under the container at once (before the next paint if you call it
early), waits for fonts, plays, and puts everything back. `intro.skip()` ends it immediately.

### Options

| Option | Default | What it does |
| --- | --- | --- |
| `labels` | English | Words for the control bar: `scanning`, `agents`, `layers`, `tour`, `touring`, `tourHint`, `speedHint`, `skipHint`. `{agents}`, `{done}` and `{total}` are filled in. |
| `speed` | `1` | Start at 1, 2 or 4 times. The speed button cycles through them. |
| `tour` | `true` | Scroll along with the build. Scrolling by hand turns it off. |
| `cursor` | arrow | How the cursors look, see [Change the cursor](#change-the-cursor). |
| `hud` | `true` | Show the control bar. |
| `respectReducedMotion` | `true` | Do nothing for visitors who asked for less motion. |
| `zIndex` | `2147483000` | Stacking level of the overlay. |
| `onProgress` | none | Called as layers finish: `{ phase, done, total, agents }`. |

### Change the cursor

```js
buildIntro(root, {
  cursor: {
    style: 'classic',            // 'arrow' (default), 'classic', 'dot', 'crosshair' or 'custom'
    size: 1.2,                   // scale the pointer
    tags: true,                  // show a name beside every cursor
    names: ['Ada', 'Linus'],     // used in turn
    colors: ['#ff3d71', '#2f6bff'], // any CSS color, used in turn
  },
})
```

Want your own pointer? Pass any SVG path as `style: 'custom'`. It is drawn with its tip at `0, 0`
and should be about 24 units tall:

```js
buildIntro(root, {
  cursor: { style: 'custom', path: 'M0 0 L0 20 L5 15 L9 23 L12 21.5 L8 14 L14 14 Z' },
})
```

### Play it only when it is worth it

```js
import { buildIntro, createReplayGate } from 'cursor-swarm-build'

const gate = createReplayGate(3) // replay after 3 or more changes

function show(pageKey, items /* Map<id, fingerprint> */) {
  if (!gate.shouldPlay(pageKey, items)) return
  gate.markPlayed(pageKey, items)
  buildIntro(document.querySelector('#app'))
}
```

The first time a key is seen it plays. After that it plays again only once at least `threshold`
items were added, removed or changed since it last played.

## Try the demo

```sh
npm install
npm run build
python3 -m http.server   # or: npx serve .
# open http://localhost:8000/demo/index.html
```

## How it works

1. **Layers.** Every element under the container that has text of its own, is a picture, or has a
   look of its own (background, border, shadow) becomes a layer, in reading order.
2. **Plan.** Layers are shared out among 6 to 14 cursors on a timeline that always fits in about
   14 seconds at 1x, however large the page. Each cursor's route is a chain of curved moves with
   pauses, so the swarm never moves in straight, robotic lines.
3. **Play.** Layers are hidden, then each is outlined or typed by its cursor on a canvas overlay
   and revealed. Everything is restored when the timeline ends or on skip.

## Credits

The idea of a crowd of cursors rebuilding a page was shown by
[Swarm](https://github.com/califa/swarm-site). cursor-swarm-build is an independent implementation: it
shares no code with it.

## License

[MIT](LICENSE) © 2026 Hadbi Mohamed ([gost1930](https://github.com/gost1930))
