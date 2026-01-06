<?php

require_once __DIR__.'/../Plugin.php';

use Kanboard\Plugin\DhtmlGantt\Plugin;

class PluginTest extends PHPUnit\Framework\TestCase
{
    public function testGetPluginName()
    {
        $plugin = new Plugin();
        $this->assertEquals('Hector Gantt', $plugin->getPluginName());
    }

    public function testGetPluginVersion()
    {
        $plugin = new Plugin();
        $this->assertEquals('1.0.0', $plugin->getPluginVersion());
    }

    public function testGetCompatibleVersion()
    {
        $plugin = new Plugin();
        $this->assertEquals('>=1.2.3', $plugin->getCompatibleVersion());
    }

    public function testGetPluginDescription()
    {
        $plugin = new Plugin();
        $this->assertNotEmpty($plugin->getPluginDescription());
    }

    public function testGetPluginAuthor()
    {
        $plugin = new Plugin();
        $this->assertNotEmpty($plugin->getPluginAuthor());
    }

    public function testGetPluginHomepage()
    {
        $plugin = new Plugin();
        $this->assertNotEmpty($plugin->getPluginHomepage());
    }
}
