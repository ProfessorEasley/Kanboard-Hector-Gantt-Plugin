<?php

namespace Kanboard\Plugin\DhtmlGantt;

use Kanboard\Core\Plugin\Base;
use Kanboard\Core\Security\Role;
use Kanboard\Core\Translator;
use Kanboard\Plugin\DhtmlGantt\Formatter\ProjectGanttFormatter;
use Kanboard\Plugin\DhtmlGantt\Formatter\TaskGanttFormatter;

class Plugin extends Base
{
    public function initialize()
    {
        //
        // Routes
        //
        // Existing routes (keep if you still use TaskGanttController screens)
        $this->route->addRoute('dhtmlgantt/:project_id', 'TaskGanttController', 'show', 'DhtmlGantt');
        $this->route->addRoute('dhtmlgantt/:project_id/sort/:sorting', 'TaskGanttController', 'show', 'DhtmlGantt');

        // New routes for the dedicated Project Gantt page + data endpoint
        $this->route->addRoute('project/:project_id/gantt', 'ProjectGanttController', 'show', 'DhtmlGantt');
        $this->route->addRoute('project/:project_id/gantt/data', 'ProjectGanttController', 'tasks', 'DhtmlGantt');
        $this->route->addRoute(
            '/project/:project_id/move_dependencies/:enabled',
            'TaskGanttController',
            'saveMoveDependenciesSetting',
            'DhtmlGantt'
        );
        
        // Task Gantt API routes for task operations and dependency management
        $this->route->addRoute('dhtmlgantt/:project_id/save', 'TaskGanttController', 'save', 'DhtmlGantt');
        $this->route->addRoute('dhtmlgantt/:project_id/create', 'TaskGanttController', 'create', 'DhtmlGantt');
        $this->route->addRoute('dhtmlgantt/:project_id/remove', 'TaskGanttController', 'remove', 'DhtmlGantt');
        // Dependency endpoints (unique paths; one registration each)
        $this->route->addRoute('dhtmlgantt/:project_id/dependency/add',    'TaskGanttController', 'addDependency',    'DhtmlGantt');
        $this->route->addRoute('dhtmlgantt/:project_id/dependency/remove', 'TaskGanttController', 'removeDependency', 'DhtmlGantt');
        // (Optional) if you keep the generic POST for creation via `dependency()`:
        $this->route->addRoute('dhtmlgantt/:project_id/dependency',        'TaskGanttController', 'dependency',       'DhtmlGantt');


        //
        // Access map
        //
        // View permissions
        $this->projectAccessMap->add('ProjectGanttController', 'show',  Role::PROJECT_VIEWER);
        $this->projectAccessMap->add('ProjectGanttController', 'tasks', Role::PROJECT_VIEWER);

        // Edit permissions (only needed if you enable drag/edit/create/delete from the Gantt)
        $this->projectAccessMap->add('ProjectGanttController', 'update', Role::PROJECT_MEMBER);
        $this->projectAccessMap->add('ProjectGanttController', 'create', Role::PROJECT_MEMBER);
        $this->projectAccessMap->add('ProjectGanttController', 'remove', Role::PROJECT_MEMBER);

        // TaskGanttController permissions
        $this->projectAccessMap->add('TaskGanttController', 'show', Role::PROJECT_VIEWER);
        $this->projectAccessMap->add('TaskGanttController', 'save', Role::PROJECT_MEMBER);
        $this->projectAccessMap->add('TaskGanttController', 'create', Role::PROJECT_MEMBER);
        $this->projectAccessMap->add('TaskGanttController', 'remove', Role::PROJECT_MEMBER);
        $this->projectAccessMap->add('TaskGanttController', 'dependency', Role::PROJECT_MEMBER);
        $this->projectAccessMap->add('TaskGanttController', 'removeDependency', Role::PROJECT_MEMBER);
        $this->projectAccessMap->add('TaskGanttController', 'addDependency',    Role::PROJECT_MEMBER);
        
        // ProjectGanttController permissions
        $this->projectAccessMap->add('ProjectGanttController', 'save', Role::PROJECT_MANAGER);

        //
        // Template hooks (menus, sidebar, etc.)
        //
        $this->template->hook->attach('template:project-header:view-switcher', 'DhtmlGantt:project_header/views');
        $this->template->hook->attach('template:project:dropdown', 'DhtmlGantt:project/dropdown');
        $this->template->hook->attach('template:project-list:menu:after', 'DhtmlGantt:project_list/menu');
        $this->template->hook->attach('template:config:sidebar', 'DhtmlGantt:config/sidebar');

        //
        // Assets (ensure correct load order)
        //
        // KB_CSP_And_Assets:
        //   1) DHTMLX vendor library + CSS (dhtmlxgantt.js, dhtmlxgantt.css)
        //   2) Our main JS integration (dhtmlx-init.js)
        //   3) Our theme CSS (gantt-theme.css)
        //   4) Final overrides CSS (gantt-overrides.css) — MUST load last
        //
        // 1) DHTMLX library first (vendor JS/CSS - do not modify)
        $this->hook->on('template:layout:js',  array('template' => 'plugins/DhtmlGantt/Assets/dhtmlxgantt.js'));
        $this->hook->on('template:layout:css', array('template' => 'plugins/DhtmlGantt/Assets/dhtmlxgantt.css'));

        // 2) Our main integration and behavior (config + all custom logic)
        $this->hook->on('template:layout:js',  array('template' => 'plugins/DhtmlGantt/Assets/dhtmlx-init.js'));

        // 3) Kanboard-specific theme styling (lightbox, workload, dark mode base)
        $this->hook->on('template:layout:css', array('template' => 'plugins/DhtmlGantt/Assets/gantt-theme.css'));

        // 4) Final overrides / CSP fixes (icon replacements, arrow heads, must load last)
        $this->hook->on('template:layout:css', array('template' => 'plugins/DhtmlGantt/Assets/gantt-overrides.css'));

        //
        // Services
        //
        $this->container['projectGanttFormatter'] = $this->container->factory(function ($c) {
            return new ProjectGanttFormatter($c);
        });

        $this->container['taskGanttFormatter'] = $this->container->factory(function ($c) {
            return new TaskGanttFormatter($c);
        });
    }

    public function onStartup()
    {
        Translator::load($this->languageModel->getCurrentLanguage(), __DIR__.'/Locale');
    }

    public function getPluginName()
    {
        return 'Hector Gantt';
    }

    public function getPluginDescription()
    {
        return t('Advanced Gantt charts with enterprise features powered by Hector Gantt (built on DHtmlX)');
    }

    public function getPluginAuthor()
    {
        return 'USCCS401 Team14';
    }

    public function getPluginVersion()
    {
        return '1.0.0';
    }

    public function getPluginHomepage()
    {
        return 'https://github.com/yourusername/kanboard-dhtmlx-gantt';
    }

    public function getCompatibleVersion()
    {
        return '>1.2.3';
    }
}
