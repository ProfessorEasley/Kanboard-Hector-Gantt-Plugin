<div class="page-header">
    <h2><?= t('Hector Gantt Settings') ?></h2>
</div>

<form method="post" action="<?= $this->url->href('ConfigController', 'save', array('plugin' => 'DhtmlGantt')) ?>" autocomplete="off">
    <?= $this->form->csrf() ?>

    <fieldset>
        <legend><?= t('General Settings') ?></legend>
        
        <div class="form-group">
            <label for="dhtmlgantt_task_sort"><?= t('Default task sorting') ?></label>
            <?= $this->form->select('dhtmlgantt_task_sort', array(
                'board' => t('Board order'),
                'date' => t('Due date'),
            ), $values, array(), array('id' => 'dhtmlgantt_task_sort')) ?>
        </div>

        <div class="form-group">
            <label for="dhtmlgantt_default_view"><?= t('Default view mode') ?></label>
            <?= $this->form->select('dhtmlgantt_default_view', array(
                'day' => t('Day'),
                'week' => t('Week'),
                'month' => t('Month'),
            ), $values, array(), array('id' => 'dhtmlgantt_default_view')) ?>
        </div>

    </fieldset>

    <fieldset>
        <legend><?= t('Advanced Settings') ?></legend>
        
        <div class="form-group">
            <label for="dhtmlgantt_license_type"><?= t('License Type') ?></label>
            <?= $this->form->select('dhtmlgantt_license_type', array(
                'gpl' => t('GPL 2.0 (Free)'),
                'commercial' => t('Commercial License'),
            ), $values, array(), array('id' => 'dhtmlgantt_license_type')) ?>
            <p class="form-help"><?= t('Select GPL for open source projects or Commercial for proprietary use') ?></p>
        </div>

        <div class="form-group">
            <label for="dhtmlgantt_cdn_mode"><?= t('Library Loading') ?></label>
            <?= $this->form->select('dhtmlgantt_cdn_mode', array(
                'local' => t('Local Files'),
                'cdn' => t('CDN (requires internet)'),
            ), $values, array(), array('id' => 'dhtmlgantt_cdn_mode')) ?>
        </div>
    </fieldset>

    <div class="form-actions">
        <button type="submit" class="btn btn-blue"><?= t('Save') ?></button>
    </div>
</form>

<div class="page-header">
    <h2><?= t('Hector Gantt Information') ?></h2>
</div>

<div class="panel">
    <h3><?= t('Plugin Status') ?></h3>
    <ul>
        <li><strong><?= t('Plugin Version') ?>:</strong> 1.0.0</li>
        <li><strong><?= t('Hector Gantt Library') ?>:</strong> 
            <span id="dhtmlx-version">
                <script>
                document.addEventListener('DOMContentLoaded', function() {
                    document.getElementById('dhtmlx-version').textContent = 
                        typeof gantt !== 'undefined' ? (gantt.version || 'Loaded') : 'Not Loaded';
                });
                </script>
            </span>
        </li>
        <li><strong><?= t('License Mode') ?>:</strong> <?= isset($values['dhtmlgantt_license_type']) ? ($values['dhtmlgantt_license_type'] === 'commercial' ? t('Commercial') : t('GPL 2.0')) : t('Not Configured') ?></li>
    </ul>
</div>

<div class="panel">
    <h3><?= t('Quick Setup Guide') ?></h3>
    <ol>
        <li><?= t('Download the Hector Gantt library (built on DHtmlX) from') ?> <a href="https://github.com/DHTMLX/gantt" target="_blank">GitHub (GPL)</a> <?= t('or') ?> <a href="https://dhtmlx.com/docs/products/dhtmlxGantt/" target="_blank">DHtmlX.com (Commercial)</a></li>
        <li><?= t('Copy dhtmlxgantt.js and dhtmlxgantt.css to the Assets/ directory') ?></li>
        <li><?= t('Or enable CDN mode above for quick testing') ?></li>
        <li><?= t('Configure your license type above') ?></li>
        <li><?= t('Navigate to any project and click \"Hector Gantt\" to view your charts') ?></li>
    </ol>
</div>

<div class="panel">
    <h3><?= t('Features') ?></h3>
    <ul>
        <li>✅ <?= t('Enterprise-grade Gantt charts') ?></li>
        <li>✅ <?= t('Interactive drag & drop') ?></li>
        <li>✅ <?= t('Multiple view modes') ?></li>
        <li>✅ <?= t('Task dependencies') ?></li>
        <li>✅ <?= t('Progress tracking') ?></li>
        <li>✅ <?= t('Real-time collaboration') ?></li>
    </ul>
</div>
