<script>
import {
  stageGeometryFanTurns,
  stageGeometryHandlePoint,
  stageGeometryLabelPoint,
  stageGeometryLinkEnds,
  stageGeometryLength,
  stageGeometryLinkPath,
  stageGeometryMidPoint,
  stageGeometryPolyline,
  stageGeometryRoundedPath,
  stageGeometryStepPoints
} from '../../js/Helper/StageGeometry';
import { buildUniqueId } from '@wexample/js-helpers/Helper/Id';

const T = 'WexampleSymfonyStageBundle.components.stage-links.stage-links::';

// How long a level stretch of a link must be to hold its handle clear of the
// connectors at both its ends: the handle, and a connector's width each side.
const HANDLE_ROOM = 64;

// The links between the items of a stage — a layer laid on it (its `layers`
// slot) —, drawn under the items in their coordinates: `v-model:links`, each
// `{ id, from, to }`, kept with the items in the stage's history, taken off
// with the items they join.
//
// An item may declare its ports (`ports`, `[{ id, side, y }]`): where, down
// its left edge (`side: 'in'`) or its right one (`side: 'out'`), a link meets
// it. A link names the ports it joins (`fromPort`, `toPort`); one naming none
// meets the middle of the edge. A link may carry its own route (`points`,
// `[[x, y], …]`), a `label` drawn on it and a `kind` the page styles it by
// (`stage--link--<kind>`). Halfway along each link long enough
// (`handleMinLength`), a handle: its middle marked, and `removable`, a button
// there taking it off — the layer takes nothing off itself, it asks the page
// (`remove`, the link). The `link` slot lays the page's own markup there
// instead.
//
// `linkable`: a link drawn from one port to another — pressed on a way out
// — or in —, dragged, dropped on a way in — or out — of another item. The
// layer adds no link: it asks the page (`connect`, `{ from, fromPort, to,
// toPort }`). Dropped on no port, the link asks for what it would lead to
// (`connect-void`, `{ from, fromPort, side, x, y, left, top }`).
export default {
  template: '#vue-template-wexample-symfony-stage-bundle-components-stage-links-stage-links',

  inject: ['stage'],

  emits: ['update:links', 'connect', 'connect-void', 'remove'],

  props: {
    links: {
      type: Array,
      default: () => []
    },
    // How a link is drawn: a curve (`curve`), or square with rounded corners
    // (`step`), as a wiring diagram draws it.
    shape: {
      type: String,
      default: 'curve'
    },
    // How round a square link's corners are, in pixels (`step`).
    radius: {
      type: Number,
      default: 8
    },
    // How far apart, in pixels, the square links leaving one port — or
    // reaching one — turn (`step`, stageGeometryFanTurns); 0 lets them share.
    fanSpacing: {
      type: Number,
      default: 6
    },
    arrows: {
      type: Boolean,
      default: true
    },
    // A link's ends marked on the edges it leaves and reaches: a round
    // connector, half of it under the item.
    connectors: {
      type: Boolean,
      default: false
    },
    linkable: {
      type: Boolean,
      default: false
    },
    // A button on each link's handle taking it off, to a page that may.
    removable: {
      type: Boolean,
      default: false
    },
    // How long a link must be to hold its handle, in pixels.
    handleMinLength: {
      type: Number,
      default: 0
    }
  },

  data() {
    return {
      edges: this.copy(this.links),
      // The link being drawn from a port: where it leaves, where the pointer is.
      draft: null,
      // The port under the pointer, its connector ringed.
      litPort: null,
      // While a link is drawn, the port it would end on if dropped now.
      draftTarget: null,
      markerId: buildUniqueId('stage-arrow')
    };
  },

  computed: {
    byId() {
      return this.stage.byId;
    },

    readonly() {
      return this.stage.readonly;
    },

    // A link whose ends are not both on the stage is not drawn.
    drawnLinks() {
      return this.edges.filter((link) => this.byId[link.from] && this.byId[link.to]);
    },

    linkFans() {
      if (this.shape !== 'step' || !this.fanSpacing) {
        return new Map();
      }

      return stageGeometryFanTurns(
        this.drawnLinks
          .filter((link) => !link.points)
          .map((link) => {
            const [start, end] = this.linkEnds(link);

            return { id: link.id, start, end, from: this.byId[link.from], to: this.byId[link.to] };
          }),
        this.fanSpacing
      );
    },

    handledLinks() {
      return this.drawnLinks.filter((link) => stageGeometryLength(link.points ?? this.defaultLinkPoints(link)) >= this.handleMinLength);
    },

    // Every port declared, linked or not, where it stands on its item's edge.
    drawnPorts() {
      return this.stage.placed.flatMap((item) => (item.ports ?? []).map((port) => ({
        key: `${item.id}-${port.side}-${port.id}`,
        id: item.id,
        port: port.id,
        side: port.side,
        x: port.side === 'in' ? item.x : item.x + (item.width || 0),
        y: item.y + port.y
      })));
    }
  },

  watch: {
    // Changed by the page, not by a gesture under way.
    links(value) {
      if (!this.stage.gesture) {
        this.edges = this.copy(value);
      }
    }
  },

  created() {
    this.stage.registerLayer({
      name: 'links',
      getState: () => this.copy(this.edges),
      setState: (edges) => { this.edges = edges; },
      emitState: () => this.$emit('update:links', this.copy(this.edges)),
      // The links of an item taken off go with it.
      onRemoved: (ids) => { this.edges = this.edges.filter((link) => !ids.includes(link.from) && !ids.includes(link.to)); },
      // A route of its own no longer fits once an end has moved.
      onMoved: (ids) => this.forgetRoutes(ids),
      boxes: () => this.drawnLinks.flatMap((link) => link.points ?? []).map(([x, y]) => ({ x, y, width: 0, height: 0 }))
    });
  },

  beforeUnmount() {
    this.stage.unregisterLayer('links');
  },

  methods: {
    copy(value) {
      return JSON.parse(JSON.stringify(value ?? []));
    },

    t(key) {
      return this.trans(`${T}${key}`);
    },

    // Whether the links hold a handle: the page's, or the layer's own.
    hasHandles() {
      return Boolean(this.$slots.link) || this.canRemove();
    },

    canRemove() {
      return this.removable && !this.readonly;
    },

    removeLink(link) {
      this.$emit('remove', link);
    },

    lightClass(id) {
      return this.stage.lightClass(id);
    },

    // Both ends picked: the link is too.
    isLinkSelected(link) {
      return this.stage.selection.includes(link.from) && this.stage.selection.includes(link.to);
    },

    linkLabelPoint(link) {
      return stageGeometryLabelPoint(link.points ?? this.defaultLinkPoints(link));
    },

    // Where the page's handle stands: halfway along it, or on the stretch it
    // has alone when it shares an end with others.
    linkHandlePoint(link) {
      if (link.points) {
        return stageGeometryMidPoint(link.points);
      }

      return stageGeometryHandlePoint(this.defaultLinkPoints(link), this.linkFans.get(link.id)?.shared ?? null, HANDLE_ROOM);
    },

    defaultLinkPoints(link) {
      const from = this.byId[link.from];
      const to = this.byId[link.to];

      if (this.shape === 'step') {
        const fan = this.linkFans.get(link.id);

        return stageGeometryStepPoints(from, to, undefined, this.linkAnchors(link), fan?.turn ?? null, fan?.loop ?? 0);
      }

      return stageGeometryLinkEnds(from, to, this.linkAnchors(link)).map(({ x, y }) => [x, y]);
    },

    linkEnds(link) {
      return stageGeometryLinkEnds(this.byId[link.from], this.byId[link.to], this.linkAnchors(link));
    },

    linkAnchors(link) {
      return {
        from: this.portY(this.byId[link.from], 'out', link.fromPort),
        to: this.portY(this.byId[link.to], 'in', link.toPort)
      };
    },

    portY(item, side, id) {
      return id == null ? undefined : item.ports?.find((port) => port.side === side && port.id === id)?.y;
    },

    // A route of its own is followed while neither end has moved since it
    // was drawn; once one has, the link is drawn afresh between them.
    linkPath(link) {
      if (link.points && !this.movedSinceRouted(link)) {
        return stageGeometryPolyline(link.points);
      }

      return this.shape === 'step'
        ? stageGeometryRoundedPath(this.defaultLinkPoints(link), this.radius)
        : stageGeometryLinkPath(this.byId[link.from], this.byId[link.to], this.linkAnchors(link));
    },

    movedSinceRouted(link) {
      const gesture = this.stage.gesture;
      const moving = gesture?.type === 'move' && gesture.moved ? gesture.origins.map((origin) => origin.id) : [];

      return moving.includes(link.from) || moving.includes(link.to);
    },

    forgetRoutes(ids) {
      this.edges.forEach((link) => {
        if (link.points && (ids.includes(link.from) || ids.includes(link.to))) {
          delete link.points;
        }
      });
    },

    // --- Drawing a link from a port: a gesture of the stage's, ours to answer.

    onPortDown(event, port) {
      if (event.button !== 0 || this.readonly) {
        return;
      }

      event.stopPropagation();
      this.draft = { from: port, x: port.x, y: port.y };
      this.stage.startGesture(event, {
        type: 'layer',
        onMove: (moveEvent) => {
          this.draft = { ...this.draft, ...this.stage.toWorld(moveEvent) };
          this.draftTarget = this.portTarget(port, document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('[data-stage-port]'))?.key ?? null;
        },
        onUp: (upEvent, gesture) => {
          const under = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          const targetEl = under?.closest('[data-stage-port]');

          if (targetEl) {
            this.connectTo(port, targetEl);
          } else if (gesture.moved && !under?.closest('[data-stage-element]')) {
            this.connectVoid(port, upEvent);
          }

          this.draft = null;
          this.draftTarget = null;
        }
      });
    },

    connectVoid(port, event) {
      const rect = this.stage.$refs.root.getBoundingClientRect();

      this.$emit('connect-void', {
        from: port.id,
        fromPort: port.port,
        side: port.side,
        ...this.stage.toWorld(event),
        left: event.clientX - rect.left,
        top: event.clientY - rect.top
      });
    },

    portTarget(port, targetEl) {
      const target = targetEl && this.drawnPorts.find((candidate) => candidate.key === targetEl.dataset.stagePort);

      return target && target.side !== port.side && target.id !== port.id ? target : null;
    },

    isPortGrown(port) {
      return Boolean(this.draft) && (port.key === this.draft.from.key || port.key === this.draftTarget);
    },

    isPortLit(port) {
      if (this.draft) {
        return port.side !== this.draft.from.side && port.id !== this.draft.from.id;
      }

      return port.key === this.litPort;
    },

    // Out to in, whichever end it was drawn from: the page asked for the link.
    connectTo(port, targetEl) {
      const target = this.portTarget(port, targetEl);

      if (!target) {
        return;
      }

      const [from, to] = port.side === 'out' ? [port, target] : [target, port];

      this.$emit('connect', { from: from.id, fromPort: from.port, to: to.id, toPort: to.port });
    },

    draftPath() {
      const { from, x, y } = this.draft;
      const middle = Math.round((from.x + x) / 2);

      return stageGeometryRoundedPath([[from.x, from.y], [middle, from.y], [middle, y], [x, y]], this.radius);
    },

    // A link the page adds — a palette, a button —: undoable like any change.
    link(from, to) {
      if (from === to || this.edges.some((link) => link.from === from && link.to === to)) {
        return null;
      }

      const before = this.stage.state();
      const link = { id: buildUniqueId('stage-link'), from, to };

      this.edges.push(link);
      this.stage.commitLayers(before);

      return link;
    }
  }
};
</script>
