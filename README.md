
## Kanboard DHtmlX Gantt Plugin

This plugin adds an advanced DHtmlX-based Gantt chart view for Kanboard
projects, including sprint support, dependency arrows, workload view,
and dark-mode friendly styling.

### Deployment / Installation

1. Copy the `DhtmlGantt` plugin directory into your Kanboard
   `plugins/` folder.
2. Ensure the DHtmlX assets are available under
   `plugins/DhtmlGantt/Assets/` (already included in this repo).
3. In Kanboard, go to a project and use the `Gantt` view switcher in
   the header to open the chart.

No additional configuration is required for a default setup.

### Developer Notes

For maintainers who need to modify behavior:

- See `KB_COMMENT_TABLE.md` for the KB_* tag index used in comments.
- The main frontend entrypoint is `Assets/dhtmlx-init.js`.
- Styling is split between:
  - Vendor CSS: `Assets/dhtmlxgantt.css`
  - Theme CSS: `Assets/gantt-theme.css`
  - Override CSS: `Assets/gantt-overrides.css`


