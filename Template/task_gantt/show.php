<?php
/**
 * Task Gantt main template
 *
 * KB_Init_Core
 *   - Renders the project header and injects the main Gantt container
 *     with all required data attributes for `dhtmlx-init.js`.
 *
 * KB_Zoom_And_Views
 *   - Provides the Day/Week/Month view buttons that JS hooks onto.
 *
 * KB_Workload_Busyness
 *   - Contains the markup for the workload panel displayed alongside
 *     the chart.
 *
 * KB_DarkMode_Styling
 *   - Hosts legend and toolbar markup whose appearance is adjusted by
 *     CSS in `gantt-theme.css` / `gantt-overrides.css`.
 *
 * KB_Interactive_Schedule
 *   - Toolbar buttons and settings dropdown that connect to toggles
 *     in the JS (move dependencies, show progress, busyness borders).
 *
 * See KB_COMMENT_TABLE.md for a full description of the KB_* tags
 * used across this plugin.
 */
?>

<section id="main" style="display: flex; flex-direction: column; height: 100%;">
    <?= $this->projectHeader->render($project, 'TaskGanttController', 'show', false, 'DhtmlGantt') ?>

    <?php
        // read current sorting and group selection passed from controller
        $sorting = isset($sorting) ? $sorting : $this->request->getStringParam('sorting', 'board');
        $cur     = isset($groupBy) && $groupBy !== '' ? $groupBy : 'none';
    ?>
    
    <div class="menu-inline" style="flex-shrink: 0;">
        <ul>
            <!-- Sort by position -->
            <li <?= $sorting === 'board' ? 'class="active"' : '' ?>>
                <?= $this->url->icon(
                    'sort-numeric-asc',
                    t('Sort by position'),
                    'TaskGanttController',
                    'show',
                    array(
                        'project_id' => $project['id'],
                        'sorting'    => 'board',
                        'plugin'     => 'DhtmlGantt',
                        'group_by'   => $cur
                    )
                ) ?>
            </li>

            <!-- Sort by date -->
            <li <?= $sorting === 'date' ? 'class="active"' : '' ?>>
                <?= $this->url->icon(
                    'sort-amount-asc',
                    t('Sort by date'),
                    'TaskGanttController',
                    'show',
                    array(
                        'project_id' => $project['id'],
                        'sorting'    => 'date',
                        'plugin'     => 'DhtmlGantt',
                        'group_by'   => $cur
                    )
                ) ?>
            </li>

            <li>
                <?= $this->modal->large('plus', t('Add task'), 'TaskCreationController', 'show', array('project_id' => $project['id'])) ?>
            </li>

            <!-- View buttons (handled by external JS) -->
            <li><button type="button" class="btn btn-dhtmlx-view" data-view="Day">Day</button></li>
            <li><button type="button" class="btn btn-dhtmlx-view active" data-view="Week">Week</button></li>
            <li><button type="button" class="btn btn-dhtmlx-view" data-view="Month">Month</button></li>
        </ul>
    </div>

    <div class="dhtmlx-gantt-container" style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
        <!-- DHtmlX Gantt Toolbar -->
        <div class="dhtmlx-gantt-toolbar" style="flex-shrink: 0;">
            <button id="dhtmlx-add-task" class="btn btn-blue" title="<?= t('Add Task') ?>">
                <i class="fa fa-plus"></i> <?= t('Add Task') ?>
            </button>

            <!-- Group by dropdown -->
            <div style="display: flex; align-items: center; gap: 6px; margin-left: 10px;">
                <i class="fa fa-users"></i>
                <span style="font-size: 13px; color: #333;"><?= t('Group by') ?>:</span>
                <select id="dhtmlx-group-by" class="btn" style="height: 32px; padding: 5px 10px; font-size: 13px; min-width: 120px; max-width: 150px;">
                    <option value="none"><?= t('None') ?></option>
                    <option value="assignee"><?= t('Assignee') ?></option>
                    <option value="group"><?= t('Category') ?></option>
                    <option value="sprint"><?= t('Sprint') ?></option>
                </select>
            </div>

            <!-- Toggle Workload View -->
            <button id="dhtmlx-toggle-resources" class="btn" title="<?= t('Toggle Workload View') ?>">
                <i class="fa fa-bar-chart"></i> <?= t('Workload View') ?>
            </button>

            <!-- Settings Dropdown -->
            <div class="dhtmlx-settings-dropdown" style="position: relative; display: inline-block; margin-left: 10px;">
                <button id="dhtmlx-settings-btn" class="btn" title="<?= t('View Settings') ?>">
                    <i class="fa fa-cog"></i> <?= t('Settings') ?>
                </button>
                <div id="dhtmlx-settings-menu" class="dhtmlx-settings-menu" style="display: none;">
                    <label class="dhtmlx-settings-item">
                        <input type="checkbox" id="move-dependencies-toggle">
                        <span><?= t('Move dependencies with task') ?></span>
                    </label>
                    <label class="dhtmlx-settings-item">
                        <input type="checkbox" id="show-progress-toggle" checked>
                        <span><?= t('Show progress bars') ?></span>
                    </label>
                    <label class="dhtmlx-settings-item">
                        <input type="checkbox" id="show-busyness-toggle" checked>
                        <span><?= t('Show busyness borders') ?></span>
                    </label>
                </div>
            </div>

            <div class="dhtmlx-toolbar-separator"></div>

            <button id="dhtmlx-zoom-in" class="btn" title="<?= t('Zoom In') ?>">
                <i class="fa fa-search-plus"></i>
            </button>

            <button id="dhtmlx-zoom-out" class="btn" title="<?= t('Zoom Out') ?>">
                <i class="fa fa-search-minus"></i>
            </button>

            <div class="dhtmlx-toolbar-separator"></div>

            <button id="dhtmlx-expand-toggle" class="btn" title="<?= t('Expand All') ?>" data-state="collapsed">
                <i class="fa fa-expand"></i>
            </button>

            <div class="dhtmlx-toolbar-separator"></div>

            <button id="dhtmlx-dark-mode-toggle" class="btn" title="<?= t('Toggle Dark Mode') ?>">
                <i class="fa fa-moon-o"></i>
            </button>
        </div>

        <!-- Gantt Chart -->
        <div id="dhtmlx-gantt-chart"
             data-project-id="<?= $project['id'] ?>"
             data-group-by="<?= $cur ?>" 
             style="flex: 1; width: 100%; min-height: 0; position: relative;"
             data-tasks='<?= htmlspecialchars(json_encode($tasks), ENT_QUOTES, 'UTF-8') ?>'
             data-update-url="<?= $this->url->href('TaskGanttController', 'save', array('project_id' => $project['id'], 'plugin' => 'DhtmlGantt')) ?>"
             data-create-url="<?= $this->url->href('TaskGanttController', 'create', array('project_id' => $project['id'], 'plugin' => 'DhtmlGantt')) ?>"
             data-remove-url="<?= $this->url->href('TaskGanttController', 'remove', array('project_id' => $project['id'], 'plugin' => 'DhtmlGantt')) ?>"
             data-create-link-url="<?= $this->url->href('TaskGanttController', 'dependency', array('project_id' => $project['id'], 'plugin' => 'DhtmlGantt')) ?>"
             data-remove-link-url="<?= $this->url->href('TaskGanttController', 'removeDependency', array('project_id' => $project['id'], 'plugin' => 'DhtmlGantt')) ?>"
             data-get-data-url="<?= $this->url->href('TaskGanttController', 'getData', array('project_id' => $project['id'], 'plugin' => 'DhtmlGantt')) ?>">
        </div>

        <!-- Task Information Panel -->
        <div class="dhtmlx-gantt-info" style="flex-shrink: 0; max-height: 250px; overflow-y: auto; overflow-x: hidden;">
            <div class="dhtmlx-info-section">
                <h3><?= t('Legend') ?></h3>
                <div class="dhtmlx-legend-two-column">
                    <!-- Left Column: Task Types -->
                    <div class="dhtmlx-legend-column">
                        <strong style="font-size: 11px; display: block; margin-bottom: 5px; color: #333;">
                            <?= t('Task Types:') ?>
                        </strong>
                        <div class="dhtmlx-legend">
                            <div class="dhtmlx-legend-item">
                                <span class="dhtmlx-legend-color" style="background: #27ae60;"></span>
                                <span style="color: #333;"><?= t('Milestone') ?></span>
                            </div>
                            <div class="dhtmlx-legend-item">
                                <span class="dhtmlx-legend-color" style="background: #9b59b6;"></span>
                                <span style="color: #333;"><?= t('Sprint') ?></span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Right Column: Task Categories (with auto-columns if > 5 categories) -->
                    <?php
                    // Display categories with their actual Kanboard colors
                    $groups = $groups ?? [];  // Note: $groups var contains categories now
                    
                    if (!empty($groups)):
                        // ✅ Split categories into chunks of 5 for multiple columns
                        $groupChunks = array_chunk($groups, 5);
                        
                        foreach ($groupChunks as $chunkIndex => $chunk):
                    ?>
                        <div class="dhtmlx-legend-column">
                            <?php if ($chunkIndex === 0): ?>
                                <strong style="font-size: 11px; display: block; margin-bottom: 5px; color: #333;">
                                    <?= t('Task Categories:') ?>
                                </strong>
                            <?php else: ?>
                                <strong style="font-size: 11px; visibility: hidden; display: block; margin-bottom: 5px;">
                                    &nbsp;
                                </strong>
                            <?php endif; ?>
                            <div class="dhtmlx-legend">
                                <?php foreach ($chunk as $category): ?>
                                    <?php 
                                    // ✅ Use actual Kanboard category color (passed from controller)
                                    $categoryColor = isset($category['color']) && !empty($category['color']) ? $category['color'] : '#bdc3c7';
                                    ?>
                                    <div class="dhtmlx-legend-item">
                                        <span class="dhtmlx-legend-color" 
                                              style="background-color: <?= $categoryColor ?> !important; border: 1px solid rgba(0,0,0,0.2); display: inline-block;">
                                        </span>
                                        <span style="color: #333;"><?= $this->text->e($category['name']) ?></span>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    <?php 
                        endforeach;
                    else: 
                    ?>
                        <div class="dhtmlx-legend-column">
                            <div style="padding: 8px; background: rgba(255, 193, 7, 0.2); border-left: 3px solid #ffc107; font-size: 12px;">
                                ℹ️ <?= t('No categories used in this project.') ?>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>

        <!-- Custom Workload Panel (hidden by default) -->
        <div id="workload-panel" class="workload-panel hidden">
            <div class="workload-header">
                <h4><?= t('Tasks per Person - Workload Summary') ?></h4>
            </div>
            <div id="workload-content" class="workload-content">
                <p class="workload-loading"><?= t('Loading workload data...') ?></p>
            </div>
        </div>
    </div>
</section>

<style>
.dhtmlx-gantt-container {
    border: 1px solid rgba(0,0,0,0.1);
}
.dhtmlx-gantt-toolbar {
    border-bottom: 1px solid rgba(0,0,0,0.1);
    padding: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.dhtmlx-toolbar-separator {
    width: 1px;
    height: 20px;
    background: rgba(0,0,0,0.2);
    margin: 0 5px;
}
.dhtmlx-gantt-info {
    border-top: 1px solid rgba(0,0,0,0.1);
    padding: 15px;
    display: flex;
    gap: 30px;
}
.dhtmlx-info-section h3 {
    margin: 0 0 10px 0;
    font-size: 14px;
    font-weight: bold;
}
.dhtmlx-stats { display: flex; gap: 20px; }
.dhtmlx-stat-item { display: flex; flex-direction: column; align-items: center; }
.dhtmlx-stat-label { font-size: 12px; }
.dhtmlx-stat-value { font-size: 18px; font-weight: bold; }
.dhtmlx-legend { display: flex; flex-direction: column; gap: 5px; }
.dhtmlx-legend-two-column { display: flex; gap: 30px; }
.dhtmlx-legend-column { flex: 1; min-width: 0; }
.dhtmlx-legend-item { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.dhtmlx-legend-color { 
    width: 16px !important; 
    height: 16px !important; 
    min-width: 16px;
    min-height: 16px;
    border-radius: 3px; 
    display: inline-block !important;
    flex-shrink: 0;
}
.gantt_task_line.dhtmlx-readonly { opacity: 0.6; }
.btn-dhtmlx-view.active { background-color: #667eea !important; color: white !important; }
.dhtmlx-toggle { display: flex; align-items: center; gap: 5px; font-size: 13px; cursor: pointer; }
.dhtmlx-toggle input[type="checkbox"] { transform: scale(1.1); margin-right: 5px; }

/* Workload Panel Styles */
.workload-panel {
    width: 100%;
    border-top: 2px solid rgba(0,0,0,0.1);
    max-height: 300px;
    display: block;
    transition: max-height 0.3s ease;
    overflow: hidden;
}

.workload-panel.hidden {
    max-height: 0;
    border-top: none;
}

.workload-header {
    padding: 10px 15px;
    border-bottom: 1px solid rgba(0,0,0,0.1);
}

.workload-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: bold;
}

.workload-content {
    padding: 15px;
    max-height: 250px;
    overflow-y: auto;
}

.workload-loading {
    text-align: center;
    font-style: italic;
}

.workload-table {
    width: 100%;
    border-collapse: collapse;
}

.workload-table th {
    background: rgba(0,0,0,0.05);
    padding: 10px;
    text-align: left;
    font-weight: bold;
    border-bottom: 2px solid rgba(0,0,0,0.1);
    font-size: 13px;
}

.workload-table td {
    padding: 10px;
    border-bottom: 1px solid rgba(0,0,0,0.05);
    font-size: 13px;
}

.workload-table tr:hover {
    background: rgba(0,0,0,0.03);
}

.workload-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-weight: bold;
    font-size: 12px;
    min-width: 30px;
    text-align: center;
}

.workload-available {
    background: #d4edda;
    color: #155724;
}

.workload-busy {
    background: #fff3cd;
    color: #856404;
}

.workload-overloaded {
    background: #f8d7da;
    color: #721c24;
}

.workload-task-list {
    font-size: 11px;
    margin-top: 5px;
}

.workload-task-item {
    display: inline-block;
    background: #e9ecef;
    padding: 2px 8px;
    margin: 2px;
    border-radius: 3px;
}

#dhtmlx-toggle-resources.active {
    background-color: #667eea !important;
    color: white !important;
}

/* Settings Dropdown Styles */
.dhtmlx-settings-dropdown {
    position: relative;
    display: inline-block;
}

.dhtmlx-settings-menu {
    position: absolute;
    top: 100%;
    right: 0;
    background: white;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    min-width: 220px;
    z-index: 1000;
    margin-top: 4px;
    padding: 8px 0;
}

.dhtmlx-settings-item {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    cursor: pointer;
    transition: background 0.2s;
    margin: 0;
}

.dhtmlx-settings-item:hover {
    background: rgba(0,0,0,0.05);
}

.dhtmlx-settings-item input[type="checkbox"] {
    margin: 0 8px 0 0;
    cursor: pointer;
}

.dhtmlx-settings-item span {
    font-size: 13px;
    user-select: none;
}
</style>
