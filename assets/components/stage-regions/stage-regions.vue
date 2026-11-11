<script>
// The regions of a stage — a layer laid on it (its `layers` slot) —, drawn
// under its items: the lanes of a process, the days of a planning, each
// `{ id, x, y, width, height, title, kind }`, a title in its head that stays
// in view while the surface moves along it. What they hold counts when the
// stage is bounded.
export default {
  template: '#vue-template-wexample-symfony-stage-bundle-components-stage-regions-stage-regions',

  inject: ['stage'],

  props: {
    regions: {
      type: Array,
      default: () => []
    }
  },

  created() {
    this.stage.registerLayer({
      name: 'regions',
      boxes: () => this.regions
    });
  },

  beforeUnmount() {
    this.stage.unregisterLayer('regions');
  },

  methods: {
    regionStyle(region) {
      return {
        left: `${region.x}px`,
        top: `${region.y}px`,
        width: `${region.width}px`,
        height: `${region.height}px`
      };
    },

    // Kept against the stage's left edge while the surface moves past it.
    regionTitleStyle(region) {
      const behind = Math.max(0, -(this.stage.pan.x + region.x));

      return behind ? { left: `${Math.max(0, Math.min(behind, region.width - 32))}px` } : null;
    }
  }
};
</script>
