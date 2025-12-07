<?php

namespace Kanboard\Plugin\DhtmlGantt\Formatter;

use Kanboard\Core\Base;

/**
 * Project Gantt Formatter
 *
 * KB_Backend_Formatter
 *   - Aggregates project task data into the simple `data` + `links`
 *     structure used by the project-level Gantt view.
 *
 * KB_Task_Dependencies
 *   - Formats dependency links between tasks for the project Gantt.
 *
 * See KB_COMMENT_TABLE.md for a full description of the KB_* tags used
 * across this plugin.
 *
 * @package Kanboard\Plugin\DhtmlGantt\Formatter
 * @author  Your Name
 */
class ProjectGanttFormatter extends Base
{
    /**
     * Format tasks for DHtmlX Gantt
     *
     * @param array $tasks
     * @return array
     */
    public function formatTasks(array $tasks)
    {
        $gantt_tasks = array();
        $gantt_links = array();
        
        foreach ($tasks as $task) {
            $gantt_tasks[] = $this->formatTask($task);
        }
        
        // Get task dependencies/links
        $gantt_links = $this->formatLinks($tasks);
        
        return array(
            'data' => $gantt_tasks,
            'links' => $gantt_links
        );
    }

    /**
     * Format a single task for DHtmlX Gantt
     *
     * @param array $task
     * @return array
     */
    private function formatTask(array $task)
    {
        $start_date = !empty($task['date_started']) ? 
            date('Y-m-d H:i', $task['date_started']) : 
            date('Y-m-d H:i');
            
        $duration = $this->calculateDuration($task);
        
        // Get assignee name (prefer full name, fallback to username)
        $assignee = '';
        if (!empty($task['owner_id'])) {
            $user = $this->userModel->getById($task['owner_id']);
            if ($user) {
                $assignee = !empty($user['name']) ? $user['name'] : ($user['username'] ?? '');
            }
        }
        
        // Check if task is a milestone
        $metadata = $this->taskMetadataModel->getAll($task['id']);
        $isMilestone = !empty($metadata['is_milestone']) && $metadata['is_milestone'] === '1';
        
        // Override color for milestones to green
        $color = $isMilestone ? '#27ae60' : $this->getTaskColor($task);
        
        return array(
            'id' => $task['id'],
            'text' => $task['title'],
            'start_date' => $start_date,
            'duration' => $duration,
            'progress' => $this->calculateProgress($task),
            'priority' => $this->mapPriority($task['priority']),
            'color' => $color,
            'owner_id' => $task['owner_id'],
            'assignee' => $assignee,
            'category_id' => $task['category_id'],
            'swimlane_id' => $task['swimlane_id'],
            'column_id' => $task['column_id'],
            'type' => 'task', // Always use 'task' type to show as rectangular bar
            'is_milestone' => $isMilestone,
            'open' => true,
            'readonly' => $this->isReadonly($task),
            'parent' => (int) ($this->resolveParentId((int)$task['id']) ?? 0),
        );
    }

    /**
     * Calculate task duration in days
     *
     * @param array $task
     * @return int
     */
    private function calculateDuration(array $task)
    {
        if (empty($task['date_started']) || empty($task['date_due'])) {
            return 1; // Default 1 day
        }
        
        $start = new \DateTime();
        $start->setTimestamp($task['date_started']);
        
        $end = new \DateTime();
        $end->setTimestamp($task['date_due']);
        
        $diff = $end->diff($start);
        return max(1, $diff->days + 1); // At least 1 day
    }

    /**
     * Calculate task progress percentage
     *
     * @param array $task
     * @return float
     */
    private function calculateProgress(array $task)
    {
        // Calculate based on completed subtasks or time spent
        if (!empty($task['time_spent']) && !empty($task['time_estimated'])) {
            return min(1.0, $task['time_spent'] / $task['time_estimated']);
        }
        
        // Default progress based on column position
        $columns = $this->columnModel->getList($task['project_id']);
        $column_position = 0;
        $total_columns = count($columns);
        
        foreach ($columns as $index => $column) {
            if ($column['id'] == $task['column_id']) {
                $column_position = $index + 1;
                break;
            }
        }
        
        return $total_columns > 0 ? ($column_position / $total_columns) : 0;
    }

    /**
     * Map Kanboard priority to DHtmlX format
     *
     * @param int $priority
     * @return string
     */
    private function mapPriority($priority)
    {
        switch ($priority) {
            case 3: return 'high';
            case 2: return 'medium';
            case 1: return 'low';
            default: return 'normal';
        }
    }

    /**
     * Get task color based on category or priority
     *
     * @param array $task
     * @return string
     */
    private function getTaskColor(array $task)
    {
        // Use category color if available
        if (!empty($task['category_id'])) {
            $category = $this->categoryModel->getById($task['category_id']);
            if (!empty($category['color_id'])) {
                return $this->colorModel->getColorProperties($category['color_id'])['background'];
            }
        }
        
        // Default colors based on priority
        switch ($task['priority']) {
            case 3: return '#e74c3c'; // High priority - red
            case 2: return '#f39c12'; // Medium priority - orange  
            case 1: return '#3498db'; // Low priority - blue
            default: return '#95a5a6'; // Normal - gray
        }
    }

    /**
     * Check if task should be readonly
     *
     * @param array $task
     * @return bool
     */
    private function isReadonly(array $task)
    {
        // Make completed tasks readonly
        return $task['is_active'] == 0;
    }
    
    /**
     * Build taskId -> parentTaskId map using internal links
     * Parent is detected from link labels: "is a child of" / "is a parent of"
     *
     * @param int[] $taskIds
     * @return array<int,int|null>
     */
    private function buildParentMap(array $taskIds): array
    {
        if (empty($taskIds)) return [];

        $taskIdSet = array_flip($taskIds);
        $rows = $this->db->table('task_has_links')
            ->join('links', 'id', 'link_id') // links.id = task_has_links.link_id
            ->columns(
                'links.label',
                'task_has_links.task_id',
                'task_has_links.opposite_task_id'
            )
            ->in('task_has_links.task_id', $taskIds)
            ->findAll();

        $parent = [];

        foreach ($rows as $r) {
            $label = $r['label'] ?? ($r['links.label'] ?? '');
            $left  = (int)($r['task_id'] ?? ($r['task_has_links.task_id'] ?? 0));
            $right = (int)($r['opposite_task_id'] ?? ($r['task_has_links.opposite_task_id'] ?? 0));

            if ($label === 'is a child of') {
                // left (child) -> right (parent)
                if (isset($taskIdSet[$left])) $parent[$left] = $right;
            } elseif ($label === 'is a parent of') {
                // left (parent) -> right (child)
                if (isset($taskIdSet[$right])) $parent[$right] = $left;
            }
        }

        // tasks without an entry are top-level parents; represent as null
        foreach ($taskIds as $id) {
            if (!array_key_exists($id, $parent)) $parent[$id] = null;
        }

        return $parent;
    }

    /** Return true if an arrow between A and B is allowed per “same-level only” rules */
    private function sameLevelAllowed(?int $parentA, ?int $parentB): bool
    {
        // both are top-level parents
        if ($parentA === null && $parentB === null) return true;
        // both are children of the same parent
        if ($parentA !== null && $parentA === $parentB) return true;
        // otherwise, cross-level — block
        return false;
    }


    /**
     * Format task dependencies/links (alias-free for PicoDb/SQLite)
     *
     * @param array $tasks
     * @return array
     */
    private function formatLinks(array $tasks)
    {
        $links = array();
        if (empty($tasks)) return $links;

        $taskIds  = array_map(fn($t) => (int)$t['id'], $tasks);
        $taskSet  = array_flip($taskIds);
        $parentMap = $this->buildParentMap($taskIds);

        $rows = $this->db->table('task_has_links')
            ->join('links', 'id', 'link_id')
            ->columns(
                'task_has_links.id',
                'links.label',
                'task_has_links.task_id',
                'task_has_links.opposite_task_id'
            )
            ->in('task_has_links.task_id', $taskIds)
            ->findAll();

        foreach ($rows as $r) {
            $left   = (int) ( $r['task_id']          ?? ($r['task_has_links.task_id'] ?? 0) );
            $right  = (int) ( $r['opposite_task_id'] ?? ($r['task_has_links.opposite_task_id'] ?? 0) );
            $label  =        ( $r['label']           ?? ($r['links.label'] ?? '') );
            $rowId  = (int) ( $r['id']               ?? ($r['task_has_links.id'] ?? 0) );

            if ($left === 0 || $right === 0) continue;
            if (!isset($taskSet[$right]))     continue;

            if ($label === 'blocks') {
                $source = $left;  $target = $right;
            } elseif ($label === 'is blocked by') {
                $source = $right; $target = $left;
            } else {
                continue;
            }

            $parentA = $parentMap[$source] ?? null;
            $parentB = $parentMap[$target] ?? null;
            if (!$this->sameLevelAllowed($parentA, $parentB)) continue;

            $links[] = array(
                'id'     => $rowId,
                'source' => $source,
                'target' => $target,
                'type'   => '0',
            );
        }

        return $links;
    }

    /**
     * Resolve a task's parent task id using internal links.
     * Returns int parent id, or null if top-level (no parent found).
     */
    private function resolveParentId(int $taskId): ?int
    {
        // Case 1: row says "task_id (child) is a child of opposite_task_id (parent)"
        $rows = $this->db->table('task_has_links')
            ->join('links', 'id', 'link_id')
            ->columns('links.label', 'task_has_links.task_id', 'task_has_links.opposite_task_id')
            ->eq('task_has_links.task_id', $taskId)
            ->findAll();

        foreach ($rows as $r) {
            $label = $r['label'] ?? ($r['links.label'] ?? '');
            if ($label === 'is a child of') {
                return (int) ($r['opposite_task_id'] ?? ($r['task_has_links.opposite_task_id'] ?? 0)) ?: null;
            }
        }

        // Case 2: inverse row says "task_id (parent) is a parent of opposite_task_id (child == current task)"
        $rows = $this->db->table('task_has_links')
            ->join('links', 'id', 'link_id')
            ->columns('links.label', 'task_has_links.task_id', 'task_has_links.opposite_task_id')
            ->eq('task_has_links.opposite_task_id', $taskId)
            ->findAll();

        foreach ($rows as $r) {
            $label = $r['label'] ?? ($r['links.label'] ?? '');
            if ($label === 'is a parent of') {
                return (int) ($r['task_id'] ?? ($r['task_has_links.task_id'] ?? 0)) ?: null;
            }
        }

        return null; // top-level if we didn't find a parent link
    }

}
