
## Kanboard DHtmlX Gantt Plugin

This plugin adds an advanced DHtmlX-based Gantt chart view for Kanboard
projects, including sprint support, dependency arrows, workload view,
and dark-mode friendly styling.

### Deployment / Installation

1. **Download the plugin code**
   - If you use the GitHub **“Download ZIP”** button, GitHub will create a folder like `Kanboard-Hector-Gantt-Plugin-main` after you unzip.
2. **Rename the folder to match the plugin id**
   - Rename that folder to **`DhtmlGantt`** (capital D, lowercase html, capital G).
3. **Copy into Kanboard**
   - Move the renamed `DhtmlGantt` folder into your Kanboard `plugins/` directory, so the final path is: `KANBOARD_ROOT/plugins/DhtmlGantt`.
4. **Verify assets**
   - Ensure the DHtmlX assets are available under `plugins/DhtmlGantt/Assets/` (already included in this repo).
5. **Open the Gantt view in Kanboard**
   - In Kanboard, go to a project and use the `Gantt` view switcher in the header to open the chart.

No additional configuration is required for a default setup.

### Developer Notes

For maintainers who need to modify behavior:

- See `KB_COMMENT_TABLE.md` for the KB_* tag index used in comments.
- The main frontend entrypoint is `Assets/dhtmlx-init.js`.
- Styling is split between:
  - Vendor CSS: `Assets/dhtmlxgantt.css`
  - Theme CSS: `Assets/gantt-theme.css`
  - Override CSS: `Assets/gantt-overrides.css`


