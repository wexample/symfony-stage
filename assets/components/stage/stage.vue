<script>
import StageHistory from '../../js/Class/StageHistory';
import {
  stageGeometryBoxFromCorners,
  stageGeometryBounds,
  stageGeometryIntersects,
  stageGeometrySnap
} from '../../js/Helper/StageGeometry';
import { buildUniqueId } from '@wexample/js-helpers/Helper/Id';

const T = 'WexampleSymfonyStageBundle.components.stage.stage::';

// What a press on an element leaves to the element itself: a field, a button,
// a link held inside it answers as it would anywhere, and is not a grip.
const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable], [data-stage-no-drag]';

// How far the pointer travels before a press becomes a drag: a click that
// shakes a little is still a click.
const DRAG_THRESHOLD = 3;

// How many grid steps a press of Shift with an arrow moves.
const NUDGE_FAR = 5;

// How much a press of the zoom, or a notch of Ctrl and the wheel, scales.
const ZOOM_STEP = 1.2;

// A neutral surface: what it holds placed on it, moved — and scaled, when
// `zoomable` —, picked, dragged, removed, every change undone and done again.
// It draws nothing of its own between what it holds: what joins them, what
// lies under them — links, regions, ribbons — is drawn by the layers the page
// lays on it (`layers` slot: stage-links, stage-regions, its own), each told
// where the items stand, how big they are and what the pointer does.
//
// The items are the page's own — `v-model:elements`, each a box `{ id, x, y,
// width, height }` with whatever else the page keeps on it. What an item looks
// like is the page's too: the `element` slot, given the item and whether it is
// selected, draws it as any markup — a card, a form, a chart, a canvas.
//
// Where they stand is the page's (their `x`, `y`), or a layout's (`layout`, a
// function of the items and the size each takes, StageLayout): the stage
// measures each item, and lays them again whenever one grows — an item opened
// in place pushes the others. Under a layout, an item is not dragged.
//
// An item's ports — where a link meets it (`ports`, `[{ id, side, y? }]`,
// stage-links) — stand where the item says (`y`), or where its markup marks
// them (`data-stage-port="side:id"` on the row of each): the stage measures
// those as it does the item, and again whenever the item is drawn anew.
//
// An item keeps its own gestures — a list scrolling, a 3D view turning —
// where its markup says so (`data-stage-no-drag`): the surface neither moves
// nor scrolls under them.
//
// `axis: 'x'` keeps the surface on its line, as a timeline is: it moves
// sideways only. `bounded` stops it where what it holds does, `inset` pixels
// from the edges. `scrollable` leaves the moving to the page's own scrollbars:
// the stage as large as what it holds, the surface not dragged, the wheel
// the browser's. `highlighted`
// lights some ids and dims the rest, items and what the layers draw alike.
//
// Read only, the stage takes no focus: its keys all change what it holds.
//
// An item double-clicked is asked open (`open`, its id): what opening it
// means — its editor, its page — is the page's. The surface double-clicked
// asks for something new there (`create`, the point on the surface and on
// the screen).
export default {
  template: '#vue-template-wexample-symfony-stage-bundle-components-stage-stage',

  emits: ['update:elements', 'update:selection', 'remove', 'open', 'create'],

  // What the layers read and call: the stage itself — its placed items, its
  // pan and zoom, its gestures, its history.
  provide() {
    return { stage: this };
  },

  props: {
    elements: {
      type: Array,
      default: () => []
    },
    // How the items are laid: a function `(items, sizes) => Map<id, { x, y }>`
    // (StageLayout), the items handed with the size each takes. None, they
    // stand where their own `x` and `y` put them.
    layout: {
      type: Function,
      default: null
    },
    // Ids lit — items, and what the layers draw —; the others dimmed while any is.
    highlighted: {
      type: Array,
      default: () => []
    },
    // Which way the surface moves: 'both', or 'x' alone.
    axis: {
      type: String,
      default: 'both'
    },
    // The step positions are brought to, in pixels; 0 for none.
    grid: {
      type: Number,
      default: 20
    },
    readonly: {
      type: Boolean,
      default: false
    },
    // Whether the elements picked are taken off the stage by the stage itself
    // (Delete). Either way it says which were asked off (`remove`, their ids):
    // a page that saves each change, keeping them here, asks its server and
    // hands back what is left.
    removable: {
      type: Boolean,
      default: true
    },
    // Whether a change can be undone and done again (Ctrl (⌘) Z, Y): a page
    // saving each change as it is made keeps none — what it saved stays.
    undoable: {
      type: Boolean,
      default: true
    },
    // Whether the surface scales — Ctrl (⌘) and the wheel about the pointer,
    // zoomIn() / zoomOut() / zoomTo() / zoomToFit() from the page —, between `zoomMin` and
    // `zoomMax`. Off, the surface is drawn at its size.
    zoomable: {
      type: Boolean,
      default: false
    },
    zoomMin: {
      type: Number,
      default: 0.25
    },
    zoomMax: {
      type: Number,
      default: 2
    },
    bounded: {
      type: Boolean,
      default: false
    },
    // The room kept between what the stage holds and its edges, bounded or
    // scrollable.
    inset: {
      type: Number,
      default: 0
    },
    scrollable: {
      type: Boolean,
      default: false
    },
    label: {
      type: String,
      default: ''
    }
  },

  data() {
    return {
      items: this.copy(this.elements),
      selection: [],
      // The size each item takes, as measured, by its id.
      sizes: {},
      // Where the ports of each item stand in it, as measured on its markup
      // (`data-stage-port`): by item id, then `side:port`.
      anchors: {},
      // The items drawn where they stand at least once, by id: only from
      // then on is a move of theirs a move to be seen — an item laid where
      // its measure puts it appears there, it does not travel there.
      settled: {},
      // What the layers hand the stage: their state, what they hold.
      layers: [],
      pan: { x: 0, y: 0 },
      // How far the stage scrolls, when scrollable: what it holds, and its inset.
      extent: { width: 0, height: 0 },
      // The surface's scale: 1 draws it at its size.
      zoom: 1,
      gesture: null,
      marquee: null,
      canUndo: false,
      canRedo: false
    };
  },

  computed: {
    extentStyle() {
      return { width: `${this.extent.width}px`, height: `${this.extent.height}px` };
    },

    worldStyle() {
      return { transform: `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})` };
    },

    // The grid moves with the surface: it is drawn on the stage itself,
    // shifted by as much as the surface was.
    stageStyle() {
      return this.grid > 0
        ? { '--stage-grid': `${this.grid * this.zoom}px`, backgroundPosition: `${this.pan.x}px ${this.pan.y}px` }
        : {};
    },

    marqueeStyle() {
      const box = this.marquee;

      return box
        ? {
          left: `${box.x * this.zoom + this.pan.x}px`,
          top: `${box.y * this.zoom + this.pan.y}px`,
          width: `${box.width * this.zoom}px`,
          height: `${box.height * this.zoom}px`
        }
        : {};
    },

    // The items where they stand — their own place, or the layout's —, each
    // with the height it takes when it says none.
    placed() {
      const laid = this.layout ? this.layout(this.items.map((item) => ({ ...item, ...this.sizeOf(item) })), this.sizes) : null;

      return this.items.map((item) => {
        const at = laid?.get(item.id);

        const height = item.height || this.sizes[item.id]?.height || 0;

        return { ...item, ...(at ? { x: at.x, y: at.y } : {}), height, ports: this.portsOf(item, height) };
      });
    },

    byId() {
      return Object.fromEntries(this.placed.map((item) => [item.id, item]));
    },

    resolvedLabel() {
      return this.label || this.trans(`${T}label`);
    }
  },

  watch: {
    // Bounded: held within what it holds from the first frame — not only
    // once moved —, and again whenever what it holds is laid or measured anew.
    // An item placed for the first time is settled once that frame is
    // painted: the frame after, so its first standing is never a move.
    placed() {
      if ((this.bounded || this.scrollable) && !this.gesture) {
        this.$nextTick(() => {
          this.pan = this.clampPan(this.pan);
        });
      }

      const arriving = this.placed.filter((item) => this.isPlaced(item) && !this.settled[item.id]).map((item) => item.id);

      if (arriving.length) {
        this.$nextTick(() => {
          requestAnimationFrame(() => {
            this.settled = { ...this.settled, ...Object.fromEntries(arriving.map((id) => [id, true])) };
          });
        });
      }
    },

    // Changed by the page — loaded, reset —, not by a gesture under way.
    elements(value) {
      if (!this.gesture) {
        this.items = this.copy(value);
        this.dropMissingFromSelection();
        this.settled = Object.fromEntries(Object.keys(this.settled).filter((id) => this.items.some((item) => item.id === id)).map((id) => [id, true]));
        this.anchors = Object.fromEntries(Object.entries(this.anchors).filter(([id]) => this.items.some((item) => item.id === id)));
      }
    }
  },

  created() {
    this.history = new StageHistory();
    // Each item measured as it is drawn and whenever it changes size.
    this.sizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => this.onResize(entries));
    // What is drawn again inside an item — a tab picked, a row added — moves
    // its ports without changing its size: read again, once per frame.
    this.portsObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver((mutations) => {
      if (mutations.some((mutation) => (mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement)?.closest('[data-stage-element]'))) {
        this.measurePortsSoon();
      }
    });
  },

  mounted() {
    const keyboard = this.app.services.keyboard;
    const on = (key, callback, enabled = () => true) => keyboard.registerKeyDown(this, key, callback, {
      preventDefault: true,
      priority: 10,
      enabled: (event) => this.hasFocus() && enabled(event)
    });
    // ⌘ on a Mac, Ctrl elsewhere: `Mod`.
    const shortcut = (combo, callback) => keyboard.registerShortcut(this, combo, callback, {
      preventDefault: true,
      priority: 10,
      enabled: () => this.hasFocus()
    });

    this.observeItems();
    this.portsObserver?.observe(this.$refs.root, { childList: true, subtree: true, characterData: true });

    if (this.bounded || this.scrollable) {
      this.$nextTick(() => {
        this.pan = this.clampPan(this.pan);
      });
    }

    ['Delete', 'Backspace'].forEach((key) => on(key, () => this.removeSelected()));
    on('Escape', () => this.select([]));
    shortcut('Mod+A', () => this.select(this.items.map((item) => item.id)));
    shortcut('Mod+Z', () => this.undo());
    shortcut('Mod+Shift+Z', () => this.redo());
    shortcut('Mod+Y', () => this.redo());

    [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]].forEach(([key, x, y]) => {
      on(key, (event) => this.nudge(x, y, event.shiftKey), () => this.selection.length > 0);
    });
  },

  updated() {
    this.observeItems();
  },

  beforeUnmount() {
    this.app.services.keyboard.unregisterOwner(this);
    this.sizeObserver?.disconnect();
    this.portsObserver?.disconnect();
    cancelAnimationFrame(this.portsFrame);
    this.endGesture();
  },

  methods: {
    copy(value) {
      return JSON.parse(JSON.stringify(value ?? []));
    },

    t(key, parameters = {}) {
      return this.trans(`${T}${key}`, parameters);
    },

    // The keys answer while the stage or one of its elements has the focus —
    // but not while a field inside an element is being written in.
    hasFocus() {
      const active = document.activeElement;

      return !!active && this.$refs.root?.contains(active) && !active.matches(INTERACTIVE);
    },

    isSelected(item) {
      return this.selection.includes(item.id);
    },


    // Lit, dimmed, or neither when nothing is lit.
    lightClass(id) {
      if (!this.highlighted.length) {
        return null;
      }

      return this.highlighted.includes(id) ? 'is-highlighted' : 'is-dimmed';
    },







    // The item itself, as the page keeps it — not its placed copy.
    itemOf(id) {
      return this.items.find((item) => item.id === id);
    },

    boxOf(item) {
      return { ...item, height: item.height || 0 };
    },

    // Whether an item stands where it will: where its own place puts it, or
    // — under a layout, which lays it by its size — once that size is known.
    // Until then it is drawn to be measured, not to be seen.
    isPlaced(item) {
      if (!this.layout) {
        return true;
      }

      const { width, height } = this.sizeOf(item);

      return width > 0 && height > 0;
    },

    // What a layout is told of an item: the size it takes, its own when it
    // says one.
    sizeOf(item) {
      const measured = this.sizes[item.id] ?? {};

      return { width: item.width || measured.width || 0, height: item.height || measured.height || 0 };
    },

    // Every item's box watched for its size: an item opened grows, and the
    // layout lays the others again around it.
    observeItems() {
      if (!this.sizeObserver || !this.$refs.root) {
        return;
      }

      this.$refs.root.querySelectorAll('[data-stage-element]').forEach((el) => {
        if (!el.dataset.stageObserved) {
          el.dataset.stageObserved = '1';
          this.sizeObserver.observe(el);
        }
      });
    },

    onResize(entries) {
      const sizes = { ...this.sizes };
      let changed = false;

      entries.forEach((entry) => {
        const id = entry.target.dataset.stageElement;
        const box = entry.borderBoxSize?.[0];
        const size = {
          width: Math.round(box ? box.inlineSize : entry.target.offsetWidth),
          height: Math.round(box ? box.blockSize : entry.target.offsetHeight)
        };

        if (id && (sizes[id]?.width !== size.width || sizes[id]?.height !== size.height)) {
          sizes[id] = size;
          changed = true;
        }
      });

      if (changed) {
        this.sizes = sizes;
      }

      // Measured along with its size: its rows stand where they will.
      this.measurePorts(entries.map((entry) => entry.target));
    },

    measurePortsSoon() {
      cancelAnimationFrame(this.portsFrame);
      this.portsFrame = requestAnimationFrame(() => this.measurePorts([...(this.$refs.root?.querySelectorAll('[data-stage-element]') ?? [])]));
    },

    // Where the ports of these items stand in them, read on their markup: the
    // middle of each row marked `data-stage-port="side:id"`, from the item's
    // top, on the surface's scale. A row gone — a tab folded over it — keeps
    // the place it had, so the links meet the item where they did. Written
    // only when a row moved: what is written is drawn again, and read again.
    measurePorts(elements) {
      const anchors = { ...this.anchors };
      let changed = false;

      elements.forEach((el) => {
        const id = el.dataset?.stageElement;
        const rows = el.querySelectorAll?.('[data-stage-port]') ?? [];

        if (!id || !rows.length) {
          return;
        }

        const top = el.getBoundingClientRect().top;
        const known = anchors[id] ?? {};
        const found = {};

        rows.forEach((row) => {
          const box = row.getBoundingClientRect();
          found[row.dataset.stagePort] = Math.round((box.top - top + box.height / 2) / this.zoom);
        });

        if (Object.entries(found).some(([key, y]) => known[key] !== y)) {
          anchors[id] = { ...known, ...found };
          changed = true;
        }
      });

      if (changed) {
        this.anchors = anchors;
      }
    },

    // An item's ports, each where it stands: the `y` it says, else the row
    // marked for it in its markup, as measured — else the middle of its edge.
    portsOf(item, height) {
      if (!item.ports?.length) {
        return item.ports;
      }

      const anchors = this.anchors[item.id] ?? {};

      return item.ports.map((port) => ({ ...port, y: port.y ?? anchors[`${port.side}:${port.id}`] ?? height / 2 }));
    },

    // --- What the layers ask of the stage.

    // A layer laid on the stage: `{ name, getState, setState, emitState,
    // onRemoved(ids), onMoved(ids), boxes() }`, each optional but its name —
    // its state in the history, what it says of a removal and a move, what
    // it holds when the surface is bounded.
    registerLayer(layer) {
      this.layers = [...this.layers.filter((other) => other.name !== layer.name), layer];
    },

    unregisterLayer(name) {
      this.layers = this.layers.filter((layer) => layer.name !== name);
    },

    // A change a layer made: written down to be undone, told to the page.
    commitLayers(before) {
      this.commit(before);
    },



    // Placed where it stands — by the page, or by the layout —, as wide as
    // it says or as its markup takes, as tall as it says or as it grows.
    elementStyle(item) {
      const own = this.items.find((candidate) => candidate.id === item.id);

      return {
        left: `${item.x}px`,
        top: `${item.y}px`,
        width: own?.width ? `${own.width}px` : null,
        height: own?.height ? `${own.height}px` : null
      };
    },



    // Where a pointer stands on the surface rather than on the screen.
    toWorld(event) {
      const rect = this.$refs.root.getBoundingClientRect();

      return {
        x: (event.clientX - rect.left + this.$refs.root.scrollLeft - this.pan.x) / this.zoom,
        y: (event.clientY - rect.top + this.$refs.root.scrollTop - this.pan.y) / this.zoom
      };
    },

    // --- What the pointer does.

    // On the root, not the element: a drag captures the pointer there, and
    // the double-click comes to the root whatever was under it — the element
    // read from the point.
    onDoubleClick(event) {
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const id = under?.closest('[data-stage-element]')?.getAttribute('data-stage-element');

      if (id) {
        this.$emit('open', id);
      } else if (!this.readonly && !under?.closest(INTERACTIVE)) {
        const rect = this.$refs.root.getBoundingClientRect();

        this.$emit('create', {
          ...this.toWorld(event),
          left: event.clientX - rect.left,
          top: event.clientY - rect.top
        });
      }
    },

    onPointerDown(event) {
      if (event.button !== 0 || event.target.closest(INTERACTIVE)) {
        return;
      }

      const elementEl = event.target.closest('[data-stage-element]');
      const additive = event.ctrlKey || event.metaKey || event.shiftKey;

      if (!this.readonly) {
        this.$refs.root.focus({ preventScroll: true });
      }

      if (elementEl) {
        const id = elementEl.dataset.stageElement;

        if (additive) {
          this.select(this.selection.includes(id)
            ? this.selection.filter((selected) => selected !== id)
            : [...this.selection, id]);
        } else if (!this.selection.includes(id)) {
          this.select([id]);
        }

        // Under a layout, an item stands where the layout puts it.
        if (!this.readonly && !this.layout && this.selection.includes(id)) {
          this.startGesture(event, {
            type: 'move',
            before: this.state(),
            origins: this.selection.map((selected) => ({ id: selected, x: this.byId[selected].x, y: this.byId[selected].y }))
          });
        }

        return;
      }

      if (event.shiftKey) {
        const start = this.toWorld(event);
        this.startGesture(event, { type: 'marquee', start, base: additive ? [...this.selection] : [] });
        this.marquee = { ...start, width: 0, height: 0 };

        return;
      }

      this.startGesture(event, { type: 'pan', origin: { ...this.pan } });
    },

    startGesture(event, gesture) {
      event.preventDefault();
      this.gesture = { ...gesture, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      this.$refs.root.setPointerCapture(event.pointerId);
      this.$refs.root.addEventListener('pointermove', this.onPointerMove);
      this.$refs.root.addEventListener('pointerup', this.onPointerUp);
      this.$refs.root.addEventListener('pointercancel', this.onPointerUp);
    },

    endGesture() {
      const root = this.$refs.root;

      if (root && this.gesture) {
        root.releasePointerCapture?.(this.gesture.pointerId);
        root.removeEventListener('pointermove', this.onPointerMove);
        root.removeEventListener('pointerup', this.onPointerUp);
        root.removeEventListener('pointercancel', this.onPointerUp);
      }

      this.gesture = null;
      this.marquee = null;
    },

    onPointerMove(event) {
      const gesture = this.gesture;

      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;

      if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }

      gesture.moved = true;

      if (gesture.type === 'pan') {
        // Scrollable: the scrollbars move it, not the pointer.
        if (this.scrollable) {
          return;
        }

        this.pan = this.clampPan({ x: gesture.origin.x + dx, y: this.axis === 'x' ? 0 : gesture.origin.y + dy });
      } else if (gesture.type === 'move') {
        // The pointer travels on the screen, the elements on the surface.
        gesture.origins.forEach((origin) => {
          const item = this.itemOf(origin.id);
          item.x = stageGeometrySnap(origin.x + dx / this.zoom, this.grid);
          item.y = stageGeometrySnap(origin.y + dy / this.zoom, this.grid);
        });
      } else if (gesture.type === 'layer') {
        gesture.onMove?.(event, gesture);
      } else if (gesture.type === 'marquee') {
        this.marquee = stageGeometryBoxFromCorners(gesture.start, this.toWorld(event));
        const picked = this.placed.filter((item) => stageGeometryIntersects(this.marquee, { ...item, height: item.height || 0 }));
        this.select([...new Set([...gesture.base, ...picked.map((item) => item.id)])]);
      }
    },

    onPointerUp(event) {
      const gesture = this.gesture;

      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      if (gesture.type === 'move' && gesture.moved) {
        this.layers.forEach((layer) => layer.onMoved?.(gesture.origins.map((origin) => origin.id)));
        this.commit(gesture.before);
      } else if (gesture.type === 'layer') {
        gesture.onUp?.(event, gesture);
      } else if (gesture.type === 'pan' && !gesture.moved) {
        // A press on the surface that went nowhere: nothing is picked any more.
        this.select([]);
      }

      this.endGesture();
    },







    // A wheel moves the surface; on a line of its own, either way of the
    // wheel moves it along that line.
    // Shift turns the wheel sideways. On a bounded surface free both ways, the
    // wheel moves it down while there is more below, and sideways once there
    // is not — a diagram as tall as the stage reads as a timeline does.
    onWheel(event) {
      // What the page lays over the surface and keeps out of its gestures
      // (`data-stage-no-drag`) — a list, a picker — scrolls itself.
      if (event.target.closest('[data-stage-no-drag]')) {
        return;
      }

      const zooming = this.zoomable && (event.ctrlKey || event.metaKey);

      // Scrollable: the browser scrolls it.
      if (this.scrollable && !zooming) {
        return;
      }

      // Ctrl (⌘) and the wheel scale the surface about the pointer.
      if (zooming) {
        event.preventDefault();

        const rect = this.$refs.root.getBoundingClientRect();
        this.zoomTo(this.zoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        });

        return;
      }

      let dx = event.deltaX;
      let dy = event.deltaY;

      if (event.shiftKey && !dx) {
        [dx, dy] = [dy, 0];
      }

      if (this.axis === 'x') {
        [dx, dy] = [dx || dy, 0];
      } else if (this.bounded && dy && !dx && this.clampPan({ x: this.pan.x, y: this.pan.y - dy }).y === this.pan.y) {
        [dx, dy] = [dy, 0];
      }

      if (!dx && !dy) {
        return;
      }

      const pan = this.clampPan({ x: this.pan.x - dx, y: this.pan.y - dy });

      // Against a bound, the wheel goes on to scroll the page.
      if (pan.x === this.pan.x && pan.y === this.pan.y) {
        return;
      }

      event.preventDefault();
      this.pan = pan;
    },

    // Within what the stage holds, when bounded — its items, and what its
    // layers hold: regions, the routes of links —: a surface smaller than the
    // stage stays at its start. Scrollable, it stays at its start, the stage
    // made as large as it to be scrolled.
    clampPan(pan) {
      const boxes = this.layers.flatMap((layer) => layer.boxes?.() ?? []);
      const bounds = this.bounded || this.scrollable
        ? stageGeometryBounds([...this.placed, ...boxes].map((box) => ({ ...box, height: box.height || 0 })))
        : null;

      if (!bounds) {
        return pan;
      }

      const inset = this.inset;

      if (this.scrollable) {
        this.extent = {
          width: Math.ceil(bounds.width * this.zoom + 2 * inset),
          height: Math.ceil(bounds.height * this.zoom + 2 * inset)
        };

        return { x: inset - bounds.x * this.zoom, y: inset - bounds.y * this.zoom };
      }

      // On the screen: the surface's bounds as scaled.
      const clamp = (value, start, size, view) => Math.min(inset - start * this.zoom, Math.max(view - inset - (start + size) * this.zoom, value));

      return {
        x: clamp(pan.x, bounds.x, bounds.width, this.$refs.root.clientWidth),
        y: this.axis === 'x' ? pan.y : clamp(pan.y, bounds.y, bounds.height, this.$refs.root.clientHeight)
      };
    },

    // --- What changes the stage, written down to be undone.

    // The items, and what each layer keeps (a layer's links).
    state() {
      return {
        elements: this.copy(this.items),
        layers: Object.fromEntries(this.layers.filter((layer) => layer.getState).map((layer) => [layer.name, layer.getState()]))
      };
    },

    // A change made: the state before it goes to the history, the state after
    // it to the page.
    commit(before) {
      if (this.undoable) {
        this.history.record(before);
      }

      this.emitState();
    },

    emitState() {
      this.canUndo = this.history.canUndo();
      this.canRedo = this.history.canRedo();
      this.$emit('update:elements', this.copy(this.items));
      this.layers.forEach((layer) => layer.emitState?.());
    },

    restore(state) {
      this.items = state.elements;
      this.layers.forEach((layer) => {
        if (layer.setState && state.layers && layer.name in state.layers) {
          layer.setState(state.layers[layer.name]);
        }
      });
      this.dropMissingFromSelection();
      this.emitState();
    },

    undo() {
      const state = this.undoable ? this.history.undo(this.state()) : null;

      if (state) {
        this.restore(state);
      }
    },

    redo() {
      const state = this.undoable ? this.history.redo(this.state()) : null;

      if (state) {
        this.restore(state);
      }
    },

    // The same choice again changes nothing, and is not told: a page that
    // picks what it is shown — an element pointed at from elsewhere —
    // would hear its own choice back and answer it again.
    select(ids) {
      if (ids.length === this.selection.length && ids.every((id, index) => id === this.selection[index])) {
        return;
      }

      this.selection = ids;
      this.$emit('update:selection', [...ids]);
    },

    dropMissingFromSelection() {
      const kept = this.selection.filter((id) => this.items.some((item) => item.id === id));

      if (kept.length !== this.selection.length) {
        this.select(kept);
      }
    },

    nudge(x, y, far) {
      if (this.readonly || this.layout) {
        return;
      }

      const step = (this.grid > 0 ? this.grid : 1) * (far ? NUDGE_FAR : 1);
      const before = this.state();

      this.selection.forEach((id) => {
        this.itemOf(id).x += x * step;
        this.itemOf(id).y += y * step;
      });

      this.layers.forEach((layer) => layer.onMoved?.([...this.selection]));
      this.commit(before);
    },


    removeSelected() {
      if (this.readonly || !this.selection.length) {
        return;
      }

      this.$emit('remove', [...this.selection]);

      if (!this.removable) {
        return;
      }

      const before = this.state();
      const removed = new Set(this.selection);

      this.items = this.items.filter((item) => !removed.has(item.id));
      this.layers.forEach((layer) => layer.onRemoved?.([...removed]));
      this.select([]);
      this.commit(before);
    },

    // An element the page adds — dropped from a palette, created by a button:
    // laid on the grid, picked, and undoable like any change.
    add(element) {
      const before = this.state();
      const item = {
        id: buildUniqueId('stage-element'),
        ...element,
        x: stageGeometrySnap(element.x ?? 0, this.grid),
        y: stageGeometrySnap(element.y ?? 0, this.grid)
      };

      this.items.push(item);
      this.select([item.id]);
      this.commit(before);

      return item;
    },


    // The surface moved so that what it holds stands in the middle of the
    // stage — on the line it moves along, with an `x` axis.
    center() {
      const bounds = stageGeometryBounds(this.placed.map((item) => ({ ...item, height: item.height || 0 })));
      const root = this.$refs.root;

      if (!bounds || !root) {
        this.pan = { x: 0, y: 0 };

        return;
      }

      this.pan = {
        x: Math.round((root.clientWidth - bounds.width * this.zoom) / 2 - bounds.x * this.zoom),
        y: this.axis === 'x' ? 0 : Math.round((root.clientHeight - bounds.height * this.zoom) / 2 - bounds.y * this.zoom)
      };
    },

    // The surface moved so that one element stands in the middle: what a
    // page points at from elsewhere is brought under the eye, the zoom left
    // as the reader set it. An id the stage does not hold moves nothing.
    centerOn(id) {
      const item = this.byId[id];
      const root = this.$refs.root;

      if (!item || !root) {
        return;
      }

      if (this.scrollable) {
        root.scrollTo({
          left: this.pan.x + (item.x + (item.width || 0) / 2) * this.zoom - root.clientWidth / 2,
          top: this.pan.y + (item.y + (item.height || 0) / 2) * this.zoom - root.clientHeight / 2,
          behavior: 'smooth'
        });

        return;
      }

      this.pan = {
        x: Math.round(root.clientWidth / 2 - (item.x + (item.width || 0) / 2) * this.zoom),
        y: this.axis === 'x' ? 0 : Math.round(root.clientHeight / 2 - (item.y + (item.height || 0) / 2) * this.zoom)
      };
    },

    zoomIn() {
      this.zoomTo(this.zoom * ZOOM_STEP);
    },

    zoomOut() {
      this.zoomTo(this.zoom / ZOOM_STEP);
    },

    // The surface scaled to `zoom`, within its bounds, about a point of the
    // stage (`anchor`, on the screen) that stays where it is — its middle when
    // none is given.
    zoomTo(zoom, anchor = null) {
      const root = this.$refs.root;
      const next = Math.min(this.zoomMax, Math.max(this.zoomMin, zoom));

      if (!this.zoomable || !root || next === this.zoom) {
        return;
      }

      const point = anchor ?? { x: root.clientWidth / 2, y: root.clientHeight / 2 };
      const ratio = next / this.zoom;

      this.zoom = next;
      this.pan = this.clampPan({
        x: Math.round(point.x - (point.x - this.pan.x) * ratio),
        y: this.axis === 'x' ? 0 : Math.round(point.y - (point.y - this.pan.y) * ratio)
      });
    },

    // The surface scaled so that what it holds fits in the stage, a step in
    // from its edges — within the zoom's bounds —, and brought to its middle.
    zoomToFit() {
      const bounds = stageGeometryBounds(this.placed.map((item) => ({ ...item, height: item.height || 0 })));
      const root = this.$refs.root;
      const margin = 2 * (this.grid > 0 ? this.grid : 16);

      if (this.zoomable && bounds && root && bounds.width && bounds.height) {
        const fits = Math.min(
          (root.clientWidth - 2 * margin) / bounds.width,
          this.axis === 'x' ? Infinity : (root.clientHeight - 2 * margin) / bounds.height
        );

        this.zoom = Math.min(this.zoomMax, Math.max(this.zoomMin, fits));
      }

      this.center();
    },

    // The surface moved so that what it holds starts at its top left corner,
    // a step in.
    fit() {
      const bounds = stageGeometryBounds(this.placed.map((item) => ({ ...item, height: item.height || 0 })));
      const margin = this.grid > 0 ? this.grid : 16;

      this.pan = bounds
        ? { x: margin - bounds.x * this.zoom, y: this.axis === 'x' ? 0 : margin - bounds.y * this.zoom }
        : { x: 0, y: 0 };
    }
  }
};
</script>
