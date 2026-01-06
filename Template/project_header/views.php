<?php if ($this->user->hasProjectAccess('TaskGanttController', 'show', $project['id'])): ?>
<li <?= $this->app->checkMenuSelection('TaskGanttController') ?>>
    <i class="fa fa-sliders fa-fw"></i>
    <?= $this->url->link(t('Hector Gantt'), 'TaskGanttController', 'show', array('project_id' => $project['id'], 'plugin' => 'DhtmlGantt'), false, 'view-gantt') ?>
</li>
<?php endif ?>
