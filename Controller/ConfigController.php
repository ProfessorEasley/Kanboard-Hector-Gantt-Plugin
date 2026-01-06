<?php

namespace Kanboard\Plugin\DhtmlGantt\Controller;

use Kanboard\Controller\BaseController;

/**
 * Config Controller
 *
 * @package  Kanboard\Plugin\DhtmlGantt\Controller
 * @author   Your Development Team
 */
class ConfigController extends BaseController
{
    /**
     * Display the configuration page
     */
    public function show()
    {
        $this->response->html($this->helper->layout->config('DhtmlGantt:config/gantt', array(
            'title' => t('Hector Gantt Settings'),
            'values' => $this->configModel->getAll(),
            'errors' => array(),
        )));
    }

    /**
     * Save configuration
     */
    public function save()
    {
        $values = $this->request->getValues();
        
        if ($this->configModel->save($values)) {
            $this->flash->success(t('Settings saved successfully.'));
        } else {
            $this->flash->failure(t('Unable to save settings.'));
        }

        $this->response->redirect($this->helper->url->to('ConfigController', 'show', array('plugin' => 'DhtmlGantt')));
    }
}
