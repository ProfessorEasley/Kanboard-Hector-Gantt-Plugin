<div class="page-header">
    <h2><?= t('Hector Gantt chart for "%s"', $project['name']) ?></h2>
    <ul>
        <li>
            <?= $this->modal->large('plus', t('Add task'), 'TaskCreationController', 'show', array('project_id' => $project['id'])) ?>
        </li>
        <li>
            <i class="fa fa-cog fa-fw"></i>
            <?= $this->url->link(t('Project settings'), 'ProjectViewController', 'show', array('project_id' => $project['id'])) ?>
        </li>
    </ul>
</div>

<div class="gantt-project-overview">
    <div class="gantt-project-info">
        <h3><?= t('Project Overview') ?></h3>
        <div class="gantt-project-stats">
            <div class="gantt-stat-card">
                <div class="gantt-stat-number" id="total-tasks">0</div>
                <div class="gantt-stat-label"><?= t('Total Tasks') ?></div>
            </div>
            <div class="gantt-stat-card">
                <div class="gantt-stat-number" id="completed-tasks">0</div>
                <div class="gantt-stat-label"><?= t('Completed') ?></div>
            </div>
            <div class="gantt-stat-card">
                <div class="gantt-stat-number" id="progress-tasks">0</div>
                <div class="gantt-stat-label"><?= t('In Progress') ?></div>
            </div>
            <div class="gantt-stat-card">
                <div class="gantt-stat-number" id="overdue-tasks">0</div>
                <div class="gantt-stat-label"><?= t('Overdue') ?></div>
            </div>
        </div>
    </div>
    
    <div class="gantt-project-actions">
        <button id="load-gantt-view" class="btn btn-blue">
            <i class="fa fa-sliders"></i> <?= t('View Gantt Chart') ?>
        </button>
    </div>
</div>

<!-- The actual Gantt container -->
<div id="dhtmlx-gantt-container" style="width:100%; height:600px; display:none;"></div>

<script type="text/javascript">
(function () {
  const dataUrl = '<?= $this->url->to(
      "ProjectGanttController",
      "tasks",
      ["project_id" => $project["id"]],
      false,
      "",
      "DhtmlGantt"
  ) ?>';

  let ganttInitialized = false;

  document.addEventListener('DOMContentLoaded', function () {
    // Basic stats (you can replace with real counts later)
    document.getElementById('total-tasks').textContent = '0';

    const btn = document.getElementById('load-gantt-view');
    btn.addEventListener('click', function () {
      const container = document.getElementById('dhtmlx-gantt-container');
      container.style.display = 'block';

      if (!ganttInitialized && window.gantt) {
        // Ensure link field mapping exists (also set in dhtmlx-init.js)
        gantt.config.links = { id:"id", source:"source", target:"target", type:"type" };

        gantt.init('dhtmlx-gantt-container');
        ganttInitialized = true;
      }

      // Fetch { data, links } and draw arrows
      fetch(dataUrl, { credentials: 'same-origin' })
        .then(r => r.json())
        .then(json => {
          // json should be: { data: [...], links: [...] }
          gantt.clearAll();
          gantt.parse(json);
        })
        .catch(console.error);
    });
  });
})();
</script>

<style>
.gantt-project-overview {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 20px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.gantt-project-info h3 {
    margin: 0 0 15px 0;
    color: #333;
}

.gantt-project-stats {
    display: flex;
    gap: 20px;
}

.gantt-stat-card {
    text-align: center;
    min-width: 80px;
}

.gantt-stat-number {
    font-size: 24px;
    font-weight: bold;
    color: #667eea;
}

.gantt-stat-label {
    font-size: 12px;
    color: #666;
    margin-top: 5px;
}

.gantt-project-actions {
    display: flex;
    align-items: center;
}

#load-gantt-view {
    font-size: 16px;
    padding: 12px 24px;
}
</style>
