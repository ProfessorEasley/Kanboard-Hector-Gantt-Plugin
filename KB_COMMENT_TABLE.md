### TABLE OF CONTENTS FOR COMMENTS (KB_* TAGS)

Use these tags in comments so future maintainers can quickly search for
the right parts of the code (Ctrl/Cmd+F for the tag).

- **KB_Init_Core**
  - Core Gantt initialization, config, column definitions, templates,
    and lightbox layout.

- **KB_Lightbox_UI**
  - Lightbox sections and UI wiring: type selector, sprint selector,
    task multi-select, Kanboard task link button.

- **KB_Sprints_Logic**
  - Sprint creation, inline sprint flow, sprint child task assignment,
    and sprint duration recalculation.

- **KB_Task_Types**
  - Logic that preserves / converts task types (task vs sprint vs
    milestone) across frontend and backend.

- **KB_Task_Dependencies**
  - Dependency arrow behavior: validation rules, link creation/removal,
    and move-with-dependencies behavior.

- **KB_Zoom_And_Views**
  - Zoom buttons, Day/Week/Month view modes, smart fit-to-screen, and
    persistence of zoom/view settings.

- **KB_Workload_Busyness**
  - Workload panel, workload/busyness calculations, and visual borders
    that show busyness on task bars.

- **KB_Grouping_Assignee / KB_Grouping_Category / KB_Grouping_Sprint**
  - Group-by logic and grouped data structures for assignee, category
    (task category), and sprint.

- **KB_DarkMode_Styling**
  - Dark/bright mode toggle, dark-mode text visibility, and styling
    that differs between themes (including arrow colors).

- **KB_Backend_Formatter**
  - PHP formatters that shape Kanboard task/project data into the
    structures used by DHTMLX Gantt (fields, colors, grouping keys).

- **KB_Backend_Controller**
  - PHP controllers that expose JSON endpoints, handle Gantt saves,
    create/update tasks, and manage dependency endpoints.

- **KB_CSP_And_Assets**
  - Asset registration and CSP-related overrides (font/icon removal,
    arrow heads, CSS files that must load last).

- **KB_Interactive_Schedule**
  - Frontend interactions that make the schedule feel "alive": context
    menu items, keyboard shortcuts, tooltips, and similar UX enhancements.

- **KB_Name_Display**
  - Assignee name display on the right side of task bars and related
    text styling for names shown in the Gantt chart.

- **KB_Utilities**
  - General-purpose helper functions: highlight tasks, project stats,
    auto-refresh, and data processor utilities.

#### HOW TO USE THIS TABLE

- Each major section in the plugin should start with a comment that
  includes one or more KB_* tags, e.g.:
  - `// ===== KB_Task_Dependencies: Link validation and arrow heads =====`
- When you add new features, pick the closest existing KB_* tag or
  introduce a new one here if it truly doesn’t fit.
- When you need to change behavior later, search for the tag first to
  jump straight to the relevant code.



