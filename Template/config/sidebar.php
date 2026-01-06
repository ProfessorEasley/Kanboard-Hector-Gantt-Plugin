<li <?= $this->app->checkMenuSelection('ConfigController') ?>>
    <?= $this->url->link(t('Hector Gantt'), 'ConfigController', 'show', array('plugin' => 'DhtmlGantt')) ?>
</li>
