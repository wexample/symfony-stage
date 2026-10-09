<script>
import StageHistory from '../../js/Class/StageHistory';
import {
  stageGeometryBoxFromCorners,
  stageGeometryBounds,
  stageGeometryIntersects,
  stageGeometryLabelPoint,
  stageGeometryLinkPath,
  stageGeometryPolyline,
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

// A surface the pointer moves, and elements laid on it: picked, dragged,
// linked, removed, and every change undone and done again.
//
// The elements are the page's own — `v-model:elements`, each a box `{ id, x,
// y, width, height }` with whatever else the page keeps on it — and so are the
// links between them, `v-model:links`, `{ id, from, to }`. The stage draws
// them, knows nothing of what they mean, and hands back each change once it is
// made. What an element looks like is the page's too: the `element` slot,
// given the element and whether it is selected, draws it as any markup — a
// card, a form, a chart.
//
// A link may carry its own route (`points`, `[[x, y], …]`), a `label` drawn on
// it and a `kind` the page styles it by (`stage--link--<kind>`). Regions
// (`regions`, `{ id, x, y, width, height, title, kind }`) are drawn under
// everything — the lanes of a process, the days of a planning —, a title in
// their head. `highlighted` lights some elements and links and dims the rest:
// a path walked, a search.
//
// `axis: 'x'` keeps the surface on its line, as a timeline is: it moves
// sideways only. `bounded` stops it where what it holds does, its first
// element or region at the edge, its last one at the other: nothing is ever
// drawn past them to go and look at. The surface is not zoomed.
//
// Read only, the stage takes no focus: its keys all change what it holds.
export default {
  template: '#vue-template-wexample-symfony-stage-bundle-components-stage-stage',

  emits: ['update:elements', 'update:links', 'update:selection'],

  props: {
    elements: {
      type: Array,
      default: () => []
    },
    links: {
      type: Array,
      default: () => []
    },
    regions: {
      type: Array,
      default: () => []
    },
    // Ids of elements and links lit; the others dimmed while any is.
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
    bounded: {
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
      edges: this.copy(this.links),
      selection: [],
      pan: { x: 0, y: 0 },
      gesture: null,
      marquee: null,
      canUndo: false,
      canRedo: false,
      markerId: buildUniqueId('stage-arrow')
    };
  },

  computed: {
    worldStyle() {
      return { transform: `translate(${this.pan.x}px, ${this.pan.y}px)` };
    },

    // The grid moves with the surface: it is drawn on the stage itself,
    // shifted by as much as the surface was.
    stageStyle() {
      return this.grid > 0
        ? { '--stage-grid': `${this.grid}px`, backgroundPosition: `${this.pan.x}px ${this.pan.y}px` }
        : {};
    },

    marqueeStyle() {
      const box = this.marquee;

      return box
        ? {
          left: `${box.x + this.pan.x}px`,
          top: `${box.y + this.pan.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`
        }
        : {};
    },

    byId() {
      return Object.fromEntries(this.items.map((item) => [item.id, item]));
    },

    // A link whose ends are not both on the stage is not drawn.
    drawnLinks() {
      return this.edges.filter((link) => this.byId[link.from] && this.byId[link.to]);
    },

    resolvedLabel() {
      return this.label || this.trans(`${T}label`);
    }
  },

  watch: {
    // Changed by the page — loaded, reset —, not by a gesture under way.
    elements(value) {
      if (!this.gesture) {
        this.items = this.copy(value);
        this.dropMissingFromSelection();
      }
    },

    links(value) {
      if (!this.gesture) {
        this.edges = this.copy(value);
      }
    }
  },

  created() {
    this.history = new StageHistory();
  },

  mounted() {
    const keyboard = this.app.services.keyboard;
    const on = (key, callback, enabled = () => true) => keyboard.registerKeyDown(this, key, callback, {
      preventDefault: true,
      priority: 10,
      enabled: (event) => this.hasFocus() && enabled(event)
    });
    const command = (event) => (event.ctrlKey || event.metaKey) && !event.altKey;

    ['Delete', 'Backspace'].forEach((key) => on(key, () => this.removeSelected()));
    on('Escape', () => this.select([]));
    ['a', 'A'].forEach((key) => on(key, () => this.select(this.items.map((item) => item.id)), command));
    ['z', 'Z'].forEach((key) => on(key, (event) => (event.shiftKey ? this.redo() : this.undo()), command));
    ['y', 'Y'].forEach((key) => on(key, () => this.redo(), command));

    [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]].forEach(([key, x, y]) => {
      on(key, (event) => this.nudge(x, y, event.shiftKey), () => this.selection.length > 0);
    });
  },

  beforeUnmount() {
    this.app.services.keyboard.unregisterOwner(this);
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

    isLinkSelected(link) {
      return this.selection.includes(link.from) && this.selection.includes(link.to);
    },

    // Lit, dimmed, or neither when nothing is lit.
    lightClass(id) {
      if (!this.highlighted.length) {
        return null;
      }

      return this.highlighted.includes(id) ? 'is-highlighted' : 'is-dimmed';
    },

    linkLabelPoint(link) {
      return stageGeometryLabelPoint(link.points ?? this.defaultLinkPoints(link));
    },

    defaultLinkPoints(link) {
      const from = this.byId[link.from];
      const to = this.byId[link.to];

      return [[from.x + from.width, from.y + (from.height || 0) / 2], [to.x, to.y + (to.height || 0) / 2]];
    },

    regionStyle(region) {
      return {
        left: `${region.x}px`,
        top: `${region.y}px`,
        width: `${region.width}px`,
        height: `${region.height}px`
      };
    },

    // A region's title stays against the stage's left edge while the surface
    // moves past it, as long as the region is in view: a lane followed far
    // along is still named.
    regionTitleStyle(region) {
      const behind = Math.max(0, -(this.pan.x + region.x));

      return behind ? { left: `${Math.max(0, Math.min(behind, region.width - 32))}px` } : null;
    },

    elementStyle(item) {
      return {
        left: `${item.x}px`,
        top: `${item.y}px`,
        width: `${item.width}px`,
        height: item.height ? `${item.height}px` : null
      };
    },

    // A route of its own is followed while neither end has moved since it
    // was drawn; once one has, the link is drawn afresh between them.
    linkPath(link) {
      return link.points && !this.movedSinceRouted(link)
        ? stageGeometryPolyline(link.points)
        : stageGeometryLinkPath(this.byId[link.from], this.byId[link.to]);
    },

    // Moving under the pointer right now: the route waits for the drop to be
    // dropped, and the link follows the element meanwhile.
    movedSinceRouted(link) {
      const moving = this.gesture?.type === 'move' && this.gesture.moved
        ? this.gesture.origins.map((origin) => origin.id)
        : [];

      return moving.includes(link.from) || moving.includes(link.to);
    },

    // Where a pointer stands on the surface rather than on the screen.
    toWorld(event) {
      const rect = this.$refs.root.getBoundingClientRect();

      return { x: event.clientX - rect.left - this.pan.x, y: event.clientY - rect.top - this.pan.y };
    },

    // --- What the pointer does.

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

        if (!this.readonly && this.selection.includes(id)) {
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
        this.pan = this.clampPan({ x: gesture.origin.x + dx, y: this.axis === 'x' ? 0 : gesture.origin.y + dy });
      } else if (gesture.type === 'move') {
        gesture.origins.forEach((origin) => {
          const item = this.byId[origin.id];
          item.x = stageGeometrySnap(origin.x + dx, this.grid);
          item.y = stageGeometrySnap(origin.y + dy, this.grid);
        });
      } else if (gesture.type === 'marquee') {
        this.marquee = stageGeometryBoxFromCorners(gesture.start, this.toWorld(event));
        const picked = this.items.filter((item) => stageGeometryIntersects(this.marquee, { ...item, height: item.height || 0 }));
        this.select([...new Set([...gesture.base, ...picked.map((item) => item.id)])]);
      }
    },

    onPointerUp(event) {
      const gesture = this.gesture;

      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }

      if (gesture.type === 'move' && gesture.moved) {
        this.forgetRoutes(gesture.origins.map((origin) => origin.id));
        this.commit(gesture.before);
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

    // Within what the stage holds, when bounded — its elements, its regions,
    // the routes of its links: a surface smaller than the stage stays at its
    // start.
    clampPan(pan) {
      const points = this.drawnLinks.flatMap((link) => link.points ?? []).map(([x, y]) => ({ x, y, width: 0, height: 0 }));
      const bounds = this.bounded
        ? stageGeometryBounds([...this.items, ...this.regions, ...points].map((box) => ({ ...box, height: box.height || 0 })))
        : null;

      if (!bounds) {
        return pan;
      }

      const clamp = (value, start, size, view) => Math.min(-start, Math.max(view - (start + size), value));

      return {
        x: clamp(pan.x, bounds.x, bounds.width, this.$refs.root.clientWidth),
        y: this.axis === 'x' ? pan.y : clamp(pan.y, bounds.y, bounds.height, this.$refs.root.clientHeight)
      };
    },

    // --- What changes the stage, written down to be undone.

    state() {
      return { elements: this.copy(this.items), links: this.copy(this.edges) };
    },

    // A change made: the state before it goes to the history, the state after
    // it to the page.
    commit(before) {
      this.history.record(before);
      this.emitState();
    },

    emitState() {
      this.canUndo = this.history.canUndo();
      this.canRedo = this.history.canRedo();
      this.$emit('update:elements', this.copy(this.items));
      this.$emit('update:links', this.copy(this.edges));
    },

    restore(state) {
      this.items = state.elements;
      this.edges = state.links;
      this.dropMissingFromSelection();
      this.emitState();
    },

    undo() {
      const state = this.history.undo(this.state());

      if (state) {
        this.restore(state);
      }
    },

    redo() {
      const state = this.history.redo(this.state());

      if (state) {
        this.restore(state);
      }
    },

    select(ids) {
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
      if (this.readonly) {
        return;
      }

      const step = (this.grid > 0 ? this.grid : 1) * (far ? NUDGE_FAR : 1);
      const before = this.state();

      this.selection.forEach((id) => {
        this.byId[id].x += x * step;
        this.byId[id].y += y * step;
      });

      this.forgetRoutes(this.selection);

      this.commit(before);
    },

    // A link's own route no longer fits once an end has moved: it is dropped,
    // and the link drawn afresh between its ends.
    forgetRoutes(ids) {
      this.edges.forEach((link) => {
        if (link.points && (ids.includes(link.from) || ids.includes(link.to))) {
          delete link.points;
        }
      });
    },

    removeSelected() {
      if (this.readonly || !this.selection.length) {
        return;
      }

      const before = this.state();
      const removed = new Set(this.selection);

      this.items = this.items.filter((item) => !removed.has(item.id));
      this.edges = this.edges.filter((link) => !removed.has(link.from) && !removed.has(link.to));
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

    link(from, to) {
      if (from === to || this.edges.some((link) => link.from === from && link.to === to)) {
        return null;
      }

      const before = this.state();
      const link = { id: buildUniqueId('stage-link'), from, to };

      this.edges.push(link);
      this.commit(before);

      return link;
    },

    // The surface moved so that what it holds starts at its top left corner,
    // a step in.
    fit() {
      const bounds = stageGeometryBounds(this.items.map((item) => ({ ...item, height: item.height || 0 })));
      const margin = this.grid > 0 ? this.grid : 16;

      this.pan = bounds
        ? { x: margin - bounds.x, y: this.axis === 'x' ? 0 : margin - bounds.y }
        : { x: 0, y: 0 };
    }
  }
};
</script>
