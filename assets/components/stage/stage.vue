<script>
import StageHistory from '../../js/Class/StageHistory';
import {
  stageGeometryBoxFromCorners,
  stageGeometryBounds,
  stageGeometryFanTurns,
  stageGeometryHandlePoint,
  stageGeometryIntersects,
  stageGeometryLabelPoint,
  stageGeometryLinkEnds,
  stageGeometryLength,
  stageGeometryLinkPath,
  stageGeometryMidPoint,
  stageGeometryPolyline,
  stageGeometryRoundedPath,
  stageGeometrySnap,
  stageGeometryStepPoints
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

// A surface the pointer moves — and scales, when `zoomable` —, and elements
// laid on it: picked, dragged, linked, removed, and every change undone and
// done again.
//
// The elements are the page's own — `v-model:elements`, each a box `{ id, x,
// y, width, height }` with whatever else the page keeps on it — and so are the
// links between them, `v-model:links`, `{ id, from, to }`. The stage draws
// them, knows nothing of what they mean, and hands back each change once it is
// made. What an element looks like is the page's too: the `element` slot,
// given the element and whether it is selected, draws it as any markup — a
// card, a form, a chart.
//
// An element may declare its ports (`ports`, `[{ id, side, y }]`): where, down
// its left edge (`side: 'in'`) or its right one (`side: 'out'`), a link meets
// it — the outputs of a step listed on its card. A link names the ports it
// joins (`fromPort`, `toPort`); one naming none meets the middle of the edge.
//
// A link may carry its own route (`points`, `[[x, y], …]`), a `label` drawn on
// it and a `kind` the page styles it by (`stage--link--<kind>`). The `link`
// slot lays the page's markup on each link, halfway along it: a handle, a
// button taking it off. Regions
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

  emits: ['update:elements', 'update:links', 'update:selection', 'connect', 'connect-void', 'remove'],

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
    // How a link is drawn between two elements: a curve (`curve`), or square
    // with rounded corners (`step`), as a wiring diagram draws it.
    linkShape: {
      type: String,
      default: 'curve'
    },
    // How round a square link's corners are, in pixels (`step`).
    linkRadius: {
      type: Number,
      default: 8
    },
    // How far apart, in pixels, the square links leaving one port — or
    // reaching one — turn, so that they do not run down the same line
    // (`step`, stageGeometryFanTurns); 0 lets them.
    linkFanSpacing: {
      type: Number,
      default: 6
    },
    // Whether a link ends on an arrow.
    linkArrows: {
      type: Boolean,
      default: true
    },
    // Whether a link's ends are marked on the edges it leaves and reaches: a
    // round connector, half of it under the element.
    linkConnectors: {
      type: Boolean,
      default: false
    },
    // Whether a link is drawn from one port to another (`ports`): pressed on a
    // way out — or in —, dragged, dropped on a way in — or out — of another
    // element. The stage adds no link: it asks the page (`connect`, `{ from,
    // fromPort, to, toPort }`), which keeps it or not and hands the links back.
    // Dropped on no port, the link asks for what it would lead to
    // (`connect-void`, `{ from, fromPort, side, x, y, left, top }`): where it
    // was dropped, on the surface (`x`, `y`) and in the stage (`left`, `top`)
    // — a new element, picked there.
    linkable: {
      type: Boolean,
      default: false
    },
    // How long a link must be to hold the page's handle (`link` slot), in
    // pixels: on a shorter one — two boxes almost touching — none is laid,
    // it would cover the link it marks.
    linkHandleMinLength: {
      type: Number,
      default: 0
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
      // The surface's scale: 1 draws it at its size.
      zoom: 1,
      gesture: null,
      marquee: null,
      // The link being drawn from a port: where it leaves, where the pointer is.
      draft: null,
      // The port under the pointer, its connector ringed.
      litPort: null,
      // While a link is drawn, the port it would end on if dropped now.
      draftTarget: null,
      canUndo: false,
      canRedo: false,
      markerId: buildUniqueId('stage-arrow')
    };
  },

  computed: {
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

    byId() {
      return Object.fromEntries(this.items.map((item) => [item.id, item]));
    },

    // A link whose ends are not both on the stage is not drawn.
    drawnLinks() {
      return this.edges.filter((link) => this.byId[link.from] && this.byId[link.to]);
    },

    // Where each square link turns, which end it shares with others and how
    // far out it loops round, by its id: a link routed by the page follows
    // its own points.
    linkFans() {
      if (this.linkShape !== 'step' || !this.linkFanSpacing) {
        return new Map();
      }

      return stageGeometryFanTurns(
        this.drawnLinks
          .filter((link) => !link.points)
          .map((link) => {
            const [start, end] = this.linkEnds(link);

            return { id: link.id, start, end, from: this.boxOf(this.byId[link.from]), to: this.boxOf(this.byId[link.to]) };
          }),
        this.linkFanSpacing
      );
    },

    // The links long enough to hold the page's handle.
    handledLinks() {
      return this.drawnLinks.filter((link) => stageGeometryLength(link.points ?? this.defaultLinkPoints(link)) >= this.linkHandleMinLength);
    },

    // Every port declared, linked or not, where it stands on its element's
    // edge: what a connector marks.
    drawnPorts() {
      return this.items.flatMap((item) => (item.ports ?? []).map((port) => ({
        key: `${item.id}-${port.side}-${port.id}`,
        id: item.id,
        port: port.id,
        side: port.side,
        x: port.side === 'in' ? item.x : item.x + item.width,
        y: item.y + port.y
      })));
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
    // ⌘ on a Mac, Ctrl elsewhere: `Mod`.
    const shortcut = (combo, callback) => keyboard.registerShortcut(this, combo, callback, {
      preventDefault: true,
      priority: 10,
      enabled: () => this.hasFocus()
    });

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

    // Where the page's handle on a link stands: halfway along it, or on the
    // stretch it has alone when it shares an end with others — their handles
    // would stand on one another.
    linkHandlePoint(link) {
      if (link.points) {
        return stageGeometryMidPoint(link.points);
      }

      return stageGeometryHandlePoint(this.defaultLinkPoints(link), this.linkFans.get(link.id)?.shared ?? null);
    },

    defaultLinkPoints(link) {
      const from = this.boxOf(this.byId[link.from]);
      const to = this.boxOf(this.byId[link.to]);

      if (this.linkShape === 'step') {
        const fan = this.linkFans.get(link.id);

        return stageGeometryStepPoints(from, to, undefined, this.linkAnchors(link), fan?.turn ?? null, fan?.loop ?? 0);
      }

      return stageGeometryLinkEnds(from, to, this.linkAnchors(link)).map(({ x, y }) => [x, y]);
    },

    // Where a link's ends stand, for its connectors.
    linkEnds(link) {
      return stageGeometryLinkEnds(this.boxOf(this.byId[link.from]), this.boxOf(this.byId[link.to]), this.linkAnchors(link));
    },

    // How far down each element a link meets it: at the ports it names.
    linkAnchors(link) {
      return {
        from: this.portY(this.byId[link.from], 'out', link.fromPort),
        to: this.portY(this.byId[link.to], 'in', link.toPort)
      };
    },

    portY(item, side, id) {
      return id == null ? undefined : item.ports?.find((port) => port.side === side && port.id === id)?.y;
    },

    boxOf(item) {
      return { ...item, height: item.height || 0 };
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
      if (link.points && !this.movedSinceRouted(link)) {
        return stageGeometryPolyline(link.points);
      }

      return this.linkShape === 'step'
        ? stageGeometryRoundedPath(this.defaultLinkPoints(link), this.linkRadius)
        : stageGeometryLinkPath(this.byId[link.from], this.byId[link.to], this.linkAnchors(link));
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

      return {
        x: (event.clientX - rect.left - this.pan.x) / this.zoom,
        y: (event.clientY - rect.top - this.pan.y) / this.zoom
      };
    },

    // --- What the pointer does.

    onPointerDown(event) {
      if (event.button !== 0 || event.target.closest(INTERACTIVE)) {
        return;
      }

      const portEl = event.target.closest('[data-stage-port]');

      if (portEl) {
        const port = this.drawnPorts.find((candidate) => candidate.key === portEl.dataset.stagePort);
        this.startGesture(event, { type: 'connect', port });
        this.draft = { from: port, x: port.x, y: port.y };

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
        // The pointer travels on the screen, the elements on the surface.
        gesture.origins.forEach((origin) => {
          const item = this.byId[origin.id];
          item.x = stageGeometrySnap(origin.x + dx / this.zoom, this.grid);
          item.y = stageGeometrySnap(origin.y + dy / this.zoom, this.grid);
        });
      } else if (gesture.type === 'connect') {
        this.draft = { ...this.draft, ...this.toWorld(event) };
        // The pointer held by the stage, the port under it is looked for.
        this.draftTarget = this.portTarget(gesture.port, document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-stage-port]'))?.key ?? null;
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
      } else if (gesture.type === 'connect') {
        const under = document.elementFromPoint(event.clientX, event.clientY);
        const targetEl = under?.closest('[data-stage-port]');

        if (targetEl) {
          this.connectTo(gesture.port, targetEl);
        } else if (gesture.moved && !under?.closest('[data-stage-element]')) {
          // On the surface itself: an element dropped on leads nowhere.
          this.connectVoid(gesture.port, event);
        }

        this.draft = null;
        this.draftTarget = null;
      } else if (gesture.type === 'pan' && !gesture.moved) {
        // A press on the surface that went nowhere: nothing is picked any more.
        this.select([]);
      }

      this.endGesture();
    },

    // A link dropped where no port is: the page asked what it leads to.
    connectVoid(port, event) {
      const rect = this.$refs.root.getBoundingClientRect();

      this.$emit('connect-void', {
        from: port.id,
        fromPort: port.port,
        side: port.side,
        ...this.toWorld(event),
        left: event.clientX - rect.left,
        top: event.clientY - rect.top
      });
    },

    // The port of this grip, when a link drawn from `port` may end on it: of
    // the other side, on another element.
    portTarget(port, targetEl) {
      const target = targetEl && this.drawnPorts.find((candidate) => candidate.key === targetEl.dataset.stagePort);

      return target && target.side !== port.side && target.id !== port.id ? target : null;
    },

    // Grown: the port a link is drawn from, and the one it would end on.
    isPortGrown(port) {
      return Boolean(this.draft) && (port.key === this.draft.from.key || port.key === this.draftTarget);
    },

    // Ringed: the port under the pointer, and while a link is drawn, those of
    // the other side it may end on.
    isPortLit(port) {
      if (this.draft) {
        return port.side !== this.draft.from.side && port.id !== this.draft.from.id;
      }

      return port.key === this.litPort;
    },

    // A port dropped on another of the other side, on another element: the
    // page asked for the link, out to in, whichever end it was drawn from.
    connectTo(port, targetEl) {
      const target = this.portTarget(port, targetEl);

      if (!target) {
        return;
      }

      const [from, to] = port.side === 'out' ? [port, target] : [target, port];

      this.$emit('connect', { from: from.id, fromPort: from.port, to: to.id, toPort: to.port });
    },

    // The link being drawn, square as the others, from its port to the
    // pointer: out of the right edge from a way out, of the left from a way in.
    draftPath() {
      const { from, x, y } = this.draft;
      const middle = Math.round((from.x + x) / 2);

      return stageGeometryRoundedPath([[from.x, from.y], [middle, from.y], [middle, y], [x, y]], this.linkRadius);
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

      // Ctrl (⌘) and the wheel scale the surface about the pointer.
      if (this.zoomable && (event.ctrlKey || event.metaKey)) {
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

      // On the screen: the surface's bounds as scaled.
      const clamp = (value, start, size, view) => Math.min(-start * this.zoom, Math.max(view - (start + size) * this.zoom, value));

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
      if (this.undoable) {
        this.history.record(before);
      }

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

      this.$emit('remove', [...this.selection]);

      if (!this.removable) {
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

    // The surface moved so that what it holds stands in the middle of the
    // stage — on the line it moves along, with an `x` axis.
    center() {
      const bounds = stageGeometryBounds(this.items.map((item) => ({ ...item, height: item.height || 0 })));
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
      const bounds = stageGeometryBounds(this.items.map((item) => ({ ...item, height: item.height || 0 })));
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
      const bounds = stageGeometryBounds(this.items.map((item) => ({ ...item, height: item.height || 0 })));
      const margin = this.grid > 0 ? this.grid : 16;

      this.pan = bounds
        ? { x: margin - bounds.x * this.zoom, y: this.axis === 'x' ? 0 : margin - bounds.y * this.zoom }
        : { x: 0, y: 0 };
    }
  }
};
</script>
